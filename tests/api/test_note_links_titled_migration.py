"""
API integration tests for revision n1l2inkpairs3: every note link becomes a
titled pair, and controls, classes, geography, episode_comments, main_plot,
side_plot, character_arcs and trivia are reshaped losslessly.

Runs the shipped revision's own data steps against the test session - the
suite has no Alembic harness. The from-zero proof is
test_migrations_build_the_schema.py.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "n1l2inkpairs3_note_links_titled.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_note_links_titled", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def game(db_session):
    row = models.Game(game_name_en="Zvornik Endfield")
    db_session.add(row)
    db_session.flush()
    return row


@pytest.fixture
def note(db_session, game, owner_user):
    def make(section, **columns):
        row = models.Note(
            system_id=uuid.uuid4(),
            media_id=game.system_id,
            author_id=owner_user.id,
            section=section,
            **columns,
        )
        db_session.add(row)
        db_session.flush()
        return row

    return make


def _upgrade(db_session, revision):
    conn = db_session.connection()
    revision.fold_links_into_text(conn)
    revision.links_to_pairs(conn)
    revision.plot_description_to_chapter(conn)
    revision.arcs_to_titled_links(conn)
    revision.trivia_locator_to_title(conn)
    db_session.expire_all()


def _get(db_session, row):
    return db_session.get(models.Note, row.system_id)


def _pair(url, text=None):
    return {"text": text, "url": url}


# --- every link becomes a pair ---------------------------------------------


def test_url_strings_become_untitled_pairs_and_pairs_are_untouched(
    db_session, note, revision
):
    strings = note("analysis", content="x", links=["https://a.example", "https://b.example"])
    song_pairs = [_pair("https://y.example", "YouTube")]
    already = note("public_reviews", content="y", links=song_pairs)
    json_null = note("resources", title="wiki", links=None)
    empty = note("beginner", content="z", links=[])

    _upgrade(db_session, revision)
    # Idempotent: a second run finds nothing left to convert.
    _upgrade(db_session, revision)

    assert _get(db_session, strings).links == [
        _pair("https://a.example"),
        _pair("https://b.example"),
    ]
    assert _get(db_session, already).links == song_pairs
    assert _get(db_session, json_null).links is None
    assert _get(db_session, empty).links == []


# --- sections losing their links ----------------------------------------------


@pytest.mark.parametrize("section", ("controls", "classes", "geography"))
def test_links_fold_into_the_description(db_session, note, revision, section):
    row = note(
        section,
        title="L2 + O",
        content="Parry.",
        links=["https://a.example", "https://b.example"],
    )
    # The mirror: a row of the same section with no links keeps its text.
    plain = note(section, title="R1", content="Attack.")

    _upgrade(db_session, revision)

    moved = _get(db_session, row)
    assert moved.content == "Parry.\nhttps://a.example\nhttps://b.example"
    assert moved.links is None
    assert _get(db_session, plain).content == "Attack."


def test_an_episode_comment_keeps_its_episode_and_its_links_as_text(
    db_session, note, revision
):
    row = note(
        "episode_comments",
        locator="Ch 3",
        content="Great.",
        links=[_pair("https://a.example", "Video"), "https://b.example"],
    )
    bare = note("episode_comments", locator="Ch 4", links=["https://c.example"])

    _upgrade(db_session, revision)

    moved = _get(db_session, row)
    assert moved.locator == "Ch 3"
    assert moved.content == "Great.\nVideo: https://a.example\nhttps://b.example"
    assert moved.links is None
    assert _get(db_session, bare).content == "https://c.example"


# --- main_plot / side_plot ---------------------------------------------------


@pytest.mark.parametrize("section", ("main_plot", "side_plot"))
def test_the_description_becomes_the_chapter_and_the_chapter_the_link_title(
    db_session, note, revision, section
):
    # The one local row, as pulled from the production sheet.
    row = note(
        section,
        locator="【Bilibili】 1.6丹青渡 日配女主全劇情全流程",
        content="祀的劇情",
        links=["https://www.bilibili.com/video/x"],
    )

    _upgrade(db_session, revision)

    moved = _get(db_session, row)
    assert moved.locator == "祀的劇情"
    assert moved.content is None
    assert moved.links == [
        _pair("https://www.bilibili.com/video/x", "【Bilibili】 1.6丹青渡 日配女主全劇情全流程")
    ]


def test_a_plot_row_with_no_link_appends_its_description_to_the_chapter(
    db_session, note, revision
):
    no_link = note("main_plot", locator="Ch 3", content="The lake.")
    no_chapter = note("main_plot", content="The lake.")

    _upgrade(db_session, revision)

    assert _get(db_session, no_link).locator == "Ch 3 — The lake."
    assert _get(db_session, no_chapter).locator == "The lake."
    assert _get(db_session, no_link).content is None


def test_a_plot_row_whose_first_link_has_a_title_appends_to_the_chapter(
    db_session, note, revision
):
    titled = [_pair("https://a.example", "Video"), "https://b.example"]
    row = note("side_plot", locator="Ch 3", content="The lake.", links=titled)
    # The mirror: no description, nothing moves.
    plain = note("side_plot", locator="Ch 4", links=["https://c.example"])

    _upgrade(db_session, revision)

    moved = _get(db_session, row)
    assert moved.locator == "Ch 3 — The lake."
    assert moved.links == [_pair("https://a.example", "Video"), _pair("https://b.example")]
    kept = _get(db_session, plain)
    assert kept.locator == "Ch 4"
    assert kept.links == [_pair("https://c.example")]


# --- character_arcs -------------------------------------------------------------


def test_an_arc_description_becomes_its_first_link_title(db_session, note, revision):
    untitled = note(
        "character_arcs",
        content="Perlica's arc",
        links=["https://a.example", "https://b.example"],
    )
    titled = note(
        "character_arcs",
        content="Perlica's arc",
        links=[_pair("https://a.example", "Video")],
    )

    _upgrade(db_session, revision)

    first = _get(db_session, untitled)
    assert first.content is None
    assert first.links == [
        _pair("https://a.example", "Perlica's arc"),
        _pair("https://b.example"),
    ]
    second = _get(db_session, titled)
    assert second.content is None
    assert second.links == [_pair("https://a.example", "Video — Perlica's arc")]


def test_an_arc_with_text_and_no_link_moves_to_story_other(
    db_session, note, revision
):
    existing = note("story_other", content="An aside.", sort_index=4.0)
    arc = note("character_arcs", content="Perlica's arc", sort_index=1.0)
    # The mirror: an arc that is links only stays where it is.
    links_only = note("character_arcs", links=["https://a.example"])

    _upgrade(db_session, revision)

    moved = _get(db_session, arc)
    assert moved.section == "story_other"
    assert moved.content == "【角色劇情】 Perlica's arc"
    assert moved.sort_index == 5.0
    assert _get(db_session, existing).content == "An aside."
    stayed = _get(db_session, links_only)
    assert stayed.section == "character_arcs"
    assert stayed.links == [_pair("https://a.example")]


# --- trivia ------------------------------------------------------------------


def test_trivia_keeps_its_content_and_a_stray_locator_becomes_its_title(
    db_session, note, revision
):
    plain = note("trivia", content="A fact.", links=["https://a.example"])
    located = note("trivia", locator="Ch 2", content="Another.")

    _upgrade(db_session, revision)

    kept = _get(db_session, plain)
    assert (kept.title, kept.content) == (None, "A fact.")
    assert kept.links == [_pair("https://a.example")]
    moved = _get(db_session, located)
    assert (moved.title, moved.locator, moved.content) == ("Ch 2", None, "Another.")


# --- downgrade ------------------------------------------------------------------


def test_downgrade_turns_pairs_back_into_urls_except_on_the_songs(
    db_session, note, revision, sample_anime
):
    review = note(
        "public_reviews",
        content="x",
        links=[_pair("https://a.example", "A"), _pair("  "), _pair("https://b.example")],
    )
    song = models.Note(
        system_id=uuid.uuid4(),
        media_id=sample_anime.system_id,
        author_id=review.author_id,
        section="op",
        title="Song",
        links=[_pair("https://y.example", "YouTube")],
    )
    db_session.add(song)
    db_session.flush()

    revision.pairs_to_urls(db_session.connection())
    db_session.expire_all()

    assert _get(db_session, review).links == ["https://a.example", "https://b.example"]
    assert _get(db_session, song).links == [_pair("https://y.example", "YouTube")]
