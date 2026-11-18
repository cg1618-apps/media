"""
API integration tests for the 劇情列表 Story List group.

Story List sections nest: an entry's `parent_id` names another entry of the
same strand. These tests assert the parent rules - own section only, no
cycles, a delete taking the subtree, a reorder naming the whole section -
against a section that declares itself hierarchical.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import pytest

from app import models

SECTION = "story_list_main"


@pytest.fixture
def game(db_session):
    g = models.Game(game_name_en="Elden Ring")
    db_session.add(g)
    db_session.flush()
    return g


def _entry(client, game, section=SECTION, **payload):
    return client.post(
        "/api/notes",
        json={
            "owner_type": "game",
            "owner_id": str(game.system_id),
            "section": section,
            **payload,
        },
    )


# --- Nesting for real -----------------------------------------------------


def test_a_three_level_entry_round_trips(owner_client, game):
    chapter = _entry(owner_client, game, locator="1", title="Limgrave").json()
    scene = _entry(
        owner_client, game, locator="1.1", title="The Gate",
        parent_id=chapter["system_id"],
    ).json()
    beat = _entry(
        owner_client, game, title="Tree Sentinel", parent_id=scene["system_id"]
    )
    assert beat.status_code == 201, beat.text
    assert beat.json()["parent_id"] == scene["system_id"]

    rows = owner_client.get(
        "/api/notes",
        params={"owner_type": "game", "owner_id": str(game.system_id)},
    ).json()
    by_id = {r["system_id"]: r for r in rows if r["section"] == SECTION}
    assert by_id[chapter["system_id"]]["parent_id"] is None
    assert by_id[scene["system_id"]]["parent_id"] == chapter["system_id"]
    assert by_id[beat.json()["system_id"]]["parent_id"] == scene["system_id"]


def test_an_entry_needs_an_order_number_or_a_name(owner_client, game):
    r = _entry(owner_client, game, content="Something happens")
    assert r.status_code == 422
    assert "at least one of" in r.json()["detail"]

    assert _entry(owner_client, game, locator="3.2").status_code == 201
    assert _entry(owner_client, game, title="The Lake").status_code == 201


def test_a_parent_from_another_strand_is_refused(owner_client, game):
    # The four strands are four sections, so this is the "own section" rule
    # with the case it was actually written for.
    side = _entry(owner_client, game, section="story_list_side", title="Ranni").json()
    r = _entry(owner_client, game, title="Scene", parent_id=side["system_id"])
    assert r.status_code == 422
    assert "its own section" in r.json()["detail"]


def test_deleting_a_chapter_takes_its_scenes_and_beats(
    owner_client, db_session, game
):
    chapter = _entry(owner_client, game, title="Limgrave").json()
    scene = _entry(
        owner_client, game, title="The Gate", parent_id=chapter["system_id"]
    ).json()
    beat = _entry(
        owner_client, game, title="Sentinel", parent_id=scene["system_id"]
    ).json()

    assert owner_client.delete(f"/api/notes/{chapter['system_id']}").status_code == 204
    db_session.expire_all()
    left = {
        str(n.system_id)
        for n in db_session.query(models.Note).filter_by(media_id=game.system_id)
    }
    assert not left & {chapter["system_id"], scene["system_id"], beat["system_id"]}


def test_a_cycle_is_refused_at_any_depth(owner_client, game):
    a = _entry(owner_client, game, title="A").json()
    b = _entry(owner_client, game, title="B", parent_id=a["system_id"]).json()
    c = _entry(owner_client, game, title="C", parent_id=b["system_id"]).json()

    r = owner_client.patch(
        f"/api/notes/{a['system_id']}", json={"parent_id": c["system_id"]}
    )
    assert r.status_code == 422
    assert "loop" in r.json()["detail"]


def test_a_reorder_must_name_every_note_of_the_section(owner_client, game):
    """
    The invariant the page works WITH rather than around.

    A hierarchical section's move only swaps two siblings, so sending just
    that pair would be the smaller payload - and is refused, because a partial
    list would quietly renumber half a section and leave the rest at whatever
    it was. The page flattens its whole tree depth-first instead.
    """
    a = _entry(owner_client, game, title="A").json()
    _entry(owner_client, game, title="A-1", parent_id=a["system_id"]).json()
    b = _entry(owner_client, game, title="B").json()

    partial = owner_client.patch(
        "/api/notes/reorder",
        json={
            "owner_type": "game",
            "owner_id": str(game.system_id),
            "section": SECTION,
            "ordered_ids": [b["system_id"], a["system_id"]],
        },
    )
    assert partial.status_code == 400
    assert "exactly the notes in this section" in partial.json()["detail"]


def test_a_whole_tree_reorder_leaves_sort_index_ascending_as_drawn(
    owner_client, db_session, game
):
    a = _entry(owner_client, game, title="A").json()
    child = _entry(
        owner_client, game, title="A-1", parent_id=a["system_id"]
    ).json()
    b = _entry(owner_client, game, title="B").json()

    # B moved above A, depth-first: B, A, A-1 - which is what the page sends.
    r = owner_client.patch(
        "/api/notes/reorder",
        json={
            "owner_type": "game",
            "owner_id": str(game.system_id),
            "section": SECTION,
            "ordered_ids": [b["system_id"], a["system_id"], child["system_id"]],
        },
    )
    assert r.status_code == 200

    db_session.expire_all()
    rows = {
        str(n.system_id): n.sort_index
        for n in db_session.query(models.Note).filter_by(media_id=game.system_id)
    }
    assert rows[b["system_id"]] < rows[a["system_id"]] < rows[child["system_id"]]

