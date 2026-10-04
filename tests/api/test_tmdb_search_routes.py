"""The TMDB picker on the movie, TV show and cartoon Add tabs, and the lookup
that turns a picked result into the IMDb id the row is keyed by."""

import pytest

from app.routers import cartoon as cartoon_router
from app.routers import movie as movie_router
from app.routers import tv_show as tv_show_router
from app.services.integrations.external_search import ExternalSearchError

ROUTES = pytest.mark.parametrize(
    "route,module,kinds",
    [
        ("movies", movie_router, ("movie",)),
        ("tv-shows", tv_show_router, ("tv",)),
        ("cartoon", cartoon_router, ("movie", "tv")),
    ],
)
ROW = {
    "external_id": "movie/603",
    "link": "https://www.themoviedb.org/movie/603",
    "title": "The Matrix",
}


@ROUTES
def test_both_routes_require_a_catalog_manager(client, route, module, kinds):
    assert client.get(f"/api/{route}/search-tmdb?q=matrix").status_code == 401
    assert client.get(f"/api/{route}/tmdb-imdb-id?ref=movie/603").status_code == 401


@ROUTES
def test_search_returns_results_for_the_tab_kinds(admin_client, monkeypatch, route, module, kinds):
    seen = {}

    def fake(q, limit, kinds):
        seen.update(q=q, limit=limit, kinds=kinds)
        return [ROW]

    monkeypatch.setattr(module, "search_tmdb", fake)
    response = admin_client.get(f"/api/{route}/search-tmdb?q=matrix&limit=5")

    assert response.status_code == 200
    assert response.json() == [
        {**ROW, "title_alt": None, "year": None, "detail": None, "cover_url": None}
    ]
    assert seen == {"q": "matrix", "limit": 5, "kinds": kinds}


@ROUTES
def test_an_empty_query_is_a_422(admin_client, route, module, kinds):
    assert admin_client.get(f"/api/{route}/search-tmdb?q=").status_code == 422


@ROUTES
def test_a_search_failure_is_a_502(admin_client, monkeypatch, route, module, kinds):
    def fail(q, limit, kinds):
        raise ExternalSearchError("TMDB could not be reached.")

    monkeypatch.setattr(module, "search_tmdb", fail)
    response = admin_client.get(f"/api/{route}/search-tmdb?q=matrix")
    assert response.status_code == 502
    assert response.json()["detail"] == "TMDB could not be reached."


@ROUTES
def test_resolve_returns_the_imdb_id_and_link(admin_client, monkeypatch, route, module, kinds):
    monkeypatch.setattr(module, "resolve_tmdb_imdb_id", lambda ref: "tt0133093")
    response = admin_client.get(f"/api/{route}/tmdb-imdb-id?ref=movie/603")
    assert response.status_code == 200
    assert response.json() == {
        "imdb_id": "tt0133093",
        "imdb_link": "https://www.imdb.com/title/tt0133093/",
    }


@ROUTES
def test_resolve_is_a_404_when_tmdb_has_no_imdb_id(admin_client, monkeypatch, route, module, kinds):
    monkeypatch.setattr(module, "resolve_tmdb_imdb_id", lambda ref: None)
    response = admin_client.get(f"/api/{route}/tmdb-imdb-id?ref=tv/1399")
    assert response.status_code == 404
    assert "IMDb" in response.json()["detail"]


@ROUTES
def test_resolve_refuses_a_malformed_ref(admin_client, route, module, kinds):
    # The real resolver: a malformed ref is refused before any request is made.
    assert admin_client.get(f"/api/{route}/tmdb-imdb-id?ref=person/1").status_code == 422
    assert admin_client.get(f"/api/{route}/tmdb-imdb-id?ref=").status_code == 422


@ROUTES
def test_a_resolve_failure_is_a_502(admin_client, monkeypatch, route, module, kinds):
    def fail(ref):
        raise ExternalSearchError("TMDB answered with an error (500).")

    monkeypatch.setattr(module, "resolve_tmdb_imdb_id", fail)
    assert admin_client.get(f"/api/{route}/tmdb-imdb-id?ref=movie/603").status_code == 502


@ROUTES
def test_the_literal_paths_are_not_swallowed_by_the_entry_route(
    admin_client, monkeypatch, route, module, kinds
):
    # GET /api/<route>/{entry_id} would answer 404 or 422 for these segments;
    # reaching the fakes proves the literal routes matched first.
    monkeypatch.setattr(module, "search_tmdb", lambda q, limit, kinds: [ROW])
    monkeypatch.setattr(module, "resolve_tmdb_imdb_id", lambda ref: "tt0133093")
    search = admin_client.get(f"/api/{route}/search-tmdb?q=matrix")
    resolve = admin_client.get(f"/api/{route}/tmdb-imdb-id?ref=movie/603")
    assert search.json()[0]["title"] == "The Matrix"
    assert resolve.json()["imdb_id"] == "tt0133093"
