"""
API integration tests for the revision that moves every Other Sources row
into Restricted Sources.

Runs the shipped revision's own `move()` against the test session - the suite
has no Alembic harness.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
from pathlib import Path

import pytest

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = (
    ROOT / "alembic" / "versions" / "o1r2srcrestr3_other_sources_to_restricted.py"
)


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_other_to_restricted", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def media_id(db_session):
    anime = models.Anime(anime_name_cn="來源")
    db_session.add(anime)
    db_session.flush()
    return anime.system_id


def _row(db, media_id, bucket, name, position, **kw):
    row = models.MediaSource(
        media_id=media_id, kind="access", bucket=bucket, name=name,
        position=position, **kw,
    )
    db.add(row)
    db.flush()
    return row


def _rows(db, media_id):
    db.expire_all()
    return (
        db.query(models.MediaSource)
        .filter_by(media_id=media_id)
        .order_by(models.MediaSource.position)
        .all()
    )


def test_other_rows_become_restricted_in_place(db_session, media_id, revision):
    myself = _row(db_session, media_id, "other", "Myself", 0, url="https://a.test")
    _row(db_session, media_id, "restricted", "Gimy", 1)
    anime1 = _row(db_session, media_id, "other", "Anime1", 2, url="https://b.test")

    revision.move(db_session.connection())
    rows = _rows(db_session, media_id)

    assert [(r.bucket, r.name, r.url) for r in rows] == [
        ("restricted", "Myself", "https://a.test"),
        ("restricted", "Gimy", None),
        ("restricted", "Anime1", "https://b.test"),
    ]
    # Moved, not copied: the rows keep their ids.
    assert {myself.system_id, anime1.system_id} <= {r.system_id for r in rows}


def test_an_other_row_the_entry_already_has_as_restricted_is_dropped(
    db_session, media_id, revision
):
    # The collision is what makes the delete necessary: without the
    # restricted twin, the UPDATE alone would succeed and this proves nothing.
    kept = _row(db_session, media_id, "restricted", "Gimy", 0, url="https://kept.test")
    _row(db_session, media_id, "other", "Gimy", 1, url="https://dropped.test")

    revision.move(db_session.connection())
    rows = _rows(db_session, media_id)

    assert [(r.system_id, r.bucket, r.url) for r in rows] == [
        (kept.system_id, "restricted", "https://kept.test")
    ]


def test_main_rows_are_untouched(db_session, media_id, revision):
    option = models.SystemOption(category="Platform", value="Netflix")
    db_session.add(option)
    db_session.flush()
    db_session.add(
        models.MediaSource(
            media_id=media_id, kind="access", bucket="main",
            option_id=option.system_id, available=True,
        )
    )
    _row(db_session, media_id, "other", "Myself", 0)

    revision.move(db_session.connection())

    assert sorted(r.bucket for r in _rows(db_session, media_id)) == [
        "main",
        "restricted",
    ]
