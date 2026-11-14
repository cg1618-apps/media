"""
The six highlight sections are personal, 下周目目標 (ng_goals) is a personal
section, and an h-comic's or h-game's highlight group order is the viewer's
own (PUT /api/me/highlight-group-order/{media_id}).

Every refusal here is asserted with the refused thing PRESENT - another
account's highlight row, another account's order - and mirrored by the account
that owns it reading or writing the same thing, so a green proves the
per-account rule did the refusing and not an empty table.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import (
    PERM_SELF_PERSONAL_NOTES,
    media_type_perm,
)
from app.services.rbac.seed import default_guest_permissions
from app.services.rbac.seed_modes import MODE_UNRESTRICTED
from tests.api.conftest import make_viewer, role_id_for

HIGHLIGHT_SECTIONS = {
    "highlights": "anime",
    "highlight_episodes": "tv-show",
    "highlight_passages": "novel",
    "highlight_moments": "game",
    "h_comic_highlights": "h-comic",
    "h_game_highlights": "h-game",
}


@pytest.fixture
def db(db_session):
    return db_session


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
    """A second member, in the mode that sees the gated types too."""
    return mode_client(MODE_UNRESTRICTED, user=second_user)


def _notes(c, owner_type, owner_id):
    r = c.get("/api/notes", params={"owner_type": owner_type, "owner_id": str(owner_id)})
    assert r.status_code == 200, r.text
    return r.json()


def _highlight(c, anime, content):
    return c.post(
        "/api/notes",
        json={
            "owner_type": "anime",
            "owner_id": str(anime.system_id),
            "section": "highlights",
            "locator": "ep 6",
            "content": content,
        },
    )


# ---------------------------------------------------------------------------
# The highlight sections
# ---------------------------------------------------------------------------


def test_the_six_highlight_sections_report_scope_personal(user_client):
    for key, owner_type in HIGHLIGHT_SECTIONS.items():
        sections = user_client.get(
            "/api/notes/sections", params={"owner_type": owner_type}
        ).json()
        by_key = {s["key"]: s for s in sections}
        assert by_key[key]["scope"] == "personal", key


def test_a_guest_is_listed_the_highlight_section_too(client):
    """Nothing withholds the section any more: its rows are per account, and a
    guest has none, so the page shows a guest an empty personal card or none
    by its own rule."""
    keys = {
        s["key"]: s["scope"]
        for s in client.get("/api/notes/sections", params={"owner_type": "anime"}).json()
    }
    assert keys["highlights"] == "personal"


def test_two_accounts_each_see_only_their_own_highlights(
    user_client, second_client, sample_anime
):
    assert _highlight(user_client, sample_anime, "mine").status_code == 201
    assert _highlight(second_client, sample_anime, "theirs").status_code == 201

    def contents(c):
        return [
            n["content"]
            for n in _notes(c, "anime", sample_anime.system_id)
            if n["section"] == "highlights"
        ]

    assert contents(user_client) == ["mine"]
    assert contents(second_client) == ["theirs"]


def test_a_guest_sees_no_highlights(client, user_client, sample_anime):
    assert _highlight(user_client, sample_anime, "mine").status_code == 201
    assert not [
        n for n in _notes(client, "anime", sample_anime.system_id)
        if n["section"] == "highlights"
    ]


def test_a_member_creates_edits_and_reorders_its_own_highlights(
    user_client, sample_anime
):
    first = _highlight(user_client, sample_anime, "one").json()
    second = _highlight(user_client, sample_anime, "two").json()

    edited = user_client.patch(
        f"/api/notes/{first['system_id']}", json={"content": "one, edited"}
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["content"] == "one, edited"

    reordered = user_client.patch(
        "/api/notes/reorder",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "highlights",
            "ordered_ids": [second["system_id"], first["system_id"]],
        },
    )
    assert reordered.status_code == 200, reordered.text
    order = [
        n["content"]
        for n in _notes(user_client, "anime", sample_anime.system_id)
        if n["section"] == "highlights"
    ]
    assert order == ["two", "one, edited"]


def test_another_accounts_highlight_is_404_to_edit_and_delete(
    user_client, second_client, sample_anime
):
    theirs = _highlight(second_client, sample_anime, "theirs").json()
    path = f"/api/notes/{theirs['system_id']}"
    assert user_client.patch(path, json={"content": "hijacked"}).status_code == 404
    assert user_client.delete(path).status_code == 404
    # The mirror: the author may.
    assert second_client.patch(path, json={"content": "still mine"}).status_code == 200


def test_reordering_names_only_the_callers_rows(user_client, second_client, sample_anime):
    """Another account's row in the section is not the caller's to order: the
    reorder names exactly the caller's own, and naming theirs is refused."""
    mine = _highlight(user_client, sample_anime, "mine").json()
    theirs = _highlight(second_client, sample_anime, "theirs").json()
    base = {
        "owner_type": "anime",
        "owner_id": str(sample_anime.system_id),
        "section": "highlights",
    }
    refused = user_client.patch(
        "/api/notes/reorder",
        json={**base, "ordered_ids": [mine["system_id"], theirs["system_id"]]},
    )
    assert refused.status_code == 400
    taken = user_client.patch(
        "/api/notes/reorder", json={**base, "ordered_ids": [mine["system_id"]]}
    )
    assert taken.status_code == 200, taken.text


def test_the_admin_may_not_write_a_highlight(admin_client, owner_client, sample_anime):
    """The admin holds no self.* permission, so it keeps no highlight. The
    mirror is an account holding self.personal_notes writing the same one."""
    assert _highlight(admin_client, sample_anime, "admin's").status_code == 401
    assert _highlight(owner_client, sample_anime, "owner's").status_code == 201


# ---------------------------------------------------------------------------
# 下周目目標
# ---------------------------------------------------------------------------


@pytest.fixture
def game(db):
    g = models.Game(game_name_en="Goal Ring")
    db.add(g)
    db.flush()
    return g


def _goal(c, game, content):
    return c.post(
        "/api/notes",
        json={
            "owner_type": "game",
            "owner_id": str(game.system_id),
            "section": "ng_goals",
            "content": content,
            "links": ["https://example.com/guide"],
        },
    )


def test_ng_goals_is_listed_as_personal_text_links(user_client):
    sections = user_client.get("/api/notes/sections", params={"owner_type": "game"}).json()
    by_key = {s["key"]: s for s in sections}
    assert by_key["ng_goals"]["scope"] == "personal"
    assert by_key["ng_goals"]["shape"] == "text_links"
    assert by_key["ng_goals"]["group"] == "ng_plus"
    keys = [s["key"] for s in sections]
    assert keys.index("ng_goals") == keys.index("ng_before_starting") + 1


def test_ng_goals_rows_are_the_authors_own(user_client, second_client, client, game):
    created = _goal(user_client, game, "beat the true ending")
    assert created.status_code == 201, created.text

    def goals(c):
        return [
            n["content"]
            for n in _notes(c, "game", game.system_id)
            if n["section"] == "ng_goals"
        ]

    assert goals(user_client) == ["beat the true ending"]
    assert goals(second_client) == []
    assert goals(client) == []


def test_the_admin_may_not_write_an_ng_goal(admin_client, user_client, game):
    assert _goal(admin_client, game, "x").status_code == 401
    assert _goal(user_client, game, "x").status_code == 201


# ---------------------------------------------------------------------------
# The highlight group order
# ---------------------------------------------------------------------------


@pytest.fixture
def kr(owner_client):
    r = owner_client.post(
        "/api/h-comic/", json={"h_comic_name_cn": "Zvornik KR", "region": "KR"}
    )
    assert r.status_code in (200, 201), r.text
    return r.json()


@pytest.fixture
def jp(owner_client):
    r = owner_client.post(
        "/api/h-comic/", json={"h_comic_name_cn": "Zvornik JP", "region": "JP"}
    )
    assert r.status_code in (200, 201), r.text
    return r.json()


@pytest.fixture
def h_game(owner_client):
    r = owner_client.post("/api/h-game/", json={"h_game_name_cn": "Zvornik Order"})
    assert r.status_code in (200, 201), r.text
    return r.json()


def _put_order(c, entry, order):
    return c.put(
        f"/api/me/highlight-group-order/{entry['system_id']}",
        json={"group_order": order},
    )


@pytest.mark.parametrize("route, fixture", [("h-comic", "kr"), ("h-game", "h_game")])
def test_each_account_reads_its_own_group_order(
    request, route, fixture, user_client, second_client, owner_client
):
    entry = request.getfixturevalue(fixture)
    mine = _put_order(user_client, entry, ["Bea", " Ana", "Bea", ""])
    assert mine.status_code == 200, mine.text
    assert mine.json() == {"media_id": entry["system_id"], "group_order": ["Bea", "Ana"]}
    assert _put_order(second_client, entry, ["Ana"]).status_code == 200

    def detail(c):
        return c.get(f"/api/{route}/{entry['system_id']}").json()["highlight_group_order"]

    def listed(c):
        rows = c.get(f"/api/{route}/").json()
        return next(r for r in rows if r["system_id"] == entry["system_id"])[
            "highlight_group_order"
        ]

    assert detail(user_client) == ["Bea", "Ana"]
    assert detail(second_client) == ["Ana"]
    assert listed(user_client) == ["Bea", "Ana"]
    assert listed(second_client) == ["Ana"]
    # An account that set none reads none, whoever else has one.
    assert detail(owner_client) is None


@pytest.mark.parametrize("cleared", [None, [], ["  "]])
def test_a_cleared_order_deletes_the_row(db, user_client, kr, cleared):
    assert _put_order(user_client, kr, ["Ana"]).status_code == 200
    assert db.query(models.UserHighlightGroupOrder).count() == 1

    r = _put_order(user_client, kr, cleared)
    assert r.status_code == 200, r.text
    assert r.json()["group_order"] is None
    assert db.query(models.UserHighlightGroupOrder).count() == 0
    assert user_client.get(f"/api/h-comic/{kr['system_id']}").json()[
        "highlight_group_order"
    ] is None


@pytest.mark.parametrize("body", [{"group_order": "Ana"}, {"group_order": [1, 2]}, {}])
def test_a_malformed_order_is_422(user_client, kr, body):
    r = user_client.put(f"/api/me/highlight-group-order/{kr['system_id']}", json=body)
    assert r.status_code == 422


def test_only_an_h_comic_or_h_game_takes_an_order(user_client, sample_anime, kr):
    r = user_client.put(
        f"/api/me/highlight-group-order/{sample_anime.system_id}",
        json={"group_order": ["Ana"]},
    )
    assert r.status_code == 404
    r = user_client.put(
        f"/api/me/highlight-group-order/{uuid.uuid4()}", json={"group_order": ["Ana"]}
    )
    assert r.status_code == 404
    # The mirror, the same body on an h-comic.
    assert _put_order(user_client, kr, ["Ana"]).status_code == 200


def test_an_entry_the_viewer_cannot_see_is_404(db, client, kr):
    """
    A viewer that may write personal notes but may not see h-comics. Its GET
    is asserted 404 first, so this fails loudly if that visibility changes
    rather than passing on some other refusal.
    """
    make_viewer(
        db,
        client,
        "no-h-comic",
        (default_guest_permissions() - {media_type_perm("h-comic")})
        | {PERM_SELF_PERSONAL_NOTES},
    )
    assert client.get(f"/api/h-comic/{kr['system_id']}").status_code == 404
    assert _put_order(client, kr, ["Ana"]).status_code == 404


def test_the_same_viewer_with_the_type_may_order(db, client, kr):
    """The mirror: the same grants plus the type."""
    make_viewer(
        db,
        client,
        "with-h-comic",
        default_guest_permissions() | {PERM_SELF_PERSONAL_NOTES, "media_type.h-comic"},
    )
    assert client.get(f"/api/h-comic/{kr['system_id']}").status_code == 200
    assert _put_order(client, kr, ["Ana"]).status_code == 200


def test_the_admin_and_a_guest_may_not_write_an_order(admin_client, client, user_client, kr):
    assert _put_order(admin_client, kr, ["Ana"]).status_code == 401
    assert _put_order(client, kr, ["Ana"]).status_code == 401
    assert _put_order(user_client, kr, ["Ana"]).status_code == 200


def test_a_jp_h_comic_takes_no_order(user_client, jp):
    assert _put_order(user_client, jp, ["Ana"]).status_code == 422


def test_turning_an_h_comic_jp_deletes_every_accounts_order(
    db, owner_client, user_client, second_client, kr, h_game
):
    assert _put_order(user_client, kr, ["Ana"]).status_code == 200
    assert _put_order(second_client, kr, ["Bea"]).status_code == 200
    # An order on another entry, which must survive.
    assert _put_order(user_client, h_game, ["Cy"]).status_code == 200

    r = owner_client.patch(f"/api/h-comic/{kr['system_id']}", json={"region": "JP"})
    assert r.status_code == 200, r.text

    held = {
        (row.user_id, str(row.media_id))
        for row in db.query(models.UserHighlightGroupOrder)
    }
    assert {media for _user, media in held} == {h_game["system_id"]}
    assert user_client.get(f"/api/h-comic/{kr['system_id']}").json()[
        "highlight_group_order"
    ] is None
