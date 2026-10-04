"""The TMDB picker search and the IMDb-id lookup for a picked result.

HTTP is mocked with ``responses`` — the suite makes no live calls.
"""

import pytest
import responses

from app.services.integrations import tmdb
from app.services.integrations.external_search import SEARCH_TIMEOUT, ExternalSearchError

BASE = tmdb.TMDB_BASE_URL

MATRIX = {
    "id": 603,
    "title": "The Matrix",
    "original_title": "The Matrix",
    "release_date": "1999-03-30",
    "original_language": "en",
    "poster_path": "/matrix.jpg",
}
DARK = {
    "id": 70523,
    "name": "Dark",
    "original_name": "Dark",
    "first_air_date": "2017-12-01",
    "original_language": "de",
    "poster_path": None,
}


@pytest.fixture(autouse=True)
def _key_and_clean_cache(monkeypatch):
    monkeypatch.setattr(tmdb.settings, "tmdb_api_key", "test-key")
    monkeypatch.setattr(tmdb.tmdb_rate_limiter, "wait_if_needed", lambda: None)
    tmdb.search_tmdb.cache_clear()
    tmdb._fetch_tmdb_imdb_id.cache_clear()
    yield
    tmdb.search_tmdb.cache_clear()
    tmdb._fetch_tmdb_imdb_id.cache_clear()


@responses.activate
def test_a_movie_search_maps_onto_the_result_shape():
    responses.get(f"{BASE}/search/movie", json={"results": [MATRIX]})

    rows = tmdb.search_tmdb("matrix", 10, ("movie",))

    assert rows == [
        {
            "external_id": "movie/603",
            "link": "https://www.themoviedb.org/movie/603",
            "title": "The Matrix",
            "title_alt": None,
            "year": 1999,
            "detail": "Movie · EN",
            "cover_url": "https://image.tmdb.org/t/p/w185/matrix.jpg",
        }
    ]
    params = responses.calls[0].request.params
    assert params["query"] == "matrix"
    assert params["api_key"] == "test-key"


@responses.activate
def test_a_tv_search_uses_name_and_first_air_date():
    responses.get(
        f"{BASE}/search/tv",
        json={"results": [{**DARK, "original_name": "Dark (DE)", "first_air_date": ""}]},
    )

    [row] = tmdb.search_tmdb("dark", 10, ("tv",))

    assert row["external_id"] == "tv/70523"
    assert row["link"] == "https://www.themoviedb.org/tv/70523"
    assert row["title"] == "Dark"
    assert row["title_alt"] == "Dark (DE)"
    assert row["year"] is None
    assert row["detail"] == "TV · DE"
    assert row["cover_url"] is None


@responses.activate
def test_both_kinds_search_multi_and_drop_people():
    responses.get(
        f"{BASE}/search/multi",
        json={
            "results": [
                {**MATRIX, "media_type": "movie"},
                {"id": 6384, "name": "Keanu Reeves", "media_type": "person"},
                {**DARK, "media_type": "tv"},
            ]
        },
    )

    rows = tmdb.search_tmdb("x", 10, ("movie", "tv"))

    assert [r["external_id"] for r in rows] == ["movie/603", "tv/70523"]


@responses.activate
def test_the_limit_caps_the_rows():
    responses.get(
        f"{BASE}/search/movie",
        json={"results": [{**MATRIX, "id": n} for n in range(1, 6)]},
    )
    assert len(tmdb.search_tmdb("matrix", 2, ("movie",))) == 2


def test_an_unknown_kind_is_a_value_error():
    with pytest.raises(ValueError):
        tmdb.search_tmdb("matrix", 10, ("person",))


@responses.activate
def test_a_missing_key_is_an_error_not_an_empty_list(monkeypatch):
    monkeypatch.setattr(tmdb.settings, "tmdb_api_key", None)
    with pytest.raises(ExternalSearchError, match="TMDB_API_KEY"):
        tmdb.search_tmdb("matrix", 10, ("movie",))
    assert len(responses.calls) == 0


@responses.activate
@pytest.mark.parametrize("status", [401, 429, 500, 503])
def test_an_upstream_error_is_raised_after_one_attempt(status):
    responses.get(f"{BASE}/search/movie", status=status, json={})
    with pytest.raises(ExternalSearchError):
        tmdb.search_tmdb("matrix", 10, ("movie",))
    assert len(responses.calls) == 1


@responses.activate
def test_unreadable_json_is_an_error():
    responses.get(f"{BASE}/search/movie", body="<html>")
    with pytest.raises(ExternalSearchError):
        tmdb.search_tmdb("matrix", 10, ("movie",))


def test_a_network_failure_is_an_error_with_the_search_timeout(monkeypatch):
    seen = {}

    def boom(*args, **kwargs):
        seen["timeout"] = kwargs.get("timeout")
        raise tmdb.requests.exceptions.ConnectionError("down")

    monkeypatch.setattr(tmdb.requests, "get", boom)
    with pytest.raises(ExternalSearchError):
        tmdb.search_tmdb("matrix", 10, ("movie",))
    assert seen["timeout"] == SEARCH_TIMEOUT


@responses.activate
def test_resolve_returns_the_imdb_id():
    responses.get(f"{BASE}/movie/603/external_ids", json={"id": 603, "imdb_id": "tt0133093"})
    assert tmdb.resolve_tmdb_imdb_id("movie/603") == "tt0133093"


@responses.activate
@pytest.mark.parametrize("value", [None, ""])
def test_resolve_returns_none_when_tmdb_has_no_imdb_id(value):
    responses.get(f"{BASE}/tv/1399/external_ids", json={"id": 1399, "imdb_id": value})
    assert tmdb.resolve_tmdb_imdb_id("tv/1399") is None


@responses.activate
@pytest.mark.parametrize(
    "ref",
    ["", "movie", "movie/", "person/1", "movie/60a", "tv/1/x", "../movie/1", "MOVIE/603"],
)
def test_resolve_refuses_a_malformed_ref_before_any_request(ref):
    with pytest.raises(ValueError):
        tmdb.resolve_tmdb_imdb_id(ref)
    assert len(responses.calls) == 0


@responses.activate
def test_resolve_raises_on_upstream_failure():
    responses.get(f"{BASE}/movie/603/external_ids", status=500, json={})
    with pytest.raises(ExternalSearchError):
        tmdb.resolve_tmdb_imdb_id("movie/603")
    assert len(responses.calls) == 1
