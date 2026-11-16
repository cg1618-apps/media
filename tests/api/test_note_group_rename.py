"""
POST /api/notes/rename-group: rename one group of one section, once.

A group's name is a stored value on each of its rows - a `groupable_by`
select's column, Resources' `kind`, or one name inside a `group_by` names
list - so renaming the group rewrites those rows in one transaction. It
rewrites only the rows the caller could edit one by one: every row of a
catalogue section for a manage.catalog holder; in a mixed section the
catalogue rows for that holder plus the caller's own personal rows; in a
personal section the caller's own rows. A `group_by` rename also renames the
name inside the caller's own stored group order.

Every refusal is asserted with the refused rows PRESENT - another account's
personal rows, the catalogue's rows, a child row carrying the name, another
account's group order - and mirrored by the caller the rule lets through, so
a green says the rule did the refusing and not an empty section.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import PERM_MANAGE_CATALOG
from app.services.rbac.seed import default_user_permissions
from app.services.rbac.seed_modes import MODE_UNRESTRICTED
from tests.api.conftest import role_id_for
from tests.api.test_note_marks import Accounts


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def game(db):
    g = models.Game(system_id=uuid.uuid4(), game_name_en="Elden Ring")
    db.add(g)
    db.flush()
    return g


@pytest.fixture
def other_game(db):
    g = models.Game(system_id=uuid.uuid4(), game_name_en="Sekiro")
    db.add(g)
    db.flush()
    return g


@pytest.fixture
def accounts(db, client):
    a = Accounts(db, client)
    a.add("alice")
    a.add("bob")
    # A catalogue editor that is neither super nor the admin.
    a.add("carol", default_user_permissions() | {PERM_MANAGE_CATALOG})
    return a


def _row(db, author, owner, section, *, personal=False, **columns):
    note = models.Note(
        system_id=uuid.uuid4(),
        media_id=owner.system_id,
        author_id=author.id,
        section=section,
        personal=personal,
        **columns,
    )
    db.add(note)
    db.flush()
    return note


def _rename(c, owner, section, old, new, owner_type="game"):
    return c.post(
        "/api/notes/rename-group",
        json={
            "owner_type": owner_type,
            "owner_id": str(owner if isinstance(owner, str) else owner.system_id),
            "section": section,
            "from": old,
            "to": new,
        },
    )


def _kinds(db, *notes):
    db.expire_all()
    return [db.get(models.Note, n.system_id).kind for n in notes]


# ---------------------------------------------------------------------------
# A catalogue section
# ---------------------------------------------------------------------------


def test_a_rename_rewrites_every_row_of_the_group_and_nothing_else(
    db, owner_client, owner_user, game, other_game
):
    a = _row(db, owner_user, game, "controls", kind="Combat", title="Roll")
    b = _row(db, owner_user, game, "controls", kind="Combat", title="Parry")
    menu = _row(db, owner_user, game, "controls", kind="Menu", title="Map")
    # Same section and name, another owner: not this group.
    elsewhere = _row(db, owner_user, other_game, "controls", kind="Combat", title="Deflect")
    # Same owner and name, another section: not this group either.
    skill = _row(db, owner_user, game, "skills", kind="Combat", title="Slash")

    r = _rename(owner_client, game, "controls", "Combat", "  Fight  ")
    assert r.status_code == 200, r.text
    assert r.json() == {"renamed": 2}
    assert _kinds(db, a, b, menu, elsewhere, skill) == [
        "Fight",
        "Fight",
        "Menu",
        "Combat",
        "Combat",
    ]


def test_renaming_onto_an_existing_group_merges_the_two(db, owner_client, owner_user, game):
    a = _row(db, owner_user, game, "controls", kind="Combat", title="Roll")
    b = _row(db, owner_user, game, "controls", kind="Fight", title="Parry")

    r = _rename(owner_client, game, "controls", "Combat", "Fight")
    assert r.status_code == 200, r.text
    assert r.json() == {"renamed": 1}
    assert _kinds(db, a, b) == ["Fight", "Fight"]


def test_the_same_name_is_a_no_op(db, owner_client, owner_user, game):
    a = _row(db, owner_user, game, "controls", kind="Combat", title="Roll")
    r = _rename(owner_client, game, "controls", "Combat", " Combat ")
    assert r.status_code == 200, r.text
    assert r.json() == {"renamed": 0}
    assert _kinds(db, a) == ["Combat"]


def test_a_catalogue_section_needs_manage_catalog(db, accounts, owner_user, game):
    a = _row(db, owner_user, game, "controls", kind="Combat", title="Roll")

    assert _rename(accounts.as_("alice"), game, "controls", "Combat", "Fight").status_code == 401
    assert _rename(accounts.anonymous(), game, "controls", "Combat", "Fight").status_code == 401
    assert _kinds(db, a) == ["Combat"]

    # Mirror: the catalogue editor renames the same row.
    r = _rename(accounts.as_("carol"), game, "controls", "Combat", "Fight")
    assert r.status_code == 200, r.text
    assert _kinds(db, a) == ["Fight"]


def test_a_closed_vocabulary_refuses_a_name_outside_it(db, owner_client, owner_user, game):
    mod = _row(db, owner_user, game, "mods_and_tools", kind="Mod", title="Seamless")

    r = _rename(owner_client, game, "mods_and_tools", "Mod", "Plugin")
    assert r.status_code == 422, r.text
    assert _kinds(db, mod) == ["Mod"]

    r = _rename(owner_client, game, "mods_and_tools", "Mod", "Tool")
    assert r.status_code == 200, r.text
    assert _kinds(db, mod) == ["Tool"]


# ---------------------------------------------------------------------------
# A mixed section
# ---------------------------------------------------------------------------


@pytest.fixture
def potions(db, accounts, owner_user, game):
    """One Potion row of every kind: the catalogue's, alice's and bob's."""
    return {
        "catalogue": _row(db, owner_user, game, "items", kind="Potion", title="Flask"),
        "alice": _row(
            db, accounts.user("alice"), game, "items", personal=True, kind="Potion", title="A"
        ),
        "bob": _row(
            db, accounts.user("bob"), game, "items", personal=True, kind="Potion", title="B"
        ),
        "carol": _row(
            db, accounts.user("carol"), game, "items", personal=True, kind="Potion", title="C"
        ),
    }


def test_a_member_renames_only_its_own_personal_rows(db, accounts, game, potions):
    r = _rename(accounts.as_("alice"), game, "items", "Potion", "Drink")
    assert r.status_code == 200, r.text
    assert r.json() == {"renamed": 1}
    assert _kinds(
        db, potions["catalogue"], potions["alice"], potions["bob"], potions["carol"]
    ) == ["Potion", "Drink", "Potion", "Potion"]


def test_a_catalogue_editor_renames_the_catalogue_and_its_own_rows(
    db, accounts, game, potions
):
    r = _rename(accounts.as_("carol"), game, "items", "Potion", "Drink")
    assert r.status_code == 200, r.text
    assert r.json() == {"renamed": 2}
    assert _kinds(
        db, potions["catalogue"], potions["alice"], potions["bob"], potions["carol"]
    ) == ["Drink", "Potion", "Potion", "Drink"]


def test_a_guest_renames_nothing_in_a_mixed_section(db, accounts, game, potions):
    assert _rename(accounts.anonymous(), game, "items", "Potion", "Drink").status_code == 401
    assert _kinds(db, *potions.values()) == ["Potion"] * 4


def test_a_tree_renames_its_roots_only(db, owner_client, owner_user, game):
    root = _row(db, owner_user, game, "geography", kind="North", title="Limgrave")
    # A child carrying a group is refused by the API; one restored by hand
    # still must not be renamed, since nothing reads it as the group.
    child = _row(
        db, owner_user, game, "geography", kind="North", title="Cave", parent_id=root.system_id
    )

    r = _rename(owner_client, game, "geography", "North", "Lands Between")
    assert r.status_code == 200, r.text
    assert r.json() == {"renamed": 1}
    assert _kinds(db, root, child) == ["Lands Between", "North"]


def test_resources_rename_their_group(db, accounts, owner_client, owner_user, game):
    wiki = _row(db, owner_user, game, "resources", kind="Wikis", title="Fextralife")
    other = _row(db, owner_user, game, "resources", kind="Videos", title="VaatiVidya")
    mine = _row(
        db, accounts.user("alice"), game, "resources", personal=True, kind="Wikis", title="Mine"
    )

    r = _rename(owner_client, game, "resources", "Wikis", "Wiki")
    assert r.status_code == 200, r.text
    assert r.json() == {"renamed": 1}
    assert _kinds(db, wiki, other, mine) == ["Wiki", "Videos", "Wikis"]


# ---------------------------------------------------------------------------
# A personal `group_by` section, and the group order
# ---------------------------------------------------------------------------


@pytest.fixture
def second_user(db):
    user = models.User(
        id=uuid.uuid4(),
        username="seconduser",
        hashed_password="!",
        role_id=role_id_for(db, "user"),
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def second_client(mode_client, second_user):
    return mode_client(MODE_UNRESTRICTED, user=second_user)


@pytest.fixture
def h_game(owner_client):
    r = owner_client.post("/api/h-game/", json={"h_game_name_cn": "Zvornik Order"})
    assert r.status_code in (200, 201), r.text
    return r.json()


def _highlight(c, h_game, names):
    r = c.post(
        "/api/notes",
        json={
            "owner_type": "h-game",
            "owner_id": h_game["system_id"],
            "section": "h_game_highlights",
            "fields": {"female_characters": names},
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["system_id"]


def _names(db, note_id):
    db.expire_all()
    return db.get(models.Note, uuid.UUID(note_id)).fields["female_characters"]


def _order(db, user, h_game):
    db.expire_all()
    row = (
        db.query(models.UserHighlightGroupOrder)
        .filter(
            models.UserHighlightGroupOrder.user_id == user.id,
            models.UserHighlightGroupOrder.media_id == uuid.UUID(h_game["system_id"]),
        )
        .first()
    )
    return None if row is None else row.group_order


def _put_order(c, h_game, order):
    r = c.put(
        f"/api/me/highlight-group-order/{h_game['system_id']}",
        json={"group_order": order},
    )
    assert r.status_code == 200, r.text


def test_a_names_rename_replaces_the_name_in_the_callers_rows_and_order(
    db, user_client, plain_user, second_client, second_user, h_game
):
    both = _highlight(user_client, h_game, ["Ana", "Bea"])
    ana = _highlight(user_client, h_game, ["Ana"])
    bea = _highlight(user_client, h_game, ["Bea"])
    theirs = _highlight(second_client, h_game, ["Ana", "Bea"])
    _put_order(user_client, h_game, ["Bea", "Ana"])
    _put_order(second_client, h_game, ["Ana", "Bea"])

    r = _rename(user_client, h_game["system_id"], "h_game_highlights", "Ana", "Cia", "h-game")
    assert r.status_code == 200, r.text
    assert r.json() == {"renamed": 2}
    assert _names(db, both) == ["Cia", "Bea"]
    assert _names(db, ana) == ["Cia"]
    assert _names(db, bea) == ["Bea"]
    assert _order(db, plain_user, h_game) == ["Bea", "Cia"]
    # The other account's rows and order are its own.
    assert _names(db, theirs) == ["Ana", "Bea"]
    assert _order(db, second_user, h_game) == ["Ana", "Bea"]


def test_a_names_rename_onto_a_name_the_row_has_drops_the_repeat(
    db, user_client, plain_user, h_game
):
    both = _highlight(user_client, h_game, ["Ana", "Bea"])
    _put_order(user_client, h_game, ["Ana", "Bea"])

    r = _rename(user_client, h_game["system_id"], "h_game_highlights", "Ana", "Bea", "h-game")
    assert r.status_code == 200, r.text
    assert r.json() == {"renamed": 1}
    assert _names(db, both) == ["Bea"]
    assert _order(db, plain_user, h_game) == ["Bea"]


def test_a_names_rename_with_no_stored_order_stores_none(
    db, user_client, plain_user, h_game
):
    _highlight(user_client, h_game, ["Ana"])
    r = _rename(user_client, h_game["system_id"], "h_game_highlights", "Ana", "Cia", "h-game")
    assert r.status_code == 200, r.text
    assert _order(db, plain_user, h_game) is None


# ---------------------------------------------------------------------------
# Refusals of the request itself
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("old, new", [("Combat", ""), ("Combat", "   "), ("", "Fight")])
def test_a_blank_name_is_422(db, owner_client, owner_user, game, old, new):
    a = _row(db, owner_user, game, "controls", kind="Combat", title="Roll")
    assert _rename(owner_client, game, "controls", old, new).status_code == 422
    assert _kinds(db, a) == ["Combat"]


def test_a_section_with_no_groups_is_422(db, owner_client, owner_user, game):
    _row(db, owner_user, game, "introduction", kind="Combat", content="x")
    r = _rename(owner_client, game, "introduction", "Combat", "Fight")
    assert r.status_code == 422, r.text


def test_an_unknown_section_is_400(owner_client, game):
    assert _rename(owner_client, game, "no_such_section", "A", "B").status_code == 400


def test_an_unknown_owner_type_is_400(owner_client, game):
    assert _rename(owner_client, game, "controls", "A", "B", "spaceship").status_code == 400
