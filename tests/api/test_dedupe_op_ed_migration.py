"""
API integration tests for the revision that folds twin OP and ED rows into one.

Pull used to insert the sheet's copy of a migrated OP/ED row beside the local
one, because each database minted its own uuid for it. The revision deletes
every copy after the first; rows that differ in anything must all survive.

Runs the shipped revision's own `dedupe()` against the test session - the
suite has no Alembic harness.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from datetime import datetime
from pathlib import Path

import pytest

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "d1e2dupmusic3_dedupe_op_ed_notes.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_dedupe_op_ed", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _row(db, anime, author_id, section, created_at, **columns):
    row = models.Note(
        system_id=uuid.uuid4(),
        media_id=anime.system_id,
        author_id=author_id,
        section=section,
        created_at=created_at,
        **columns,
    )
    db.add(row)
    db.flush()
    return row


def _rows(db, anime, section):
    return (
        db.query(models.Note)
        .filter(models.Note.media_id == anime.system_id, models.Note.section == section)
        .all()
    )


def test_twins_fold_into_the_earliest(db_session, sample_anime, admin_user, revision):
    first = _row(
        db_session, sample_anime, admin_user.id, "op", datetime(2026, 1, 1),
        kind="normal", status="Done",
    )
    _row(
        db_session, sample_anime, admin_user.id, "op", datetime(2026, 2, 1),
        kind="normal", status="Done",
    )
    _row(
        db_session, sample_anime, admin_user.id, "ed", datetime(2026, 1, 1),
        kind="normal", status="Done",
    )
    _row(
        db_session, sample_anime, admin_user.id, "ed", datetime(2026, 2, 1),
        kind="normal", status="Done",
    )

    revision.dedupe(db_session.connection())
    db_session.expire_all()

    assert [r.system_id for r in _rows(db_session, sample_anime, "op")] == [
        first.system_id
    ]
    assert len(_rows(db_session, sample_anime, "ed")) == 1


def test_rows_that_differ_all_survive(db_session, sample_anime, admin_user, revision):
    # The mirror of the fold above, with rows on the same owner and section,
    # so a green here proves the partition did the keeping.
    _row(
        db_session, sample_anime, admin_user.id, "op", datetime(2026, 1, 1),
        kind="normal", status="Done", title="Opening A",
    )
    _row(
        db_session, sample_anime, admin_user.id, "op", datetime(2026, 2, 1),
        kind="normal", status="Done", title="Opening B",
    )
    _row(
        db_session, sample_anime, admin_user.id, "op", datetime(2026, 3, 1),
        kind="normal", status="Need", title="Opening A",
    )

    revision.dedupe(db_session.connection())
    db_session.expire_all()

    assert len(_rows(db_session, sample_anime, "op")) == 3
