"""
The HowLongToBeat transport: how it finds the search endpoint, how it
authenticates, and that every failure is a None rather than an exception.
requests is patched out - no test touches the network.
"""

import json

import pytest
import requests

from app.services.integrations import hltb

HOME_HTML = (
    "<html><head>"
    '<script src="/_next/static/chunks/aaa.js"></script>'
    '<script src="/_next/static/chunks/bbb.js"></script>'
    "</head></html>"
)
CHUNK_WITHOUT_SEARCH = 'fetch("/api/user/me",{method:"GET"})'
CHUNK_WITH_SEARCH = (
    'let r=await fetch("/api/search/site",{method:"POST",headers:'
    '{"Content-Type":"application/json","x-auth-token":t},body:JSON.stringify(a)});'
)

WITCHER = {
    "game_id": 10270,
    "game_name": "The Witcher 3: Wild Hunt",
    "game_alias": "The Witcher III: Wild Hunt",
    "release_world": 2015,
}


class FakeResponse:
    def __init__(self, status_code=200, text="", payload=None):
        self.status_code = status_code
        self.text = text if payload is None else json.dumps(payload)
        self._payload = payload

    def json(self):
        if self._payload is None:
            raise ValueError("not JSON")
        return self._payload


@pytest.fixture(autouse=True)
def clean_client(monkeypatch):
    """Enabled, unpaced, and with nothing discovered yet."""
    monkeypatch.setattr(hltb.settings, "hltb_enabled", True)
    monkeypatch.setattr(hltb, "_pause", lambda: None)
    hltb.reset()
    yield
    hltb.reset()


@pytest.fixture
def site(monkeypatch):
    """
    A fake howlongtobeat.com. `state` steers it: the chunk that carries the
    search call, the search answers to hand out in order, and an exception
    to raise instead of answering.
    """
    state = {
        "chunks": {"aaa.js": CHUNK_WITHOUT_SEARCH, "bbb.js": CHUNK_WITH_SEARCH},
        "home_status": 200,
        "search_answers": [FakeResponse(payload={"count": 1, "data": [WITCHER]})],
        "raise": None,
        "gets": [],
        "posts": [],
        "tokens": iter(["token-1", "token-2", "token-3"]),
    }

    def fake_get(url, **kwargs):
        if state["raise"]:
            raise state["raise"]
        state["gets"].append(url)
        if url == "https://howlongtobeat.com/":
            return FakeResponse(state["home_status"], text=HOME_HTML)
        for name, body in state["chunks"].items():
            if url.endswith(f"/_next/static/chunks/{name}"):
                return FakeResponse(text=body)
        if url.endswith("/init"):
            return FakeResponse(payload={"token": next(state["tokens"])})
        return FakeResponse(404, text="")

    def fake_post(url, **kwargs):
        if state["raise"]:
            raise state["raise"]
        state["posts"].append(
            (url, kwargs.get("headers") or {}, json.loads(kwargs["data"]), kwargs.get("timeout"))
        )
        answers = state["search_answers"]
        return answers.pop(0) if len(answers) > 1 else answers[0]

    monkeypatch.setattr(hltb.requests, "get", fake_get)
    monkeypatch.setattr(hltb.requests, "post", fake_post)
    return state


class TestSearch:
    def test_it_posts_to_the_endpoint_the_sites_own_script_names(self, site):
        results = hltb.search_hltb("The Witcher 3: Wild Hunt")

        assert results == [WITCHER]
        url, headers, body, timeout = site["posts"][0]
        assert url == "https://howlongtobeat.com/api/search/site"
        assert headers["x-auth-token"] == "token-1"
        assert body["searchType"] == "games"
        assert body["searchTerms"] == ["The", "Witcher", "3:", "Wild", "Hunt"]
        assert timeout == hltb.TIMEOUT

    def test_a_renamed_endpoint_is_followed(self, site):
        site["chunks"]["bbb.js"] = CHUNK_WITH_SEARCH.replace("/api/search/site", "/api/find/v3")

        hltb.search_hltb("Celeste")

        assert site["posts"][0][0] == "https://howlongtobeat.com/api/find/v3"
        assert "https://howlongtobeat.com/api/find/v3/init" in site["gets"]

    def test_discovery_falls_back_to_the_last_known_endpoint(self, site):
        site["chunks"] = {"aaa.js": CHUNK_WITHOUT_SEARCH, "bbb.js": ""}

        hltb.search_hltb("Celeste")

        assert site["posts"][0][0] == "https://howlongtobeat.com" + hltb.FALLBACK_SEARCH_PATH

    def test_the_endpoint_and_token_are_reused_across_searches(self, site):
        hltb.search_hltb("Celeste")
        gets_after_first = len(site["gets"])

        hltb.search_hltb("Hades")

        assert len(site["gets"]) == gets_after_first
        assert len(site["posts"]) == 2

    def test_an_expired_token_is_refreshed_once(self, site):
        site["search_answers"] = [
            FakeResponse(403, payload={"message": "expired"}),
            FakeResponse(payload={"count": 1, "data": [WITCHER]}),
        ]

        assert hltb.search_hltb("The Witcher 3: Wild Hunt") == [WITCHER]
        assert [p[1]["x-auth-token"] for p in site["posts"]] == ["token-1", "token-2"]

    def test_a_token_refused_twice_is_none(self, site):
        site["search_answers"] = [FakeResponse(403, payload={"message": "no"})]

        assert hltb.search_hltb("Celeste") is None
        assert len(site["posts"]) == 2

    def test_a_moved_endpoint_is_rediscovered_once(self, site):
        site["search_answers"] = [
            FakeResponse(404, text="gone"),
            FakeResponse(payload={"count": 1, "data": [WITCHER]}),
        ]

        assert hltb.search_hltb("The Witcher 3: Wild Hunt") == [WITCHER]
        assert site["gets"].count("https://howlongtobeat.com/") == 2

    def test_rate_limited_is_none(self, site):
        site["search_answers"] = [FakeResponse(429, payload={"message": "slow down"})]

        assert hltb.search_hltb("Celeste") is None

    def test_a_network_error_is_none_not_an_exception(self, site):
        site["raise"] = requests.exceptions.ConnectionError("down")

        assert hltb.search_hltb("Celeste") is None

    def test_a_body_that_is_not_json_is_none(self, site):
        site["search_answers"] = [FakeResponse(200, text="<html>captcha</html>")]

        assert hltb.search_hltb("Celeste") is None

    def test_disabled_sends_nothing(self, site, monkeypatch):
        monkeypatch.setattr(hltb.settings, "hltb_enabled", False)

        assert hltb.search_hltb("Celeste") is None
        assert site["gets"] == [] and site["posts"] == []

    def test_a_blank_term_sends_nothing(self, site):
        assert hltb.search_hltb("   ") is None
        assert site["gets"] == []


class TestFindGameId:
    def test_an_exact_match_is_its_id(self, site):
        assert hltb.find_hltb_game_id("The Witcher 3: Wild Hunt", ["The Witcher 3: Wild Hunt"], 2015) == 10270

    def test_an_ambiguous_result_is_none(self, site):
        twin = dict(WITCHER, game_id=99999)
        site["search_answers"] = [FakeResponse(payload={"count": 2, "data": [WITCHER, twin]})]

        assert hltb.find_hltb_game_id("The Witcher 3: Wild Hunt", ["The Witcher 3: Wild Hunt"], 2015) is None

    def test_no_results_is_none(self, site):
        site["search_answers"] = [FakeResponse(payload={"count": 0, "data": []})]

        assert hltb.find_hltb_game_id("Nothing Like It", ["Nothing Like It"], None) is None

    def test_a_network_error_is_none(self, site):
        site["raise"] = requests.exceptions.Timeout("slow")

        assert hltb.find_hltb_game_id("The Witcher 3: Wild Hunt", ["The Witcher 3: Wild Hunt"], 2015) is None
