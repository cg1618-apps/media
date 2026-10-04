"""The admin's MyAnimeList pickers on the Add tab: anime, anime movie, manga,
person and character, each a GET /api/<type>/search-mal."""

import re

import pytest

from app.routers import anime, anime_movie, character, manga, person
from app.services.integrations.external_search import ExternalSearchError

# (path, router module, name of the search function the route calls)
ROUTES = [
    ("/api/anime/search-mal", anime, "search_mal_anime"),
    ("/api/anime-movie/search-mal", anime_movie, "search_mal_anime"),
    ("/api/manga/search-mal", manga, "search_mal_manga"),
    ("/api/person/search-mal", person, "search_mal_people"),
    ("/api/character/search-mal", character, "search_mal_characters"),
]
PATHS = [path for path, _, _ in ROUTES]
# A route whose last segment is a bare path parameter: /api/anime/{entry_id}.
ID_ROUTE = re.compile(r"/\{\w+\}$")

ROW = {
    "external_id": "52991",
    "link": "https://myanimelist.net/anime/52991/Sousou_no_Frieren",
    "title": "Sousou no Frieren",
    "title_alt": "Frieren: Beyond Journey's End",
    "year": 2023,
    "detail": "TV · 28 eps",
    "cover_url": "https://cdn.myanimelist.net/images/anime/1015/138006.jpg",
}


@pytest.fixture
def stub_searches(monkeypatch):
    """Replaces every route's search function; records the calls it gets."""
    calls = []

    def fake(q, limit, **kwargs):
        calls.append((q, limit, kwargs))
        return [ROW]

    for _, module, name in ROUTES:
        monkeypatch.setattr(module, name, fake)
    return calls


@pytest.mark.parametrize("path", PATHS)
def test_a_guest_is_refused(client, stub_searches, path):
    assert client.get(f"{path}?q=frieren").status_code == 401
    assert stub_searches == []


@pytest.mark.parametrize("path", PATHS)
def test_a_user_without_manage_catalog_is_refused(user_client, stub_searches, path):
    # Mirror of the admin case below: the same stub would answer, so the
    # refusal is the permission gate's. require_permission answers 401, not
    # 403, for a signed-in user who lacks the permission.
    assert user_client.get(f"{path}?q=frieren").status_code == 401
    assert stub_searches == []


@pytest.mark.parametrize("path", PATHS)
def test_returns_the_search_results(admin_client, stub_searches, path):
    response = admin_client.get(f"{path}?q=frieren&limit=5")
    assert response.status_code == 200
    assert response.json() == [ROW]
    assert stub_searches[0][:2] == ("frieren", 5)


def test_the_anime_movie_picker_filters_to_movies(admin_client, stub_searches):
    admin_client.get("/api/anime-movie/search-mal?q=spirited")
    admin_client.get("/api/anime/search-mal?q=spirited")
    assert stub_searches[0][2] == {"media_type": "movie"}
    assert stub_searches[1][2] == {}


@pytest.mark.parametrize("path", PATHS)
def test_an_empty_query_is_a_422(admin_client, stub_searches, path):
    assert admin_client.get(f"{path}?q=").status_code == 422
    assert stub_searches == []


@pytest.mark.parametrize("path", PATHS)
def test_a_limit_over_fifty_is_a_422(admin_client, stub_searches, path):
    assert admin_client.get(f"{path}?q=frieren&limit=51").status_code == 422


@pytest.mark.parametrize("path, module, name", ROUTES)
def test_a_search_failure_is_a_502_with_its_message(admin_client, monkeypatch, path, module, name):
    def failing(q, limit, **kwargs):
        raise ExternalSearchError("MyAnimeList search (Tenrai) is unreachable.")

    monkeypatch.setattr(module, name, failing)
    response = admin_client.get(f"{path}?q=frieren")
    assert response.status_code == 502
    assert response.json()["detail"] == "MyAnimeList search (Tenrai) is unreachable."


@pytest.mark.parametrize("path, module, name", ROUTES)
def test_the_path_is_not_swallowed_by_the_id_route(admin_client, stub_searches, path, module, name):
    """The literal route must win over the router's GET /{id} route.

    The factory's is /{entry_id}, person's and character's /{system_id}.
    Taken by the id route, this would be a 404 or 422 (no entry called
    "search-mal") and the stub would never be called.
    """
    assert admin_client.get(f"{path}?q=frieren").status_code == 200
    assert len(stub_searches) == 1
    literal = next(
        i for i, route in enumerate(module.router.routes) if getattr(route, "path", None) == path
    )
    catch_all = [
        i
        for i, route in enumerate(module.router.routes)
        if "GET" in getattr(route, "methods", set()) and ID_ROUTE.search(getattr(route, "path", ""))
    ]
    assert catch_all, "expected the router to have a GET /{id} route"
    assert literal < min(catch_all)
