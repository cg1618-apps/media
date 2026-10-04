"""
API integration tests for the revision that makes the 評論 Reviews lists text
plus any number of links.

The rows already fit the new shape column for column; the revision moves a URL
typed into a body out into `links`, and stores an empty `links` as `[]`
whatever form it was in. 我的評價 Personal Reviews stays plain text and is
not touched.

Runs the shipped revision's own `reshape()` against the test session - the
suite has no Alembic harness.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from app import models
from app.schemas.note import NoteCreate, validate_note_payload

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "r2v3textlink4_reviews_text_and_links.py"

BILIBILI = "https://www.bilibili.com/video/BV1XjbX6VEfk/?share_source=copy_web"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_reviews_text_links", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def movie(db_session):
    m = models.Movies(movie_name_en="Memory Bureau")
    db_session.add(m)
    db_session.flush()
    return m


def _row(db, owner, author_id, section, **columns):
    row = models.Note(
        system_id=uuid.uuid4(),
        media_id=owner.system_id,
        author_id=author_id,
        section=section,
        **columns,
    )
    db.add(row)
    db.flush()
    return row


def _reshape(db, revision):
    db.commit()
    revision.reshape(db)
    db.commit()


def _reload(db, row):
    db.expire_all()
    return db.query(models.Note).filter_by(system_id=row.system_id).one()


def test_a_url_in_a_public_review_moves_into_its_links(db_session, revision, movie, admin_user):
    row = _row(
        db_session,
        movie,
        admin_user.id,
        "public_reviews",
        content=f"【制作六年评价却两极分化？】 {BILIBILI}",
        links=[],
    )
    _reshape(db_session, revision)

    row = _reload(db_session, row)
    assert row.content == "【制作六年评价却两极分化？】"
    assert row.links == [BILIBILI]
    # And the row is one the new shape accepts on its next edit.
    validate_note_payload(
        NoteCreate(
            owner_type="movie",
            owner_id=str(movie.system_id),
            section="public_reviews",
            content=row.content,
            links=row.links,
        )
    )


def test_urls_join_the_links_already_there_once_each(db_session, revision, movie, admin_user):
    row = _row(
        db_session,
        movie,
        admin_user.id,
        "public_reviews",
        content="Two takes:\nhttps://a.example/1\nsee https://b.example/2.",
        links=["https://a.example/1"],
    )
    _reshape(db_session, revision)

    row = _reload(db_session, row)
    # The line that was only a URL goes; the sentence keeps its full stop.
    assert row.content == "Two takes:\nsee."
    assert row.links == ["https://a.example/1", "https://b.example/2"]


def test_a_body_that_was_only_a_url_becomes_a_link(db_session, revision, movie, admin_user):
    row = _row(db_session, movie, admin_user.id, "advantages", content="https://a.example/x")
    _reshape(db_session, revision)

    row = _reload(db_session, row)
    assert row.content is None
    assert row.links == ["https://a.example/x"]


@pytest.mark.parametrize("section", ["advantages", "disadvantages", "double_edged"])
def test_no_links_is_stored_as_an_empty_list(db_session, revision, movie, admin_user, section):
    sql_null = _row(db_session, movie, admin_user.id, section, content="好看")
    json_null = _row(db_session, movie, admin_user.id, section, content="節奏慢")
    db_session.execute(
        text("UPDATE note SET links = 'null'::jsonb WHERE system_id = :id"),
        {"id": json_null.system_id},
    )
    _reshape(db_session, revision)

    for row in (sql_null, json_null):
        row = _reload(db_session, row)
        assert row.links == []
        assert row.content in ("好看", "節奏慢")


def test_personal_reviews_is_left_alone(db_session, revision, movie, admin_user):
    """The mirror: a reshape over every section would pass the tests above."""
    row = _row(
        db_session,
        movie,
        admin_user.id,
        "personal_reviews",
        content="My verdict https://a.example/mine",
    )
    _reshape(db_session, revision)

    row = _reload(db_session, row)
    assert row.content == "My verdict https://a.example/mine"
    assert row.links is None


def test_split_urls_keeps_paragraph_breaks(revision):
    body, urls = revision.split_urls("First.\n\nSecond https://a.example/z)")
    assert body == "First.\n\nSecond)"
    assert urls == ["https://a.example/z"]
