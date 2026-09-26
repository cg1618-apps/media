"""
E-Hentai transport: what the gdata call asks for and how a miss degrades.
requests is patched out - no test touches the network.
"""

import pytest
import requests

from app.services.integrations import ehentai


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(str(self.status_code))


RECORD = {"gid": 618395, "token": "0439fa3666", "thumb": "https://ehgt.org/w/x.webp"}


@pytest.fixture(autouse=True)
def no_pause(monkeypatch):
    monkeypatch.setattr(ehentai, "_pause", lambda: None)


def test_posts_one_gdata_request_with_namespaced_tags(monkeypatch):
    seen = {}

    def fake_post(url, **kwargs):
        seen["url"] = url
        seen["json"] = kwargs.get("json")
        seen["timeout"] = kwargs.get("timeout")
        return FakeResponse(200, {"gmetadata": [RECORD]})

    monkeypatch.setattr(ehentai.requests, "post", fake_post)
    assert ehentai.fetch_ehentai_gallery(618395, "0439fa3666") == RECORD
    assert seen["url"] == ehentai.EHENTAI_API_URL
    assert seen["json"] == {
        "method": "gdata",
        "gidlist": [[618395, "0439fa3666"]],
        "namespace": 1,
    }
    assert seen["timeout"]


def test_a_refused_gallery_is_a_none(monkeypatch):
    """A wrong token is an HTTP 200 with an error record, not an exception."""
    payload = {"gmetadata": [{"gid": 618395, "error": "Key missing, or incorrect key provided."}]}
    monkeypatch.setattr(ehentai.requests, "post", lambda url, **k: FakeResponse(200, payload))
    assert ehentai.fetch_ehentai_gallery(618395, "badbadbad0") is None


def test_an_empty_answer_is_a_none(monkeypatch):
    monkeypatch.setattr(
        ehentai.requests, "post", lambda url, **k: FakeResponse(200, {"gmetadata": []})
    )
    assert ehentai.fetch_ehentai_gallery(618395, "0439fa3666") is None


def test_a_404_is_a_none_without_retrying(monkeypatch):
    calls = []

    def fake_post(url, **kwargs):
        calls.append(url)
        return FakeResponse(404)

    monkeypatch.setattr(ehentai.requests, "post", fake_post)
    assert ehentai.fetch_ehentai_gallery(618395, "0439fa3666") is None
    assert len(calls) == 1


def test_a_server_error_is_a_none_without_retrying(monkeypatch):
    calls = []

    def fake_post(url, **kwargs):
        calls.append(url)
        return FakeResponse(503)

    monkeypatch.setattr(ehentai.requests, "post", fake_post)
    assert ehentai.fetch_ehentai_gallery(618395, "0439fa3666") is None
    assert len(calls) == 1


def test_no_key_makes_no_request(monkeypatch):
    def explode(*args, **kwargs):
        raise AssertionError("no key means no E-Hentai call")

    monkeypatch.setattr(ehentai.requests, "post", explode)
    assert ehentai.fetch_ehentai_gallery(0, "0439fa3666") is None
    assert ehentai.fetch_ehentai_gallery(618395, "") is None
