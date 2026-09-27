"""
API integration tests for the h_game field revamp's data half.

H 演出形式 took a new vocabulary no old value maps onto, so the revision clears
it on every h-game and on every 亮點 Highlights note, which offers the same
options. A note left holding an old value would 422 the first time anybody
edited it, on a field whose options no longer name what it holds.

Runs the shipped revision's own `reshape()` against the test session - the
suite has no Alembic harness.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "h4g5amefx6_h_game_field_revamp.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_h_game_revamp", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def h_game(db_session):
    # Stored straight through the ORM: the write schemas would refuse the old
    # vocabulary, which is exactly what a row from before the revision holds.
    g = models.HGame(
        h_game_name_cn="舊作",
        h_presentation=["靜圖", "互動"],
        art_style=["2D"],
        dialogue_audio=["H場景"],
    )
    db_session.add(g)
    db_session.flush()
    return g


def _note(db, h_game, author_id, section, fields):
    row = models.Note(
        system_id=uuid.uuid4(),
        media_id=h_game.system_id,
        author_id=author_id,
        section=section,
        fields=fields,
    )
    db.add(row)
    db.flush()
    return row


def _reload(db, model, row):
    db.expire_all()
    return db.query(model).filter_by(system_id=row.system_id).one()


def test_the_entry_column_is_cleared_and_its_neighbours_kept(
    db_session, revision, h_game
):
    revision.reshape(db_session)
    g = _reload(db_session, models.HGame, h_game)
    assert g.h_presentation is None
    # The mirror: a reshape that nulled every list would pass the line above.
    assert g.art_style == ["2D"]
    assert g.dialogue_audio == ["H場景"]


def test_a_highlight_loses_only_its_h_presentation(
    db_session, revision, h_game, admin_user
):
    note = _note(
        db_session,
        h_game,
        admin_user.id,
        "h_game_highlights",
        {"female_characters": ["Ana"], "h_presentation": "靜圖", "audio": "H場景"},
    )
    revision.reshape(db_session)
    assert _reload(db_session, models.Note, note).fields == {
        "female_characters": ["Ana"],
        "audio": "H場景",
    }


def test_another_sections_h_presentation_key_is_left_alone(
    db_session, revision, h_game, admin_user
):
    """The mirror: only the highlights section offers the h_game options."""
    note = _note(
        db_session,
        h_game,
        admin_user.id,
        "gameplay_systems",
        {"h_presentation": "kept"},
    )
    revision.reshape(db_session)
    assert _reload(db_session, models.Note, note).fields == {"h_presentation": "kept"}
