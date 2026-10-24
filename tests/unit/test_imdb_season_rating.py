"""
Unit tests for a season's IMDb rating.

A TV show or TV cartoon entry is one season, so its imdb_rating is that
season's own - the mean of its episodes' ratings from OMDb's season listing -
and imdb_series_rating is the show's. The network calls are patched out; these
tests pin the averaging, the one-season fallback, and what the autofill writes.
"""

import types

import pytest

from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import (
    autofill_cartoon_from_imdb,
    autofill_tv_show_from_imdb,
)
from app.utils.omdb_utils import map_omdb_to_tv_data, season_rating


def season(*ratings):
    return {
        "Season": "1",
        "Episodes": [
            {"Episode": str(n), "imdbRating": r} for n, r in enumerate(ratings, start=1)
        ],
    }


# ---------------------------------------------------------------------------
# season_rating
# ---------------------------------------------------------------------------


def test_season_rating_is_the_mean_of_its_episodes_to_one_decimal():
    assert season_rating(season("8.0", "8.5", "9.2")) == "8.6"


def test_season_rating_leaves_unrated_episodes_out():
    assert season_rating(season("8.0", "N/A", "9.0", "")) == "8.5"


def test_a_season_with_no_rated_episode_has_no_rating():
    assert season_rating(season("N/A", "N/A")) is None
    assert season_rating({"Episodes": []}) is None
    assert season_rating(None) is None


# ---------------------------------------------------------------------------
# map_omdb_to_tv_data
# ---------------------------------------------------------------------------


def test_the_season_and_the_show_each_get_their_own_rating():
    mapped = map_omdb_to_tv_data(
        {"imdbRating": "8.9", "totalSeasons": "4"}, season("7.0", "8.0")
    )
    assert mapped == {"imdb_rating": "7.5", "imdb_series_rating": "8.9"}


def test_an_unrated_season_of_a_longer_show_does_not_borrow_the_show_rating():
    mapped = map_omdb_to_tv_data(
        {"imdbRating": "8.9", "totalSeasons": "4"}, season("N/A")
    )
    assert mapped == {"imdb_rating": None, "imdb_series_rating": "8.9"}


def test_a_one_season_show_without_episode_ratings_takes_the_show_rating():
    mapped = map_omdb_to_tv_data({"imdbRating": "8.2", "totalSeasons": "1"}, None)
    assert mapped == {"imdb_rating": "8.2", "imdb_series_rating": "8.2"}


# ---------------------------------------------------------------------------
# The autofills
# ---------------------------------------------------------------------------

OMDB_SHOW = {"imdbRating": "8.9", "totalSeasons": "4"}


def make_entry(**kwargs):
    defaults = dict(
        system_id="44444444-4444-4444-4444-444444444444",
        imdb_id="tt0000001",
        season_part="Season 2",
        airing_type="TV",
        airing_status="Finished Airing",
        release_date="2020-01-01",
        ep_total=10,
        imdb_rating=None,
        imdb_series_rating=None,
        cover_image_file="already-there.jpg",
    )
    defaults.update(kwargs)
    return types.SimpleNamespace(**defaults)


@pytest.fixture
def omdb(monkeypatch):
    """Patches the IMDb fetches; records which season OMDb was asked for."""
    asked = []

    monkeypatch.setattr(
        autofill_module,
        "fetch_imdb_data",
        lambda imdb_id: {"tmdb_raw": None, "omdb_raw": OMDB_SHOW},
    )

    def fake_season(imdb_id, number):
        asked.append((imdb_id, number))
        return season("7.0", "8.0")

    monkeypatch.setattr(autofill_module, "fetch_omdb_season_data", fake_season)
    monkeypatch.setattr(autofill_module, "cover_needs_download", lambda *a: False)
    return asked


@pytest.mark.parametrize(
    "autofill", [autofill_tv_show_from_imdb, autofill_cartoon_from_imdb]
)
def test_autofill_writes_the_season_rating_and_the_show_rating(omdb, autofill):
    entry = make_entry(imdb_rating="8.9")  # the show's, as stored before
    autofill(entry, db=None)
    assert omdb == [("tt0000001", 2)]
    assert entry.imdb_rating == "7.5"
    assert entry.imdb_series_rating == "8.9"


def test_a_movie_cartoon_keeps_its_title_rating_and_asks_for_no_season(
    omdb, monkeypatch
):
    monkeypatch.setattr(
        autofill_module,
        "fetch_imdb_data",
        lambda imdb_id: {"tmdb_raw": None, "omdb_raw": {"imdbRating": "7.7"}},
    )
    entry = make_entry(airing_type="Movie", season_part=None)
    autofill_cartoon_from_imdb(entry, db=None)
    assert omdb == []
    assert entry.imdb_rating == "7.7"
    assert entry.imdb_series_rating is None


def test_no_season_is_asked_for_when_omdb_did_not_find_the_show(omdb, monkeypatch):
    monkeypatch.setattr(
        autofill_module,
        "fetch_imdb_data",
        lambda imdb_id: {"tmdb_raw": None, "omdb_raw": None},
    )
    entry = make_entry(imdb_rating="6.0")
    autofill_tv_show_from_imdb(entry, db=None)
    assert omdb == []
    assert entry.imdb_rating == "6.0"
