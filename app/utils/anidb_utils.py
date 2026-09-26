"""
anidb_utils.py
Pure helpers for the AniDB integration: reading an anime id (aid) out of an
AniDB URL, and mapping AniDB's anime record onto hentai fields. No I/O lives
here.

The record is the XML root the HTTP API returns for `request=anime`
(https://wiki.anidb.net/HTTP_API_Definition), already parsed by the client:

    <anime id="..." restricted="true">
      <type>OVA</type>
      <episodecount>2</episodecount>
      <startdate>2003-01-24</startdate>
      <enddate>2003-05-23</enddate>
      <titles>...</titles>
      <url>http://official.example/</url>
      <picture>12345.jpg</picture>
      <characters><character>... <picture>...</picture></character></characters>
      ...
    </anime>

Only DIRECT children of <anime> are read: a character carries a <picture>
of its own, and an external resource a <url>, and neither is the anime's.
"""

import logging
import re
from datetime import date
from typing import Any, Dict, Optional
from xml.etree.ElementTree import Element

from app.utils.constants import AiringStatus
from app.utils.release_date import normalize

logger = logging.getLogger(__name__)

# The anime's main picture is served from AniDB's image CDN by file name.
# cdn-eu, cdn-us and cdn answer the same files; img7.anidb.net, which older
# clients still name, only redirects here now.
ANIDB_IMAGE_BASE_URL = "https://cdn-eu.anidb.net/images/main/"

# `https://anidb.net/anime/<aid>`, and the short `anidb.net/a<aid>` form.
_ANIME_PATH_PATTERN = re.compile(r"anidb\.net/(?:anime/|a)(\d+)(?![\d])", re.IGNORECASE)
# The old `anidb.net/perl-bin/animedb.pl?show=anime&aid=<aid>` form.
_PERL_PATTERN = re.compile(
    r"anidb\.net/perl-bin/animedb\.pl\?(?:[^#]*&)?aid=(\d+)(?![\d])", re.IGNORECASE
)


def extract_anidb_aid(url: Optional[str]) -> Optional[int]:
    """
    The anime id in an AniDB anime URL, or None for an empty value or a URL
    that names no anime (an episode, a creator, a search).
    """
    if not url:
        return None
    text = str(url).strip()
    match = _ANIME_PATH_PATTERN.search(text) or _PERL_PATTERN.search(text)
    if not match:
        return None
    aid = int(match.group(1))
    return aid if aid > 0 else None


def _child_text(root: Element, tag: str) -> Optional[str]:
    """A direct child's text, stripped, or None when absent or empty."""
    node = root.find(tag)
    if node is None or node.text is None:
        return None
    return node.text.strip() or None


def _release_day(startdate: Optional[str]) -> Optional[str]:
    """AniDB dates are `YYYY-MM-DD`, or coarser when only that much is known."""
    if not startdate:
        return None
    day = normalize(startdate)
    if day is None:
        logger.warning("AniDB startdate '%s' is not a date.", startdate)
    return day


def _compare(value: str, today: date) -> int:
    """
    -1 when the (possibly partial) date is wholly before today, 1 when wholly
    after it, 0 when today falls inside it - "2026" in 2026, or today's day.
    """
    iso = today.isoformat()[: len(value)]
    if value < iso:
        return -1
    if value > iso:
        return 1
    return 0


def derive_airing_status(
    startdate: Optional[str],
    enddate: Optional[str],
    episodecount: Optional[int] = None,
    today: Optional[date] = None,
) -> Optional[str]:
    """
    Anime's vocabulary, from AniDB's dates. AniDB publishes no status.

    Finished once the end date has passed - an OVA's end date is usually its
    start date - or, for a single-episode anime, once it has started. Not Yet
    Aired while the start date is still ahead. Airing when it has started and
    the end is unknown or still ahead. None when there is no start date, or
    when a coarse date cannot say which side of today it falls on.
    """
    today = today or date.today()
    start = normalize(startdate) if startdate else None
    end = normalize(enddate) if enddate else None
    if start is None:
        return None
    if end is not None and _compare(end, today) < 0:
        return AiringStatus.FINISHED_AIRING.value
    started = _compare(start, today)
    if started > 0:
        return AiringStatus.NOT_YET_AIRED.value
    if started < 0 or start == today.isoformat():
        if episodecount == 1:
            return AiringStatus.FINISHED_AIRING.value
        if end is None or _compare(end, today) > 0:
            return AiringStatus.AIRING.value
        if end == today.isoformat():
            return AiringStatus.FINISHED_AIRING.value
    return None


def _episode_count(root: Element) -> Optional[int]:
    text = _child_text(root, "episodecount")
    try:
        return int(text) if text else None
    except ValueError:
        return None


def _cover_url(picture: Optional[str]) -> Optional[str]:
    """The main picture's CDN URL. AniDB gives a bare file name."""
    if not picture:
        return None
    name = picture.rsplit("/", 1)[-1]
    return f"{ANIDB_IMAGE_BASE_URL}{name}" if name else None


def map_anidb_to_hentai_data(
    root: Optional[Element], today: Optional[date] = None
) -> Dict[str, Any]:
    """
    One AniDB anime record, as the things the hentai fill can take from it:
    the release date, the airing status, the official site and the cover.
    Titles are never mapped - the names are the entry's identity.
    """
    if root is None:
        return {
            "release_date": None,
            "airing_status": None,
            "official_link": None,
            "cover_image_url": None,
        }
    startdate = _child_text(root, "startdate")
    enddate = _child_text(root, "enddate")
    return {
        "release_date": _release_day(startdate),
        "airing_status": derive_airing_status(
            startdate, enddate, _episode_count(root), today
        ),
        "official_link": _child_text(root, "url"),
        "cover_image_url": _cover_url(_child_text(root, "picture")),
    }
