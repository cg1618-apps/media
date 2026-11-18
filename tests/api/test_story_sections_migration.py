"""
API integration tests for revision s1q2uests345: every row of the three
retired 劇情 Story sections is deleted, with its note marks, and nothing else
is; and the Side Quest Type suggestions are seeded once.

Runs the shipped revision's own statements against the test session. A
revision's own test, deleted once the revision has deployed (docs/testing.md,
"Migration tests").

Requires PostgreSQL. See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "s1q2uests345_story_and_quests.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_story_and_quests", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def game(db_session):
    g = models.Game(system_id=uuid.uuid4(), game_name_en="明日方舟：終末地")
    db_session.add(g)
    db_session.flush()
    return g


def _note(db, author, owner, section, **columns):
    row = models.Note(
        system_id=uuid.uuid4(),
        media_id=owner.system_id,
        author_id=author.id,
        section=section,
        **columns,
    )
    db.add(row)
    db.flush()
    return row


def _exists(db, table, note) -> bool:
    column = "system_id" if table == "note" else "note_id"
    return (
        db.execute(
            text(f"SELECT count(*) FROM {table} WHERE {column} = :id"),
            {"id": note.system_id},
        ).scalar()
        > 0
    )


def test_the_three_story_sections_go_and_the_strands_stay(
    db_session, revision, owner_user, game
):
    """The set is non-empty on purpose, and mirrored by rows the delete must
    spare, so a green says the filter did the sparing."""
    doomed = [
        _note(
            db_session,
            owner_user,
            game,
            "main_plot",
            locator="祀的劇情",
            links=[{"text": "【Bilibili】", "url": "https://b23.tv/x"}],
        ),
        _note(db_session, owner_user, game, "side_plot", locator="Ch 2"),
        _note(
            db_session,
            owner_user,
            game,
            "character_arcs",
            links=[{"text": "Perlica", "url": "https://a.example"}],
        ),
    ]
    spared = [
        _note(db_session, owner_user, game, "story_list_main", title="Act I"),
        _note(db_session, owner_user, game, "endings", title="True End"),
        _note(db_session, owner_user, game, "story_other", content="x"),
    ]
    # A mark on a doomed row goes with it; one on a spared row stays.
    for note in (doomed[0], spared[1]):
        db_session.add(
            models.NoteMark(
                user_id=owner_user.id, note_id=note.system_id, values={"x": "y"}
            )
        )
    db_session.flush()

    assert revision.delete_story_rows(db_session.connection()) == 3

    for note in doomed:
        assert not _exists(db_session, "note", note), note.section
    assert not _exists(db_session, "note_mark", doomed[0])
    for note in spared:
        assert _exists(db_session, "note", note), note.section
    assert _exists(db_session, "note_mark", spared[1])


def test_the_side_quest_types_are_seeded_once(db_session, revision):
    revision.seed_side_quest_types(db_session.connection())
    revision.seed_side_quest_types(db_session.connection())
    values = (
        db_session.execute(
            text(
                "SELECT value FROM system_option "
                "WHERE category = 'Side Quest Type' ORDER BY sort_order"
            )
        )
        .scalars()
        .all()
    )
    assert values == ["主要支線", "委託", "懸賞", "角色任務", "活動任務", "隱藏任務", "收集"]


def test_the_revision_declares_itself_irreversible(revision):
    assert revision.irreversible is True
