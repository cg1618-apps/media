"""
anidb.py
Handles all HTTP interactions with AniDB's HTTP API.

Strictly responsible for fetching and parsing the raw XML. One request shape:

    GET http://api.anidb.net:9001/httpapi?request=anime&client=<name>
        &clientver=<n>&protover=1&aid=<aid>

It answers an `<anime>` document, or an `<error>` document - `<error>Banned
</error>`, `<error>Anime not found</error>`, `<error code="...">client version
missing or invalid</error>` and the like - both gzip-compressed. The API is
documented at https://wiki.anidb.net/HTTP_API_Definition.

Three rules come from AniDB, and all three are enforced here rather than
trusted to the caller:

- **A registered client.** AniDB answers only a client registered on the site.
  Without ANIDB_CLIENT and ANIDB_CLIENTVER (settings.anidb_enabled) nothing is
  sent at all.
- **No flooding.** AniDB bans a client that asks more than about once every
  two seconds. Requests are spaced by MIN_INTERVAL, double that.
- **No repeat requests.** AniDB asks that the same anime is not fetched more
  than once a day, and bans clients that do. Every answer - a record or a
  not-found - is cached in-process for CACHE_SECONDS, so a Fill followed by a
  Replace, or an entry AniDB has no picture for, costs one request a day.

Any other error answer - a ban above all - HALTS the client: no further
request is sent until the next pipeline run calls start_run(), and
has_capacity() turns False, which the hentai pipeline reads as its budget and
stops on. A not-found is an answer about one aid, not about the client, and
does not halt.
"""

import gzip
import logging
import time
from typing import Dict, Optional, Tuple
from xml.etree import ElementTree
from xml.etree.ElementTree import Element

import requests

from app.config import settings

logger = logging.getLogger(__name__)

ANIDB_API_URL = "http://api.anidb.net:9001/httpapi"
PROTOVER = 1

# Seconds between two requests. AniDB bans above roughly one per two seconds.
MIN_INTERVAL = 4.0

# How long one aid's answer is reused rather than re-requested.
CACHE_SECONDS = 24 * 60 * 60

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediaTracker/1.0",
    "Accept-Encoding": "gzip",
}

_last_request_at = 0.0
# The error text that halted the client, or None while it may ask.
_halted: Optional[str] = None
# aid -> (fetched_at, record or None for "AniDB has no such anime").
_cache: Dict[int, Tuple[float, Optional[Element]]] = {}
# Logged once per process rather than once per entry.
_disabled_logged = False


def has_capacity() -> bool:
    """False once an error answer has halted the client for this run."""
    return _halted is None


def start_run() -> None:
    """
    Lifts a halt at the start of a pipeline run, so one ban does not silence
    AniDB for the life of the process. The next run spends one request to
    learn whether the ban still stands, and halts again at once if it does.
    """
    global _halted
    if _halted is not None:
        logger.info("AniDB: clearing the halt from the previous run (%s).", _halted)
    _halted = None


def reset_cache() -> None:
    """Forgets every cached answer. For tests."""
    _cache.clear()


def _pause() -> None:
    """Sleeps until MIN_INTERVAL has passed since the previous request."""
    global _last_request_at
    wait = MIN_INTERVAL - (time.time() - _last_request_at)
    if wait > 0:
        time.sleep(wait)
    _last_request_at = time.time()


def _halt(reason: str) -> None:
    global _halted
    _halted = reason
    logger.error(
        "AniDB answered an error (%s). No further AniDB request is sent this "
        "run; the rest of the run is skipped.",
        reason,
    )


def _decode(content: bytes) -> bytes:
    """AniDB gzips its answers. requests inflates them when the header says
    so; a body that still starts with the gzip magic is inflated here."""
    if content[:2] == b"\x1f\x8b":
        return gzip.decompress(content)
    return content


def _is_not_found(message: str) -> bool:
    return "not found" in message.lower()


def _request(aid: int) -> Tuple[bool, Optional[Element]]:
    """
    One paced request. Returns (answered, record): answered is True when
    AniDB gave an answer worth caching - a record, or a not-found - and False
    for a failure that says nothing about the aid.
    """
    _pause()
    params = {
        "request": "anime",
        "client": settings.anidb_client.strip(),
        "clientver": settings.anidb_clientver.strip(),
        "protover": PROTOVER,
        "aid": aid,
    }
    try:
        response = requests.get(ANIDB_API_URL, params=params, headers=HEADERS, timeout=20)
    except requests.exceptions.RequestException as e:
        logger.error("Network/Timeout Error connecting to AniDB for aid %s: %s", aid, e)
        return False, None

    if response.status_code != 200:
        logger.warning("AniDB answered HTTP %s for aid %s.", response.status_code, aid)
        return False, None

    try:
        root = ElementTree.fromstring(_decode(response.content))
    except (OSError, ElementTree.ParseError) as e:
        logger.warning("AniDB's answer for aid %s is not XML: %s", aid, e)
        return False, None

    if root.tag == "error":
        message = (root.text or "").strip() or "unknown error"
        code = root.get("code")
        if code:
            message = f"{message} (code {code})"
        if _is_not_found(message):
            logger.info("AniDB has no anime %s (%s).", aid, message)
            return True, None
        _halt(message)
        return False, None

    if root.tag != "anime":
        logger.warning("AniDB answered <%s> for aid %s, not <anime>.", root.tag, aid)
        return False, None

    return True, root


def fetch_anidb_anime(aid: Optional[int]) -> Optional[Element]:
    """
    The `<anime>` record for one aid, or None: for no aid, a disabled or
    halted client, an anime AniDB does not have, or any failure. A None is
    never an exception - a missing record must not cost the entry its MAL half.
    """
    global _disabled_logged
    if not aid:
        return None
    if not settings.anidb_enabled:
        if not _disabled_logged:
            logger.info("AniDB is disabled: ANIDB_CLIENT / ANIDB_CLIENTVER are not set.")
            _disabled_logged = True
        return None
    if _halted is not None:
        return None

    aid = int(aid)
    cached = _cache.get(aid)
    if cached is not None and time.time() - cached[0] < CACHE_SECONDS:
        return cached[1]

    answered, record = _request(aid)
    if answered:
        _cache[aid] = (time.time(), record)
    return record
