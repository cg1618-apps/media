"""
API integration tests for the revision that splits the "ACG" franchise type
into "Anime" and "Manga" by what each franchise holds.

Runs the shipped revision's own `rewrite()` and `fold()` against the test
session - the suite has no Alembic harness for data.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "a1n2imanga4_acg_splits_into_anime_and_manga.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_acg_splits", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _franchise(db, franchise_type, name, type_covers=None):
    row = models.Franchise(
        system_id=uuid.uuid4(),
        franchise_type=franchise_type,
        franchise_name_en=name,
        type_covers=type_covers,
    )
    db.add(row)
    db.flush()
    return row


def _entry(db, model, franchise, **names):
    row = model(system_id=uuid.uuid4(), franchise_id=franchise.system_id, **names)
    db.add(row)
    db.flush()
    return row


def _reread(db, row):
    db.expire_all()
    return db.get(models.Franchise, row.system_id)


def test_acg_splits_by_the_entries_each_franchise_holds(db_session, revision):
    anime = _franchise(db_session, "ACG", "Zvornik A")
    _entry(db_session, models.Anime, anime, anime_name_en="a")
    movie = _franchise(db_session, "Game,ACG", "Zvornik B")
    _entry(db_session, models.AnimeMovies, movie, anime_movie_name_en="b")
    manga = _franchise(db_session, "ACG, Novel", "Zvornik C")
    _entry(db_session, models.Manga, manga, manga_name_en="c")
    both = _franchise(db_session, "ACG, Manga", "Zvornik D")
    _entry(db_session, models.Anime, both, anime_name_en="d")
    _entry(db_session, models.Manga, both, manga_name_en="d")
    empty = _franchise(db_session, "ACG", "Zvornik E")
    # Mirror cases: not ACG, so nothing moves.
    untouched = _franchise(db_session, "Anime Movie, TV", "Zvornik F")
    untyped = _franchise(db_session, None, "Zvornik G")

    revision.rewrite(db_session.connection())

    assert {
        r.franchise_name_en: _reread(db_session, r).franchise_type
        for r in (anime, movie, manga, both, empty, untouched, untyped)
    } == {
        "Zvornik A": "Anime",
        "Zvornik B": "Game,Anime",
        "Zvornik C": "Manga, Novel",
        "Zvornik D": "Anime, Manga",
        "Zvornik E": "Anime",
        "Zvornik F": "Anime Movie, TV",
        "Zvornik G": None,
    }


def test_an_acg_cover_choice_moves_to_the_chosen_entrys_type(db_session, revision):
    franchise = _franchise(db_session, "ACG", "Zvornik H")
    _entry(db_session, models.Anime, franchise, anime_name_en="h")
    chosen = _entry(db_session, models.Manga, franchise, manga_name_en="h")
    franchise.type_covers = {"ACG": str(chosen.system_id)}
    db_session.flush()

    revision.rewrite(db_session.connection())

    assert _reread(db_session, franchise).type_covers == {
        "Manga": str(chosen.system_id)
    }


def test_the_downgrade_folds_anime_and_manga_back_into_acg(db_session, revision):
    both = _franchise(
        db_session, "Novel, Anime, Manga", "Zvornik I",
        type_covers={"Anime": "x", "Manga": "y", "Game": "z"},
    )
    manga = _franchise(db_session, "Manga", "Zvornik J", type_covers={"Manga": "y"})
    # Mirror: "Anime Movie" is its own type and stays.
    movie = _franchise(db_session, "Anime Movie", "Zvornik K")

    revision.fold(db_session.connection())

    assert _reread(db_session, both).franchise_type == "Novel, ACG"
    assert _reread(db_session, both).type_covers == {"ACG": "x", "Game": "z"}
    assert _reread(db_session, manga).franchise_type == "ACG"
    assert _reread(db_session, manga).type_covers == {"ACG": "y"}
    assert _reread(db_session, movie).franchise_type == "Anime Movie"


def test_the_revision_is_reversible(revision):
    assert getattr(revision, "irreversible", False) is False
