"""The SPA catch-all must never serve files outside frontend_dist."""

import pytest
from fastapi.testclient import TestClient

from app import main as main_module


@pytest.fixture
def client(tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>spa</html>", encoding="utf-8")
    (dist / "app.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("SECRET", encoding="utf-8")
    monkeypatch.setattr(main_module, "FRONTEND_DIST", dist)
    # No lifespan: the catch-all needs no database.
    return TestClient(main_module.app)


def test_serves_built_asset(client):
    assert client.get("/app.js").text == "console.log(1)"


def test_unknown_route_falls_back_to_index(client):
    assert client.get("/library/anime").text == "<html>spa</html>"


@pytest.mark.parametrize("path", ["/..%2Fsecret.txt", "/%2E%2E%2Fsecret.txt", "/..%5Csecret.txt"])
def test_traversal_never_leaves_dist(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert "SECRET" not in response.text
    assert response.text == "<html>spa</html>"


# Cache headers. Vite names every asset after its content hash, so a deploy
# replaces the files an older index.html points at. A browser reusing that
# older index.html asks for assets that no longer exist and draws a blank
# page; so index.html is revalidated on every load and the hashed assets,
# which never change under one name, are cached for good.


def test_index_is_revalidated_on_every_load(client):
    assert client.get("/library/anime").headers["cache-control"] == "no-cache"


def test_root_index_is_revalidated_on_every_load(client):
    assert client.get("/").headers["cache-control"] == "no-cache"


def test_a_file_in_dist_is_not_marked_immutable(client):
    """Only /assets/ is content-hashed; a favicon keeps its name across builds."""
    assert "immutable" not in client.get("/app.js").headers.get("cache-control", "")


def test_hashed_assets_are_cached_for_good(tmp_path):
    from starlette.applications import Starlette
    from starlette.routing import Mount

    (tmp_path / "index-abc123.js").write_text("console.log(1)", encoding="utf-8")
    app = Starlette(
        routes=[Mount("/assets", main_module.HashedAssets(directory=tmp_path))]
    )

    response = TestClient(app).get("/assets/index-abc123.js")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_a_missing_hashed_asset_is_not_cached(tmp_path):
    """A 404 must not be pinned for a year: the next deploy may bring the file."""
    from starlette.applications import Starlette
    from starlette.routing import Mount

    app = Starlette(
        routes=[Mount("/assets", main_module.HashedAssets(directory=tmp_path))]
    )

    response = TestClient(app).get("/assets/index-gone.js")

    assert response.status_code == 404
    assert "immutable" not in response.headers.get("cache-control", "")
