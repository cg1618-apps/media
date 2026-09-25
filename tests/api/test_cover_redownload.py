"""
An entry pointed at a different external id gets that id's cover.

The report this guards: an anime with a downloaded MAL cover had its MAL id
changed and its cover cleared, and afterwards showed no cover anywhere - or,
by another path, kept the old title's. Each test here is one of the ways in,
and each ends in the same place: the next autofill downloads the NEW id's
cover into the entry's file.

The Tenrai fetch and the HTTP get are both stubbed; nothing reaches the
network. Covers are written under tmp_path.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

from types import SimpleNamespace

import pytest

from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_anime_from_mal
from app.services.integrations import image_library, image_manager

OLD_ID, NEW_ID = 1001, 2002


@pytest.fixture
def covers_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(image_library, "STATIC_DIR", str(tmp_path))
    root = tmp_path / "covers"
    monkeypatch.setattr(image_manager, "COVER_DIR", str(root))
    return root


@pytest.fixture
def mal(monkeypatch):
    """Tenrai answers with a cover url per MAL id; the CDN answers with its bytes."""

    def fetch(mal_id):
        return {
            "type": "Movie",
            "images": {"jpg": {"image_url": f"https://cdn.test/{mal_id}.jpg"}},
        }

    def get(url, **kwargs):
        mal_id = url.rsplit("/", 1)[-1].removesuffix(".jpg")
        return SimpleNamespace(
            content=f"cover of {mal_id}".encode(), raise_for_status=lambda: None
        )

    monkeypatch.setattr(autofill_module, "fetch_tenrai_anime_data", fetch)
    monkeypatch.setattr(image_manager.requests, "get", get)


def _cover_path(covers_dir, anime):
    return covers_dir / "anime" / f"{anime.system_id}.jpg"


def _with_old_cover(db_session, covers_dir, anime):
    """The entry as it was: pointing at OLD_ID, with OLD_ID's cover on disk."""
    anime.mal_id = OLD_ID
    anime.cover_image_file = f"anime/{anime.system_id}.jpg"
    path = _cover_path(covers_dir, anime)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(f"cover of {OLD_ID}".encode())
    db_session.flush()
    return path


def test_clear_then_a_new_mal_id_downloads_the_new_cover(
    admin_client, db_session, sample_anime, covers_dir, mal
):
    path = _with_old_cover(db_session, covers_dir, sample_anime)

    cleared = admin_client.delete(
        f"/api/images/owners/anime/{sample_anime.system_id}/cover"
    )
    assert cleared.status_code == 204
    db_session.refresh(sample_anime)
    sample_anime.mal_id = NEW_ID
    autofill_anime_from_mal(sample_anime, db=db_session)

    assert sample_anime.cover_image_file == f"anime/{sample_anime.system_id}.jpg"
    assert path.read_bytes() == f"cover of {NEW_ID}".encode()


def test_a_stale_file_behind_an_empty_column_is_replaced(
    db_session, sample_anime, covers_dir, mal
):
    # The column was cleared some other way - a detach, a sheet Pull - and
    # the old file stayed. It used to be returned as if it were the download.
    path = _with_old_cover(db_session, covers_dir, sample_anime)
    sample_anime.cover_image_file = None
    sample_anime.mal_id = NEW_ID

    autofill_anime_from_mal(sample_anime, db=db_session)

    assert sample_anime.cover_image_file == f"anime/{sample_anime.system_id}.jpg"
    assert path.read_bytes() == f"cover of {NEW_ID}".encode()


def test_a_column_naming_a_file_that_is_gone_is_downloaded_again(
    db_session, sample_anime, covers_dir, mal
):
    # The shape that shows nothing anywhere: the column still names the
    # entry's download, and the file has been deleted - from the library, or
    # it never reached this machine. Replace used to see a non-empty column
    # and leave it.
    path = _with_old_cover(db_session, covers_dir, sample_anime)
    path.unlink()
    sample_anime.mal_id = NEW_ID

    autofill_anime_from_mal(sample_anime, db=db_session)

    assert path.read_bytes() == f"cover of {NEW_ID}".encode()


def test_a_cover_on_disk_is_left_alone_until_it_is_cleared(
    db_session, sample_anime, covers_dir, mal
):
    # Changing the id alone does not replace a cover that is there: the cover
    # may have been picked by hand. Clearing it is the explicit step.
    path = _with_old_cover(db_session, covers_dir, sample_anime)
    sample_anime.mal_id = NEW_ID

    autofill_anime_from_mal(sample_anime, db=db_session)

    assert path.read_bytes() == f"cover of {OLD_ID}".encode()


def test_a_missing_upload_is_not_replaced_by_a_download(
    db_session, sample_anime, covers_dir, mal
):
    # An upload's bytes do not travel between machines, so a missing one is
    # normal on the other machine - and nothing can supply it again.
    sample_anime.mal_id = NEW_ID
    sample_anime.cover_image_file = "library/0123abcd.jpg"
    db_session.flush()

    autofill_anime_from_mal(sample_anime, db=db_session)

    assert sample_anime.cover_image_file == "library/0123abcd.jpg"
    assert not _cover_path(covers_dir, sample_anime).exists()
