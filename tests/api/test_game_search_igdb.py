"""The admin's IGDB picker, so an entry can be linked before Fill runs."""

from app.routers import game as game_router
from app.services.integrations.external_search import ExternalSearchError

ELDEN_RING = {
    "external_id": "1029",
    "link": "https://www.igdb.com/games/elden-ring",
    "title": "Elden Ring",
    "title_alt": None,
    "year": 2022,
    "detail": "PC · PS5 · XSX",
    "cover_url": "https://images.igdb.com/igdb/image/upload/t_thumb/co4jni.jpg",
}


def test_search_requires_admin(client):
    assert client.get("/api/game/search-igdb?q=elden").status_code == 401


def test_search_returns_the_shared_result_shape(admin_client, monkeypatch):
    seen = {}

    def fake_search(q, limit):
        seen["args"] = (q, limit)
        return [ELDEN_RING]

    monkeypatch.setattr(game_router, "search_igdb_games", fake_search)
    response = admin_client.get("/api/game/search-igdb?q=elden&limit=5")
    assert response.status_code == 200
    assert response.json() == [ELDEN_RING]
    assert seen["args"] == ("elden", 5)


def test_a_search_failure_is_a_502_carrying_the_message(admin_client, monkeypatch):
    def failing(q, limit):
        raise ExternalSearchError("IGDB could not be reached.")

    monkeypatch.setattr(game_router, "search_igdb_games", failing)
    response = admin_client.get("/api/game/search-igdb?q=elden")
    assert response.status_code == 502
    assert response.json()["detail"] == "IGDB could not be reached."


def test_an_empty_query_is_a_422(admin_client):
    assert admin_client.get("/api/game/search-igdb?q=").status_code == 422
