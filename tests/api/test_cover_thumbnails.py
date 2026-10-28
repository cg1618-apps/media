"""
`GET /api/covers/<owner_type>/<id>.jpg?size=thumb` - the small version a list
card shows.

The thumbnail is a cache, generated on first request and kept on disk, so the
one thing it must not become is a way round the visibility gate: the gate runs
first, exactly as it does for the original, and a hidden owner's thumbnail is a
404 whether or not a cached file is already sitting there.

The refusal test bites only because of `hidden_anime`, whose label puts a
non-empty set in front of the gate (see test_cover_images_are_gated.py), and
because a cached thumbnail is written BEFORE the narrowed session asks - so a
gate that ran after the cache lookup would have something to hand out. The
admin fetching the same URL is the mirror that says the 404 was the gate.
"""

import io
import os

import pytest
from PIL import Image

from app.services.integrations import image_manager
from app.services.integrations.image_library import THUMB_EDGE


@pytest.fixture
def covers_root(tmp_path, monkeypatch):
    """The route's cover root under tmp_path, so no test writes into the
    developer's real static/covers."""
    root = tmp_path / "covers"
    monkeypatch.setattr("app.routers.covers.COVER_DIR", str(root))
    return root


@pytest.fixture
def jpeg_cover(covers_root):
    def _write(owner_type, system_id, width, height):
        path = covers_root / owner_type / f"{system_id}.jpg"
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (width, height), (30, 120, 200)).save(path, format="JPEG")
        return path, f"/api/covers/{owner_type}/{system_id}.jpg"

    return _write


def _size_of(response):
    return Image.open(io.BytesIO(response.content)).size


def test_a_thumbnail_is_smaller_than_its_cover(catalog_writer, sample_anime, jpeg_cover):
    path, url = jpeg_cover("anime", sample_anime.system_id, 1000, 1500)
    session = catalog_writer()

    original = session.get(url)
    thumb = session.get(f"{url}?size=thumb")

    assert original.status_code == 200
    assert original.content == path.read_bytes()
    assert thumb.status_code == 200
    assert thumb.headers["content-type"] == "image/jpeg"
    assert max(_size_of(thumb)) == THUMB_EDGE
    assert len(thumb.content) < len(original.content)


def test_a_thumbnail_is_cached_privately_with_its_own_etag(
    catalog_writer, sample_anime, jpeg_cover
):
    """The ETag must differ from the original's, or a browser revalidating one
    URL with the other's tag would be told its copy is current."""
    _, url = jpeg_cover("anime", sample_anime.system_id, 1000, 1500)
    session = catalog_writer()

    original = session.get(url)
    thumb = session.get(f"{url}?size=thumb")

    assert thumb.headers["cache-control"] == "private, max-age=86400"
    assert thumb.headers["etag"] != original.headers["etag"]

    again = session.get(f"{url}?size=thumb", headers={"If-None-Match": thumb.headers["etag"]})
    assert again.status_code == 304
    assert again.headers["etag"] == thumb.headers["etag"]

    crossed = session.get(
        f"{url}?size=thumb", headers={"If-None-Match": original.headers["etag"]}
    )
    assert crossed.status_code == 200


def test_a_small_cover_is_served_as_is(catalog_writer, sample_anime, jpeg_cover, covers_root):
    path, url = jpeg_cover("anime", sample_anime.system_id, 200, 300)

    thumb = catalog_writer().get(f"{url}?size=thumb")

    assert thumb.status_code == 200
    assert thumb.content == path.read_bytes()
    assert not (covers_root / image_manager.THUMB_FOLDER).exists()


def test_a_thumbnail_follows_a_replaced_cover(catalog_writer, sample_anime, jpeg_cover):
    path, url = jpeg_cover("anime", sample_anime.system_id, 1000, 1000)
    session = catalog_writer()
    first = session.get(f"{url}?size=thumb")
    assert _size_of(first) == (THUMB_EDGE, THUMB_EDGE)

    jpeg_cover("anime", sample_anime.system_id, 800, 1600)
    stat = os.stat(path)
    os.utime(path, ns=(stat.st_atime_ns, stat.st_mtime_ns + 5_000_000_000))

    second = session.get(f"{url}?size=thumb")
    assert _size_of(second) == (THUMB_EDGE // 2, THUMB_EDGE)
    assert second.headers["etag"] != first.headers["etag"]


def test_a_hidden_entrys_thumbnail_is_not_served(
    admin_client, catalog_writer, hidden_anime, jpeg_cover
):
    _, url = jpeg_cover("anime", hidden_anime.system_id, 1000, 1500)

    # The mirror, and it also leaves a cached thumbnail on disk - so the
    # refusal below is the gate, not an absent file.
    allowed = admin_client.get(f"{url}?size=thumb")
    assert allowed.status_code == 200
    assert max(_size_of(allowed)) == THUMB_EDGE

    narrowed = catalog_writer()
    assert narrowed.get(f"{url}?size=thumb").status_code == 404
    assert narrowed.get(url).status_code == 404


def test_a_hidden_entrys_thumbnail_is_never_generated(
    catalog_writer, hidden_anime, jpeg_cover, covers_root
):
    """The gate runs before any thumbnail work: a refused request writes
    nothing to the cache."""
    _, url = jpeg_cover("anime", hidden_anime.system_id, 1000, 1500)

    assert catalog_writer().get(f"{url}?size=thumb").status_code == 404
    assert not (covers_root / image_manager.THUMB_FOLDER).exists()


@pytest.mark.parametrize("size", ["full", "THUMB", "", "small"])
def test_an_unknown_size_is_a_miss(admin_client, sample_anime, jpeg_cover, size):
    """Like every other input that does not name a cover, an unrecognised size
    is a 404 - checked before the gate, so it says nothing about the entry."""
    _, url = jpeg_cover("anime", sample_anime.system_id, 1000, 1500)

    assert admin_client.get(url).status_code == 200
    assert admin_client.get(f"{url}?size={size}").status_code == 404


def test_a_missing_cover_has_no_thumbnail(admin_client, sample_anime, covers_root):
    url = f"/api/covers/anime/{sample_anime.system_id}.jpg?size=thumb"
    assert admin_client.get(url).status_code == 404
