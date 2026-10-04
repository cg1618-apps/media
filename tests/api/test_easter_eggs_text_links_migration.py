"""
API integration tests for the revision that makes 彩蛋 Easter Eggs text plus
any number of URL links, like the rest of 解析.

The section was structured, with its links stored as text-and-URL pairs. The
revision rewrites each row's `links` into URL strings - the text is dropped,
a pair with no URL goes, an exact repeat goes, the order stays - and clears the
`fields` blob text_links refuses. The downgrade turns the URLs back into pairs
with no text, which the previous code's validator accepts.

Runs the shipped revision's own `reshape()` and `unshape()` against the test
session - the suite has no Alembic harness.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from app import models
from app.schemas.note import NoteCreate, NoteUpdate, validate_note_payload

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "e4s5teggurl6_easter_eggs_text_links.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_easter_eggs_text_links", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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


def _run(db, step):
    db.commit()
    step(db)
    db.commit()


def _reload(db, row):
    db.expire_all()
    return db.query(models.Note).filter_by(system_id=row.system_id).one()


def test_an_easter_eggs_pairs_become_urls(db_session, revision, sample_anime, admin_user):
    row = _row(
        db_session,
        sample_anime,
        admin_user.id,
        "easter_eggs",
        locator="ep 3",
        content="The poster is the ep 12 villain.",
        links=[
            {"text": "Bilibili", "url": "https://b23.tv/x"},
            {"text": None, "url": " https://youtu.be/y "},
            {"text": "no url", "url": "  "},
            {"text": "again", "url": "https://b23.tv/x"},
        ],
        fields={},
    )
    _run(db_session, revision.reshape)

    row = _reload(db_session, row)
    assert row.links == ["https://b23.tv/x", "https://youtu.be/y"]
    assert row.fields is None
    assert row.locator == "ep 3"
    assert row.content == "The poster is the ep 12 villain."
    # And the row is one the new shape accepts, both as a write and as the
    # merged row a PATCH validates.
    validate_note_payload(
        NoteCreate(
            owner_type="anime",
            owner_id=str(sample_anime.system_id),
            section="easter_eggs",
            locator=row.locator,
            content=row.content,
            links=row.links,
            fields=row.fields,
        )
    )


def test_no_links_becomes_an_empty_list(db_session, revision, sample_anime, admin_user):
    sql_null = _row(db_session, sample_anime, admin_user.id, "easter_eggs", content="a")
    json_null = _row(db_session, sample_anime, admin_user.id, "easter_eggs", content="b")
    db_session.execute(
        text("UPDATE note SET links = 'null'::jsonb WHERE system_id = :id"),
        {"id": json_null.system_id},
    )
    _run(db_session, revision.reshape)

    for row in (sql_null, json_null):
        assert _reload(db_session, row).links == []


def test_the_song_lists_keep_their_pairs(db_session, revision, sample_anime, admin_user):
    """The mirror: a reshape over every section would pass the tests above."""
    pairs = [{"text": "YouTube", "url": "https://youtu.be/a"}]
    row = _row(db_session, sample_anime, admin_user.id, "op", title="紅蓮華", links=pairs)
    _run(db_session, revision.reshape)

    assert _reload(db_session, row).links == pairs


def test_the_downgrade_turns_urls_back_into_pairs(
    db_session, revision, sample_anime, admin_user
):
    row = _row(
        db_session,
        sample_anime,
        admin_user.id,
        "easter_eggs",
        content="The poster is the ep 12 villain.",
        links=["https://b23.tv/x", "https://youtu.be/y"],
    )
    empty = _row(
        db_session, sample_anime, admin_user.id, "easter_eggs", content="x", links=[]
    )
    song = _row(
        db_session,
        sample_anime,
        admin_user.id,
        "op",
        title="紅蓮華",
        links=[{"text": "YouTube", "url": "https://youtu.be/a"}],
    )
    _run(db_session, revision.unshape)

    assert _reload(db_session, row).links == [
        {"text": None, "url": "https://b23.tv/x"},
        {"text": None, "url": "https://youtu.be/y"},
    ]
    assert _reload(db_session, empty).links == []
    assert _reload(db_session, song).links == [
        {"text": "YouTube", "url": "https://youtu.be/a"}
    ]


def test_up_then_down_then_up_is_stable(db_session, revision, sample_anime, admin_user):
    row = _row(
        db_session,
        sample_anime,
        admin_user.id,
        "easter_eggs",
        content="x",
        links=[{"text": "a", "url": "https://a.example"}],
    )
    _run(db_session, revision.reshape)
    _run(db_session, revision.unshape)
    _run(db_session, revision.reshape)

    assert _reload(db_session, row).links == ["https://a.example"]


def test_a_merged_patch_of_a_reshaped_row_validates(
    db_session, revision, sample_anime, admin_user
):
    row = _row(
        db_session,
        sample_anime,
        admin_user.id,
        "easter_eggs",
        content="x",
        links=[{"text": "a", "url": "https://a.example"}],
        fields={},
    )
    _run(db_session, revision.reshape)
    row = _reload(db_session, row)
    merged = NoteUpdate(
        owner_type="anime",
        owner_id=str(sample_anime.system_id),
        section=row.section,
        locator="ep 4",
        content=row.content,
        links=row.links,
        fields=row.fields,
    )
    validate_note_payload(merged)
