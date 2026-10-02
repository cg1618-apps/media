"""
tenrai.py
Handles all HTTP interactions with the external Tenrai v1 API.
Strictly responsible for fetching raw external JSON data and handling rate limits (429).
"""

import logging
import time
from typing import Any, Dict, Optional

import requests
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
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
