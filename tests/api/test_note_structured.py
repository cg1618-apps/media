"""
API integration tests for structured note rows.

The `structured` shape splits one row across a `note` column and the `fields`
JSONB blob according to the section's registry spec, and adds the parent rules
the schema layer cannot check without a query. Both halves are exercised here
against a real database.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import dataclasses
import uuid

import pytest

from app import models
from app.utils import note_sections as ns


@pytest.fixture
def game(db_session):
    g = models.Game(game_name_en="Elden Ring")
    db_session.add(g)
    db_session.flush()
    return g


@pytest.fixture
def nesting_section(monkeypatch):
    """
    `controls`, temporarily hierarchical.

    No shipped section nests yet - the Story List group is a later change -
    but `note.parent_id` and the router rules around it ship now, so they are
    tested against a section patched into the state the registry will declare
    rather than left uncovered until then.
    """
    nesting = dataclasses.replace(ns.section_by_key("controls"), hierarchical=True)
    monkeypatch.setitem(ns._BY_KEY, "controls", nesting)
    return nesting


def _create(client, game, **payload):
    return client.post(
        "/api/notes",
        json={
            "owner_type": "game",
            "owner_id": str(game.system_id),
            "section": "controls",
            **payload,
        },
    )


# --- Round trip -----------------------------------------------------------


def test_a_structured_row_round_trips_columns_and_the_blob(
    admin_client, db_session, game
):
    r = _create(
        admin_client,
        game,
        title="L2 + O",
        content="Parry on the upswing.",
        links=["https://example.com/guide"],
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["title"] == "L2 + O"
    assert body["content"] == "Parry on the upswing."
    assert body["links"] == ["https://example.com/guide"]
    # Every `controls` field claims a column, so nothing lands in the blob.
    assert body["fields"] is None

    row = db_session.query(models.Note).filter_by(system_id=body["system_id"]).one()
    assert row.title == "L2 + O"
    assert row.fields is None


def test_the_blob_survives_the_database(admin_client, db_session, game, monkeypatch):
    # `controls` stores nothing in `fields`, so a blob-backed field is patched
    # in: what is under test is the COLUMN, not this section's spec.
    section = ns.section_by_key("controls")
    with_blob = dataclasses.replace(
        section,
        fields=section.fields
        + (
            ns.NoteField(key="region", label="Region"),
            ns.NoteField(
                key="drops",
                label="Drops",
                type=ns.FIELD_LIST,
                item_fields=(ns.NoteField(key="item", label="Item"),),
            ),
        ),
    )
    monkeypatch.setitem(ns._BY_KEY, "controls", with_blob)

    r = _create(
        admin_client,
        game,
        title="Malenia",
        fields={"region": "Haligtree", "drops": [{"item": "Great Rune"}]},
    )
    assert r.status_code == 201, r.text
    row = db_session.query(models.Note).filter_by(system_id=r.json()["system_id"]).one()
    assert row.fields == {"region": "Haligtree", "drops": [{"item": "Great Rune"}]}


def test_an_undeclared_field_is_refused(admin_client, game):
    r = _create(admin_client, game, title="L2", fields={"region": "Haligtree"})
    assert r.status_code == 422
    assert "has no field 'region'" in r.json()["detail"]


def test_a_patch_revalidates_against_the_spec(admin_client, game):
    created = _create(admin_client, game, title="L2 + O").json()
    r = admin_client.patch(
        f"/api/notes/{created['system_id']}", json={"locator": "Ch 3"}
    )
    assert r.status_code == 422
    assert "takes no 'locator'" in r.json()["detail"]


def test_a_patch_may_clear_a_field_while_another_still_carries_the_row(
    admin_client, game
):
    created = _create(admin_client, game, title="L2 + O", content="Parry.").json()
    r = admin_client.patch(f"/api/notes/{created['system_id']}", json={"title": None})
    assert r.status_code == 200
    assert r.json()["title"] is None
    assert r.json()["content"] == "Parry."


def test_a_patch_emptying_every_field_is_refused(admin_client, game):
    created = _create(admin_client, game, title="L2 + O").json()
    r = admin_client.patch(f"/api/notes/{created['system_id']}", json={"title": None})
    assert r.status_code == 422
    assert "empty" in r.json()["detail"]


# --- Nesting --------------------------------------------------------------


def test_a_flat_section_refuses_a_parent(admin_client, game):
    parent = _create(admin_client, game, title="parent").json()
    r = _create(admin_client, game, title="child", parent_id=parent["system_id"])
    assert r.status_code == 422
    assert "do not nest" in r.json()["detail"]


def test_a_child_is_stored_under_its_parent(
    admin_client, db_session, game, nesting_section
):
    parent = _create(admin_client, game, title="Chapter 1").json()
    r = _create(admin_client, game, title="Scene 1", parent_id=parent["system_id"])
    assert r.status_code == 201, r.text
    assert r.json()["parent_id"] == parent["system_id"]

    row = db_session.query(models.Note).filter_by(system_id=r.json()["system_id"]).one()
    assert str(row.parent_id) == parent["system_id"]


def test_a_missing_parent_is_refused(admin_client, game, nesting_section):
    r = _create(admin_client, game, title="orphan", parent_id=str(uuid.uuid4()))
    assert r.status_code == 422
    assert "Parent note not found" in r.json()["detail"]


def test_a_parent_in_another_section_is_refused(
    admin_client, db_session, game, admin_user, nesting_section
):
    other = models.Note(
        system_id=uuid.uuid4(),
        author_id=admin_user.id,
        media_id=game.system_id,
        section="beginner",
        content="Read the manual.",
    )
    db_session.add(other)
    db_session.flush()

    r = _create(admin_client, game, title="child", parent_id=str(other.system_id))
    assert r.status_code == 422
    assert "its own section" in r.json()["detail"]


def test_a_parent_on_another_owner_is_refused(
    admin_client, db_session, game, nesting_section
):
    other_game = models.Game(game_name_en="Sekiro")
    db_session.add(other_game)
    db_session.flush()
    elsewhere = admin_client.post(
        "/api/notes",
        json={
            "owner_type": "game",
            "owner_id": str(other_game.system_id),
            "section": "controls",
            "title": "elsewhere",
        },
    ).json()

    r = _create(admin_client, game, title="child", parent_id=elsewhere["system_id"])
    assert r.status_code == 422
    assert "its own owner" in r.json()["detail"]


def test_a_row_may_not_become_its_own_parent(admin_client, game, nesting_section):
    row = _create(admin_client, game, title="self").json()
    r = admin_client.patch(
        f"/api/notes/{row['system_id']}", json={"parent_id": row["system_id"]}
    )
    assert r.status_code == 422
    assert "its own parent" in r.json()["detail"]


def test_a_cycle_deeper_than_one_row_is_refused(admin_client, game, nesting_section):
    # A is not B's parent directly: A -> B -> C, and then C is offered as A's
    # parent. "Not your own parent" does not catch this, and the page would
    # recurse forever on the tree it produced.
    a = _create(admin_client, game, title="A").json()
    b = _create(admin_client, game, title="B", parent_id=a["system_id"]).json()
    c = _create(admin_client, game, title="C", parent_id=b["system_id"]).json()

    r = admin_client.patch(
        f"/api/notes/{a['system_id']}", json={"parent_id": c["system_id"]}
    )
    assert r.status_code == 422
    assert "loop" in r.json()["detail"]


def test_deleting_a_parent_takes_its_subtree(
    admin_client, db_session, game, nesting_section
):
    a = _create(admin_client, game, title="A").json()
    b = _create(admin_client, game, title="B", parent_id=a["system_id"]).json()
    c = _create(admin_client, game, title="C", parent_id=b["system_id"]).json()

    assert admin_client.delete(f"/api/notes/{a['system_id']}").status_code == 204
    db_session.expire_all()
    remaining = {
        str(n.system_id)
        for n in db_session.query(models.Note).filter_by(media_id=game.system_id)
    }
    assert not remaining & {a["system_id"], b["system_id"], c["system_id"]}
