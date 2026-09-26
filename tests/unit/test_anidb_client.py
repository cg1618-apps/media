"""
The AniDB transport: what it asks for, when it asks at all, and how an
error answer halts it. requests is patched out - no test touches the network.
"""

import gzip

import pytest
import requests

from app.services.integrations import anidb

ANIME_XML = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<anime id="4521" restricted="true"><startdate>2003-01-24</startdate>'
    "<picture>12345.jpg</picture></anime>"
)


class FakeResponse:
    def __init__(self, body: str = ANIME_XML, status_code: int = 200, gzipped: bool = True):
        raw = body.encode("utf-8")
        self.content = gzip.compress(raw) if gzipped else raw
        self.status_code = status_code


@pytest.fixture(autouse=True)
def clean_client(monkeypatch):
    """No pacing, no cached answers, no halt - and a registered client."""
    monkeypatch.setattr(anidb, "_pause", lambda: None)
    monkeypatch.setattr(anidb.settings, "anidb_client", "testclient")
    monkeypatch.setattr(anidb.settings, "anidb_clientver", "1")
    anidb.reset_cache()
    anidb.start_run()
    yield
    anidb.reset_cache()
    anidb.start_run()


@pytest.fixture
def get(monkeypatch):
    """Answers every request with `state["answer"]`; records the params."""
    state = {"answer": FakeResponse(), "calls": []}

    def fake_get(url, **kwargs):
        state["calls"].append((url, kwargs.get("params") or {}, kwargs.get("timeout")))
        answer = state["answer"]
        if isinstance(answer, Exception):
            raise answer
        return answer

    monkeypatch.setattr(anidb.requests, "get", fake_get)
    return state


class TestRequest:
    def test_asks_for_the_anime_as_the_registered_client(self, get):
        record = anidb.fetch_anidb_anime(4521)
        assert record.tag == "anime"
        assert record.get("id") == "4521"
        url, params, timeout = get["calls"][0]
        assert url == "http://api.anidb.net:9001/httpapi"
        assert params == {
            "request": "anime",
            "client": "testclient",
            "clientver": "1",
            "protover": 1,
            "aid": 4521,
        }
        assert timeout

    def test_a_body_requests_already_inflated_parses_too(self, get):
        get["answer"] = FakeResponse(gzipped=False)
        assert anidb.fetch_anidb_anime(4521).tag == "anime"

    def test_no_aid_makes_no_request(self, get):
        assert anidb.fetch_anidb_anime(None) is None
        assert get["calls"] == []

    def test_the_same_aid_is_asked_once_a_day(self, get):
        """AniDB bans a client that re-fetches an anime within a day."""
        first = anidb.fetch_anidb_anime(4521)
        second = anidb.fetch_anidb_anime(4521)
        assert first is second
        assert len(get["calls"]) == 1

    def test_the_pacing_is_at_least_four_seconds(self):
        assert anidb.MIN_INTERVAL >= 4


class TestDisabled:
    """Both directions with one fixture: the client set is what makes the
    disabled case's silence mean something."""

    def test_with_a_client_it_asks(self, get):
        assert anidb.fetch_anidb_anime(4521) is not None
        assert len(get["calls"]) == 1

    @pytest.mark.parametrize(
        "client, clientver", [(None, "1"), ("testclient", None), ("", ""), ("  ", "1")]
    )
    def test_without_a_client_it_never_asks(self, get, monkeypatch, client, clientver):
        monkeypatch.setattr(anidb.settings, "anidb_client", client)
        monkeypatch.setattr(anidb.settings, "anidb_clientver", clientver)
        assert anidb.settings.anidb_enabled is False
        assert anidb.fetch_anidb_anime(4521) is None
        assert get["calls"] == []
        # Disabled is not an error: nothing is halted.
        assert anidb.has_capacity() is True


class TestErrors:
    def test_a_ban_halts_the_client(self, get):
        get["answer"] = FakeResponse('<?xml version="1.0"?><error>Banned</error>')
        assert anidb.fetch_anidb_anime(4521) is None
        assert anidb.has_capacity() is False

        # Nothing further is sent, for any aid, until the next run.
        get["answer"] = FakeResponse()
        assert anidb.fetch_anidb_anime(4522) is None
        assert len(get["calls"]) == 1

        anidb.start_run()
        assert anidb.has_capacity() is True
        assert anidb.fetch_anidb_anime(4522) is not None
        assert len(get["calls"]) == 2

    def test_a_coded_client_error_halts_too(self, get):
        get["answer"] = FakeResponse(
            '<error code="302">client version missing or invalid</error>'
        )
        assert anidb.fetch_anidb_anime(4521) is None
        assert anidb.has_capacity() is False

    def test_a_ban_is_not_cached(self, get):
        get["answer"] = FakeResponse("<error>Banned</error>")
        anidb.fetch_anidb_anime(4521)
        anidb.start_run()
        get["answer"] = FakeResponse()
        assert anidb.fetch_anidb_anime(4521) is not None

    def test_not_found_is_an_answer_about_the_aid_not_the_client(self, get):
        get["answer"] = FakeResponse("<error>Anime not found</error>")
        assert anidb.fetch_anidb_anime(999999) is None
        assert anidb.has_capacity() is True
        # And it is cached like a record: asked once a day.
        assert anidb.fetch_anidb_anime(999999) is None
        assert len(get["calls"]) == 1

    def test_a_network_error_is_a_none_without_halting(self, get):
        get["answer"] = requests.exceptions.ConnectionError("down")
        assert anidb.fetch_anidb_anime(4521) is None
        assert anidb.has_capacity() is True

    def test_a_server_error_is_a_none_without_halting(self, get):
        get["answer"] = FakeResponse(status_code=503)
        assert anidb.fetch_anidb_anime(4521) is None
        assert anidb.has_capacity() is True

    def test_a_body_that_is_not_xml_is_a_none(self, get):
        get["answer"] = FakeResponse("<html>maintenance", gzipped=False)
        assert anidb.fetch_anidb_anime(4521) is None
        assert anidb.has_capacity() is True
