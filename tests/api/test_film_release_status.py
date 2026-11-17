"""
A film's release status and an anime movie's release type.

Movie and Anime Movie carry `release_status` (Not Released / Released /
Canceled, Not Released on a new entry) where the airing types carry
`airing_status`. An anime movie carries `release_type`, Cinema or ONA,
Cinema on a new entry; an ONA has one release date, held in both
release_date_jp and release_date_tw and kept equal on every write.

Pull must still read a Movies or Anime Movie tab written before the rename:
its `airing_status` column, in the airing vocabulary, restores into
`release_status` and is not reported as a stale header.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import pytest

from app import models
from app.services.pipelines import pull

ANIME_MOVIE = "/api/anime-movie/"
MOVIE = "/api/movies/"


def _create(client, path, **body):
    response = client.post(path, json=body)
    assert response.status_code == 201, response.text
    return response.json()


# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------


def test_a_new_movie_is_not_released(owner_client):
    data = _create(owner_client, MOVIE, movie_name_en="New Movie")
    assert data["release_status"] == "Not Released"
    assert "airing_status" not in data


def test_a_new_anime_movie_is_a_cinema_release_not_yet_released(owner_client):
    data = _create(owner_client, ANIME_MOVIE, anime_movie_name_en="New Film")
    assert data["release_status"] == "Not Released"
    assert data["release_type"] == "Cinema"


def test_release_type_is_closed(owner_client):
    response = owner_client.post(
        ANIME_MOVIE, json={"anime_movie_name_en": "Bad", "release_type": "OVA"}
    )
    assert response.status_code == 422


def test_the_movie_list_filters_on_release_status(owner_client):
    _create(owner_client, MOVIE, movie_name_en="Out", release_status="Released")
    _create(owner_client, MOVIE, movie_name_en="Coming")
    response = owner_client.get(MOVIE, params={"release_status": "Released"})
    assert response.status_code == 200
    assert [m["movie_name_en"] for m in response.json()] == ["Out"]


# ---------------------------------------------------------------------------
# ONA: one release date
# ---------------------------------------------------------------------------


def test_a_cinema_release_keeps_its_two_dates_apart(owner_client):
    data = _create(
        owner_client,
        ANIME_MOVIE,
        anime_movie_name_en="Cinema",
        release_date_jp="2024-07-01",
        release_date_tw="2024-08-15",
    )
    assert (data["release_date_jp"], data["release_date_tw"]) == ("2024-07-01", "2024-08-15")


def test_an_ona_created_with_one_date_holds_it_twice(owner_client):
    data = _create(
        owner_client,
        ANIME_MOVIE,
        anime_movie_name_en="ONA",
        release_type="ONA",
        release_date_jp="2024-07-01",
    )
    assert (data["release_date_jp"], data["release_date_tw"]) == ("2024-07-01", "2024-07-01")


def test_an_ona_created_with_only_a_tw_date_holds_it_twice(owner_client):
    data = _create(
        owner_client,
        ANIME_MOVIE,
        anime_movie_name_en="ONA",
        release_type="ONA",
        release_date_tw="2024-07",
    )
    assert (data["release_date_jp"], data["release_date_tw"]) == ("2024-07", "2024-07")


def test_switching_a_cinema_release_to_ona_carries_jp_to_tw(owner_client):
    created = _create(
        owner_client,
        ANIME_MOVIE,
        anime_movie_name_en="Switch",
        release_date_jp="2024-07-01",
        release_date_tw="2024-08-15",
    )
    response = owner_client.patch(
        f"{ANIME_MOVIE}{created['system_id']}", json={"release_type": "ONA"}
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert (data["release_date_jp"], data["release_date_tw"]) == ("2024-07-01", "2024-07-01")


@pytest.mark.parametrize("method", ["put", "patch"])
def test_an_ona_edit_of_the_tw_date_alone_carries_it_to_jp(owner_client, method):
    """The date the write changed wins: a TW-only edit is not undone by JP."""
    created = _create(
        owner_client,
        ANIME_MOVIE,
        anime_movie_name_en="ONA",
        release_type="ONA",
        release_date_jp="2024-07-01",
    )
    response = getattr(owner_client, method)(
        f"{ANIME_MOVIE}{created['system_id']}", json={"release_date_tw": "2024-09-09"}
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert (data["release_date_jp"], data["release_date_tw"]) == ("2024-09-09", "2024-09-09")


def test_an_ona_edit_of_the_jp_date_carries_it_to_tw(owner_client):
    created = _create(
        owner_client,
        ANIME_MOVIE,
        anime_movie_name_en="ONA",
        release_type="ONA",
        release_date_jp="2024-07-01",
    )
    response = owner_client.patch(
        f"{ANIME_MOVIE}{created['system_id']}", json={"release_date_jp": "2025-01-01"}
    )
    data = response.json()
    assert (data["release_date_jp"], data["release_date_tw"]) == ("2025-01-01", "2025-01-01")


# ---------------------------------------------------------------------------
# Completing a film
# ---------------------------------------------------------------------------


def test_completing_a_film_releases_it(owner_client):
    created = _create(owner_client, ANIME_MOVIE, anime_movie_name_en="Done")
    response = owner_client.post(f"{ANIME_MOVIE}{created['system_id']}/complete")
    assert response.status_code == 200
    assert response.json()["release_status"] == "Released"


# ---------------------------------------------------------------------------
# Pull from a sheet older than the rename
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "old, new",
    [
        ("Finished Airing", "Released"),
        ("Airing", "Released"),
        ("Not Yet Aired", "Not Released"),
        ("Rumored", "Not Released"),
        ("Canceled", "Canceled"),
    ],
)
def test_pull_restores_an_old_movies_tab_airing_status_into_release_status(
    db_session, monkeypatch, old, new
):
    headers = ["movie_name_cn", "airing_status"]
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers, ["舊電影", old]])

    result = pull.execute_pull_specific(db_session, "Movies", log_action=False)

    assert result["status"] == "success"
    fresh = db_session.query(models.Movies).filter_by(movie_name_cn="舊電影").one()
    assert fresh.release_status == new


def test_pull_restores_an_old_anime_movie_tab_as_a_cinema_release(db_session, monkeypatch):
    headers = ["anime_movie_name_cn", "airing_status"]
    monkeypatch.setattr(
        pull, "get_all_raw_rows", lambda tab: [headers, ["舊動畫電影", "Finished Airing"]]
    )

    result = pull.execute_pull_specific(db_session, "Anime Movie", log_action=False)

    assert result["status"] == "success"
    fresh = db_session.query(models.AnimeMovies).filter_by(anime_movie_name_cn="舊動畫電影").one()
    assert fresh.release_status == "Released"
    assert fresh.release_type == "Cinema"


def test_pull_reads_a_current_tab_as_written(db_session, monkeypatch):
    """With both headers present, release_status is the one read."""
    headers = ["movie_name_cn", "airing_status", "release_status"]
    monkeypatch.setattr(
        pull, "get_all_raw_rows", lambda tab: [headers, ["電影", "Finished Airing", "Canceled"]]
    )

    pull.execute_pull_specific(db_session, "Movies", log_action=False)

    fresh = db_session.query(models.Movies).filter_by(movie_name_cn="電影").one()
    assert fresh.release_status == "Canceled"


@pytest.mark.parametrize("tab", ["Movies", "Anime Movie"])
def test_the_old_airing_status_header_is_not_reported_stale(tab):
    assert "airing_status" not in pull.unexpected_headers(tab, ["airing_status"])


def test_pull_retires_rumored_on_an_airing_type(db_session, monkeypatch):
    headers = ["anime_name_cn", "airing_status"]
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers, ["傳聞", "Rumored"]])

    pull.execute_pull_specific(db_session, "Anime", log_action=False)

    fresh = db_session.query(models.Anime).filter_by(anime_name_cn="傳聞").one()
    assert fresh.airing_status == "Not Yet Aired"


# ---------------------------------------------------------------------------
# The vocabularies served
# ---------------------------------------------------------------------------


def test_constants_serve_the_film_vocabularies(client):
    data = client.get("/api/constants").json()
    assert data["film_release_status"] == ["Not Released", "Released", "Canceled"]
    assert data["anime_movie_release_type"] == ["Cinema", "ONA"]
    assert "Rumored" not in data["airing_status"]
    statuses = data["watching_status"]
    assert statuses.index("Watch When Released") == statuses.index("Watch When Airs") + 1
