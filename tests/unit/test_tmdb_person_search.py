"""The person tab's IMDb picker: a TMDB person search, and the IMDb name id
TMDB holds for the person picked.

IMDb has no public API, so the picker searches TMDB's people and resolves
only the one picked. HTTP is mocked with ``responses`` - no live calls.
"""

import pytest
import responses

from app.services.integrations import tmdb
from app.services.integrations.external_search import ExternalSearchError

BASE = tmdb.TMDB_BASE_URL

KEANU = {
    "id": 6384,
    "name": "Keanu Reeves",
    "original_name": "Keanu Reeves",
    "known_for_department": "Acting",
    "profile_path": "/keanu.jpg",
}
MIYAZAKI = {
    "id": 608,
    "name": "Hayao Miyazaki",
    "original_name": "宮崎駿",
    "known_for_department": "Directing",
    "profile_path": None,
}


@pytest.fixture(autouse=True)
def _key_and_clean_cache(monkeypatch):
    monkeypatch.setattr(tmdb.settings, "tmdb_api_key", "test-key")
    monkeypatch.setattr(tmdb.tmdb_rate_limiter, "wait_if_needed", lambda: None)
    tmdb.search_tmdb_people.cache_clear()
    tmdb._fetch_tmdb_person_imdb_id.cache_clear()
    yield
    tmdb.search_tmdb_people.cache_clear()
    tmdb._fetch_tmdb_person_imdb_id.cache_clear()


@responses.activate
def test_a_person_search_maps_onto_the_result_shape():
    responses.get(f"{BASE}/search/person", json={"results": [KEANU, MIYAZAKI]})

    rows = tmdb.search_tmdb_people("keanu", 10)

    assert rows == [
        {
            "external_id": "person/6384",
            "link": "https://www.themoviedb.org/person/6384",
            "title": "Keanu Reeves",
            "title_alt": None,
            "year": None,
            "detail": "Acting",
            "cover_url": "https://image.tmdb.org/t/p/w185/keanu.jpg",
        },
        {
            "external_id": "person/608",
            "link": "https://www.themoviedb.org/person/608",
            "title": "Hayao Miyazaki",
            "title_alt": "宮崎駿",
            "year": None,
            "detail": "Directing",
            "cover_url": None,
        },
    ]
    params = responses.calls[0].request.params
    assert params["query"] == "keanu"
    assert params["include_adult"] == "false"
    assert params["api_key"] == "test-key"


@responses.activate
def test_a_nameless_row_is_dropped_and_the_limit_caps_the_rows():
    responses.get(
        f"{BASE}/search/person",
        json={"results": [{"id": 1}, *({**KEANU, "id": n} for n in range(2, 7))]},
    )
    rows = tmdb.search_tmdb_people("keanu", 3)
    assert [r["external_id"] for r in rows] == ["person/2", "person/3", "person/4"]


@responses.activate
def test_a_missing_key_is_an_error_not_an_empty_list(monkeypatch):
    monkeypatch.setattr(tmdb.settings, "tmdb_api_key", None)
    with pytest.raises(ExternalSearchError, match="TMDB_API_KEY"):
        tmdb.search_tmdb_people("keanu", 10)
    assert len(responses.calls) == 0


@responses.activate
@pytest.mark.parametrize("status", [401, 429, 500])
def test_an_upstream_error_is_raised_after_one_attempt(status):
    responses.get(f"{BASE}/search/person", status=status, json={})
    with pytest.raises(ExternalSearchError):
        tmdb.search_tmdb_people("keanu", 10)
    assert len(responses.calls) == 1


@responses.activate
def test_resolve_returns_the_imdb_name_id():
    responses.get(
        f"{BASE}/person/6384/external_ids", json={"id": 6384, "imdb_id": "nm0000206"}
    )
    assert tmdb.resolve_tmdb_person_imdb_id("person/6384") == "nm0000206"


@responses.activate
@pytest.mark.parametrize("value", [None, "", "tt0133093"])
def test_resolve_returns_none_without_an_imdb_name_id(value):
    responses.get(f"{BASE}/person/608/external_ids", json={"id": 608, "imdb_id": value})
    assert tmdb.resolve_tmdb_person_imdb_id("person/608") is None


@responses.activate
@pytest.mark.parametrize(
    "ref", ["", "person", "person/", "movie/603", "person/6a", "person/1/x", "PERSON/1"]
)
def test_resolve_refuses_a_malformed_ref_before_any_request(ref):
    with pytest.raises(ValueError):
        tmdb.resolve_tmdb_person_imdb_id(ref)
    assert len(responses.calls) == 0


@responses.activate
def test_resolve_raises_on_upstream_failure():
    responses.get(f"{BASE}/person/6384/external_ids", status=500, json={})
    with pytest.raises(ExternalSearchError):
        tmdb.resolve_tmdb_person_imdb_id("person/6384")
