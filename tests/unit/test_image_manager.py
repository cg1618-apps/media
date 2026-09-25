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


@pytest.mark.parametrize(
    "key",
    [
        "library/0123abcd.jpg",  # an upload, possibly on the other machine
        "anime/someone-else.jpg",  # another entry's download
        "covers/anime/someone-else.jpg",
        "anime-movie/id1.jpg",  # the same id under another owner is another file
    ],
)
def test_a_cover_that_is_not_the_owners_download_is_never_replaced(local_covers, key):
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
