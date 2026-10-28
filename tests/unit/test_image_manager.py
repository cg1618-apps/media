"""
Unit tests for the owner-typed cover storage layout.

Every image is stored under `static/covers/<owner_type>/<system_id>.jpg`, so a
system_id alone no longer names a file - each entry point takes the owner type
alongside it. These tests point COVER_DIR at a tmp_path and exercise the real
filesystem.
"""

from types import SimpleNamespace

import pytest

from app.services.integrations import image_manager


@pytest.fixture
def local_covers(tmp_path, monkeypatch):
    """COVER_DIR under tmp_path."""
    root = tmp_path / "covers"
    monkeypatch.setattr(image_manager, "COVER_DIR", str(root))
    return root


# --------------------------------------------------------------------------
# cover_key
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "owner_type",
    [
        "anime",
        "anime-movie",
        "tv-show",
        "game",
        "staff",
        "character",
        "publisher",
        "studio",
    ],
)
def test_cover_key_is_owner_folder_plus_id(owner_type):
    assert image_manager.cover_key(owner_type, "abc-123") == f"{owner_type}/abc-123.jpg"


def test_cover_key_rejects_unknown_owner_type():
    """A typo must fail loudly rather than silently create a stray folder."""
    with pytest.raises(ValueError):
        image_manager.cover_key("animes", "abc-123")


def test_every_media_type_key_is_a_cover_owner():
    from app.utils.media_resolver import MEDIA_TYPE_KEYS

    for key in MEDIA_TYPE_KEYS:
        assert key in image_manager.COVER_OWNERS


# --------------------------------------------------------------------------
# download
# --------------------------------------------------------------------------


def test_download_writes_into_the_owner_folder_and_returns_the_key(
    local_covers, monkeypatch
):
    monkeypatch.setattr(
        image_manager.requests,
        "get",
        lambda *a, **k: SimpleNamespace(
            content=b"jpegbytes", raise_for_status=lambda: None
        ),
    )

    key = image_manager.download_cover_image("http://x/y.jpg", "anime", "id1")

    assert key == "anime/id1.jpg"
    assert (local_covers / "anime" / "id1.jpg").read_bytes() == b"jpegbytes"


def test_download_overwrites_a_file_already_at_the_owner_key(
    local_covers, monkeypatch
):
    """
    A file already there is a leftover, never the answer.

    Autofill downloads only when the entry has no cover, so a file at its key
    is the cover of whatever external id the entry pointed at before. Returning
    it instead of fetching is how an anime whose MAL id changed kept the old
    title's cover.
    """
    (local_covers / "anime").mkdir(parents=True)
    (local_covers / "anime" / "id1.jpg").write_bytes(b"old title")
    monkeypatch.setattr(
        image_manager.requests,
        "get",
        lambda *a, **k: SimpleNamespace(
            content=b"new title", raise_for_status=lambda: None
        ),
    )

    key = image_manager.download_cover_image("http://x/new.jpg", "anime", "id1")

    assert key == "anime/id1.jpg"
    assert (local_covers / "anime" / "id1.jpg").read_bytes() == b"new title"


def test_a_failed_download_leaves_the_existing_file_alone(local_covers, monkeypatch):
    (local_covers / "anime").mkdir(parents=True)
    (local_covers / "anime" / "id1.jpg").write_bytes(b"kept")

    def refuse(*a, **k):
        raise image_manager.requests.ConnectionError("offline")

    monkeypatch.setattr(image_manager.requests, "get", refuse)

    assert image_manager.download_cover_image("http://x/y.jpg", "anime", "id1") is None
    assert (local_covers / "anime" / "id1.jpg").read_bytes() == b"kept"
    assert list((local_covers / "anime").iterdir()) == [local_covers / "anime" / "id1.jpg"]


def test_download_ignores_a_stray_flat_file_of_the_same_id(local_covers, monkeypatch):
    """An un-migrated file at the root must not satisfy the new location."""
    local_covers.mkdir(parents=True)
    (local_covers / "id1.jpg").write_bytes(b"flat")
    monkeypatch.setattr(
        image_manager.requests,
        "get",
        lambda *a, **k: SimpleNamespace(content=b"fresh", raise_for_status=lambda: None),
    )

    image_manager.download_cover_image("http://x/y.jpg", "anime", "id1")

    assert (local_covers / "anime" / "id1.jpg").read_bytes() == b"fresh"


# --------------------------------------------------------------------------
# cover_needs_download
#
# The one question every autofill asks before downloading. Uploads are the
# case that must say False: nothing can supply their bytes again, so a missing
# upload is left missing rather than replaced by an API's picture.
# --------------------------------------------------------------------------


def test_an_owner_with_no_cover_needs_one(local_covers):
    assert image_manager.cover_needs_download(None, "anime", "id1") is True
    assert image_manager.cover_needs_download("", "anime", "id1") is True


def test_an_own_download_that_is_on_disk_does_not(local_covers):
    (local_covers / "anime").mkdir(parents=True)
    (local_covers / "anime" / "id1.jpg").write_bytes(b"x")

    assert image_manager.cover_needs_download("anime/id1.jpg", "anime", "id1") is False


@pytest.mark.parametrize("key", ["anime/id1.jpg", "covers/anime/id1.jpg"])
def test_an_own_download_whose_file_is_gone_needs_one(local_covers, key):
    """Both spellings of the owner's own file - the column's and a backfilled row's."""
    assert image_manager.cover_needs_download(key, "anime", "id1") is True


def test_a_bare_legacy_key_is_the_owners_own_download(local_covers):
    """
    `<id>.jpg` is the spelling from before per-type folders, and Pull still
    brings it in. Named after the entry's own id, it can only be its download.
    """
    assert image_manager.is_own_download("id1.jpg", "anime", "id1") is True


def test_a_bare_legacy_key_whose_file_is_missing_needs_one(local_covers):
    """
    No file ever answers to a bare key - the root is not an owner folder - so
    without this the entry would never download a cover again.
    """
    assert image_manager.cover_needs_download("id1.jpg", "anime", "id1") is True


def test_a_bare_legacy_key_with_a_file_at_the_owner_key_does_not(local_covers):
    (local_covers / "anime").mkdir(parents=True)
    (local_covers / "anime" / "id1.jpg").write_bytes(b"x")

    assert image_manager.cover_needs_download("id1.jpg", "anime", "id1") is False


@pytest.mark.parametrize(
    "key",
    [
        "library/0123abcd.jpg",  # an upload, possibly on the other machine
        "anime/someone-else.jpg",  # another entry's download
        "covers/anime/someone-else.jpg",
        "someone-else.jpg",  # another entry's download, in the legacy spelling
        "anime-movie/id1.jpg",  # the same id under another owner is another file
    ],
)
def test_a_cover_that_is_not_the_owners_download_is_never_replaced(local_covers, key):
    # No file exists for any of these keys, so a False here is the ownership
    # check refusing - not the "already on disk" branch.
    assert image_manager.is_own_download(key, "anime", "id1") is False
    assert image_manager.cover_needs_download(key, "anime", "id1") is False


# --------------------------------------------------------------------------
# exists / delete
# --------------------------------------------------------------------------


def test_exists_is_owner_scoped(local_covers):
    (local_covers / "manga").mkdir(parents=True)
    (local_covers / "manga" / "id1.jpg").write_bytes(b"x")

    assert image_manager.cover_image_exists("manga", "id1") is True
    # The same id under a different owner is a different image.
    assert image_manager.cover_image_exists("novel", "id1") is False


def test_exists_does_not_match_a_flat_file(local_covers):
    local_covers.mkdir(parents=True)
    (local_covers / "id1.jpg").write_bytes(b"x")

    assert image_manager.cover_image_exists("anime", "id1") is False


def test_delete_removes_only_the_owner_scoped_file(local_covers):
    (local_covers / "studio").mkdir(parents=True)
    (local_covers / "studio" / "id1.jpg").write_bytes(b"x")
    (local_covers / "id1.jpg").write_bytes(b"flat")

    image_manager.delete_cover_image("studio", "id1")

    assert not (local_covers / "studio" / "id1.jpg").exists()
    assert (local_covers / "id1.jpg").exists()


def test_delete_is_quiet_when_the_file_is_absent(local_covers):
    local_covers.mkdir(parents=True)
    image_manager.delete_cover_image("comic", "nope")  # must not raise


# --------------------------------------------------------------------------
# listing
# --------------------------------------------------------------------------


def test_list_returns_keys_not_bare_filenames(local_covers):
    for owner, name in [("anime", "a"), ("anime", "b"), ("staff", "c")]:
        (local_covers / owner).mkdir(parents=True, exist_ok=True)
        (local_covers / owner / f"{name}.jpg").write_bytes(b"x")

    assert set(image_manager.list_all_cover_images()) == {
        "anime/a.jpg",
        "anime/b.jpg",
        "staff/c.jpg",
    }


def test_list_can_be_restricted_to_one_owner(local_covers):
    for owner, name in [("anime", "a"), ("staff", "c")]:
        (local_covers / owner).mkdir(parents=True, exist_ok=True)
        (local_covers / owner / f"{name}.jpg").write_bytes(b"x")

    assert image_manager.list_all_cover_images("anime") == ["anime/a.jpg"]


def test_list_skips_files_left_at_the_root(local_covers):
    """Un-migrated flat files are not part of the new layout's inventory."""
    local_covers.mkdir(parents=True)
    (local_covers / "loose.jpg").write_bytes(b"x")

    assert image_manager.list_all_cover_images() == []


def test_list_of_a_missing_dir_is_empty(local_covers):
    assert image_manager.list_all_cover_images() == []


# --------------------------------------------------------------------------
# thumbnails
#
# A cover's thumbnail is a cache at `thumbs/<owner_type>/<id>.jpg` under the
# cover root, generated on first request by the cover route's `?size=thumb`.
# --------------------------------------------------------------------------


def _jpeg(path, width, height, colour=(200, 40, 40)):
    """A real JPEG on disk - the thumbnailer decodes what it is given."""
    from PIL import Image

    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (width, height), colour).save(path, format="JPEG")
    return path


def _thumb_file(local_covers, owner, name):
    return local_covers / image_manager.THUMB_FOLDER / owner / f"{name}.jpg"


def test_the_thumb_folder_is_not_an_owner_type():
    """Were it one, the cover route would serve the cache as an owner's folder
    and the orphan sweep would list it as covers."""
    assert image_manager.THUMB_FOLDER not in image_manager.COVER_OWNERS


def test_a_thumbnail_is_smaller_and_capped_at_the_thumb_edge(local_covers):
    from PIL import Image

    from app.services.integrations.image_library import THUMB_EDGE

    source = _jpeg(local_covers / "anime" / "a.jpg", 1200, 1600)

    served = image_manager.cover_thumbnail(str(source))

    assert served == str(_thumb_file(local_covers, "anime", "a"))
    with Image.open(served) as thumb:
        assert max(thumb.size) == THUMB_EDGE
        assert thumb.size == (THUMB_EDGE * 3 // 4, THUMB_EDGE)
        assert thumb.format == "JPEG"
    assert (local_covers / image_manager.THUMB_FOLDER).is_dir()


def test_a_source_no_bigger_than_the_thumb_is_served_as_is(local_covers):
    from app.services.integrations.image_library import THUMB_EDGE

    source = _jpeg(local_covers / "anime" / "small.jpg", THUMB_EDGE, 300)

    assert image_manager.cover_thumbnail(str(source)) == str(source)
    assert not _thumb_file(local_covers, "anime", "small").exists()


def test_a_cached_thumbnail_is_reused_while_the_source_is_unchanged(local_covers):
    source = _jpeg(local_covers / "anime" / "a.jpg", 1000, 1000)
    first = image_manager.cover_thumbnail(str(source))
    written = _thumb_file(local_covers, "anime", "a").stat().st_mtime_ns

    assert image_manager.cover_thumbnail(str(source)) == first
    assert _thumb_file(local_covers, "anime", "a").stat().st_mtime_ns == written


def test_a_thumbnail_is_regenerated_when_the_source_changes(local_covers):
    import os

    from PIL import Image

    source = local_covers / "anime" / "a.jpg"
    _jpeg(source, 1000, 1000, colour=(255, 0, 0))
    image_manager.cover_thumbnail(str(source))

    # A re-download replaces the file in place. Pin a different mtime rather
    # than trusting the clock to have ticked between two writes.
    _jpeg(source, 800, 1600, colour=(0, 0, 255))
    stat = source.stat()
    os.utime(source, ns=(stat.st_atime_ns, stat.st_mtime_ns + 5_000_000_000))

    served = image_manager.cover_thumbnail(str(source))
    with Image.open(served) as thumb:
        assert thumb.size == (200, 400)
        r, g, b = thumb.convert("RGB").getpixel((100, 200))
        assert b > 200 and r < 50


def test_a_thumbnail_is_regenerated_when_the_source_is_replaced_by_an_older_file(
    local_covers,
):
    """
    A restore (rclone keeps mtimes) or a merge's rename can put an OLDER file
    at the key. "Regenerate when the source is newer" would keep the previous
    image's thumbnail for ever; matching the mtime exactly does not.
    """
    import os

    from PIL import Image

    source = local_covers / "anime" / "a.jpg"
    _jpeg(source, 1000, 1000)
    image_manager.cover_thumbnail(str(source))

    _jpeg(source, 800, 1600)
    stat = source.stat()
    os.utime(source, ns=(stat.st_atime_ns, stat.st_mtime_ns - 5_000_000_000))

    with Image.open(image_manager.cover_thumbnail(str(source))) as thumb:
        assert thumb.size == (200, 400)


def test_a_stale_thumbnail_is_dropped_when_the_new_source_is_small(local_covers):
    import os

    source = local_covers / "anime" / "a.jpg"
    _jpeg(source, 1000, 1000)
    image_manager.cover_thumbnail(str(source))
    assert _thumb_file(local_covers, "anime", "a").exists()

    _jpeg(source, 100, 100)
    stat = source.stat()
    os.utime(source, ns=(stat.st_atime_ns, stat.st_mtime_ns + 5_000_000_000))

    assert image_manager.cover_thumbnail(str(source)) == str(source)
    assert not _thumb_file(local_covers, "anime", "a").exists()


def test_an_undecodable_source_is_served_as_is(local_covers):
    """The thumbnail is an optimisation: a file Pillow cannot read still has
    to reach the browser exactly as the original route would send it."""
    source = local_covers / "anime" / "junk.jpg"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"\xff\xd8\xff not really a jpeg")

    assert image_manager.cover_thumbnail(str(source)) == str(source)
    assert not _thumb_file(local_covers, "anime", "junk").exists()


def test_writing_a_thumbnail_leaves_no_partial_file(local_covers):
    source = _jpeg(local_covers / "anime" / "a.jpg", 1000, 1000)
    image_manager.cover_thumbnail(str(source))

    folder = local_covers / image_manager.THUMB_FOLDER / "anime"
    assert sorted(p.name for p in folder.iterdir()) == ["a.jpg"]


def test_delete_removes_the_thumbnail_with_its_source(local_covers):
    source = _jpeg(local_covers / "studio" / "id1.jpg", 1000, 1000)
    image_manager.cover_thumbnail(str(source))
    assert _thumb_file(local_covers, "studio", "id1").exists()

    image_manager.delete_cover_image("studio", "id1")

    assert not source.exists()
    assert not _thumb_file(local_covers, "studio", "id1").exists()


def test_move_carries_the_thumbnail_with_its_source(local_covers):
    source = _jpeg(local_covers / "anime" / "old.jpg", 1000, 1000)
    image_manager.cover_thumbnail(str(source))
    thumb_bytes = _thumb_file(local_covers, "anime", "old").read_bytes()

    image_manager.move_cover_image("anime/old.jpg", "anime/new.jpg")

    assert not _thumb_file(local_covers, "anime", "old").exists()
    assert _thumb_file(local_covers, "anime", "new").read_bytes() == thumb_bytes
    assert (local_covers / "anime" / "new.jpg").exists()


def test_move_drops_the_targets_old_thumbnail_when_the_source_has_none(
    local_covers,
):
    """The survivor's previous thumbnail depicts the image being replaced."""
    _jpeg(local_covers / "anime" / "new.jpg", 1000, 1000)
    image_manager.cover_thumbnail(str(local_covers / "anime" / "new.jpg"))
    _jpeg(local_covers / "anime" / "old.jpg", 1000, 1000)

    image_manager.move_cover_image("anime/old.jpg", "anime/new.jpg")

    assert not _thumb_file(local_covers, "anime", "new").exists()


def test_the_listing_does_not_include_thumbnails(local_covers):
    """The orphan sweep deletes what this lists and no row owns - a cached
    thumbnail must never reach it."""
    source = _jpeg(local_covers / "anime" / "a.jpg", 1000, 1000)
    image_manager.cover_thumbnail(str(source))
    assert _thumb_file(local_covers, "anime", "a").exists()

    assert image_manager.list_all_cover_images() == ["anime/a.jpg"]
