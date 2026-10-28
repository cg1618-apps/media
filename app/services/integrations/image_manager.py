"""
image_manager.py
Handles the persistent storage and retrieval of cover images and portraits.
Images live on the local filesystem; this module is the only place that knows
where.

Layout: every image lives at `<owner_type>/<system_id>.jpg`, under
`static/covers/`. The owner type is the table the id belongs to - a bare
system_id does not identify a file, since each table has its own id space.
`cover_key` is the only place the layout is spelled out; callers pass the owner
type and store the returned key verbatim in `cover_image_file` / `photo_file`.

Thumbnails: a cover's small version is a CACHE at
`thumbs/<owner_type>/<system_id>.jpg`, under the same `static/covers/` root -
see THUMB_FOLDER and `cover_thumbnail`.
"""

import logging
import os
import tempfile
from typing import Optional

import requests
from PIL import Image as PILImage

from app.services.integrations.image_library import THUMB_EDGE, thumbnail_jpeg
from app.utils.media_resolver import MEDIA_TYPE_KEYS

logger = logging.getLogger(__name__)

COVER_DIR = "static/covers"

# Every table whose rows own an image. The media types come from
# media_resolver so the two never drift; the rest are the entity tables that
# have always shared this storage - staff and character portraits, character
# identity portraits, publisher and studio logos.
COVER_OWNERS: frozenset[str] = frozenset(MEDIA_TYPE_KEYS) | frozenset(
    {"staff", "character", "character-identity", "publisher", "studio"}
)


# Where cover thumbnails are cached: `<COVER_DIR>/thumbs/<owner_type>/<id>.jpg`.
#
# INSIDE the cover root rather than beside it, because that root is the one
# bind mount production gives the cover tree (docker-compose.prod.yml mounts
# ./static/covers) - so the cache is writable there and survives a redeploy,
# where a sibling tree would live in the container's own layer and start from
# nothing after every release. It stays invisible to everything that walks the
# tree as covers: `list_all_cover_images` (and with it the orphan sweep) walks
# COVER_OWNERS folders only, and the cover route refuses any owner type outside
# COVER_OWNERS, so `thumbs` is neither listed nor addressable as an owner. It
# must therefore never become an owner type, which the assert below enforces.
# The weekly R2 mirror excludes it (deploy/backup/covers.sh): every thumbnail
# can be rebuilt from its cover.
THUMB_FOLDER = "thumbs"
assert THUMB_FOLDER not in COVER_OWNERS, "the thumbnail cache would read as an owner"


def cover_key(owner_type: str, system_id: str) -> str:
    """
    The storage key for one image: `<owner_type>/<system_id>.jpg`.

    Rejects an unknown owner type rather than creating a stray folder, which
    would silently hide the image from every listing and orphan check.
    """
    if owner_type not in COVER_OWNERS:
        raise ValueError(
            f"Unknown cover owner type {owner_type!r}; expected one of "
            f"{sorted(COVER_OWNERS)}"
        )
    return f"{owner_type}/{system_id}.jpg"


def _local_path(key: str) -> str:
    return os.path.join(COVER_DIR, *key.split("/"))


def _thumb_path_of(source_path: str) -> str:
    """
    The cached thumbnail's path for the cover at `source_path`
    (`<root>/<owner>/<id>.jpg` -> `<root>/thumbs/<owner>/<id>.jpg`).

    Derived from the source PATH rather than from COVER_DIR, so a caller that
    resolved the cover against its own root (the cover route does) gets the
    thumbnail under that same root.
    """
    owner_dir, filename = os.path.split(source_path)
    root, owner = os.path.split(owner_dir)
    return os.path.join(root, THUMB_FOLDER, owner, filename)


def _remove_if_present(path: str) -> None:
    try:
        os.remove(path)
    except FileNotFoundError:
        pass


def cover_thumbnail(source_path: str) -> str:
    """
    The file to send for a cover's thumbnail: the cached thumbnail, generated
    now if it is missing or stale, or the cover itself.

    The cover itself is the answer when it is already no bigger than
    THUMB_EDGE (a copy would only duplicate it), and also when it cannot be
    thumbnailed at all - an undecodable file, or a cache that cannot be
    written. A thumbnail is an optimisation, so failing to make one degrades
    to the original rather than to an error.

    Staleness is an EXACT mtime match: a written thumbnail carries its
    source's mtime, and any other mtime on the source means it changed. Not
    "the source is newer", because a restore (rclone keeps mtimes) or a
    merge's rename can put an OLDER file at the key, and that would keep the
    previous image's thumbnail for ever.

    The write goes to a uniquely named temporary file in the same folder and
    is renamed into place, so two requests generating the same thumbnail at
    once each rename a complete file and neither can serve a half-written
    one. The caller must have run the visibility gate first: this function
    knows nothing about who is asking.
    """
    thumb_path = _thumb_path_of(source_path)
    source_mtime = os.stat(source_path).st_mtime_ns
    try:
        if os.stat(thumb_path).st_mtime_ns == source_mtime:
            return thumb_path
    except FileNotFoundError:
        pass

    try:
        with PILImage.open(source_path) as image:
            if max(image.size) <= THUMB_EDGE:
                # A thumbnail left by a previous, larger cover is stale now.
                _remove_if_present(thumb_path)
                return source_path
            payload = thumbnail_jpeg(image)
    except Exception as e:
        logger.warning("Cannot thumbnail cover %s, serving it as is: %s", source_path, e)
        return source_path

    partial = None
    try:
        os.makedirs(os.path.dirname(thumb_path), exist_ok=True)
        fd, partial = tempfile.mkstemp(dir=os.path.dirname(thumb_path), suffix=".part")
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
        os.utime(partial, ns=(source_mtime, source_mtime))
        os.replace(partial, thumb_path)
        return thumb_path
    except OSError as e:
        logger.error("Cannot cache thumbnail %s, serving the cover: %s", thumb_path, e)
        if partial is not None:
            try:
                _remove_if_present(partial)
            except OSError:
                pass
        return source_path


def list_all_cover_images(owner_type: Optional[str] = None) -> list[str]:
    """
    All image keys currently in storage, optionally just one owner's.

    Returns keys (`anime/<id>.jpg`), not bare filenames. Files left at the root
    by an un-migrated installation are deliberately skipped: they belong to no
    owner, so no row can reference them.
    """
    owners = [owner_type] if owner_type else sorted(COVER_OWNERS)
    try:
        keys: list[str] = []
        for owner in owners:
            folder = os.path.join(COVER_DIR, owner)
            if not os.path.isdir(folder):
                continue
            keys.extend(
                f"{owner}/{f}" for f in os.listdir(folder) if f.endswith(".jpg")
            )
        return sorted(keys)
    except Exception as e:
        logger.error("Error listing cover images: %s", e)
        return []


def cover_image_exists(owner_type: str, system_id: str) -> bool:
    """Returns True if the image is present on disk."""
    key = cover_key(owner_type, str(system_id))
    try:
        return os.path.exists(_local_path(key))
    except Exception as e:
        logger.error("Error checking cover image for %s: %s", key, e)
        return False


def is_own_download(current_key: Optional[str], owner_type: str, system_id: str) -> bool:
    """
    Whether `current_key` names the file downloaded FOR this owner.

    Three spellings mean the owner's own download: `<owner_type>/<id>.jpg`,
    which a download writes; `covers/<owner_type>/<id>.jpg`, which is the
    storage key of a backfilled `image` row and lands in the column when that
    row is attached; and the bare `<id>.jpg` of the flat layout, which a Pull
    can still bring in. No file ever answers to the bare spelling - the root
    is not an owner folder - but it is named after this owner's own id, so it
    cannot be an upload or another entry's file, and the next download
    replaces it with the canonical key.
    Anything else - a `library/` upload, another entry's download - is not
    this owner's and must never be overwritten by one of its downloads.
    """
    if not current_key:
        return False
    key = cover_key(owner_type, str(system_id))
    return current_key in (key, f"covers/{key}", f"{system_id}.jpg")


def cover_needs_download(
    current_key: Optional[str], owner_type: str, system_id: str
) -> bool:
    """
    Whether an autofill should download a cover for this owner.

    True when the owner has no cover, and also when its cover is its OWN
    download whose file is not on this machine - a reference to a file that
    is gone shows nothing anywhere, and the external API can supply it again.
    An upload is never re-fetched: nothing can supply its bytes, and replacing
    its reference would lose it (see `bulk_download_missing_covers`).
    """
    if not current_key:
        return True
    return is_own_download(current_key, owner_type, system_id) and not (
        cover_image_exists(owner_type, system_id)
    )


def download_cover_image(
    image_url: str, owner_type: str, system_id: str
) -> Optional[str]:
    """
    Downloads an image from a remote URL and saves it to disk, returning the
    storage key to record on the row.

    ALWAYS fetches, overwriting whatever file is already at the owner's key.
    Callers download only when the owner needs a cover (`cover_needs_download`),
    so a file already sitting there is a leftover - typically the cover of the
    external id the entry pointed at before, cleared from the entry and now
    stale. Returning it instead of fetching is how an entry whose MAL id
    changed kept the old title's cover.

    The write goes to a temporary file first and is renamed into place, so a
    failed download never leaves a half-written cover behind.
    """
    if not image_url or not system_id:
        return None

    key = cover_key(owner_type, str(system_id))

    try:
        filepath = _local_path(key)
        os.makedirs(os.path.dirname(filepath), exist_ok=True)

        # MAL's image CDN requires a User-Agent to prevent 403 Forbidden errors
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediaTracker/1.0"
        }
        response = requests.get(image_url, headers=headers, timeout=15)
        response.raise_for_status()

        partial = f"{filepath}.part"
        with open(partial, "wb") as f:
            f.write(response.content)
        os.replace(partial, filepath)
        logger.info("Cover image saved: %s", key)

        return key

    except requests.RequestException as e:
        logger.error("Network error downloading image from %s: %s", image_url, e)
        return None
    except Exception as e:
        logger.error("Unexpected error managing cover image for %s: %s", key, e)
        return None


def move_cover_image(old_key: str, new_key: str) -> None:
    """
    Renames one stored image, e.g. a merged record's download onto the
    survivor's own key. A failure is logged, not raised: the caller's
    transaction has already committed.

    The cached thumbnail moves with it. When the moved image has none, the
    target's own thumbnail is dropped instead - it depicts the image just
    replaced.
    """
    old_path, new_path = _local_path(old_key), _local_path(new_key)
    try:
        os.replace(old_path, new_path)
        logger.info("Moved cover image: %s -> %s", old_key, new_key)
    except OSError as e:
        logger.error("Maintenance Error: Failed to move image %s to %s: %s", old_key, new_key, e)
        return
    old_thumb, new_thumb = _thumb_path_of(old_path), _thumb_path_of(new_path)
    try:
        if os.path.exists(old_thumb):
            os.makedirs(os.path.dirname(new_thumb), exist_ok=True)
            os.replace(old_thumb, new_thumb)
        else:
            _remove_if_present(new_thumb)
    except OSError as e:
        # Harmless if it sticks: a thumbnail whose mtime no longer matches its
        # cover is regenerated on the next request.
        logger.error("Maintenance Error: Failed to move thumbnail of %s: %s", old_key, e)


def delete_cover_image(owner_type: str, system_id: str) -> None:
    """
    Permanently removes an image, and its cached thumbnail, from storage.
    Typically called via BackgroundTasks during a record deletion.
    """
    if not system_id:
        return

    key = cover_key(owner_type, str(system_id))

    try:
        filepath = _local_path(key)
        if os.path.exists(filepath):
            os.remove(filepath)
            logger.info("Deleted cover image: %s", key)
        _remove_if_present(_thumb_path_of(filepath))

    except Exception as e:
        # Non-critical: Log the error but allow the parent transaction to continue
        logger.error("Maintenance Error: Failed to delete image %s: %s", key, e)
