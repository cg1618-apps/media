"""
comicvine.py
Handles all HTTP interactions with the Comic Vine API.
Strictly responsible for fetching raw external JSON data.

A Comic Vine "volume" is one numbered run, so it is the entry point for a
`comic` row. Volume IDs are stored on the entry; titles are far too collision-
prone to match on ("Avengers" alone has dozens of volumes).
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

from app.config import settings
from app.services.integrations.external_search import (
    SEARCH_TIMEOUT,
    ExternalSearchError,
    cached_search,
)
from app.utils.comicvine_utils import _pick_cover_url

logger = logging.getLogger(__name__)

COMICVINE_BASE_URL = "https://comicvine.gamespot.com/api"

# Comic Vine rejects requests from default client agents outright, so this must
# be a real, identifying string rather than python-requests/x.y.
COMICVINE_USER_AGENT = "CG1618-Media-Tracker/1.0"

# The volume detail response is large. Requesting only what the mapper reads
# keeps responses small and stays well clear of the field-count limits.
VOLUME_FIELD_LIST = "id,name,start_year,count_of_issues,publisher,person_credits,image,site_detail_url"
SEARCH_FIELD_LIST = "id,name,start_year,count_of_issues,publisher,image,site_detail_url"


class ComicVineRateLimiter:
    """
    Sliding window rate limiter for the Comic Vine API (200 requests per hour).

    Far tighter than TMDB's 40/10s: a large backfill will not finish in one run,
    so callers should surface how many entries were left rather than block for
    the remainder of the hour.
    """

    def __init__(self, max_requests: int = 200, time_window: int = 3600):
        self.max_requests = max_requests
        self.time_window = time_window
        self.request_timestamps = []

    def has_capacity(self) -> bool:
        """Returns False when the next request would block on the hourly cap."""
        now = time.time()
        self.request_timestamps = [
            t for t in self.request_timestamps if now - t < self.time_window
        ]
        return len(self.request_timestamps) < self.max_requests

    def wait_if_needed(self):
        now = time.time()
        self.request_timestamps = [
            t for t in self.request_timestamps if now - t < self.time_window
        ]

        if len(self.request_timestamps) >= self.max_requests:
            sleep_time = self.time_window - (now - self.request_timestamps[0])
            if sleep_time > 0:
                logger.warning(
                    "Comic Vine Rate Limiter: Hourly limit (%s) reached. Pausing for %.2f seconds.",
                    self.max_requests,
                    sleep_time,
                )
                time.sleep(sleep_time)

        self.request_timestamps.append(time.time())


# Global instance shared across the application
comicvine_rate_limiter = ComicVineRateLimiter()


class RateLimitExceeded(Exception):
    pass


def _get_api_key() -> Optional[str]:
    api_key = settings.comicvine_api_key
    if not api_key:
        logger.error("COMICVINE_API_KEY environment variable is not set.")
    return api_key


def _request(path: str, params: Dict[str, Any], context: str) -> Optional[Dict[str, Any]]:
    """
    Issues one throttled Comic Vine request and returns the parsed envelope.
    Returns None on any non-retryable failure; raises for retryable ones.
    """
    comicvine_rate_limiter.wait_if_needed()

    url = f"{COMICVINE_BASE_URL}/{path}"
    headers = {"User-Agent": COMICVINE_USER_AGENT}

    try:
        response = requests.get(url, params=params, headers=headers, timeout=15)

        if response.status_code == 401:
            logger.error("Comic Vine API key is invalid or unauthorized.")
            return None

        if response.status_code == 420:
            # Comic Vine's non-standard "rate limit exceeded" code.
            logger.warning("Comic Vine rate limit (420) for %s.", context)
            raise RateLimitExceeded("420 Rate Limit Exceeded")

        if response.status_code == 429:
            logger.warning("Comic Vine rate limit (429) for %s.", context)
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code >= 500:
            logger.warning(
                "Comic Vine server error (%s) for %s — skipping retries.",
                response.status_code,
                context,
            )
            return None

        response.raise_for_status()

        payload = response.json()

        # Comic Vine reports application errors in the body with HTTP 200.
        # status_code 1 is OK; anything else is a failure.
        if payload.get("status_code") != 1:
            logger.warning(
                "Comic Vine error for %s: %s (status_code %s)",
                context,
                payload.get('error'),
                payload.get('status_code'),
            )
            return None

        return payload

    except requests.exceptions.RequestException as e:
        logger.error("Network/Timeout Error connecting to Comic Vine for %s: %s", context, e)
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
def fetch_comicvine_volume(volume_id: int) -> Optional[Dict[str, Any]]:
    """
    Fetches a single volume (one comic run) by its Comic Vine ID.
    Returns the `results` object, or None if unavailable.
    """
    if not volume_id:
        return None

    api_key = _get_api_key()
    if not api_key:
        return None

    payload = _request(
        f"volume/4050-{volume_id}/",
        {"api_key": api_key, "format": "json", "field_list": VOLUME_FIELD_LIST},
        context=f"volume {volume_id}",
    )

    if not payload:
        return None

    return payload.get("results") or None


def _search_request(params: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    One Comic Vine search for the Add-tab picker: a single attempt with
    ``SEARCH_TIMEOUT``, raising ``ExternalSearchError`` on any failure.

    Fill's ``_request`` retries through tenacity and degrades to None; a search
    box can do neither. Nor can it wait out the hourly cap the way a backfill
    does, so an exhausted limiter is reported rather than slept on.
    """
    if not comicvine_rate_limiter.has_capacity():
        raise ExternalSearchError("Comic Vine's hourly request limit is used up; try again later.")
    comicvine_rate_limiter.wait_if_needed()

    try:
        response = requests.get(
            f"{COMICVINE_BASE_URL}/search/",
            params=params,
            headers={"User-Agent": COMICVINE_USER_AGENT},
            timeout=SEARCH_TIMEOUT,
        )
    except requests.exceptions.RequestException as e:
        logger.error("Comic Vine search failed to connect: %s", e)
        raise ExternalSearchError("Comic Vine could not be reached.") from e

    if response.status_code == 401:
        raise ExternalSearchError("Comic Vine rejected the API key (401).")
    if response.status_code in (420, 429):
        raise ExternalSearchError("Comic Vine rate limit reached; try again later.")
    if response.status_code >= 400:
        raise ExternalSearchError(f"Comic Vine answered with an error ({response.status_code}).")

    try:
        payload = response.json()
    except ValueError as e:
        raise ExternalSearchError("Comic Vine returned a response that is not JSON.") from e
    if not isinstance(payload, dict):
        raise ExternalSearchError("Comic Vine returned an unexpected response.")

    # Comic Vine reports application errors in the body with HTTP 200;
    # status_code 1 is OK.
    if payload.get("status_code") != 1:
        raise ExternalSearchError(f"Comic Vine error: {payload.get('error') or 'unknown error'}.")

    results = payload.get("results") or []
    return results if isinstance(results, list) else []


def _start_year(value: Any) -> Optional[int]:
    """``start_year`` arrives as a string ("2015"), sometimes junk or empty."""
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _volume_detail(volume: Dict[str, Any]) -> Optional[str]:
    """``"Marvel · 75 issues"`` — whichever halves Comic Vine supplied."""
    parts = []
    publisher = (volume.get("publisher") or {}).get("name")
    if publisher:
        parts.append(publisher)
    issues = volume.get("count_of_issues")
    if isinstance(issues, int):
        parts.append(f"{issues} issue" if issues == 1 else f"{issues} issues")
    return " · ".join(parts) or None


def _map_search_result(volume: Dict[str, Any]) -> Dict[str, Any]:
    """One Comic Vine volume onto ``ExternalSearchResult``. ``link`` is
    ``site_detail_url`` (``.../<slug>/4050-<id>/``), which
    ``extract_comicvine_id`` parses back to the same id."""
    return {
        "external_id": str(volume["id"]),
        "link": volume.get("site_detail_url"),
        "title": volume["name"],
        "title_alt": None,
        "year": _start_year(volume.get("start_year")),
        "detail": _volume_detail(volume),
        "cover_url": _pick_cover_url(volume.get("image")),
    }


@cached_search
def search_comicvine_volumes(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Searches volumes by name for the Add-tab picker, so the admin can pick the
    right run and store its ID. One attempt, no retry; a missing key or any
    failure raises ``ExternalSearchError``. Returns
    ``ExternalSearchResult``-shaped dicts.
    """
    if not query or not query.strip():
        return []

    api_key = _get_api_key()
    if not api_key:
        raise ExternalSearchError("Comic Vine is not configured (COMICVINE_API_KEY).")

    results = _search_request(
        {
            "api_key": api_key,
            "format": "json",
            "resources": "volume",
            "query": query.strip(),
            "limit": limit,
            "field_list": SEARCH_FIELD_LIST,
        }
    )
    return [
        _map_search_result(volume)
        for volume in results
        if isinstance(volume, dict) and volume.get("id") is not None and volume.get("name")
    ]
