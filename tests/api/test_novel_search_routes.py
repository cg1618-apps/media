"""The novel tab's two pickers: GET /api/novel/search-mal and /search-openlibrary."""

import pytest

from app.routers import novel
from app.services.integrations.external_search import ExternalSearchError

ROUTES = [
    ("/api/novel/search-mal", "search_mal_novel"),
    ("/api/novel/search-openlibrary", "search_openlibrary_works"),
]

ROW = {
    "external_id": "OL17075811W",
    "link": "https://openlibrary.org/works/OL17075811W",
    "title": "Sapiens",
    "title_alt": "A Brief History of Humankind",
    "year": 2011,
    "detail": "Yuval Noah Harari",
    "cover_url": "https://covers.openlibrary.org/b/id/8634250-M.jpg",
}


@pytest.mark.parametrize("path,_", ROUTES)
def test_search_requires_admin(client, path, _):
    assert client.get(f"{path}?q=sapiens").status_code == 401


@pytest.mark.parametrize("path,func", ROUTES)
def test_search_returns_the_shared_shape(admin_client, monkeypatch, path, func):
    calls = []

    def fake(q, limit):
        calls.append((q, limit))
        return [ROW]

    monkeypatch.setattr(novel, func, fake)
    response = admin_client.get(f"{path}?q=sapiens&limit=5")
    assert response.status_code == 200
    assert response.json() == [ROW]
    # Reaching the fake proves the literal path is not swallowed by /{entry_id}.
    assert calls == [("sapiens", 5)]


@pytest.mark.parametrize("path,_", ROUTES)
def test_an_empty_query_is_a_422(admin_client, path, _):
    assert admin_client.get(f"{path}?q=").status_code == 422


@pytest.mark.parametrize("path,func", ROUTES)
def test_an_upstream_failure_is_a_502(admin_client, monkeypatch, path, func):
    def fail(q, limit):
        raise ExternalSearchError("Open Library did not answer.")

    monkeypatch.setattr(novel, func, fail)
    response = admin_client.get(f"{path}?q=sapiens")
    assert response.status_code == 502
    assert response.json()["detail"] == "Open Library did not answer."
