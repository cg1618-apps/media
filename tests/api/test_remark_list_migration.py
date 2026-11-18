"""
API integration tests for revision p1n2otesrmk3: 備註 Remark becomes a shared
list and 備註列表 becomes 個人筆記 Personal Notes.

Runs the shipped revision's own upgrade() and downgrade() against the test
session, with `op` pointed at the test's connection, as
test_remark_catalogue_migration.py runs r1e2mcatalog3's steps. The schema here
is create_all's, which no longer carries ix_note_one_remark_per_owner, so a
test that starts from the old shape puts it back with the revision's own
create_index - inside the test's transaction, which rolls back at teardown.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import importlib.util
import logging
import types
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = (
    ROOT / "alembic" / "versions" / "p1n2otesrmk3_remark_list_personal_notes.py"
)
INDEX = "ix_note_one_remark_per_owner"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_remark_list", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def conn(db_session, revision, monkeypatch):
    """The test's connection, as the revision's `op.get_bind()` returns it."""
    connection = db_session.connection()
    monkeypatch.setattr(
        revision, "op", types.SimpleNamespace(get_bind=lambda: connection)
    )
    return connection


@pytest.fixture
def old_schema(conn, revision):
    revision.create_index(conn)
    return conn


def _note(db, author, section, content, sort_index=None, links=None, **owner):
    row = models.Note(
        system_id=uuid.uuid4(),
        author_id=author.id,
        section=section,
        content=content,
        sort_index=sort_index,
        links=links,
        **owner,
    )
    db.add(row)
    db.flush()
    return row.system_id


def _row(conn, note_id):
    return conn.execute(
        text("SELECT section, content, links FROM note WHERE system_id = :id"),
        {"id": note_id},
    ).one_or_none()


def _index_exists(conn) -> bool:
    return (
        conn.execute(
            text("SELECT 1 FROM pg_indexes WHERE indexname = :name"), {"name": INDEX}
        ).first()
        is not None
    )


def _second_remark_flushes(db, author, owner_id) -> bool:
    savepoint = db.begin_nested()
    try:
        _note(db, author, "remark", "another", media_id=owner_id)
    except IntegrityError:
        savepoint.rollback()
        return False
    savepoint.rollback()
    return True


# ---------------------------------------------------------------------------
# The multi-line report
# ---------------------------------------------------------------------------


def test_multiline_remarks_lists_only_remarks_that_run_to_several_lines(
    db_session, conn, revision, owner_user, sample_anime, sample_franchise
):
    many = _note(
        db_session, owner_user, "remark", "第一行\n第二行",
        media_id=sample_anime.system_id,
    )
    group = _note(
        db_session, owner_user, "remark", "line one\r\n\r\nline two",
        franchise_id=sample_franchise.system_id,
    )
    # Not listed: one line, one line with trailing blank lines, and a
    # multi-line note that is not a remark.
    _note(db_session, owner_user, "remark", "一行", media_id=sample_anime.system_id)
    _note(db_session, owner_user, "remark", "一行\n\n", media_id=sample_anime.system_id)
    _note(
        db_session, owner_user, "remark_list", "a\nb", media_id=sample_anime.system_id
    )
    media = db_session.get(models.Media, sample_anime.system_id)

    rows = {row["note_id"]: row for row in revision.multiline_remarks(conn)}

    assert set(rows) == {many, group}
    assert rows[many] == {
        "owner_type": "anime",
        "name": media.display_name,
        "public_id": media.public_id,
        "owner_id": sample_anime.system_id,
        "note_id": many,
        "content": "第一行\n第二行",
    }
    assert rows[group]["owner_type"] == "franchise"
    # A group has no display_name; its CN name stands in.
    assert rows[group]["name"] == "測試系列"
    assert rows[group]["public_id"] == sample_franchise.public_id
    assert rows[group]["content"] == "line one\r\n\r\nline two"


def test_upgrade_logs_each_multiline_remark_in_full(
    db_session, old_schema, revision, owner_user, sample_anime, caplog
):
    _note(
        db_session, owner_user, "remark", "第一行\n第二行",
        media_id=sample_anime.system_id,
    )
    with caplog.at_level(logging.INFO, logger=revision.logger.name):
        revision.upgrade()
    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert "1 remark(s) run to more than one line" in logged
    assert "第一行\n第二行" in logged


# ---------------------------------------------------------------------------
# Upgrade
# ---------------------------------------------------------------------------


def test_upgrade_drops_the_singleton_index(
    db_session, old_schema, revision, owner_user, sample_anime
):
    _note(db_session, owner_user, "remark", "已有", media_id=sample_anime.system_id)
    # The old shape refuses a second remark: the index is really there.
    assert _index_exists(old_schema)
    assert not _second_remark_flushes(db_session, owner_user, sample_anime.system_id)

    revision.upgrade()

    assert not _index_exists(old_schema)
    assert _second_remark_flushes(db_session, owner_user, sample_anime.system_id)


def test_upgrade_keeps_each_remark_whole_and_renames_remark_list(
    db_session, old_schema, revision, owner_user, plain_user, sample_anime
):
    remark = _note(
        db_session, owner_user, "remark", "第一行\n第二行",
        media_id=sample_anime.system_id,
    )
    mine = _note(
        db_session, plain_user, "remark_list", "我的", sort_index=3.0, links=[],
        media_id=sample_anime.system_id,
    )
    other = _note(
        db_session, owner_user, "advantages", "不相干", media_id=sample_anime.system_id
    )

    revision.upgrade()

    # One row, text and line breaks untouched, links in the list form.
    assert tuple(_row(old_schema, remark)) == ("remark", "第一行\n第二行", [])
    assert tuple(_row(old_schema, mine)) == ("personal_notes", "我的", [])
    assert _row(old_schema, other).section == "advantages"
    count = old_schema.execute(
        text("SELECT count(*) FROM note WHERE section = 'remark'")
    ).scalar()
    assert count == 1


# ---------------------------------------------------------------------------
# Downgrade
# ---------------------------------------------------------------------------


def test_downgrade_folds_an_owners_remarks_into_its_first(
    db_session, conn, revision, owner_user, plain_user, sample_anime, sample_franchise
):
    second = _note(
        db_session, plain_user, "remark", "第二條", sort_index=2.0,
        links=[{"text": "來源", "url": "https://example.com/a"}],
        media_id=sample_anime.system_id,
    )
    first = _note(
        db_session, owner_user, "remark", "第一條", sort_index=1.0, links=[],
        media_id=sample_anime.system_id,
    )
    alone = _note(
        db_session, owner_user, "remark", "只有一條", links=[],
        franchise_id=sample_franchise.system_id,
    )
    mine = _note(
        db_session, plain_user, "personal_notes", "我的", links=[],
        media_id=sample_anime.system_id,
    )

    revision.downgrade()

    assert tuple(_row(conn, first)) == (
        "remark",
        "第一條\n\n第二條\n來源: https://example.com/a",
        None,
    )
    assert _row(conn, second) is None
    assert tuple(_row(conn, alone)) == ("remark", "只有一條", [])
    assert _row(conn, mine).section == "remark_list"
    # The index is back, and bites.
    assert _index_exists(conn)
    assert not _second_remark_flushes(db_session, owner_user, sample_anime.system_id)


def test_upgrade_then_downgrade_round_trips_one_remark_per_owner(
    db_session, old_schema, revision, owner_user, sample_anime
):
    remark = _note(
        db_session, owner_user, "remark", "一段\n兩行", media_id=sample_anime.system_id
    )
    revision.upgrade()
    revision.downgrade()
    assert _row(old_schema, remark).content == "一段\n兩行"
    assert _index_exists(old_schema)
