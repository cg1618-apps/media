"""
API integration tests for the revision that folds 攻略筆記 Guide Notes links
and h-game 亮點 Highlights locations into the description.

A guide note is plain text now, so its links would sit in a column nothing
shows. An h-game highlight no longer declares `location`, and
`_validate_structured` refuses a `fields` key the section does not declare -
so the row would 422 the first time anybody edited it. The revision moves both
into the row's description.

Runs the shipped revision's own `reshape()` against the test session - the
suite has no Alembic harness.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest

from app import models
from app.schemas.note import NoteCreate, validate_note_payload

ROOT = Path(__file__).resolve().parents[2]
REVISION = (
    ROOT / "alembic" / "versions" / "h6n7otesect8_guide_notes_and_highlight_location.py"
)


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_guide_notes_location", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def game(db_session):
    g = models.Game(game_name_en="Elden Ring")
    db_session.add(g)
    db_session.flush()
    return g


@pytest.fixture
def h_game(db_session):
    g = models.HGame(h_game_name_cn="Zvornik")
    db_session.add(g)
    db_session.flush()
    return g


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


def test_guide_note_links_move_into_the_description(
    db_session, revision, game, admin_user
):
    row = _row(
        db_session,
        game,
        admin_user.id,
        "guide_notes",
        content="Parry everything",
        links=["https://example.com/a", " ", "https://example.com/b"],
    )
    _reshape(db_session, revision)

    row = _reload(db_session, row)
    assert row.links is None
    assert row.content == "Parry everything\nhttps://example.com/a\nhttps://example.com/b"


def test_a_links_only_guide_note_keeps_them_as_its_description(
    db_session, revision, game, admin_user
):
    row = _row(
        db_session, game, admin_user.id, "guide_notes", links=["https://example.com/only"]
    )
    _reshape(db_session, revision)

    row = _reload(db_session, row)
    assert row.links is None
    assert row.content == "https://example.com/only"


def test_other_sections_keep_their_links(db_session, revision, game, admin_user):
    """The mirror: a reshape clearing links everywhere would pass the above."""
    row = _row(
        db_session,
        game,
        admin_user.id,
        "controls",
        title="L2",
        content="Guard",
        links=["https://example.com/guide"],
    )
    _reshape(db_session, revision)

    row = _reload(db_session, row)
    assert row.links == ["https://example.com/guide"]
    assert row.content == "Guard"


def test_a_highlight_location_moves_into_the_description(
    db_session, revision, h_game, admin_user
):
    row = _row(
        db_session,
        h_game,
        admin_user.id,
        "h_game_highlights",
        content="what happens",
        fields={"female_characters": ["Ana"], "location": "classroom"},
    )
    _reshape(db_session, revision)

    row = _reload(db_session, row)
    assert row.content == "what happens\nLocation: classroom"
    assert row.fields == {"female_characters": ["Ana"]}


def test_a_blank_location_is_dropped_without_a_line(
    db_session, revision, h_game, admin_user
):
    row = _row(
        db_session,
        h_game,
        admin_user.id,
        "h_game_highlights",
        content="what happens",
        fields={"female_characters": ["Ana"], "location": "  "},
    )
    _reshape(db_session, revision)

    row = _reload(db_session, row)
    assert row.content == "what happens"
    assert row.fields == {"female_characters": ["Ana"]}


def test_an_h_comic_highlight_keeps_its_location(
    db_session, revision, admin_user
):
    """The mirror: h-comic still declares `location`, and must keep it."""
    comic = models.HComic(h_comic_name_cn="Zvornik KR", region="KR")
    db_session.add(comic)
    db_session.flush()
    row = _row(
        db_session,
        comic,
        admin_user.id,
        "h_comic_highlights",
        content="what happens",
        fields={"female_characters": ["Ana"], "location": "classroom"},
    )
    _reshape(db_session, revision)

    row = _reload(db_session, row)
    assert row.fields["location"] == "classroom"
    assert row.content == "what happens"


def test_a_migrated_highlight_validates_against_the_new_spec(
    db_session, revision, h_game, admin_user
):
    row = _row(
        db_session,
        h_game,
        admin_user.id,
        "h_game_highlights",
        fields={"female_characters": ["Ana"], "location": "classroom"},
    )
    payload = dict(
        owner_type="h-game",
        owner_id=h_game.system_id,
        section="h_game_highlights",
    )
    # The mirror first: the unmigrated row is what the new spec refuses.
    with pytest.raises(ValueError):
        validate_note_payload(NoteCreate(**payload, fields=row.fields))

    _reshape(db_session, revision)

    fresh = _reload(db_session, row)
    validate_note_payload(
        NoteCreate(**payload, content=fresh.content, fields=fresh.fields)
    )
