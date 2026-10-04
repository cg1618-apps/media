"""
The Comic Vine picker search: mapping onto the shared result shape, a single
attempt, and a failure that raises rather than reading as "no such title".

HTTP is served by `responses` - the suite makes no live calls.
"""

import pytest
import requests
import responses

from app.services.integrations import comicvine
from app.services.integrations.external_search import SEARCH_TIMEOUT, ExternalSearchError
from app.utils.comicvine_utils import extract_comicvine_id

SEARCH_URL = f"{comicvine.COMICVINE_BASE_URL}/search/"

VOLUME = {
    "id": 2127,
    "name": "The Amazing Spider-Man",
    "start_year": "1963",
    "count_of_issues": 700,
    "publisher": {"id": 31, "name": "Marvel"},
    "image": {
        "original_url": "https://comicvine.gamespot.com/a/uploads/original/asm1.jpg",
        "medium_url": "https://comicvine.gamespot.com/a/uploads/medium/asm1.jpg",
    },
    "site_detail_url": "https://comicvine.gamespot.com/the-amazing-spider-man/4050-2127/",
}


def _ok(results):
    return {"status_code": 1, "error": "OK", "results": results}


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(comicvine.settings, "comicvine_api_key", "key")
    monkeypatch.setattr(comicvine.comicvine_rate_limiter, "request_timestamps", [])
    comicvine.search_comicvine_volumes.cache_clear()
    yield
    comicvine.search_comicvine_volumes.cache_clear()


@responses.activate
def test_a_volume_is_mapped_onto_the_shared_result_shape():
    responses.get(SEARCH_URL, json=_ok([VOLUME]))
    assert comicvine.search_comicvine_volumes("spider-man") == [
        {
            "external_id": "2127",
            "link": "https://comicvine.gamespot.com/the-amazing-spider-man/4050-2127/",
            "title": "The Amazing Spider-Man",
            "title_alt": None,
            "year": 1963,
            "detail": "Marvel · 700 issues",
            "cover_url": "https://comicvine.gamespot.com/a/uploads/original/asm1.jpg",
        }
    ]


@responses.activate
def test_the_link_round_trips_to_the_same_comicvine_id():
    responses.get(SEARCH_URL, json=_ok([VOLUME]))
    [row] = comicvine.search_comicvine_volumes("spider-man")
    assert extract_comicvine_id(row["link"]) == int(row["external_id"])


@responses.activate
def test_partial_volumes_map_what_is_there():
    responses.get(
        SEARCH_URL,
        json=_ok(
            [
                {"id": 1, "name": "No Publisher", "start_year": "19??", "count_of_issues": 1},
                {
                    "id": 2,
                    "name": "No Count",
                    "start_year": None,
                    "publisher": {"name": "DC Comics"},
                    "image": {"original_url": "https://x/uploads/image_not_available.jpg"},
                },
                {"id": 3, "name": "Bare"},
            ]
        ),
    )
    rows = comicvine.search_comicvine_volumes("partial")
    assert [(r["year"], r["detail"], r["cover_url"]) for r in rows] == [
        (None, "1 issue", None),
        (None, "DC Comics", None),
        (None, None, None),
    ]


@responses.activate
def test_the_request_is_one_attempt_with_the_search_timeout(monkeypatch):
    seen = {}
    real_get = requests.get

    def spy(url, **kwargs):
        seen["timeout"] = kwargs.get("timeout")
        return real_get(url, **kwargs)

    monkeypatch.setattr(comicvine.requests, "get", spy)
    responses.get(SEARCH_URL, json=_ok([VOLUME]))
    comicvine.search_comicvine_volumes("spider-man", 5)
    assert len(responses.calls) == 1
    assert seen["timeout"] == SEARCH_TIMEOUT
    params = responses.calls[0].request.params
    assert params["resources"] == "volume"
    assert params["query"] == "spider-man"
    assert params["limit"] == "5"


@responses.activate
def test_a_repeated_query_is_served_from_the_cache():
    responses.get(SEARCH_URL, json=_ok([VOLUME]))
    comicvine.search_comicvine_volumes("Spider-Man")
    comicvine.search_comicvine_volumes(" spider-man ")
    assert len(responses.calls) == 1


def test_an_empty_query_returns_an_empty_list_without_calling_out():
    with responses.RequestsMock() as rsps:
        assert comicvine.search_comicvine_volumes("   ") == []
        assert len(rsps.calls) == 0


def test_a_missing_key_raises_without_calling_out(monkeypatch):
    monkeypatch.setattr(comicvine.settings, "comicvine_api_key", None)
    with responses.RequestsMock() as rsps:
        with pytest.raises(ExternalSearchError, match="not configured"):
            comicvine.search_comicvine_volumes("spider-man")
        assert len(rsps.calls) == 0


@responses.activate
def test_a_network_error_raises_after_a_single_attempt():
    responses.get(SEARCH_URL, body=requests.exceptions.ConnectTimeout("slow"))
    with pytest.raises(ExternalSearchError):
        comicvine.search_comicvine_volumes("spider-man")
    assert len(responses.calls) == 1


@pytest.mark.parametrize("status", [401, 404, 420, 429, 500, 503])
@responses.activate
def test_an_error_status_raises(status):
    responses.get(SEARCH_URL, status=status, json={})
    with pytest.raises(ExternalSearchError):
        comicvine.search_comicvine_volumes("spider-man")
    assert len(responses.calls) == 1


@responses.activate
def test_an_error_in_the_body_raises():
    responses.get(SEARCH_URL, json={"status_code": 100, "error": "Invalid API Key", "results": []})
    with pytest.raises(ExternalSearchError, match="Invalid API Key"):
        comicvine.search_comicvine_volumes("spider-man")


@responses.activate
def test_a_non_json_body_raises():
    responses.get(SEARCH_URL, body="<html>maintenance</html>")
    with pytest.raises(ExternalSearchError):
        comicvine.search_comicvine_volumes("spider-man")


@responses.activate
def test_a_failure_is_not_cached():
    responses.get(SEARCH_URL, status=503, json={})
    with pytest.raises(ExternalSearchError):
        comicvine.search_comicvine_volumes("spider-man")
    responses.replace(responses.GET, SEARCH_URL, json=_ok([VOLUME]))
    assert comicvine.search_comicvine_volumes("spider-man")[0]["external_id"] == "2127"


def test_an_exhausted_hourly_limit_raises_rather_than_sleeping(monkeypatch):
    monkeypatch.setattr(comicvine.comicvine_rate_limiter, "has_capacity", lambda: False)

    def no_sleep(*a, **k):
        raise AssertionError("a picker search must not wait out the hourly cap")

    monkeypatch.setattr(comicvine.comicvine_rate_limiter, "wait_if_needed", no_sleep)
    with responses.RequestsMock() as rsps:
        with pytest.raises(ExternalSearchError, match="hourly"):
            comicvine.search_comicvine_volumes("spider-man")
        assert len(rsps.calls) == 0


def test_fill_keeps_its_retrying_path():
    assert hasattr(comicvine.fetch_comicvine_volume, "retry")
    assert not hasattr(comicvine.search_comicvine_volumes, "retry")
