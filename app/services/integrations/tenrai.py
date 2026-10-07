"""
tenrai.py
Handles all HTTP interactions with the external Tenrai v1 API.
Strictly responsible for fetching raw external JSON data and handling rate limits (429).
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

# Constants for MyAnimeList's Unofficial API
TENRAI_BASE_URL = "https://api.tenrai.org/v1"


class TenraiRateLimiter:
    """
    Sliding-window throttle for the Tenrai v1 API.

    Tenrai enforces two limits at once — 4 requests per second and 120 requests
    per minute — so one window is not enough. Every window is checked before each
    request and the caller sleeps until all of them have room.
    """

    # (max_requests, time_window_seconds)
    DEFAULT_LIMITS = ((4, 1), (120, 60))

    def __init__(self, limits=None):
        self.limits = tuple(limits) if limits else self.DEFAULT_LIMITS
        self.max_window = max(window for _, window in self.limits)
        self.request_timestamps = []

    def _sleep_time(self, now: float) -> float:
        """Longest wait any window demands before another request may go out."""
        sleep_time = 0.0
        for max_requests, window in self.limits:
            recent = [t for t in self.request_timestamps if now - t < window]
            if len(recent) >= max_requests:
                # The request that must expire before this window frees a slot.
                blocking = recent[len(recent) - max_requests]
                sleep_time = max(sleep_time, window - (now - blocking))
        return sleep_time

    def wait_if_needed(self):
        while True:
            now = time.time()
            # Drop timestamps older than the widest window — they constrain nothing.
            self.request_timestamps = [
                t for t in self.request_timestamps if now - t < self.max_window
            ]

            sleep_time = self._sleep_time(now)
            if sleep_time <= 0:
                break

            logger.info("Tenrai Rate Limiter: limit reached. Pausing for %.2f seconds.", sleep_time)
            time.sleep(sleep_time)

        self.request_timestamps.append(time.time())


# Global instance shared across the application
tenrai_rate_limiter = TenraiRateLimiter()


class RateLimitExceeded(Exception):
    pass


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=(
        retry_if_exception_type(requests.exceptions.RequestException)
        | retry_if_exception_type(RateLimitExceeded)
    ),
    reraise=False,
)
def fetch_tenrai_anime_data(mal_id: int) -> Optional[Dict[str, Any]]:
    """
    Fetches raw anime details from Tenrai.
    Works for anime and anime movie entries.
    Includes sliding window throttling and exponential backoff retry mechanism.
    """
    if not mal_id:
        return None

    # Proactive Throttling
    tenrai_rate_limiter.wait_if_needed()

    url = f"{TENRAI_BASE_URL}/anime/{mal_id}/full"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediaTracker/1.0"
    }

    try:
        response = requests.get(url, headers=headers, timeout=15)

        if response.status_code == 429:
            logger.warning("Tenrai Rate Limit (429) for MAL ID %s.", mal_id)
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code == 404:
            logger.warning("Anime not found (404) on Tenrai for MAL ID %s", mal_id)
            return None

        if response.status_code >= 500:
            logger.warning(
                "Tenrai server error (%s) for MAL ID %s — skipping retries.",
                response.status_code,
                mal_id,
            )
            return None

        response.raise_for_status()

        return response.json().get("data", {})

    except requests.exceptions.RequestException as e:
        logger.error("Network/Timeout Error connecting to Tenrai for MAL ID %s: %s", mal_id, e)
        # Raise to trigger tenacity's reactive Exponential Backoff
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
def fetch_tenrai_manga_novel_data(mal_id: int) -> Optional[Dict[str, Any]]:
    """
    Fetches raw manga details from Tenrai.
    Uses the same TenraiRateLimiter and retry configuration as fetch_tenrai_anime_data.
    """
    if not mal_id:
        return None

    tenrai_rate_limiter.wait_if_needed()

    url = f"{TENRAI_BASE_URL}/manga/{mal_id}/full"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediaTracker/1.0"
    }

    try:
        response = requests.get(url, headers=headers, timeout=15)

        if response.status_code == 429:
            logger.warning("Tenrai Rate Limit (429) for Manga MAL ID %s.", mal_id)
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code == 404:
            logger.warning("Manga not found (404) on Tenrai for MAL ID %s", mal_id)
            return None

        if response.status_code >= 500:
            logger.warning(
                "Tenrai server error (%s) for Manga MAL ID %s — skipping retries.",
                response.status_code,
                mal_id,
            )
            return None

        response.raise_for_status()

        return response.json().get("data", {})

    except requests.exceptions.RequestException as e:
        logger.error(
            "Network/Timeout Error connecting to Tenrai for Manga MAL ID %s: %s",
            mal_id,
            e,
        )
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
def fetch_tenrai_producer_data(mal_id: int) -> Optional[Dict[str, Any]]:
    """
    Fetches raw studio (MAL "producer") details from Tenrai.

    Producers are a different resource from anime and manga - they carry a
    logo, an `established` timestamp and an `external` link list, and no
    score or rank - but the throttle and retry policy are identical, so the
    same TenraiRateLimiter budget covers every fetcher here.
    """
    if not mal_id:
        return None

    tenrai_rate_limiter.wait_if_needed()

    url = f"{TENRAI_BASE_URL}/producers/{mal_id}/full"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediaTracker/1.0"
    }

    try:
        response = requests.get(url, headers=headers, timeout=15)

        if response.status_code == 429:
            logger.warning("Tenrai Rate Limit (429) for Producer MAL ID %s.", mal_id)
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code == 404:
            logger.warning("Producer not found (404) on Tenrai for MAL ID %s", mal_id)
            return None

        if response.status_code >= 500:
            logger.warning(
                "Tenrai server error (%s) for Producer MAL ID %s — skipping retries.",
                response.status_code,
                mal_id,
            )
            return None

        response.raise_for_status()

        return response.json().get("data", {})

    except requests.exceptions.RequestException as e:
        logger.error(
            "Network/Timeout Error connecting to Tenrai for Producer MAL ID %s: %s",
            mal_id,
            e,
        )
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
def fetch_tenrai_person_data(mal_id: int) -> Optional[Dict[str, Any]]:
    """
    Fetches raw person (MAL "people") details from Tenrai - a seiyuu's names,
    alternate names and photo.

    Same throttle and retry policy as the other fetchers, so one
    TenraiRateLimiter budget covers all four.
    """
    if not mal_id:
        return None

    tenrai_rate_limiter.wait_if_needed()

    url = f"{TENRAI_BASE_URL}/people/{mal_id}/full"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediaTracker/1.0"
    }

    try:
        response = requests.get(url, headers=headers, timeout=15)

        if response.status_code == 429:
            logger.warning("Tenrai Rate Limit (429) for People MAL ID %s.", mal_id)
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code == 404:
            logger.warning("Person not found (404) on Tenrai for MAL ID %s", mal_id)
            return None

        if response.status_code >= 500:
            logger.warning(
                "Tenrai server error (%s) for People MAL ID %s — skipping retries.",
                response.status_code,
                mal_id,
            )
            return None

        response.raise_for_status()

        return response.json().get("data", {})

    except requests.exceptions.RequestException as e:
        logger.error(
            "Network/Timeout Error connecting to Tenrai for People MAL ID %s: %s",
            mal_id,
            e,
        )
        raise


def _get_tenrai_data(label: str, path: str, mal_id: int) -> Optional[Any]:
    """
    One throttled GET of `path` under TENRAI_BASE_URL, returning the
    response's `data`. The same status handling as the fetchers above: a 429
    raises for the caller's retry, a 404 or a 5xx is None, a network error
    is logged and re-raised.
    """
    tenrai_rate_limiter.wait_if_needed()
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediaTracker/1.0"
    }
    try:
        response = requests.get(f"{TENRAI_BASE_URL}/{path}", headers=headers, timeout=15)

        if response.status_code == 429:
            logger.warning("Tenrai Rate Limit (429) for %s MAL ID %s.", label, mal_id)
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code == 404:
            logger.warning("%s not found (404) on Tenrai for MAL ID %s", label, mal_id)
            return None

        if response.status_code >= 500:
            logger.warning(
                "Tenrai server error (%s) for %s MAL ID %s — skipping retries.",
                response.status_code,
                label,
                mal_id,
            )
            return None

        response.raise_for_status()
        return response.json().get("data")

    except requests.exceptions.RequestException as e:
        logger.error(
            "Network/Timeout Error connecting to Tenrai for %s MAL ID %s: %s",
            label,
            mal_id,
            e,
        )
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
def fetch_tenrai_character_data(mal_id: int) -> Optional[Dict[str, Any]]:
    """
    Fetches one MAL character from Tenrai - names, kanji name, nicknames and
    picture. Same throttle and retry policy, and the same budget, as the
    fetchers above.
    """
    if not mal_id:
        return None
    return _get_tenrai_data("Character", f"characters/{mal_id}/full", mal_id)


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=(
        retry_if_exception_type(requests.exceptions.RequestException)
        | retry_if_exception_type(RateLimitExceeded)
    ),
    reraise=False,
)
def fetch_tenrai_cast(resource: str, mal_id: int) -> Optional[list]:
    """
    Fetches an entry's cast from Tenrai: `resource` is "anime" (anime, anime
    movie, hentai), whose characters carry voice actors in every language,
    or "manga" (manga, novel, h-comic), whose do not. A list of
    {character, role, voice_actors?} items.
    """
    if not mal_id:
        return None
    return _get_tenrai_data(
        f"{resource.capitalize()} cast", f"{resource}/{mal_id}/characters", mal_id
    )


# ==========================================
# Add-tab picker searches
# ==========================================
#
# Interactive, so they follow app/services/integrations/external_search.py
# rather than the fetchers above: one attempt, a short timeout, and an
# ExternalSearchError on any failure instead of a retry or a None. They still
# take a slot from tenrai_rate_limiter, so a search and a running Fill share
# one budget.

# MAL's manga `type` values that are novels. The novel picker asks for exactly
# these; the manga picker drops them.
_NOVEL_TYPES = ("lightnovel", "novel")
_NOVEL_TYPE_LABELS = {"Light Novel", "Novel"}
# How far the manga picker over-fetches to make up for the novels it drops.
_TENRAI_SEARCH_MAX_LIMIT = 50


def _search_tenrai(resource: str, params: Dict[str, Any]) -> list:
    """One throttled, unretried GET of a Tenrai search; the response's `data` list."""
    tenrai_rate_limiter.wait_if_needed()
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediaTracker/1.0"}
    try:
        response = requests.get(
            f"{TENRAI_BASE_URL}/{resource}",
            params=params,
            headers=headers,
            timeout=SEARCH_TIMEOUT,
        )
    except requests.exceptions.RequestException as exc:
        logger.warning("Tenrai %s search unreachable: %s", resource, exc)
        raise ExternalSearchError("MyAnimeList search (Tenrai) is unreachable.") from exc

    if response.status_code == 429:
        raise ExternalSearchError(
            "MyAnimeList search (Tenrai) is rate-limited; try again in a moment."
        )
    if not 200 <= response.status_code < 300:
        logger.warning("Tenrai %s search answered %s", resource, response.status_code)
        raise ExternalSearchError(
            f"MyAnimeList search (Tenrai) failed with HTTP {response.status_code}."
        )
    try:
        data = response.json().get("data")
    except (ValueError, AttributeError) as exc:
        raise ExternalSearchError(
            "MyAnimeList search (Tenrai) returned an unreadable response."
        ) from exc
    if not isinstance(data, list):
        raise ExternalSearchError("MyAnimeList search (Tenrai) returned an unreadable response.")
    return data


def _lookup_tenrai(resource: str, mal_id: int) -> Optional[Dict[str, Any]]:
    """
    One throttled, unretried GET of `/{resource}/{mal_id}/full` for the Add
    page's MAL prefill: the record's `data`, None when MAL has no such id, an
    ExternalSearchError on any other failure - the picker searches' rules, not
    the Fill fetchers' retries.
    """
    tenrai_rate_limiter.wait_if_needed()
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediaTracker/1.0"}
    try:
        response = requests.get(
            f"{TENRAI_BASE_URL}/{resource}/{mal_id}/full",
            headers=headers,
            timeout=SEARCH_TIMEOUT,
        )
    except requests.exceptions.RequestException as exc:
        logger.warning("Tenrai %s %s lookup unreachable: %s", resource, mal_id, exc)
        raise ExternalSearchError("MyAnimeList (Tenrai) is unreachable.") from exc

    if response.status_code == 404:
        return None
    if response.status_code == 429:
        raise ExternalSearchError(
            "MyAnimeList (Tenrai) is rate-limited; try again in a moment."
        )
    if not 200 <= response.status_code < 300:
        logger.warning("Tenrai %s %s lookup answered %s", resource, mal_id, response.status_code)
        raise ExternalSearchError(
            f"MyAnimeList (Tenrai) failed with HTTP {response.status_code}."
        )
    try:
        data = response.json().get("data")
    except (ValueError, AttributeError) as exc:
        raise ExternalSearchError("MyAnimeList (Tenrai) returned an unreadable response.") from exc
    if not isinstance(data, dict):
        raise ExternalSearchError("MyAnimeList (Tenrai) returned an unreadable response.")
    return data


def lookup_mal_anime(mal_id: int) -> Optional[Dict[str, Any]]:
    """One MAL anime record (anime and anime movie), for the Add page's prefill."""
    return _lookup_tenrai("anime", mal_id)


def lookup_mal_manga(mal_id: int) -> Optional[Dict[str, Any]]:
    """One MAL manga record (manga and novel), for the Add page's prefill."""
    return _lookup_tenrai("manga", mal_id)


def _cover_url(item: Dict[str, Any]) -> Optional[str]:
    images = item.get("images") or {}
    for fmt in ("jpg", "webp"):
        url = (images.get(fmt) or {}).get("image_url")
        if url:
            return url
    return None


def _start_year(item: Dict[str, Any], dates_key: str) -> Optional[int]:
    """`year` when the payload has one, else the year of the aired/published from-date."""
    if item.get("year"):
        return item["year"]
    dates = item.get(dates_key) or {}
    return ((dates.get("prop") or {}).get("from") or {}).get("year")


def _alt_title(item: Dict[str, Any]) -> Optional[str]:
    """The English title when it differs from the romaji one, else the Japanese."""
    english = item.get("title_english")
    if english and english != item.get("title"):
        return english
    return item.get("title_japanese") or None


def _count(n: Optional[int], singular: str, plural: str) -> Optional[str]:
    if not n:
        return None
    return f"{n} {singular if n == 1 else plural}"


def _detail(*parts: Optional[str]) -> Optional[str]:
    return " · ".join(p for p in parts if p) or None


def _map_anime(item: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "external_id": str(item["mal_id"]),
        "link": item.get("url"),
        "title": item.get("title") or "",
        "title_alt": _alt_title(item),
        "year": _start_year(item, "aired"),
        "detail": _detail(item.get("type"), _count(item.get("episodes"), "ep", "eps")),
        "cover_url": _cover_url(item),
    }


def _map_manga(item: Dict[str, Any]) -> Dict[str, Any]:
    size = _count(item.get("volumes"), "vol", "vols") or _count(item.get("chapters"), "ch", "ch")
    return {
        "external_id": str(item["mal_id"]),
        "link": item.get("url"),
        "title": item.get("title") or "",
        "title_alt": _alt_title(item),
        "year": _start_year(item, "published"),
        "detail": _detail(item.get("type"), size),
        "cover_url": _cover_url(item),
    }


def _map_person(item: Dict[str, Any]) -> Dict[str, Any]:
    native = f"{item.get('family_name') or ''}{item.get('given_name') or ''}"
    birthday = (item.get("birthday") or "")[:10]
    return {
        "external_id": str(item["mal_id"]),
        "link": item.get("url"),
        "title": item.get("name") or "",
        "title_alt": native or None,
        "year": None,
        "detail": f"Born {birthday}" if birthday else None,
        "cover_url": _cover_url(item),
    }


def _map_character(item: Dict[str, Any]) -> Dict[str, Any]:
    favourites = item.get("favorites")
    return {
        "external_id": str(item["mal_id"]),
        "link": item.get("url"),
        "title": item.get("name") or "",
        "title_alt": item.get("name_kanji") or None,
        "year": None,
        "detail": f"{favourites:,} favourites" if favourites else None,
        "cover_url": _cover_url(item),
    }


@cached_search
def search_mal_anime(q: str, limit: int, media_type: Optional[str] = None) -> List[Dict[str, Any]]:
    """Searches MAL anime by title; `media_type` is MAL's `type` filter ("movie")."""
    params: Dict[str, Any] = {"q": q, "limit": limit, "sfw": "true"}
    if media_type:
        params["type"] = media_type
    return [_map_anime(item) for item in _search_tenrai("anime", params)]


@cached_search
def search_mal_manga(q: str, limit: int) -> List[Dict[str, Any]]:
    """Searches MAL manga by title, leaving out novels and light novels.

    MAL's `type` filter takes one value and the manga picker wants five
    (manga, one-shot, doujinshi, manhwa, manhua), so this asks once with no
    filter, over-fetching to make up for the novels it then drops.
    """
    fetch = max(limit, min(limit * 2, _TENRAI_SEARCH_MAX_LIMIT))
    items = _search_tenrai("manga", {"q": q, "limit": fetch, "sfw": "true"})
    kept = [i for i in items if i.get("type") not in _NOVEL_TYPE_LABELS]
    return [_map_manga(item) for item in kept[:limit]]


@cached_search
def search_mal_novel(q: str, limit: int) -> List[Dict[str, Any]]:
    """Searches MAL light novels and novels by title.

    One request per type, because the filter takes one value and an
    unfiltered search lets manga crowd the novels out. The two lists are
    interleaved so neither type is hidden behind the other at a small limit.
    """
    per_type = [
        _search_tenrai("manga", {"q": q, "limit": limit, "sfw": "true", "type": t})
        for t in _NOVEL_TYPES
    ]
    merged: List[Dict[str, Any]] = []
    seen = set()
    for i in range(max(len(items) for items in per_type)):
        for items in per_type:
            if i < len(items) and items[i]["mal_id"] not in seen:
                seen.add(items[i]["mal_id"])
                merged.append(items[i])
    return [_map_manga(item) for item in merged[:limit]]


@cached_search
def search_mal_people(q: str, limit: int) -> List[Dict[str, Any]]:
    """Searches MAL people (voice actors, staff) by name."""
    items = _search_tenrai("people", {"q": q, "limit": limit})
    return [_map_person(item) for item in items]


@cached_search
def search_mal_characters(q: str, limit: int) -> List[Dict[str, Any]]:
    """Searches MAL characters by name."""
    items = _search_tenrai("characters", {"q": q, "limit": limit})
    return [_map_character(item) for item in items]
