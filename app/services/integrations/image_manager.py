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
"""

import logging
import os
from typing import Optional

import requests

from app.utils.media_resolver import MEDIA_TYPE_KEYS

logger = logging.getLogger(__name__)

COVER_DIR = "static/covers"

# Every table whose rows own an image. The media types come from
# media_resolver so the two never drift; the rest are the entity tables that
# have always shared this storage - staff and character portraits, publisher
# and studio logos.
COVER_OWNERS: frozenset[str] = frozenset(MEDIA_TYPE_KEYS) | frozenset(
    {"staff", "character", "publisher", "studio"}
)


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

    Two spellings mean the same file: `<owner_type>/<id>.jpg`, which a download
    writes, and `covers/<owner_type>/<id>.jpg`, which is the storage key of a
    backfilled `image` row and lands in the column when that row is attached.
    Anything else - a `library/` upload, another entry's download - is not
    this owner's and must never be overwritten by one of its downloads.
    """
    if not current_key:
        return False
    key = cover_key(owner_type, str(system_id))
    return current_key in (key, f"covers/{key}")


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


def delete_cover_image(owner_type: str, system_id: str) -> None:
    """
    Permanently removes an image from storage.
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

    except Exception as e:
        # Non-critical: Log the error but allow the parent transaction to continue
        logger.error("Maintenance Error: Failed to delete image %s: %s", key, e)
