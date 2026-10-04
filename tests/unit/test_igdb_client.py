"""
The IGDB client: OAuth token caching, failure classification, throttling.

requests is patched throughout - the suite makes no live calls.
"""

import time

import pytest
import requests

from app.services.integrations import igdb


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(str(self.status_code))


GAME = {
    "id": 1029,
    "name": "Elden Ring",
    "first_release_date": 1645747200,
    "genres": [{"name": "Role-playing (RPG)"}],
}


@pytest.fixture(autouse=True)
def credentials(monkeypatch):
    monkeypatch.setattr(igdb.settings, "igdb_client_id", "cid")
    monkeypatch.setattr(igdb.settings, "igdb_client_secret", "secret")
    monkeypatch.setattr(igdb.igdb_rate_limiter, "wait_if_needed", lambda: None)
    igdb._TOKEN_CACHE.clear()


@pytest.fixture
def transport(monkeypatch):
    """Records every POST, serving a token for Twitch and data for IGDB."""
    calls = {"token": 0, "data": []}

    def fake_post(url, **kwargs):
        if "id.twitch.tv" in url:
            calls["token"] += 1
            return FakeResponse(200, {"access_token": "tok", "expires_in": 3600})
        calls["data"].append((url, kwargs.get("data"), kwargs.get("headers")))
        return FakeResponse(200, [GAME])

    monkeypatch.setattr(igdb.requests, "post", fake_post)
    return calls


class TestToken:
    def test_the_token_is_fetched_once_and_reused(self, transport):
        igdb.fetch_igdb_game(1029)
        igdb.fetch_igdb_game(1029)
        assert transport["token"] == 1

    def test_an_expired_token_is_refetched(self, transport, monkeypatch):
        igdb.fetch_igdb_game(1029)
        igdb._TOKEN_CACHE["expires_at"] = time.time() - 1
        igdb.fetch_igdb_game(1029)
        assert transport["token"] == 2

    def test_both_credentials_travel_on_every_data_request(self, transport):
        igdb.fetch_igdb_game(1029)
        _url, _body, headers = transport["data"][0]
        assert headers["Client-ID"] == "cid"
        assert headers["Authorization"] == "Bearer tok"

    def test_missing_credentials_degrade_to_none_without_calling_out(
        self, monkeypatch
    ):
        monkeypatch.setattr(igdb.settings, "igdb_client_id", None)

        def explode(*a, **k):
            raise AssertionError("must not call out without credentials")

        monkeypatch.setattr(igdb.requests, "post", explode)
        assert igdb.fetch_igdb_game(1029) is None


class TestFetch:
    def test_returns_the_first_result(self, transport):
        assert igdb.fetch_igdb_game(1029)["name"] == "Elden Ring"

    def test_a_missing_id_returns_none_without_a_request(self, transport):
        assert igdb.fetch_igdb_game(None) is None
        assert transport["data"] == []

    def test_an_empty_result_list_is_none(self, monkeypatch, transport):
        monkeypatch.setattr(
            igdb.requests,
            "post",
            lambda url, **k: FakeResponse(200, {"access_token": "t", "expires_in": 99})
            if "twitch" in url
            else FakeResponse(200, []),
        )
        assert igdb.fetch_igdb_game(1029) is None

    def test_a_429_raises_so_tenacity_backs_off(self, monkeypatch):
        monkeypatch.setattr(
            igdb.requests,
            "post",
            lambda url, **k: FakeResponse(200, {"access_token": "t", "expires_in": 99})
            if "twitch" in url
            else FakeResponse(429),
        )
        with pytest.raises(igdb.RateLimitExceeded):
            igdb._request("games", "fields name;", context="test")

    def test_a_500_returns_none_without_retrying(self, monkeypatch):
        monkeypatch.setattr(
            igdb.requests,
            "post",
            lambda url, **k: FakeResponse(200, {"access_token": "t", "expires_in": 99})
            if "twitch" in url
            else FakeResponse(503),
        )
        assert igdb._request("games", "fields name;", context="test") is None

    def test_a_timeout_is_set_on_every_call(self, monkeypatch):
        seen = {}

        def fake_post(url, **kwargs):
            seen[url] = kwargs.get("timeout")
            if "twitch" in url:
                return FakeResponse(200, {"access_token": "t", "expires_in": 99})
            return FakeResponse(200, [GAME])

        monkeypatch.setattr(igdb.requests, "post", fake_post)
        igdb.fetch_igdb_game(1029)
        assert all(t == 15 for t in seen.values())


SEARCH_HIT = {
    "id": 119133,
    "name": "Elden Ring",
    "summary": "A long summary that is deliberately not the detail line.",
    "first_release_date": 1645747200,
    "cover": {"url": "//images.igdb.com/igdb/image/upload/t_thumb/co4jni.jpg"},
    "url": "https://www.igdb.com/games/elden-ring",
    "platforms": [
        {"abbreviation": "PC", "name": "PC (Microsoft Windows)"},
        {"abbreviation": "PS5", "name": "PlayStation 5"},
        {"name": "Xbox Series X|S"},
        {"abbreviation": "PS4", "name": "PlayStation 4"},
    ],
}


def _serve_search(monkeypatch, data_response, seen=None):
    """Twitch hands out a token; IGDB answers every data request with `data_response`."""

    def fake_post(url, **kwargs):
        if "twitch" in url:
            return FakeResponse(200, {"access_token": "t", "expires_in": 3600})
        if seen is not None:
            seen.append(kwargs)
        if isinstance(data_response, Exception):
            raise data_response
        return data_response

    monkeypatch.setattr(igdb.requests, "post", fake_post)


class TestSearch:
    @pytest.fixture(autouse=True)
    def fresh_cache(self):
        igdb.search_igdb_games.cache_clear()
        yield
        igdb.search_igdb_games.cache_clear()

    def test_an_empty_query_returns_an_empty_list(self, transport):
        assert igdb.search_igdb_games("   ") == []
        assert transport["data"] == []

    def test_a_hit_is_mapped_onto_the_shared_result_shape(self, monkeypatch):
        _serve_search(monkeypatch, FakeResponse(200, [SEARCH_HIT]))
        assert igdb.search_igdb_games("elden ring") == [
            {
                "external_id": "119133",
                "link": "https://www.igdb.com/games/elden-ring",
                "title": "Elden Ring",
                "title_alt": None,
                "year": 2022,
                "detail": "PC · PS5 · Xbox Series X|S +1",
                "cover_url": "https://images.igdb.com/igdb/image/upload/t_thumb/co4jni.jpg",
            }
        ]

    def test_missing_optional_fields_map_to_none(self, monkeypatch):
        _serve_search(monkeypatch, FakeResponse(200, [{"id": 7, "name": "Bare"}]))
        [row] = igdb.search_igdb_games("bare")
        assert row["external_id"] == "7"
        assert (row["link"], row["year"], row["detail"], row["cover_url"]) == (
            None,
            None,
            None,
            None,
        )

    def test_the_request_is_one_attempt_with_the_search_timeout(self, monkeypatch):
        seen = []
        _serve_search(monkeypatch, FakeResponse(200, [SEARCH_HIT]), seen)
        igdb.search_igdb_games("elden ring", 5)
        assert len(seen) == 1
        assert seen[0]["timeout"] == igdb.SEARCH_TIMEOUT
        assert 'search "elden ring"' in seen[0]["data"]
        assert "limit 5;" in seen[0]["data"]

    def test_a_repeated_query_is_served_from_the_cache(self, monkeypatch):
        seen = []
        _serve_search(monkeypatch, FakeResponse(200, [SEARCH_HIT]), seen)
        igdb.search_igdb_games("Elden Ring")
        igdb.search_igdb_games(" elden ring ")
        assert len(seen) == 1

    def test_a_network_error_raises_after_a_single_attempt(self, monkeypatch):
        seen = []
        _serve_search(monkeypatch, requests.exceptions.ConnectTimeout("slow"), seen)
        with pytest.raises(igdb.ExternalSearchError):
            igdb.search_igdb_games("elden ring")
        assert len(seen) == 1

    @pytest.mark.parametrize("status", [401, 404, 429, 500, 503])
    def test_an_error_status_raises(self, monkeypatch, status):
        _serve_search(monkeypatch, FakeResponse(status))
        with pytest.raises(igdb.ExternalSearchError):
            igdb.search_igdb_games("elden ring")

    def test_a_failure_is_not_cached(self, monkeypatch):
        _serve_search(monkeypatch, FakeResponse(503))
        with pytest.raises(igdb.ExternalSearchError):
            igdb.search_igdb_games("elden ring")
        _serve_search(monkeypatch, FakeResponse(200, [SEARCH_HIT]))
        assert igdb.search_igdb_games("elden ring")[0]["title"] == "Elden Ring"

    def test_a_non_json_body_raises(self, monkeypatch):
        class NotJson(FakeResponse):
            def json(self):
                raise ValueError("no json")

        _serve_search(monkeypatch, NotJson(200))
        with pytest.raises(igdb.ExternalSearchError):
            igdb.search_igdb_games("elden ring")

    def test_missing_credentials_raise_without_calling_out(self, monkeypatch):
        monkeypatch.setattr(igdb.settings, "igdb_client_secret", None)

        def explode(*a, **k):
            raise AssertionError("must not call out without credentials")

        monkeypatch.setattr(igdb.requests, "post", explode)
        with pytest.raises(igdb.ExternalSearchError, match="not configured"):
            igdb.search_igdb_games("elden ring")

    def test_a_refused_token_raises(self, monkeypatch):
        calls = []

        def fake_post(url, **kwargs):
            calls.append(url)
            return FakeResponse(400)

        monkeypatch.setattr(igdb.requests, "post", fake_post)
        with pytest.raises(igdb.ExternalSearchError, match="token"):
            igdb.search_igdb_games("elden ring")
        assert len(calls) == 1 and "twitch" in calls[0]

    def test_fill_keeps_its_retrying_path(self):
        assert hasattr(igdb.fetch_igdb_game, "retry")
        assert not hasattr(igdb.search_igdb_games, "retry")
