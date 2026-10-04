"""The picker-search cache: hits on a normalised query, never caches a failure."""

import pytest

from app.services.integrations import external_search
from app.services.integrations.external_search import ExternalSearchError, cached_search


def test_a_repeated_query_is_answered_from_the_cache():
    calls = []

    @cached_search
    def search(q, limit):
        calls.append(q)
        return [{"external_id": "1", "title": q}]

    search("Frieren", 10)
    search("  frieren ", 10)
    assert calls == ["Frieren"]


def test_a_different_limit_is_a_different_entry():
    calls = []

    @cached_search
    def search(q, limit):
        calls.append(limit)
        return []

    search("frieren", 10)
    search("frieren", 5)
    assert calls == [10, 5]


def test_a_failure_is_not_cached():
    calls = []

    @cached_search
    def search(q, limit):
        calls.append(q)
        raise ExternalSearchError("down")

    for _ in range(2):
        with pytest.raises(ExternalSearchError):
            search("frieren", 10)
    assert len(calls) == 2


def test_an_entry_expires_after_the_ttl(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(external_search.time, "monotonic", lambda: clock[0])
    calls = []

    @cached_search
    def search(q, limit):
        calls.append(q)
        return []

    search("frieren", 10)
    clock[0] += external_search.CACHE_TTL_SECONDS + 1
    search("frieren", 10)
    assert len(calls) == 2
