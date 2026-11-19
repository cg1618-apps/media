"""
The Needs Work tab: marks travel through Backup and Pull like every other
table.

The owner columns carry uuids that are the same in every database, so they
travel unchanged. What is worth pinning is the round trip, and that a mark
made on both machines - one owner, two uuids - is matched by its owner
instead of colliding with the one-mark-per-owner constraint.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.pipelines import backup, pull
from app.services.pipelines.tabs import TAB_BY_NAME, TAB_NAMES

TAB = "Needs Work"


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def sheets(monkeypatch):
    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


def _backed_up_matrix(db, monkeypatch):
    written = {}

    def record(tab, matrix):
        written[tab] = matrix
        return True

    monkeypatch.setattr(backup, "bulk_overwrite_sheet", record)
    backup.execute_backup(db)
    return written[TAB]


def test_the_tab_is_registered():
    assert TAB in TAB_NAMES
    assert TAB_BY_NAME[TAB].model is models.NeedsWork
    # Catalogue bookkeeping, not authorization.
    assert TAB_BY_NAME[TAB].requires_authz is False


def test_marks_round_trip(db, sheets, monkeypatch, sample_anime, sample_series):
    entry = models.NeedsWork(
        system_id=uuid.uuid4(), media_id=sample_anime.system_id, note="續集未補"
    )
    group = models.NeedsWork(system_id=uuid.uuid4(), series_id=sample_series.system_id)
    db.add_all([entry, group])
    db.flush()
    expected = {
        row.system_id: (row.media_id, row.series_id, row.note) for row in (entry, group)
    }

    matrix = _backed_up_matrix(db, monkeypatch)
    headers = matrix[0]
    assert headers == [c.name for c in models.NeedsWork.__table__.columns]
    assert len(matrix) == 3

    db.query(models.NeedsWork).delete()
    db.flush()
    sheets({TAB: matrix})

    result = pull.execute_pull_specific(db, TAB, log_action=False)

    assert result["status"] == "success", result
    assert result["rows_added"] == 2
    restored = {
        row.system_id: (row.media_id, row.series_id, row.note)
        for row in db.query(models.NeedsWork).all()
    }
    assert restored == expected


def test_a_mark_under_another_uuid_is_matched_by_its_owner(
    db, sheets, monkeypatch, sample_franchise
):
    """Both machines marked the franchise. The sheet's row updates the local
    one - its note wins - rather than failing uq_needs_work_franchise."""
    local = models.NeedsWork(
        system_id=uuid.uuid4(), franchise_id=sample_franchise.system_id, note="舊"
    )
    db.add(local)
    db.flush()
    matrix = _backed_up_matrix(db, monkeypatch)
    headers, row = matrix[0], list(matrix[1])
    row[headers.index("system_id")] = str(uuid.uuid4())
    row[headers.index("note")] = "新"
    sheets({TAB: [headers, row]})

    result = pull.execute_pull_specific(db, TAB, log_action=False)

    assert result["status"] == "success", result
    assert result["rows_added"] == 0
    assert result["rows_updated"] == 1
    marks = db.query(models.NeedsWork).all()
    assert [(m.system_id, m.note) for m in marks] == [(local.system_id, "新")]
