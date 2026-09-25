"""
API integration tests for 玩法系統 Gameplay Systems losing its links field.

A row saved while the section declared links would otherwise keep them in a
column no field claims, and `_validate_structured` refuses that - so the row
would 422 the first time anybody edited it, on a field they cannot see. The
revision moves each such URL into the description, one per line.

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
REVISION = ROOT / "alembic" / "versions" / "g3s4ysnolink_gameplay_systems_links.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_gameplay_links", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def game(db_session):
    g = models.Game(game_name_en="Elden Ring")
    db_session.add(g)
    db_session.flush()
    return g


def _row(db, game, author_id, section="gameplay_systems", **columns):
    row = models.Note(
        system_id=uuid.uuid4(),
        media_id=game.system_id,
        author_id=author_id,
        section=section,
        **columns,
    )
    db.add(row)
    db.flush()
    return row


def _reload(db, row):
    db.expire_all()
    return db.query(models.Note).filter_by(system_id=row.system_id).one()


def test_links_move_into_the_description(db_session, revision, game, admin_user):
    row = _row(
        db_session,
        game,
        admin_user.id,
        title="祈願",
        content="Pity at 90",
        links=["https://example.com/a", "https://example.com/b"],
    )
    db_session.commit()

    revision.reshape(db_session)
    db_session.commit()

    row = _reload(db_session, row)
    assert row.links is None
    assert row.content == "Pity at 90\nhttps://example.com/a\nhttps://example.com/b"
    assert row.title == "祈願"


def test_a_links_only_row_keeps_its_links_as_its_description(
    db_session, revision, game, admin_user
):
    row = _row(
        db_session, game, admin_user.id, links=["https://example.com/only"]
    )
    db_session.commit()

    revision.reshape(db_session)
    db_session.commit()

    row = _reload(db_session, row)
    assert row.links is None
    assert row.content == "https://example.com/only"


def test_other_sections_keep_their_links(db_session, revision, game, admin_user):
    """
    The mirror case: without it, a reshape that cleared links everywhere
    would pass the two tests above.
    """
    row = _row(
        db_session,
        game,
        admin_user.id,
        section="guide_notes",
        content="Parry everything",
        links=["https://example.com/guide"],
    )
    db_session.commit()

    revision.reshape(db_session)
    db_session.commit()

    row = _reload(db_session, row)
    assert row.links == ["https://example.com/guide"]
    assert row.content == "Parry everything"


def test_a_migrated_row_validates_against_the_new_spec(
    db_session, revision, game, admin_user
):
    from app.schemas.note import NoteCreate, validate_note_payload

    row = _row(
        db_session,
        game,
        admin_user.id,
        kind="gacha",
        title="祈願",
        links=["https://example.com/a"],
    )
    db_session.commit()

    revision.reshape(db_session)
    db_session.commit()

    fresh = _reload(db_session, row)
    validate_note_payload(
        NoteCreate(
            owner_type="game",
            owner_id=game.system_id,
            section=fresh.section,
            kind=fresh.kind,
            title=fresh.title,
            content=fresh.content,
            links=fresh.links,
            fields=fresh.fields,
        )
    )
