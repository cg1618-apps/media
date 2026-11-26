"""The person Add tab's IMDb picker: GET /api/person/search-imdb searches
TMDB's people, and GET /api/person/tmdb-imdb-id turns the one picked into
its IMDb name id and link."""

from app.routers import person as person_router
from app.services.integrations.external_search import ExternalSearchError

ROW = {
    "external_id": "person/6384",
    "link": "https://www.themoviedb.org/person/6384",
    "title": "Keanu Reeves",
    "detail": "Acting",
}


def test_both_routes_require_a_catalog_manager(client):
    assert client.get("/api/person/search-imdb?q=keanu").status_code == 401
    assert client.get("/api/person/tmdb-imdb-id?ref=person/6384").status_code == 401


def test_search_returns_tmdb_people(owner_client, monkeypatch):
    seen = {}

    def fake(q, limit):
        seen.update(q=q, limit=limit)
        return [ROW]

    monkeypatch.setattr(person_router, "search_tmdb_people", fake)
    response = owner_client.get("/api/person/search-imdb?q=keanu&limit=5")

    assert response.status_code == 200
    assert response.json() == [{**ROW, "title_alt": None, "year": None, "cover_url": None}]
    assert seen == {"q": "keanu", "limit": 5}


def test_an_empty_query_is_a_422(owner_client):
    assert owner_client.get("/api/person/search-imdb?q=").status_code == 422


def test_a_search_failure_is_a_502(owner_client, monkeypatch):
    def fail(q, limit):
        raise ExternalSearchError("TMDB could not be reached.")

    monkeypatch.setattr(person_router, "search_tmdb_people", fail)
    response = owner_client.get("/api/person/search-imdb?q=keanu")
    assert response.status_code == 502
    assert response.json()["detail"] == "TMDB could not be reached."


def test_resolve_returns_the_imdb_name_id_and_link(owner_client, monkeypatch):
    monkeypatch.setattr(person_router, "resolve_tmdb_person_imdb_id", lambda ref: "nm0000206")
    response = owner_client.get("/api/person/tmdb-imdb-id?ref=person/6384")
    assert response.status_code == 200
    assert response.json() == {
        "imdb_id": "nm0000206",
        "imdb_link": "https://www.imdb.com/name/nm0000206/",
    }


def test_resolve_is_a_404_when_tmdb_has_no_imdb_id(owner_client, monkeypatch):
    monkeypatch.setattr(person_router, "resolve_tmdb_person_imdb_id", lambda ref: None)
    response = owner_client.get("/api/person/tmdb-imdb-id?ref=person/608")
    assert response.status_code == 404
    assert "IMDb" in response.json()["detail"]


def test_resolve_refuses_a_malformed_ref(owner_client):
    # The real resolver: refused before any request is made.
    assert owner_client.get("/api/person/tmdb-imdb-id?ref=movie/603").status_code == 422


def test_a_resolve_failure_is_a_502(owner_client, monkeypatch):
    def fail(ref):
        raise ExternalSearchError("TMDB answered with an error (500).")

    monkeypatch.setattr(person_router, "resolve_tmdb_person_imdb_id", fail)
    assert owner_client.get("/api/person/tmdb-imdb-id?ref=person/6384").status_code == 502
