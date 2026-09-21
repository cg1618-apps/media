"""
API integration tests for the 劇情列表 Story List group.

These are the first sections that actually nest, so the parent rules that
shipped with `note.parent_id` finally have a real caller. The stage that added
the column tested them against `controls` patched hierarchical; this asserts
the same rules against a section that declares it.

Also covers the side_quests migration, by running the shipped revision's own
`reshape()` against the test session - the suite has no Alembic harness.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = (
    ROOT / "alembic" / "versions" / "s3t4orylist5_side_quests_to_story_list.py"
)
SECTION = "story_list_main"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_story_list", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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


def test_a_three_level_entry_round_trips(admin_client, game):
    chapter = _entry(admin_client, game, locator="1", title="Limgrave").json()
    scene = _entry(
        admin_client, game, locator="1.1", title="The Gate",
        parent_id=chapter["system_id"],
    ).json()
    beat = _entry(
        admin_client, game, title="Tree Sentinel", parent_id=scene["system_id"]
    )
    assert beat.status_code == 201, beat.text
    assert beat.json()["parent_id"] == scene["system_id"]

    rows = admin_client.get(
        "/api/notes",
        params={"owner_type": "game", "owner_id": str(game.system_id)},
    ).json()
    by_id = {r["system_id"]: r for r in rows if r["section"] == SECTION}
    assert by_id[chapter["system_id"]]["parent_id"] is None
    assert by_id[scene["system_id"]]["parent_id"] == chapter["system_id"]
    assert by_id[beat.json()["system_id"]]["parent_id"] == scene["system_id"]


def test_an_entry_needs_an_order_number_or_a_name(admin_client, game):
    r = _entry(admin_client, game, content="Something happens")
    assert r.status_code == 422
    assert "at least one of" in r.json()["detail"]

    assert _entry(admin_client, game, locator="3.2").status_code == 201
    assert _entry(admin_client, game, title="The Lake").status_code == 201


def test_a_parent_from_another_strand_is_refused(admin_client, game):
    # The four strands are four sections, so this is the "own section" rule
    # with the case it was actually written for.
    side = _entry(admin_client, game, section="story_list_side", title="Ranni").json()
    r = _entry(admin_client, game, title="Scene", parent_id=side["system_id"])
    assert r.status_code == 422
    assert "its own section" in r.json()["detail"]


def test_deleting_a_chapter_takes_its_scenes_and_beats(
    admin_client, db_session, game
):
    chapter = _entry(admin_client, game, title="Limgrave").json()
    scene = _entry(
        admin_client, game, title="The Gate", parent_id=chapter["system_id"]
    ).json()
    beat = _entry(
        admin_client, game, title="Sentinel", parent_id=scene["system_id"]
    ).json()

    assert admin_client.delete(f"/api/notes/{chapter['system_id']}").status_code == 204
    db_session.expire_all()
    left = {
        str(n.system_id)
        for n in db_session.query(models.Note).filter_by(media_id=game.system_id)
    }
    assert not left & {chapter["system_id"], scene["system_id"], beat["system_id"]}


def test_a_cycle_is_refused_at_any_depth(admin_client, game):
    a = _entry(admin_client, game, title="A").json()
    b = _entry(admin_client, game, title="B", parent_id=a["system_id"]).json()
    c = _entry(admin_client, game, title="C", parent_id=b["system_id"]).json()

    r = admin_client.patch(
        f"/api/notes/{a['system_id']}", json={"parent_id": c["system_id"]}
    )
    assert r.status_code == 422
    assert "loop" in r.json()["detail"]


def test_a_reorder_must_name_every_note_of_the_section(admin_client, game):
    """
    The invariant the page works WITH rather than around.

    A hierarchical section's move only swaps two siblings, so sending just
    that pair would be the smaller payload - and is refused, because a partial
    list would quietly renumber half a section and leave the rest at whatever
    it was. The page flattens its whole tree depth-first instead.
    """
    a = _entry(admin_client, game, title="A").json()
    _entry(admin_client, game, title="A-1", parent_id=a["system_id"]).json()
    b = _entry(admin_client, game, title="B").json()

    partial = admin_client.patch(
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
    admin_client, db_session, game
):
    a = _entry(admin_client, game, title="A").json()
    child = _entry(
        admin_client, game, title="A-1", parent_id=a["system_id"]
    ).json()
    b = _entry(admin_client, game, title="B").json()

    # B moved above A, depth-first: B, A, A-1 - which is what the page sends.
    r = admin_client.patch(
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


# --- 6-2: side_quests rows arrive here ------------------------------------


def _side_quest(db, game, author_id, **columns):
    row = models.Note(
        system_id=uuid.uuid4(),
        media_id=game.system_id,
        author_id=author_id,
        section="side_quests",
        **columns,
    )
    db.add(row)
    db.flush()
    return row


def _reload(db, row):
    db.expire_all()
    return db.query(models.Note).filter_by(system_id=row.system_id).one()


def test_a_side_quest_becomes_a_side_strand_entry(
    db_session, revision, game, admin_user
):
    row = _side_quest(
        db_session,
        game,
        admin_user.id,
        title="Ranni's questline",
        sort_index=3.0,
        entries=[
            {"type": "text", "value": "Do not kill Blaidd"},
            {"type": "link", "value": "https://example.com/ranni", "label": "Steps"},
        ],
    )
    db_session.commit()

    revision.reshape(db_session)
    db_session.commit()

    row = _reload(db_session, row)
    assert row.section == "story_list_side"
    assert row.title == "Ranni's questline"
    assert row.content == "Do not kill Blaidd"
    assert row.links == ["https://example.com/ranni"]
    assert row.entries is None
    # The order it was already in is the order it keeps; the old shape had
    # nowhere to put an order NUMBER, so it gets none.
    assert row.sort_index == 3.0
    assert row.locator is None
    assert row.parent_id is None


def test_a_nameless_side_quest_is_named_by_its_first_line(
    db_session, revision, game, admin_user
):
    """
    A Story List entry needs an order number or a name. A row with neither
    would read fine and then 422 the first time anybody edited it, on a field
    they had not touched.
    """
    row = _side_quest(
        db_session,
        game,
        admin_user.id,
        entries=[
            {"type": "text", "value": "Volcano Manor"},
            {"type": "text", "value": "Three invasions"},
        ],
    )
    db_session.commit()

    revision.reshape(db_session)
    db_session.commit()

    row = _reload(db_session, row)
    assert row.title == "Volcano Manor"
    # ...and the line it became is no longer also in the description.
    assert row.content == "Three invasions"


def test_every_migrated_side_quest_validates_against_the_new_spec(
    db_session, revision, game, admin_user
):
    from app.schemas.note import NoteCreate, validate_note_payload

    rows = [
        _side_quest(db_session, game, admin_user.id, title="Named", content="Body"),
        _side_quest(
            db_session,
            game,
            admin_user.id,
            entries=[{"type": "text", "value": "Nameless"}],
        ),
        _side_quest(
            db_session,
            game,
            admin_user.id,
            title="Links only",
            entries=[{"type": "link", "value": "https://example.com"}],
        ),
    ]
    db_session.commit()

    revision.reshape(db_session)
    db_session.commit()

    for row in rows:
        fresh = _reload(db_session, row)
        validate_note_payload(
            NoteCreate(
                owner_type="game",
                owner_id=game.system_id,
                section=fresh.section,
                locator=fresh.locator,
                title=fresh.title,
                content=fresh.content,
                links=fresh.links,
                entries=fresh.entries,
                fields=fresh.fields,
                parent_id=fresh.parent_id,
            )
        )
