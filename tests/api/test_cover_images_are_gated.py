"""
A cover image is served only to a session that may see the entry it belongs to.

The whole `static/` tree used to be mounted unauthenticated, and a cover's URL
is CONSTRUCTIBLE — `<owner_type>/<system_id>.jpg` — so anyone who learned an
entry's id from any source could fetch the cover of an entry the label gate
hides from them, with no login at all. The cover image is exactly what a
content label exists to hide, so that was the payload rather than a hint at it.

Two things make the refusal tests here bite, and both look like decoration:

  - `nsfw_label` and `hidden_anime`. The label gate computes over the set of
    labels the viewer's mode does not carry, and that set is EMPTY in a fresh
    test database — so a refusal test without a real label passes vacuously,
    on day one and forever after. Neither fixture is named in the assertions.
  - the file written to disk by `cover_on_disk`. A missing file 404s too, so a
    gate test whose file was never created proves nothing about the gate.

Every refusal below is therefore mirrored by an admin fetching the SAME file
and getting the bytes, which is what says the 404 came from the gate and not
from an empty set, an absent file or a typo in the URL.
"""

import os

import pytest

from app.services.integrations.image_manager import COVER_DIR, cover_key

PIXEL = b"\xff\xd8\xff\xe0 not really a jpeg, but bytes on disk"


@pytest.fixture
def cover_on_disk():
    """Write a cover file for one owner, and take it away again afterwards."""
    written = []

    def _write(owner_type, system_id):
        key = cover_key(owner_type, str(system_id))
        path = os.path.join(COVER_DIR, *key.split("/"))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(PIXEL)
        written.append(path)
        return f"/api/covers/{key}"

    yield _write

    for path in written:
        try:
            os.remove(path)
        except FileNotFoundError:
            pass


def test_a_hidden_entrys_cover_is_not_served(
    client, admin_client, catalog_writer, hidden_anime, cover_on_disk
):
    url = cover_on_disk("anime", hidden_anime.system_id)

    # The mirror, first: the file is really there and really served, so the
    # 404s below are the gate refusing rather than the fixture failing.
    allowed = admin_client.get(url)
    assert allowed.status_code == 200
    assert allowed.content == PIXEL

    narrowed = catalog_writer()
    assert narrowed.get(url).status_code == 404


def test_a_visible_entrys_cover_is_served_to_the_same_narrowed_session(
    catalog_writer, sample_anime, cover_on_disk
):
    """The other half of the pair: the narrowed session is not refused
    everything, so the refusal above is about THIS entry."""
    url = cover_on_disk("anime", sample_anime.system_id)
    narrowed = catalog_writer()

    response = narrowed.get(url)
    assert response.status_code == 200
    assert response.content == PIXEL


def test_the_owner_type_in_the_url_is_not_trusted(
    admin_client, catalog_writer, hidden_anime, cover_on_disk
):
    """
    The type is resolved from the media row, never from the path.

    A caller-supplied type paired with a client-supplied id gates under the
    WRONG media_type.<key> permission — the trap require_visible_media exists
    for. Here the file is written under a lying folder, so a gate reading the
    path would ask about `movie` and wave an anime entry through.
    """
    url = cover_on_disk("movie", hidden_anime.system_id)

    assert admin_client.get(url).status_code == 200
    narrowed = catalog_writer()
    assert narrowed.get(url).status_code == 404


def test_the_static_mount_no_longer_serves_covers(client, hidden_anime, cover_on_disk):
    """The gate is worth nothing while the old ungated path still answers."""
    cover_on_disk("anime", hidden_anime.system_id)
    key = cover_key("anime", str(hidden_anime.system_id))

    assert client.get(f"/static/covers/{key}").status_code == 404


def test_library_and_quote_images_are_still_served_from_static(client):
    """
    Scope check. Library uploads and quote images keep the unauthenticated
    mount they have always had — this change closes the CONSTRUCTIBLE path,
    and takes no view on the other two.
    """
    os.makedirs("static/library", exist_ok=True)
    path = "static/library/gate-test-fixture.jpg"
    with open(path, "wb") as fh:
        fh.write(PIXEL)
    try:
        assert client.get("/static/library/gate-test-fixture.jpg").status_code == 200
    finally:
        os.remove(path)


@pytest.mark.parametrize(
    "path",
    [
        "/api/covers/anime/%2e%2e%2f%2e%2e%2f.env",
        "/api/covers/not-a-real-owner/x.jpg",
        "/api/covers/anime/not-a-uuid.jpg",
        "/api/covers/anime/",
    ],
)
def test_a_path_that_does_not_name_a_cover_is_refused(client, path):
    """The filename this route opens is the canonical form of a PARSED UUID, so
    no caller-supplied text reaches os.path.join and traversal has nothing to
    traverse. Anything that is not an owner type plus a uuid.jpg is a miss."""
    assert client.get(path).status_code in (404, 422)
