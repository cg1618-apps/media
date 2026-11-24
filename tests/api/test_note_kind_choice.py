"""
優點 / 缺點 / 優缺點: mixed sections whose catalogue writer picks each row's kind.

A manage.catalog holder writes a personal row unless it asks for a public
one, and may switch a row it wrote between the two. Everyone else writes
personal rows only, and asking for a public one is refused. A public row is
read by everyone; a personal row by its author alone.

Each refusal runs with the refused thing present - a member asking for
`personal: false`, a public row written by somebody else - and is mirrored by
the viewer the rule lets through, so a green says the rule refused.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import PERM_MANAGE_CATALOG
from app.services.rbac.seed import default_user_permissions
from app.utils.note_sections import section_by_key
from tests.api.test_note_marks import Accounts

SECTIONS = ("advantages", "disadvantages", "double_edged")


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
    # Two catalogue editors, so "a public row somebody else wrote" exists.
    a.add("carol", default_user_permissions() | {PERM_MANAGE_CATALOG})
    a.add("dave", default_user_permissions() | {PERM_MANAGE_CATALOG})
    return a


def _post(c, game, section="advantages", **extra):
    return c.post(
        "/api/notes",
        json={
            "owner_type": "game",
            "owner_id": str(game.system_id),
            "section": section,
            "content": "Tight combat",
            **extra,
        },
    )


def _listed(c, game, section="advantages"):
    r = c.get("/api/notes", params={"owner_type": "game", "owner_id": str(game.system_id)})
    assert r.status_code == 200, r.text
    return [n for n in r.json() if n["section"] == section]


@pytest.mark.parametrize("key", SECTIONS)
def test_the_three_sections_are_mixed_with_a_kind_choice(key):
    section = section_by_key(key)
    assert section.scope == "catalog"
    assert section.mixed and section.kind_choice


@pytest.mark.parametrize("key", SECTIONS)
def test_an_editors_row_is_personal_by_default_and_public_on_request(accounts, game, key):
    carol = accounts.as_("carol")
    mine = _post(carol, game, key)
    assert mine.status_code == 201, mine.text
    assert mine.json()["personal"] is True
    public = _post(carol, game, key, content="Great music", personal=False)
    assert public.status_code == 201, public.text
    assert public.json()["personal"] is False


def test_a_public_row_is_read_by_everyone_and_a_personal_one_by_its_author(accounts, game):
    carol = accounts.as_("carol")
    _post(carol, game, content="Carol private")
    _post(carol, game, content="Carol public", personal=False)

    def contents(name):
        c = accounts.anonymous() if name is None else accounts.as_(name)
        return [n["content"] for n in _listed(c, game)]

    # Public first, then the reader's own.
    assert contents("carol") == ["Carol public", "Carol private"]
    assert contents("alice") == ["Carol public"]
    assert contents(None) == ["Carol public"]


def test_a_member_writes_personal_rows_and_may_not_ask_for_public(accounts, game):
    alice = accounts.as_("alice")
    refused = _post(alice, game, personal=False)
    assert refused.status_code == 401, refused.text
    ok = _post(alice, game)
    assert ok.status_code == 201 and ok.json()["personal"] is True
    # The mirror: the same request from an editor is a public row.
    assert _post(accounts.as_("carol"), game, personal=False).json()["personal"] is False


def test_an_editor_switches_its_own_row_both_ways(db, accounts, game):
    carol = accounts.as_("carol")
    row = _post(carol, game).json()
    r = carol.patch(f"/api/notes/{row['system_id']}/kind", json={"personal": False})
    assert r.status_code == 200, r.text
    assert r.json()["personal"] is False
    assert [n["content"] for n in _listed(accounts.as_("alice"), game)] == ["Tight combat"]

    # One client, one cookie: the read above signed in as alice.
    r = accounts.as_("carol").patch(f"/api/notes/{row['system_id']}/kind", json={"personal": True})
    assert r.status_code == 200 and r.json()["personal"] is True
    assert _listed(accounts.as_("alice"), game) == []


def test_a_public_row_somebody_else_wrote_is_not_taken_personal(accounts, game):
    row = _post(accounts.as_("dave"), game, personal=False).json()
    r = accounts.as_("carol").patch(f"/api/notes/{row['system_id']}/kind", json={"personal": True})
    assert r.status_code == 422, r.text
    # The mirror: its author may.
    r = accounts.as_("dave").patch(f"/api/notes/{row['system_id']}/kind", json={"personal": True})
    assert r.status_code == 200 and r.json()["personal"] is True


def test_a_member_may_not_publish_its_own_row(accounts, game):
    row = _post(accounts.as_("alice"), game).json()
    r = accounts.as_("alice").patch(f"/api/notes/{row['system_id']}/kind", json={"personal": False})
    assert r.status_code == 401, r.text
    assert _listed(accounts.as_("carol"), game) == []


def test_a_section_without_the_choice_does_not_switch(accounts, game):
    # 物品 Items is mixed without kind_choice: the editor's rows are catalogue.
    r = accounts.as_("carol").post(
        "/api/notes",
        json={
            "owner_type": "game",
            "owner_id": str(game.system_id),
            "section": "items",
            "title": "Flask",
            "personal": True,
        },
    )
    assert r.status_code == 201 and r.json()["personal"] is False
    r = accounts.as_("carol").patch(f"/api/notes/{r.json()['system_id']}/kind", json={"personal": True})
    assert r.status_code == 422, r.text


def test_reorder_renumbers_the_kind_it_names(accounts, game):
    carol = accounts.as_("carol")
    p1 = _post(carol, game, content="p1").json()["system_id"]
    p2 = _post(carol, game, content="p2").json()["system_id"]
    c1 = _post(carol, game, content="c1", personal=False).json()["system_id"]
    c2 = _post(carol, game, content="c2", personal=False).json()["system_id"]
    body = {"owner_type": "game", "owner_id": str(game.system_id), "section": "advantages"}

    # Personal is the default kind: naming the public rows without saying so fails.
    assert carol.patch("/api/notes/reorder", json={**body, "ordered_ids": [c2, c1]}).status_code == 400
    r = carol.patch("/api/notes/reorder", json={**body, "ordered_ids": [c2, c1], "personal": False})
    assert r.status_code == 200, r.text
    r = carol.patch("/api/notes/reorder", json={**body, "ordered_ids": [p2, p1]})
    assert r.status_code == 200, r.text
    assert [n["content"] for n in _listed(carol, game)] == ["c2", "c1", "p2", "p1"]
