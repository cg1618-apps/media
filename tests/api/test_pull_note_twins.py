"""
Pulling the Note tab must not double a note that each database minted its own
uuid for.

The OP and ED rows were created by a migration, once per database, each with
`gen_random_uuid()` - so the same row reads as two different ids on two
machines. Pull matches on system_id, finds nothing, and inserts the sheet's
copy beside the local one: one OP becomes two identical OPs.

A sheet row whose id is unknown here is therefore retargeted at a local row
with the same owner, section and content - but only a local row whose OWN id
is not in the sheet, so a row that already has its own sheet copy is never
claimed, and each local row is claimed at most once. The second guard is what
keeps two genuinely separate identical rows (two unnamed OPs) apart.

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


@pytest.fixture
def local_op(db_session, sample_anime, admin_user):
    """One OP row, normal and Done, under this database's own uuid."""
    note = models.Note(
        author_id=admin_user.id,
        media_id=sample_anime.system_id,
        section="op",
        kind="normal",
        status="Done",
        sort_index=0,
    )
    db_session.add(note)
    db_session.flush()
    return note


def _ops(db_session, owner_id):
    return (
        db_session.query(models.Note)
        .filter(models.Note.media_id == owner_id, models.Note.section == "op")
        .all()
    )


def test_pull_retargets_a_twin_under_another_uuid(
    db_session, sample_anime, local_op, sheet
):
    owner_id = sample_anime.system_id
    local_id = local_op.system_id
    sheet([_row(uuid.uuid4(), owner_id, "op", "normal", "Done")])

    result = pull.execute_pull_specific(db_session, "Note", log_action=False)

    assert result["status"] == "success"
    rows = _ops(db_session, owner_id)
    assert [r.system_id for r in rows] == [local_id]


def test_pull_keeps_a_second_identical_row_when_the_local_one_is_in_the_sheet(
    db_session, sample_anime, local_op, sheet
):
    # The local row travels under its own id, so it is not a twin of anything:
    # the sheet genuinely holds two unnamed OPs, and both must survive.
    owner_id = sample_anime.system_id
    sheet(
        [
            _row(local_op.system_id, owner_id, "op", "normal", "Done"),
            _row(uuid.uuid4(), owner_id, "op", "normal", "Done"),
        ]
    )

    result = pull.execute_pull_specific(db_session, "Note", log_action=False)

    assert result["status"] == "success"
    assert len(_ops(db_session, owner_id)) == 2


def test_pull_claims_a_local_twin_only_once(
    db_session, sample_anime, local_op, sheet
):
    owner_id = sample_anime.system_id
    sheet(
        [
            _row(uuid.uuid4(), owner_id, "op", "normal", "Done"),
            _row(uuid.uuid4(), owner_id, "op", "normal", "Done"),
        ]
    )

    result = pull.execute_pull_specific(db_session, "Note", log_action=False)

    assert result["status"] == "success"
    assert len(_ops(db_session, owner_id)) == 2


def test_pull_inserts_an_unknown_row_whose_content_differs(
    db_session, sample_anime, local_op, sheet
):
    owner_id = sample_anime.system_id
    sheet([_row(uuid.uuid4(), owner_id, "op", "normal", "Need")])

    result = pull.execute_pull_specific(db_session, "Note", log_action=False)

    assert result["status"] == "success"
    assert sorted(r.status for r in _ops(db_session, owner_id)) == ["Done", "Need"]
