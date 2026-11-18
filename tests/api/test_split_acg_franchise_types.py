"""
API integration tests for hierarchy.split_acg_franchise_types: a franchise
still typed "ACG" - restored from a sheet backed up before the type split - is
retyped by the entries it holds, and Pull All runs it once every tab has
restored, so the entries it decides by are there.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain.hierarchy import split_acg_franchise_types
from app.services.pipelines import pull


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


def _anime(db, franchise):
    row = models.Anime(
        system_id=uuid.uuid4(), franchise_id=franchise.system_id, anime_name_en="A"
    )
    db.add(row)
    db.flush()
    return row


def _anime_movie(db, franchise):
    row = models.AnimeMovies(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        anime_movie_name_en="AM",
    )
    db.add(row)
    db.flush()
    return row


def _manga(db, franchise):
    row = models.Manga(
        system_id=uuid.uuid4(), franchise_id=franchise.system_id, manga_name_en="M"
    )
    db.add(row)
    db.flush()
    return row


def _reread(db, row):
    db.expire_all()
    return db.get(models.Franchise, row.system_id)


def test_acg_is_split_by_what_the_franchise_holds(db_session):
    anime = _franchise(db_session, "ACG", "Zvornik Anime")
    _anime(db_session, anime)
    movie = _franchise(db_session, "ACG, Game", "Zvornik Movie")
    _anime_movie(db_session, movie)
    manga = _franchise(db_session, "ACG", "Zvornik Manga")
    _manga(db_session, manga)
    both = _franchise(db_session, "Book, ACG", "Zvornik Both")
    _anime(db_session, both)
    _manga(db_session, both)
    empty = _franchise(db_session, "ACG", "Zvornik Empty")
    # Mirror cases: nothing to split, and an Anime Movie type left alone even
    # though it holds a manga.
    plain = _franchise(db_session, "Game", "Zvornik Plain")
    _manga(db_session, plain)
    anime_movie_type = _franchise(db_session, "Anime Movie", "Zvornik AM Type")
    _manga(db_session, anime_movie_type)

    counts = split_acg_franchise_types(db_session)

    assert {
        r.franchise_name_en: _reread(db_session, r).franchise_type
        for r in (anime, movie, manga, both, empty, plain, anime_movie_type)
    } == {
        "Zvornik Anime": "Anime",
        "Zvornik Movie": "Anime, Game",
        "Zvornik Manga": "Manga",
        "Zvornik Both": "Book, Anime, Manga",
        "Zvornik Empty": "Anime",
        "Zvornik Plain": "Game",
        "Zvornik AM Type": "Anime Movie",
    }
    assert counts == {"franchises_split": 5, "anime": 3, "manga": 1, "both": 1}


def test_an_acg_cover_choice_follows_the_chosen_entry(db_session):
    franchise = _franchise(db_session, "ACG", "Zvornik Covers")
    _anime(db_session, franchise)
    chosen = _manga(db_session, franchise)
    franchise.type_covers = {"ACG": str(chosen.system_id), "Game": "kept"}
    db_session.flush()

    split_acg_franchise_types(db_session)

    row = _reread(db_session, franchise)
    assert row.franchise_type == "Anime, Manga"
    assert row.type_covers == {"Manga": str(chosen.system_id), "Game": "kept"}


def test_an_acg_cover_choice_never_overwrites_one_already_made(db_session):
    franchise = _franchise(db_session, "ACG", "Zvornik Covers Kept")
    chosen = _anime(db_session, franchise)
    franchise.type_covers = {"ACG": str(chosen.system_id), "Anime": "already"}
    db_session.flush()

    split_acg_franchise_types(db_session)

    assert _reread(db_session, franchise).type_covers == {"Anime": "already"}


def test_a_second_run_changes_nothing(db_session):
    franchise = _franchise(db_session, "ACG", "Zvornik Twice")
    _manga(db_session, franchise)
    split_acg_franchise_types(db_session)

    assert split_acg_franchise_types(db_session) == {
        "franchises_split": 0,
        "anime": 0,
        "manga": 0,
        "both": 0,
    }
    assert _reread(db_session, franchise).franchise_type == "Manga"


@pytest.fixture
def sheet(monkeypatch):
    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs.get(tab, []))

    return _install


def test_pull_all_splits_an_acg_franchise_after_its_entries_restore(db_session, sheet):
    # The Franchise tab restores before the Manga tab: splitting there would
    # find no manga and type it Anime. The split runs once every tab is in.
    franchise_id = str(uuid.uuid4())
    sheet(
        {
            "Franchise": [
                ["system_id", "franchise_name_en", "franchise_type"],
                [franchise_id, "Zvornik Pulled", "ACG"],
            ],
            "Manga": [
                ["system_id", "franchise_id", "manga_name_en"],
                [str(uuid.uuid4()), franchise_id, "Zvornik Pulled Manga"],
            ],
        }
    )

    pull.execute_pull_all(db_session, action_type="Manual")

    row = db_session.get(models.Franchise, uuid.UUID(franchise_id))
    db_session.refresh(row)
    assert row.franchise_type == "Manga"


def test_pulling_the_franchise_tab_alone_splits_against_the_local_entries(
    db_session, sheet
):
    franchise = _franchise(db_session, "Manga", "Zvornik Local")
    _manga(db_session, franchise)
    db_session.commit()
    sheet(
        {
            "Franchise": [
                ["system_id", "franchise_name_en", "franchise_type"],
                [str(franchise.system_id), "Zvornik Local", "ACG"],
            ],
        }
    )

    pull.execute_pull_specific(db_session, "Franchise", log_action=False)

    assert _reread(db_session, franchise).franchise_type == "Manga"
