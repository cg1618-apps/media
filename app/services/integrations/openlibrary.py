"""
openlibrary.py
Handles all HTTP interactions with the Open Library API.
Strictly responsible for fetching raw external JSON data.

An Open Library *work* is one book. A novel entry may span several books
(Mistborn is one entry and three novels), so the stored work id names the
entry's anchor book — see the design spec, Decision A.

No API key: Open Library is open. The User-Agent is not optional, though —
generic client agents get throttled, the same reason Comic Vine and Tenrai
set one.
"""

import logging
import time
from typing import Any, Dict, List, Optional

import requests
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.services.integrations.external_search import (
    SEARCH_TIMEOUT,
    ExternalSearchError,
    cached_search,
)

logger = logging.getLogger(__name__)

OPENLIBRARY_BASE_URL = "https://openlibrary.org"
OPENLIBRARY_USER_AGENT = "CG1618-Media-Tracker/1.0"

# The editions list is the only place a first-publication year can be found;
# work.first_publish_date is unpopulated in practice (see the spec's probe).
EDITIONS_LIMIT = 1000
# A book has one or two authors. The cap stops a pathological record from
# costing dozens of requests.
MAX_AUTHOR_CALLS = 3


class OpenLibraryRateLimiter:
    """
    Sliding window rate limiter for Open Library (100 requests per minute).

    Open Library publishes no hard quota; this is politeness, not a ceiling
    they enforce. In-memory and per-process, like every other limiter here:
    it resets on restart and is not shared between instances.
    """

    def __init__(self, max_requests: int = 100, time_window: int = 60):
        self.max_requests = max_requests
        self.time_window = time_window
        self.request_timestamps = []

    def _prune(self, now: float) -> None:
        self.request_timestamps = [
            t for t in self.request_timestamps if now - t < self.time_window
        ]

    def has_capacity(self) -> bool:
        self._prune(time.time())
        return len(self.request_timestamps) < self.max_requests

    def wait_if_needed(self):
        now = time.time()
        self._prune(now)

        if len(self.request_timestamps) >= self.max_requests:
            sleep_time = self.time_window - (now - self.request_timestamps[0])
            if sleep_time > 0:
                logger.warning(
                    "Open Library Rate Limiter: limit (%s) reached. Pausing for %.2f seconds.",
                    self.max_requests,
                    sleep_time,
                )
                time.sleep(sleep_time)

        self.request_timestamps.append(time.time())


openlibrary_rate_limiter = OpenLibraryRateLimiter()


class RateLimitExceeded(Exception):
    pass


def _request(path: str, context: str) -> Optional[Any]:
    """
    Issues one throttled Open Library request and returns the parsed JSON.
    Returns None on any non-retryable failure; raises for retryable ones.
    """
    openlibrary_rate_limiter.wait_if_needed()

    url = f"{OPENLIBRARY_BASE_URL}{path}"
    headers = {"User-Agent": OPENLIBRARY_USER_AGENT}

    try:
        response = requests.get(url, headers=headers, timeout=15)

        if response.status_code == 429:
            logger.warning("Open Library rate limit (429) for %s.", context)
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code == 404:
            logger.warning("Open Library has no record for %s.", context)
            return None

        if response.status_code >= 500:
            logger.warning(
                "Open Library server error (%s) for %s — skipping retries.",
                response.status_code,
                context,
            )
            return None

        response.raise_for_status()
        return response.json()

    except requests.exceptions.RequestException as e:
        logger.error("Network/Timeout Error connecting to Open Library for %s: %s", context, e)
        raise


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=(
        retry_if_exception_type(requests.exceptions.RequestException)
        | retry_if_exception_type(RateLimitExceeded)
    ),
    reraise=False,
)
def fetch_openlibrary_work(
    work_id: str, *, want_editions: bool = True, want_authors: bool = True
) -> Optional[Dict[str, Any]]:
    """
    Fetches one work and, only when asked for, its editions and its authors.

    The flags exist because the caller's writes are fill-only: an entry that
    already has a release_date can never use the editions response, and one
    that already has an author credit can never use the author responses.
    Skipping them drops the steady-state cost to a single request.
    """
    if not work_id:
        return None

    work = _request(f"/works/{work_id}.json", context=f"work {work_id}")
    if not work:
        return None

    editions: List[Dict[str, Any]] = []
    if want_editions:
        payload = _request(
            f"/works/{work_id}/editions.json?limit={EDITIONS_LIMIT}",
            context=f"editions of {work_id}",
        )
        editions = (payload or {}).get("entries") or []

    authors: List[Dict[str, Any]] = []
    if want_authors:
        for entry in (work.get("authors") or [])[:MAX_AUTHOR_CALLS]:
            key = (entry.get("author") or {}).get("key")
            if not key:
                continue
            author = _request(f"{key}.json", context=f"author {key}")
            if author:
                authors.append(author)

    return {"work": work, "editions": editions, "authors": authors}


# ==========================================
# Add-tab picker search
# ==========================================

OPENLIBRARY_SEARCH_FIELDS = "key,title,subtitle,first_publish_year,author_name,cover_i"
OPENLIBRARY_SEARCH_COVER_URL = "https://covers.openlibrary.org/b/id/{cover_id}-M.jpg"
# A work can credit a dozen contributors; the picker line needs the first few.
SEARCH_DETAIL_AUTHORS = 2


def _map_search_doc(doc: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    key = doc.get("key") or ""
    title = doc.get("title")
    if not key.startswith("/works/") or not title:
        return None
    work_id = key[len("/works/") :]
    authors = [name for name in (doc.get("author_name") or []) if name]
    year = doc.get("first_publish_year")
    cover_id = doc.get("cover_i")
    return {
        "external_id": work_id,
        "link": f"{OPENLIBRARY_BASE_URL}/works/{work_id}",
        "title": title,
        "title_alt": doc.get("subtitle") or None,
        "year": year if isinstance(year, int) else None,
        "detail": ", ".join(authors[:SEARCH_DETAIL_AUTHORS]) or None,
        "cover_url": OPENLIBRARY_SEARCH_COVER_URL.format(cover_id=cover_id) if cover_id else None,
    }


@cached_search
def search_openlibrary_works(q: str, limit: int) -> List[Dict[str, Any]]:
    """
    Searches Open Library works for the Add-tab picker, as ExternalSearchResult
    dicts. One unretried request; any failure is an ExternalSearchError.
    """
    openlibrary_rate_limiter.wait_if_needed()
    try:
        response = requests.get(
            f"{OPENLIBRARY_BASE_URL}/search.json",
            params={"q": q, "fields": OPENLIBRARY_SEARCH_FIELDS, "limit": limit},
            headers={"User-Agent": OPENLIBRARY_USER_AGENT},
            timeout=SEARCH_TIMEOUT,
        )
    except requests.exceptions.RequestException as exc:
        logger.warning("Open Library search for %r failed: %s", q, exc)
        raise ExternalSearchError("Open Library could not be reached. Try again in a moment.")

    if response.status_code == 429:
        raise ExternalSearchError("Open Library is rate limiting requests. Try again shortly.")
    if response.status_code != 200:
        logger.warning("Open Library search for %r answered %s.", q, response.status_code)
        raise ExternalSearchError(f"Open Library answered with an error ({response.status_code}).")

    try:
        data = response.json()
    except ValueError:
        raise ExternalSearchError("Open Library sent a response that could not be read.")
    if not isinstance(data, dict):
        raise ExternalSearchError("Open Library sent a response that could not be read.")

    rows = [row for row in map(_map_search_doc, data.get("docs") or []) if row]
    return rows[:limit]
