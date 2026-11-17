"""
API integration tests for revision c1o2micrmk3: every 備註 and 備註列表 row
owned by a Comic entry is deleted, for every author, and nothing else is.

Runs the shipped revision's own statement against the test session, as
test_remark_catalogue_migration.py does.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "c1o2micrmk3_clear_comic_remarks.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_clear_comic_remarks", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def sample_h_comic(db_session):
    h = models.HComic(system_id=uuid.uuid4(), h_comic_name_en="Test H-Comic")
    db_session.add(h)
    db_session.flush()
    return h


def _note(db, author, section, content, *, owner=None, series=None, **extra):
    row = models.Note(
        system_id=uuid.uuid4(),
        media_id=owner.system_id if owner is not None else None,
        series_id=series.system_id if series is not None else None,
        author_id=author.id,
        section=section,
        content=content,
        **extra,
    )
    db.add(row)
    db.flush()
    return row


def _exists(db, note) -> bool:
    return (
        db.execute(
            text("SELECT count(*) FROM note WHERE system_id = :id"),
            {"id": note.system_id},
        ).scalar()
        == 1
    )


def test_every_comic_remark_and_remark_list_row_goes(
    db_session, revision, owner_user, plain_user, sample_comic
):
    """The shared remark and both authors' personal rows - the set is made
    non-empty on purpose, so the deletion is what turns it empty."""
    remark = _note(db_session, owner_user, "remark", "備註", owner=sample_comic)
    mine = _note(
        db_session, owner_user, "remark_list", "我的", owner=sample_comic, links=[]
    )
    theirs = _note(
        db_session, plain_user, "remark_list", "他的", owner=sample_comic, links=[]
    )

    assert revision.clear_comic_remarks(db_session.connection()) == 3

    assert not _exists(db_session, remark)
    assert not _exists(db_session, mine)
    assert not _exists(db_session, theirs)


def test_other_types_groups_and_sections_are_untouched(
    db_session,
    revision,
    owner_user,
    sample_comic,
    sample_h_comic,
    sample_anime,
    sample_series,
):
    """The mirror case: rows the wipe must spare, beside one it must take, so
    a green proves the filter did the sparing."""
    doomed = _note(db_session, owner_user, "remark", "comic", owner=sample_comic)
    spared = [
        _note(db_session, owner_user, "remark", "h-comic", owner=sample_h_comic),
        _note(db_session, owner_user, "remark", "anime", owner=sample_anime),
        _note(db_session, owner_user, "remark", "series", series=sample_series),
        _note(
            db_session,
            owner_user,
            "remark_list",
            "h-comic list",
            owner=sample_h_comic,
            links=[],
        ),
        _note(db_session, owner_user, "highlights", "x", owner=sample_comic),
    ]

    assert revision.clear_comic_remarks(db_session.connection()) == 1

    assert not _exists(db_session, doomed)
    for row in spared:
        assert _exists(db_session, row), row.content


def test_the_revision_declares_itself_irreversible(revision):
    assert revision.irreversible is True
