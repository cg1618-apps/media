"""
Mixed sections: catalogue rows and each account's own personal rows together.

Ten catalogue sections (NoteSection.mixed) also hold personal rows, told
apart by `note.personal`. A viewer reads the catalogue rows plus its OWN
personal rows - nobody else's, the admin included; a guest reads the
catalogue. Which kind a write makes is the server's call, from
manage.catalog: its holders (super, the admin) write catalogue rows, every
other account holding self.personal_notes writes personal rows, and a
`personal` key in the payload is ignored either way. A personal row is
edited, deleted, reordered and nested under only by its author.

Every refusal here is asserted with the refused thing PRESENT - another
account's personal row, a personal parent, a catalogue row in the reorder
set - and mirrored by the viewer the rule lets through, so a green says the
rule did the refusing and not an empty section.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import (
    PERM_MANAGE_CATALOG,
    PERM_SELF_PERSONAL_NOTES,
)
from app.services.rbac.seed import default_user_permissions
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
def accounts(db, client):
    a = Accounts(db, client)
    a.add("alice")
    a.add("bob")
    # A catalogue editor that is neither super nor the admin.
    a.add("carol", default_user_permissions() | {PERM_MANAGE_CATALOG})
    return a


def _catalogue(db, author, owner, section, **columns):
    note = models.Note(
        system_id=uuid.uuid4(),
        media_id=owner.system_id,
        author_id=author.id,
        section=section,
        **columns,
    )
    db.add(note)
    db.flush()
    return note


def _body(game, section="items", **extra):
    return {
        "owner_type": "game",
        "owner_id": str(game.system_id),
        "section": section,
        **extra,
    }


def _post(c, game, section="items", **extra):
    return c.post("/api/notes", json=_body(game, section, **extra))


def _listed(c, game, section=None):
    r = c.get("/api/notes", params={"owner_type": "game", "owner_id": str(game.system_id)})
    assert r.status_code == 200, r.text
    return [n for n in r.json() if section is None or n["section"] == section]


def _titles(rows):
    return [n["title"] for n in rows]


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


def test_each_user_reads_the_catalogue_and_its_own_rows(
    db, accounts, admin_client, admin_user, game
):
    _catalogue(db, admin_user, game, "items", title="Flask", sort_index=0)
    a = accounts
    assert _post(a.as_("alice"), game, title="Alice's").status_code == 201
    assert _post(a.as_("bob"), game, title="Bob's").status_code == 201

    alice = _listed(a.as_("alice"), game, "items")
    assert _titles(alice) == ["Flask", "Alice's"]
    assert [n["personal"] for n in alice] == [False, True]
    assert _titles(_listed(a.as_("bob"), game, "items")) == ["Flask", "Bob's"]
    # Nobody else's: not the catalogue editor, not the admin, not a guest.
    assert _titles(_listed(a.as_("carol"), game, "items")) == ["Flask"]
    assert _titles(_listed(admin_client, game, "items")) == ["Flask"]
    assert _titles(_listed(a.anonymous(), game, "items")) == ["Flask"]


def test_a_users_rows_sort_after_the_catalogues_within_the_section(
    db, accounts, admin_user, game
):
    a = accounts
    _catalogue(db, admin_user, game, "items", title="C1", kind="Potion", sort_index=0)
    assert _post(a.as_("alice"), game, title="P1", kind="Potion").status_code == 201
    assert _post(a.as_("alice"), game, title="P2", kind="Key").status_code == 201
    # A catalogue row written AFTER the user's still reads before them.
    assert _post(a.as_("carol"), game, title="C2", kind="Key").status_code == 201

    rows = _listed(a.as_("alice"), game, "items")
    assert _titles(rows) == ["C1", "C2", "P1", "P2"]
    # Grouped by type the page keeps this order within each group, so a
    # group's catalogue rows still come first: Potion C1, P1; Key C2, P2.
    for kind in ("Potion", "Key"):
        assert [n["personal"] for n in rows if n["kind"] == kind] == [False, True]


def test_a_users_children_sort_after_the_catalogues_under_one_parent(
    db, accounts, admin_user, game
):
    a = accounts
    region = _catalogue(db, admin_user, game, "geography", title="Limgrave", sort_index=0)
    r = _post(a.as_("alice"), game, "geography", title="My cave", parent_id=str(region.system_id))
    assert r.status_code == 201, r.text
    r = _post(a.as_("carol"), game, "geography", title="Stormveil", parent_id=str(region.system_id))
    assert r.status_code == 201, r.text

    children = [
        n for n in _listed(a.as_("alice"), game, "geography")
        if n["parent_id"] == str(region.system_id)
    ]
    assert _titles(children) == ["Stormveil", "My cave"]


# ---------------------------------------------------------------------------
# Which kind a write makes
# ---------------------------------------------------------------------------


def test_the_server_picks_the_kind_and_ignores_the_payloads(
    db, accounts, super_client, super_user, admin_client, admin_user, game
):
    r = _post(super_client, game, title="Super's", personal=True)
    assert r.status_code == 201, r.text
    assert r.json()["personal"] is False
    r = _post(admin_client, game, title="Admin's", personal=True)
    assert r.status_code == 201, r.text
    assert r.json()["personal"] is False
    r = _post(accounts.as_("carol"), game, title="Carol's", personal=True)
    assert r.status_code == 201 and r.json()["personal"] is False

    alice = accounts.user("alice")
    r = _post(accounts.as_("alice"), game, title="Alice's", personal=False)
    assert r.status_code == 201, r.text
    assert r.json()["personal"] is True
    assert r.json()["author_id"] == str(alice.id)
    db.expire_all()
    stored = db.get(models.Note, uuid.UUID(r.json()["system_id"]))
    assert stored.personal is True and stored.author_id == alice.id


def test_a_write_needs_one_of_the_two_permissions(db, accounts, game):
    # Holding neither: no manage.catalog, no self.personal_notes.
    accounts.add("dora", default_user_permissions() - {PERM_SELF_PERSONAL_NOTES})
    assert _post(accounts.as_("dora"), game, title="X").status_code == 401
    assert _post(accounts.anonymous(), game, title="X").status_code == 401
    # The mirror: the same write by a member is a personal row.
    assert _post(accounts.as_("alice"), game, title="X").status_code == 201


def test_a_section_that_is_not_mixed_still_needs_manage_catalog(accounts, game):
    # 技能 Skills is catalogue and not mixed: a member may not write it.
    assert _post(accounts.as_("alice"), game, "skills", title="Parry").status_code == 401
    assert _post(accounts.as_("carol"), game, "skills", title="Parry").status_code == 201


# ---------------------------------------------------------------------------
# Editing and deleting
# ---------------------------------------------------------------------------


@pytest.fixture
def alices_row(accounts, game):
    r = _post(accounts.as_("alice"), game, title="Alice's")
    assert r.status_code == 201, r.text
    return r.json()["system_id"]


def test_only_the_author_edits_or_deletes_a_personal_row(
    db, accounts, super_client, admin_client, alices_row
):
    url = f"/api/notes/{alices_row}"
    for c in (accounts.as_("bob"), accounts.as_("carol"), super_client, admin_client):
        assert c.patch(url, json={"title": "Taken"}).status_code == 404
        assert c.delete(url).status_code == 404
    db.expire_all()
    assert db.get(models.Note, uuid.UUID(alices_row)).title == "Alice's"

    r = accounts.as_("alice").patch(url, json={"title": "Renamed"})
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Renamed" and r.json()["personal"] is True
    assert accounts.as_("alice").delete(url).status_code == 204
    db.expire_all()
    assert db.get(models.Note, uuid.UUID(alices_row)) is None


def test_a_member_may_not_edit_a_catalogue_row(db, accounts, admin_user, game):
    row = _catalogue(db, admin_user, game, "items", title="Flask", sort_index=0)
    url = f"/api/notes/{row.system_id}"
    assert accounts.as_("alice").patch(url, json={"title": "Mine"}).status_code == 401
    assert accounts.as_("alice").delete(url).status_code == 401
    r = accounts.as_("carol").patch(url, json={"title": "Flask+1"})
    assert r.status_code == 200, r.text
    assert r.json()["personal"] is False


def test_a_write_never_flips_the_kind(db, accounts, admin_user, game, alices_row):
    r = accounts.as_("alice").patch(f"/api/notes/{alices_row}", json={"personal": False})
    assert r.status_code == 200 and r.json()["personal"] is True
    row = _catalogue(db, admin_user, game, "items", title="Flask", sort_index=0)
    r = accounts.as_("carol").patch(f"/api/notes/{row.system_id}", json={"personal": True})
    assert r.status_code == 200 and r.json()["personal"] is False
    db.expire_all()
    assert db.get(models.Note, uuid.UUID(alices_row)).personal is True
    assert db.get(models.Note, row.system_id).personal is False


def test_a_personal_row_moves_only_to_another_mixed_section(accounts, alices_row):
    url = f"/api/notes/{alices_row}"
    # 技能 Skills takes no personal rows; 收集物 Collectibles does.
    assert accounts.as_("alice").patch(url, json={"section": "skills"}).status_code == 422
    r = accounts.as_("alice").patch(url, json={"section": "collectibles"})
    assert r.status_code == 200, r.text
    assert r.json()["section"] == "collectibles" and r.json()["personal"] is True


# ---------------------------------------------------------------------------
# Reordering, one kind at a time
# ---------------------------------------------------------------------------


def _reorder(c, game, ids, section="items"):
    return c.patch(
        "/api/notes/reorder",
        json={
            "owner_type": "game",
            "owner_id": str(game.system_id),
            "section": section,
            "ordered_ids": [str(i) for i in ids],
        },
    )


def test_reorder_renumbers_one_kind(db, accounts, admin_user, game):
    a = accounts
    c1 = _catalogue(db, admin_user, game, "items", title="C1", sort_index=0).system_id
    c2 = _catalogue(db, admin_user, game, "items", title="C2", sort_index=1).system_id
    p1 = _post(a.as_("alice"), game, title="P1").json()["system_id"]
    p2 = _post(a.as_("alice"), game, title="P2").json()["system_id"]
    b1 = _post(a.as_("bob"), game, title="B1").json()["system_id"]

    # A catalogue editor sends exactly the catalogue rows; a member exactly
    # its own. A set naming the other kind, or another account's row, is 400.
    assert _reorder(a.as_("carol"), game, [c2, c1, p1]).status_code == 400
    assert _reorder(a.as_("alice"), game, [p2, p1, c1]).status_code == 400
    assert _reorder(a.as_("alice"), game, [p2, p1, b1]).status_code == 400
    assert _reorder(a.as_("alice"), game, [c2, c1]).status_code == 400

    assert _reorder(a.as_("carol"), game, [c2, c1]).status_code == 200
    assert _reorder(a.as_("alice"), game, [p2, p1]).status_code == 200
    assert _titles(_listed(a.as_("alice"), game, "items")) == ["C2", "C1", "P2", "P1"]
    assert _titles(_listed(a.as_("bob"), game, "items")) == ["C2", "C1", "B1"]


# ---------------------------------------------------------------------------
# Nesting (地理 Geography)
# ---------------------------------------------------------------------------


def test_a_catalogue_row_may_not_nest_under_a_personal_row(
    db, accounts, admin_user, game
):
    a = accounts
    mine = _post(a.as_("alice"), game, "geography", title="My region").json()["system_id"]
    region = _catalogue(db, admin_user, game, "geography", title="Limgrave", sort_index=0)

    r = _post(a.as_("carol"), game, "geography", title="Stormveil", parent_id=mine)
    assert r.status_code == 422, r.text
    r = a.as_("carol").patch(f"/api/notes/{region.system_id}", json={"parent_id": mine})
    assert r.status_code == 422, r.text
    # Nor may a personal row nest under ANOTHER account's: it is not there.
    r = _post(a.as_("bob"), game, "geography", title="Bob's cave", parent_id=mine)
    assert r.status_code == 422, r.text

    # The mirrors: a personal row under a catalogue row, and under its own.
    r = _post(a.as_("alice"), game, "geography", title="Cave", parent_id=str(region.system_id))
    assert r.status_code == 201, r.text
    r = _post(a.as_("alice"), game, "geography", title="Nook", parent_id=mine)
    assert r.status_code == 201, r.text


# ---------------------------------------------------------------------------
# Personal values on personal rows
# ---------------------------------------------------------------------------


def test_marks_and_the_ng_reset_reach_a_personal_row(db, accounts, game):
    a = accounts
    item = _post(a.as_("alice"), game, title="Rune", fields={"ng_reset": "yes"}).json()
    enemy = _post(a.as_("alice"), game, "enemies", title="Margit").json()

    # Another account cannot mark a row it cannot read.
    r = a.as_("bob").put(f"/api/notes/{item['system_id']}/mark", json={"values": {"collected": "collected"}})
    assert r.status_code == 404
    r = a.as_("alice").put(f"/api/notes/{item['system_id']}/mark", json={"values": {"collected": "collected"}})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "collected" and r.json()["personal"] is True
    r = a.as_("alice").put(f"/api/notes/{enemy['system_id']}/mark", json={"values": {"beaten": "beaten"}})
    assert r.status_code == 200, r.text
    by_id = {n["system_id"]: n for n in _listed(a.as_("alice"), game)}
    assert by_id[item["system_id"]]["status"] == "collected"
    assert by_id[enemy["system_id"]]["status"] == "beaten"

    r = a.as_("alice").post(
        "/api/notes/ng-reset", json={"owner_type": "game", "owner_id": str(game.system_id)}
    )
    assert r.status_code == 200 and r.json() == {"cleared": 2}
    by_id = {n["system_id"]: n for n in _listed(a.as_("alice"), game)}
    assert by_id[item["system_id"]]["status"] == "not collected"
    assert by_id[enemy["system_id"]]["status"] == "to beat"


# ---------------------------------------------------------------------------
# Deleting a catalogue parent re-homes members' rows under it
# ---------------------------------------------------------------------------


def _by_title(rows):
    return {n["title"]: n for n in rows}


def test_deleting_a_catalogue_parent_moves_members_rows_under_it_to_the_top(
    db, accounts, admin_user, game
):
    """
    A member's rows nested anywhere under a deleted catalogue row survive at
    the section's top level, after the member's own top-level rows and in the
    order they were listed in; a member's row nested under its OWN row keeps
    that parent. The members' rows are what make this bite: without them the
    delete would pass by deleting nothing personal.
    """
    a = accounts
    region = _catalogue(db, admin_user, game, "geography", title="Limgrave", sort_index=0)
    sub = _catalogue(
        db, admin_user, game, "geography", title="Weeping", sort_index=0,
        parent_id=region.system_id,
    )
    alice = a.as_("alice")
    r = _post(alice, game, "geography", title="Top")
    assert r.status_code == 201, r.text
    r = _post(alice, game, "geography", title="My cave", parent_id=str(region.system_id))
    assert r.status_code == 201, r.text
    cave = r.json()["system_id"]
    r = _post(alice, game, "geography", title="Cave room", parent_id=cave)
    assert r.status_code == 201, r.text
    r = _post(alice, game, "geography", title="Deep cave", parent_id=str(sub.system_id))
    assert r.status_code == 201, r.text
    r = _post(a.as_("bob"), game, "geography", title="Bob's cave", parent_id=str(region.system_id))
    assert r.status_code == 201, r.text

    assert a.as_("carol").delete(f"/api/notes/{region.system_id}").status_code == 204

    # as_ logs the one test client in as that account, so log back in.
    alice = a.as_("alice")
    rows = _by_title(_listed(alice, game, "geography"))
    assert "Limgrave" not in rows and "Weeping" not in rows
    tops = [n["title"] for n in _listed(alice, game, "geography") if n["parent_id"] is None]
    assert tops == ["Top", "My cave", "Deep cave"]
    assert rows["Cave room"]["parent_id"] == cave
    bob_rows = _by_title(_listed(a.as_("bob"), game, "geography"))
    assert bob_rows["Bob's cave"]["parent_id"] is None


def test_deleting_a_catalogue_parent_still_deletes_its_catalogue_children(
    db, accounts, admin_user, game
):
    """The mirror: catalogue rows under a deleted catalogue row go with it, as
    before - only members' rows are re-homed."""
    a = accounts
    region = _catalogue(db, admin_user, game, "geography", title="Limgrave", sort_index=0)
    _catalogue(
        db, admin_user, game, "geography", title="Weeping", sort_index=0,
        parent_id=region.system_id,
    )
    other = _catalogue(db, admin_user, game, "geography", title="Caelid", sort_index=1)

    assert a.as_("carol").delete(f"/api/notes/{region.system_id}").status_code == 204

    db.expire_all()
    left = {
        n.title
        for n in db.query(models.Note).filter(models.Note.section == "geography").all()
    }
    assert left == {"Caelid"}
    assert db.get(models.Note, other.system_id) is not None
