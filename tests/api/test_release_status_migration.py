"""
The r1l2status34 revision: Rumored leaves the airing vocabulary, a film's
airing_status becomes release_status over its own vocabulary, and a film's
Watch When Airs list rows become Watch When Released.

The suite builds its schema with create_all and never runs Alembic, so this
imports the revision by file path and runs its OWN data functions against the
test session, whose schema already carries the renamed columns. The anime list
row holding Watch When Airs is what proves the status rename is confined to
the two film types; the Canceled film is what proves an unmapped value is left
alone rather than blanked.
"""

import importlib.util
import json
from pathlib import Path

import pytest

from app import models
from app.utils import constants as c

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "r1l2status34_movie_release_status.py"
MOVIE_KEY = "form_defaults:movie"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_release_status", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _statuses(db, model):
    db.expire_all()
    return sorted(e.release_status for e in db.query(model).all())


@pytest.fixture
def pre_revision(db_session, list_row):
    """The state before the revision: old values sitting in the new columns."""
    db = db_session
    movies = [
        models.Movies(movie_name_en=f"m{i}", release_status=s)
        for i, s in enumerate(["Not Yet Aired", "Rumored", "Airing", "Finished Airing", "Canceled"])
    ]
    anime_movie = models.AnimeMovies(anime_movie_name_en="am", release_status="Finished Airing")
    rumored_anime = models.Anime(anime_name_en="rumored", airing_status="Rumored")
    rumored_tv = models.TVShows(tv_name_en="rumored", airing_status="Rumored")
    airing_anime = models.Anime(anime_name_en="airing", airing_status="Airing")
    db.add_all(movies + [anime_movie, rumored_anime, rumored_tv, airing_anime])
    db.add(
        models.SystemConfigs(
            config_key=MOVIE_KEY,
            config_value=json.dumps(
                {
                    "defaults": {"airing_status": "Finished Airing", "watching_status": "Watch When Airs"},
                    "autofill": ["movie_name_en", "airing_status"],
                }
            ),
        )
    )
    db.flush()
    list_row(movies[0], status="Watch When Airs")
    list_row(anime_movie, status="Watch When Airs")
    list_row(airing_anime, status="Watch When Airs")
    return db, {"anime": airing_anime, "rumored_anime": rumored_anime, "rumored_tv": rumored_tv}


def _list_statuses(db):
    db.expire_all()
    rows = db.query(models.UserMediaList, models.Media).join(
        models.Media, models.Media.system_id == models.UserMediaList.media_id
    )
    return sorted((m.media_type, r.status) for r, m in rows)


def test_the_frozen_values_match_the_vocabularies(revision):
    assert set(revision.TO_RELEASE.values()) <= set(c.FILM_RELEASE_STATUSES)
    assert set(revision.TO_AIRING) == set(c.FILM_RELEASE_STATUSES)
    assert "Rumored" not in {s.value for s in c.AiringStatus}
    assert revision.WHEN_RELEASED == c.WatchStatus.WATCH_WHEN_RELEASED.value


def test_upgrade_maps_every_film_status(revision, pre_revision):
    db, _ = pre_revision
    revision.rewrite(db.connection())
    assert _statuses(db, models.Movies) == [
        "Canceled", "Not Released", "Not Released", "Released", "Released",
    ]
    assert _statuses(db, models.AnimeMovies) == ["Released"]


def test_upgrade_retires_rumored_on_the_airing_types(revision, pre_revision):
    db, rows = pre_revision
    revision.rewrite(db.connection())
    db.expire_all()
    assert rows["rumored_anime"].airing_status == "Not Yet Aired"
    assert rows["rumored_tv"].airing_status == "Not Yet Aired"
    assert rows["anime"].airing_status == "Airing"


def test_upgrade_renames_watch_when_airs_on_the_film_types_only(revision, pre_revision):
    db, _ = pre_revision
    revision.rewrite(db.connection())
    assert _list_statuses(db) == [
        ("anime", "Watch When Airs"),
        ("anime-movie", "Watch When Released"),
        ("movie", "Watch When Released"),
    ]


def test_upgrade_rewrites_the_stored_movie_defaults(revision, pre_revision):
    db, _ = pre_revision
    revision.rewrite(db.connection())
    row = db.query(models.SystemConfigs).filter_by(config_key=MOVIE_KEY).one()
    db.refresh(row)
    assert json.loads(row.config_value) == {
        "defaults": {"release_status": "Released", "watching_status": "Watch When Released"},
        "autofill": ["movie_name_en", "release_status"],
    }


def test_upgrade_is_idempotent(revision, pre_revision):
    db, _ = pre_revision
    revision.rewrite(db.connection())
    revision.rewrite(db.connection())
    assert _statuses(db, models.AnimeMovies) == ["Released"]


def test_downgrade_maps_back_onto_the_airing_vocabulary(revision, pre_revision):
    db, _ = pre_revision
    revision.rewrite(db.connection())
    revision.fold(db.connection())
    assert _statuses(db, models.Movies) == [
        "Canceled", "Finished Airing", "Finished Airing", "Not Yet Aired", "Not Yet Aired",
    ]
    assert _list_statuses(db) == [
        ("anime", "Watch When Airs"),
        ("anime-movie", "Watch When Airs"),
        ("movie", "Watch When Airs"),
    ]
