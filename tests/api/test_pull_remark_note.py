"""
Pulling the Note tab's 備註 Remark and 個人筆記 Personal Notes rows.

`remark` is a list: a sheet remark row the local database does not hold is
one more row for its owner, never a replacement for the one already there.
And a sheet backed up while 個人筆記 was still 備註列表 names its rows
`remark_list`, which Pull files under `personal_notes`.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
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
    "locator",
    "kind",
    "title",
    "content",
    "links",
    "sort_index",
    "created_at",
    "updated_at",
]


def _row(system_id, owner_id, section, content):
    return [
        str(system_id),
        "anime",
        str(owner_id),
        section,
        "",
        "",
        "",
        content,
        "",
        "0",
        "",
        "",
    ]


@pytest.fixture
def sheet(monkeypatch):
    """Feed execute_pull_specific a fake Note tab instead of Google Sheets."""

    def _install(rows):
        monkeypatch.setattr(
            pull, "get_all_raw_rows", lambda tab: [NOTE_HEADERS] + rows
        )

    return _install


def _section(db_session, owner_id, section):
    return (
        db_session.query(models.Note)
        .filter(models.Note.media_id == owner_id, models.Note.section == section)
        .order_by(models.Note.content)
        .all()
    )


def test_pull_adds_a_remark_beside_the_one_the_owner_has(
    db_session, sample_anime, sheet, owner_user,
):
    owner_id = sample_anime.system_id
    local = models.Note(
        author_id=owner_user.id,
        media_id=owner_id,
        section="remark",
        content="local text",
        links=[],
        sort_index=0,
    )
    db_session.add(local)
    db_session.flush()
    local_id = local.system_id

    sheet([_row(uuid.uuid4(), owner_id, "remark", "from the backup")])

    result = pull.execute_pull_specific(db_session, "Note", log_action=False)

    assert result["status"] == "success"
    rows = _section(db_session, owner_id, "remark")
    assert [r.content for r in rows] == ["from the backup", "local text"]
    # The local row is untouched, not overwritten by the sheet's.
    assert local_id in {r.system_id for r in rows}


def test_pull_inserts_every_remark_of_one_owner(db_session, sample_anime, sheet):
    owner_id = sample_anime.system_id
    sheet(
        [
            _row(uuid.uuid4(), owner_id, "remark", "first"),
            _row(uuid.uuid4(), owner_id, "remark", "second"),
        ]
    )

    result = pull.execute_pull_specific(db_session, "Note", log_action=False)

    assert result["status"] == "success"
    assert [r.content for r in _section(db_session, owner_id, "remark")] == [
        "first",
        "second",
    ]


def test_an_old_sheets_remark_list_row_lands_in_personal_notes(
    db_session, sample_anime, sheet
):
    owner_id = sample_anime.system_id
    sheet([_row(uuid.uuid4(), owner_id, "remark_list", "my own note")])

    result = pull.execute_pull_specific(db_session, "Note", log_action=False)

    assert result["status"] == "success"
    assert [r.content for r in _section(db_session, owner_id, "personal_notes")] == [
        "my own note"
    ]
    assert _section(db_session, owner_id, "remark_list") == []
