"""
ehentai_utils.py
Pure helpers for the E-Hentai integration: reading a gallery key out of a
gallery URL, and mapping the API's gallery record onto h-comic fields. No I/O
lives here.

What the record is NOT mapped to is as deliberate as what it is:

- `posted` is when the gallery was UPLOADED, not when the work came out, so
  it never reaches release_date.
- `title` / `title_jpn` are a scanlator's or uploader's filename-style title
  (`(Event) [Circle (Artist)] Title (Parody) [Language]`), and an entry's
  names are its identity, so no name is written.
"""

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# https://e-hentai.org/g/<gid>/<token>/ - and exhentai.org, which shares the
# id space. The token is ten lowercase hex characters.
EHENTAI_GALLERY_PATTERN = re.compile(
    r"(?:e-hentai|exhentai)\.org/g/(\d+)/([0-9a-f]{10})\b", re.IGNORECASE
)

ARTIST_TAG_PREFIX = "artist:"


def extract_ehentai_gallery_key(url: Optional[str]) -> Optional[Tuple[int, str]]:
    """
    The (gid, token) pair in an E-Hentai or ExHentai gallery URL. Returns None
    for an empty value or a URL that is not a gallery page.
    """
    if not url:
        return None
    match = EHENTAI_GALLERY_PATTERN.search(str(url))
    if not match:
        return None
    return int(match.group(1)), match.group(2).lower()


def ehentai_gallery_key_for(entry) -> Optional[Tuple[int, str]]:
    """The gallery key an h-comic's E-Hentai fill keys off, from ehentai_link."""
    return extract_ehentai_gallery_key(getattr(entry, "ehentai_link", None))


def _artist_names(tags: Any) -> List[str]:
    """
    The `artist:` tags, in the order the gallery lists them, title-cased.

    E-Hentai's tags are lowercase romanisation (`artist:nanahara fuyuki`).
    Title case is only for a person the credit creates: an existing one is
    matched whatever the case, since person lookup casefolds.
    """
    if not isinstance(tags, list):
        return []
    names = []
    for tag in tags:
        if not isinstance(tag, str) or not tag.startswith(ARTIST_TAG_PREFIX):
            continue
        name = tag[len(ARTIST_TAG_PREFIX):].strip()
        if name and name.title() not in names:
            names.append(name.title())
    return names


def map_ehentai_to_h_comic_data(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    The two things an E-Hentai record supplies to an h-comic: the cover URL
    and the artist names for the illustrator credit.

    The cover is the API's `thumb` - the same 250px-wide image the gallery
    page shows as its cover. Its CDN has no larger variant of it and wants no
    Referer.
    """
    thumb = record.get("thumb")
    return {
        "cover_image_url": str(thumb) if thumb else None,
        "artists": _artist_names(record.get("tags")),
    }
