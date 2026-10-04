"""The admin's Comic Vine picker, so a comic can be linked before Fill runs."""

from app.routers import comic as comic_router
from app.services.integrations.external_search import ExternalSearchError

SPIDER_MAN = {
    "external_id": "2127",
    "link": "https://comicvine.gamespot.com/the-amazing-spider-man/4050-2127/",
    "title": "The Amazing Spider-Man",
    "title_alt": None,
    "year": 1963,
    "detail": "Marvel · 700 issues",
    "cover_url": "https://comicvine.gamespot.com/a/uploads/original/asm1.jpg",
}


def test_search_requires_admin(client):
    assert client.get("/api/comic/search-comicvine?q=spider").status_code == 401


def test_search_returns_the_shared_result_shape(admin_client, monkeypatch):
    seen = {}

    def fake_search(q, limit):
        seen["args"] = (q, limit)
        return [SPIDER_MAN]

    monkeypatch.setattr(comic_router, "search_comicvine_volumes", fake_search)
    response = admin_client.get("/api/comic/search-comicvine?q=spider&limit=3")
    assert response.status_code == 200
    assert response.json() == [SPIDER_MAN]
    assert seen["args"] == ("spider", 3)


def test_a_search_failure_is_a_502_carrying_the_message(admin_client, monkeypatch):
    def failing(q, limit):
        raise ExternalSearchError("Comic Vine is not configured (COMICVINE_API_KEY).")

    monkeypatch.setattr(comic_router, "search_comicvine_volumes", failing)
    response = admin_client.get("/api/comic/search-comicvine?q=spider")
    assert response.status_code == 502
    assert response.json()["detail"] == "Comic Vine is not configured (COMICVINE_API_KEY)."


def test_an_empty_query_is_a_422(admin_client):
    assert admin_client.get("/api/comic/search-comicvine?q=").status_code == 422


def test_the_route_is_not_swallowed_by_the_factory_detail_route(admin_client, monkeypatch):
    monkeypatch.setattr(comic_router, "search_comicvine_volumes", lambda q, limit: [])
    response = admin_client.get("/api/comic/search-comicvine?q=spider")
    assert response.status_code == 200
    assert response.json() == []
