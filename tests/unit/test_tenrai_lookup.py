"""
The MAL prefill's record lookups through Tenrai (lookup_mal_anime,
lookup_mal_manga): one attempt, None for an id MAL does not have, and an
ExternalSearchError for anything else - interactive, like the picker searches.

requests is mocked with `responses` - the suite makes no live calls.
"""

import pytest
import requests
import responses

from app.services.integrations import tenrai
from app.services.integrations.external_search import ExternalSearchError

BASE = tenrai.TENRAI_BASE_URL
LOOKUPS = (
    (tenrai.lookup_mal_anime, "anime"),
    (tenrai.lookup_mal_manga, "manga"),
)


@pytest.fixture(autouse=True)
def no_throttle(monkeypatch):
    monkeypatch.setattr(tenrai.tenrai_rate_limiter, "wait_if_needed", lambda: None)


@pytest.mark.parametrize("lookup, resource", LOOKUPS)
@responses.activate
def test_returns_the_records_data(lookup, resource):
    responses.get(f"{BASE}/{resource}/21/full", json={"data": {"mal_id": 21, "title": "X"}})
    assert lookup(21) == {"mal_id": 21, "title": "X"}


@pytest.mark.parametrize("lookup, resource", LOOKUPS)
@responses.activate
def test_an_unknown_id_is_none(lookup, resource):
    responses.get(f"{BASE}/{resource}/999/full", status=404)
    assert lookup(999) is None


@pytest.mark.parametrize("lookup, resource", LOOKUPS)
@responses.activate
def test_a_server_error_raises_once(lookup, resource):
    responses.get(f"{BASE}/{resource}/21/full", status=503)
    with pytest.raises(ExternalSearchError, match="HTTP 503"):
        lookup(21)
    assert len(responses.calls) == 1


@pytest.mark.parametrize("lookup, resource", LOOKUPS)
@responses.activate
def test_unreachable_raises(lookup, resource):
    responses.get(f"{BASE}/{resource}/21/full", body=requests.exceptions.ConnectionError("down"))
    with pytest.raises(ExternalSearchError, match="unreachable"):
        lookup(21)


@responses.activate
def test_an_unreadable_body_raises():
    responses.get(f"{BASE}/anime/21/full", json={"data": []})
    with pytest.raises(ExternalSearchError, match="unreadable"):
        tenrai.lookup_mal_anime(21)
