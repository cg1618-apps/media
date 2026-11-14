"""
API integration tests for revision m1i2xedrows3: `note.personal`.

The upgrade only adds the column - every row existing before it is catalogue,
so nothing moves, and the server default says so. The downgrade has nowhere
to keep a personal row of a mixed section (the older code would read it as
catalogue and show it to everyone), so it deletes them before dropping the
column. Runs the shipped revision's own data step against the test session,
as test_note_marks_migration.py does; create_all has already built the
column. The schema half is test_migrations_build_the_schema.py's and
test_migration_round_trip.py's.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "m1i2xedrows3_mixed_note_rows.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_mixed_rows", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_revision_follows_note_marks(revision):
    assert revision.revision == "m1i2xedrows3"
    assert revision.down_revision == "n1o2temarks3"


def test_a_row_written_without_the_column_is_catalogue(db_session, admin_user):
    game = models.Game(system_id=uuid.uuid4(), game_name_en="Old Game")
    db_session.add(game)
    db_session.flush()
    note_id = uuid.uuid4()
    # Raw SQL naming no `personal`, as every writer before the revision did.
    db_session.execute(
        text(
            "INSERT INTO note (system_id, media_id, author_id, section, title) "
            "VALUES (:id, :media, :author, 'items', 'Flask')"
        ),
        {"id": note_id, "media": game.system_id, "author": admin_user.id},
    )
    assert db_session.execute(
        text("SELECT personal FROM note WHERE system_id = :id"), {"id": note_id}
    ).scalar_one() is False


def test_downgrade_deletes_the_personal_rows_and_keeps_the_catalogue(
    db_session, admin_user, plain_user, revision
):
    game = models.Game(system_id=uuid.uuid4(), game_name_en="Old Game")
    db_session.add(game)
    db_session.flush()

    def note(author, personal, **kw):
        row = models.Note(system_id=uuid.uuid4(), media_id=game.system_id,
                          author_id=author.id, section="geography",
                          title="x", personal=personal, **kw)
        db_session.add(row)
        db_session.flush()
        return row

    catalogue = note(admin_user, False)
    mine = note(plain_user, True, parent_id=catalogue.system_id)
    db_session.add(models.NoteMark(user_id=plain_user.id, note_id=mine.system_id,
                                   values={"collected": "collected"}))
    db_session.flush()

    kept, gone = catalogue.system_id, mine.system_id

    revision.delete_personal_rows(db_session.connection())

    db_session.expunge_all()
    assert db_session.get(models.Note, kept) is not None
    assert db_session.get(models.Note, gone) is None
    assert db_session.query(models.NoteMark).filter(
        models.NoteMark.note_id == gone
    ).count() == 0
