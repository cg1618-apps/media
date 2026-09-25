"""
Pulling the Note tab must survive a backup holding more than one `ost` row for
an anime.

`ost` is one row per anime (ix_note_one_ost_per_owner). A backup taken before
that rule held two identical rows per anime, and the second - or any row whose
system_id the local database no longer has - would be inserted blindly, raise
IntegrityError at commit, and roll back the ENTIRE tab. Pull retargets such a
row at the one the anime already has, as it does for `remark`.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.pipelines import pull

NOTE_HEADERS = [
    "system_id",
    "owner_type",
    "owner_id",
    "section",
    "kind",
    "status",
    "sort_index",
]


def _row(system_id, owner_id, section, kind, status):
    return [str(system_id), "anime", str(owner_id), section, kind, status, "0"]


@pytest.fixture
def sheet(monkeypatch):
    """Feed execute_pull_specific a fake Note tab instead of Google Sheets."""

    def _install(rows):
        monkeypatch.setattr(
            pull, "get_all_raw_rows", lambda tab: [NOTE_HEADERS] + rows
        )

    return _install


def _osts(db_session, owner_id):
    return (
        db_session.query(models.Note)
        .filter(models.Note.media_id == owner_id, models.Note.section == "ost")
        .all()
    )


def test_pull_folds_two_sheet_ost_rows_into_one(db_session, sample_anime, sheet):
    owner_id = sample_anime.system_id
    sheet(
        [
            _row(uuid.uuid4(), owner_id, "ost", "normal", "Pending"),
            _row(uuid.uuid4(), owner_id, "ost", "normal", "Done"),
        ]
    )

    result = pull.execute_pull_specific(db_session, "Note", log_action=False)

    assert result["status"] == "success"
    rows = _osts(db_session, owner_id)
    assert len(rows) == 1
    # The later sheet row wins, as a second write to the one entry would.
    assert rows[0].status == "Done"


def test_pull_updates_the_existing_ost_instead_of_inserting_a_second(
    db_session, sample_anime, sheet, admin_user,
):
    owner_id = sample_anime.system_id
    local = models.Note(
        author_id=admin_user.id,
        media_id=owner_id,
        section="ost",
        kind="normal",
        status="Need",
        sort_index=0,
    )
    db_session.add(local)
    db_session.flush()
    local_id = local.system_id

    sheet([_row(uuid.uuid4(), owner_id, "ost", "normal", "Done")])

    result = pull.execute_pull_specific(db_session, "Note", log_action=False)

    assert result["status"] == "success"
    rows = _osts(db_session, owner_id)
    assert len(rows) == 1
    assert rows[0].system_id == local_id
    assert rows[0].status == "Done"
