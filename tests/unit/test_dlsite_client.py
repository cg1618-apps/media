"""
DLsite transport, and Steam's library-capsule lookup: what each asks for and
how a miss degrades. requests is patched out - no test touches the network.
"""

import pytest
import requests

from app.services.integrations import dlsite, steam


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(str(self.status_code))


RECORD = {"workno": "RJ173356", "maker_name": "ONEONE1"}


@pytest.fixture(autouse=True)
def no_pause(monkeypatch):
    monkeypatch.setattr(dlsite, "_pause", lambda: None)


class TestFetchProduct:
    def test_the_first_record_is_unwrapped_from_the_list(self, monkeypatch):
        seen = {}

        def fake_get(url, **kwargs):
            seen["url"] = url
            seen.update(kwargs.get("params") or {})
            seen["timeout"] = kwargs.get("timeout")
            return FakeResponse(200, [RECORD])

        monkeypatch.setattr(dlsite.requests, "get", fake_get)
        assert dlsite.fetch_dlsite_product("RJ173356") == RECORD
        assert seen["url"] == dlsite.DLSITE_BASE_URL
        assert seen["workno"] == "RJ173356"
        assert seen["timeout"]

    def test_an_unknown_id_is_an_empty_list_and_a_none(self, monkeypatch):
        monkeypatch.setattr(dlsite.requests, "get", lambda url, **k: FakeResponse(200, []))
        assert dlsite.fetch_dlsite_product("RJ999999999") is None

    def test_a_404_is_a_none(self, monkeypatch):
        monkeypatch.setattr(dlsite.requests, "get", lambda url, **k: FakeResponse(404))
        assert dlsite.fetch_dlsite_product("RJ173356") is None

    def test_a_server_error_is_a_none_without_retrying(self, monkeypatch):
        calls = []

        def fake_get(url, **kwargs):
            calls.append(url)
            return FakeResponse(503)

        monkeypatch.setattr(dlsite.requests, "get", fake_get)
        assert dlsite.fetch_dlsite_product("RJ173356") is None
        assert len(calls) == 1

    def test_no_id_makes_no_request(self, monkeypatch):
        def explode(*args, **kwargs):
            raise AssertionError("no id means no DLsite call")

        monkeypatch.setattr(dlsite.requests, "get", explode)
        assert dlsite.fetch_dlsite_product("") is None


class TestSteamLibraryCapsule:
    @pytest.fixture(autouse=True)
    def enabled(self, monkeypatch):
        monkeypatch.setattr(steam.settings, "steam_enabled", True)

    def _head(self, monkeypatch, answers):
        asked = []

        def fake_head(url, **kwargs):
            asked.append(url)
            return FakeResponse(answers[len(asked) - 1])

        monkeypatch.setattr(steam.requests, "head", fake_head)
        return asked

    def test_the_2x_capsule_is_preferred(self, monkeypatch):
        asked = self._head(monkeypatch, [200])
        url = steam.fetch_steam_library_capsule_url(1086940)
        assert url == (
            "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/"
            "1086940/library_600x900_2x.jpg"
        )
        assert len(asked) == 1

    def test_the_1x_capsule_is_the_fallback(self, monkeypatch):
        asked = self._head(monkeypatch, [404, 200])
        url = steam.fetch_steam_library_capsule_url(1086940)
        assert url.endswith("/1086940/library_600x900.jpg")
        assert len(asked) == 2

    def test_two_404s_are_no_cover(self, monkeypatch):
        self._head(monkeypatch, [404, 404])
        assert steam.fetch_steam_library_capsule_url(1086940) is None

    def test_a_network_error_is_no_cover(self, monkeypatch):
        def boom(url, **kwargs):
            raise requests.exceptions.ConnectionError("down")

        monkeypatch.setattr(steam.requests, "head", boom)
        assert steam.fetch_steam_library_capsule_url(1086940) is None

    def test_a_disabled_integration_makes_no_request(self, monkeypatch):
        monkeypatch.setattr(steam.settings, "steam_enabled", False)

        def explode(*args, **kwargs):
            raise AssertionError("disabled means no call")

        monkeypatch.setattr(steam.requests, "head", explode)
        assert steam.fetch_steam_library_capsule_url(1086940) is None
