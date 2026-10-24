"""
omdb.py
Handles all HTTP interactions with the OMDb (Open Movie Database) API.
Strictly responsible for fetching raw external JSON data.
Used solely to retrieve IMDb ratings - a title's, and a season's episodes' -
which TMDB does not provide.
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

from app.config import settings

logger = logging.getLogger(__name__)

OMDB_BASE_URL = "http://www.omdbapi.com"


class OMDbRateLimiter:
    """Sliding window daily quota tracker for the OMDb free tier (1000 requests/day)."""

    def __init__(self, max_requests: int = 1000, time_window: int = 86400):
        self.max_requests = max_requests
        self.time_window = time_window
        self.request_timestamps = []

    def wait_if_needed(self):
        now = time.time()
        self.request_timestamps = [
            t for t in self.request_timestamps if now - t < self.time_window
        ]

        if len(self.request_timestamps) >= self.max_requests:
            sleep_time = self.time_window - (now - self.request_timestamps[0])
            if sleep_time > 0:
                logger.warning(
                    "OMDb Rate Limiter: Daily limit (%s) reached. Pausing for %.2f seconds.",
                    self.max_requests,
                    sleep_time,
                )
                time.sleep(sleep_time)

        self.request_timestamps.append(time.time())


# Global instance shared across the application
omdb_rate_limiter = OMDbRateLimiter()


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
def _fetch(params: Dict[str, Any], what: str) -> Optional[Dict[str, Any]]:
    """
    One OMDb request, counted against the daily quota and retried with
    exponential backoff. `what` names the lookup in the log lines.
    """
    api_key = settings.omdb_api_key
    if not api_key:
        logger.error("OMDB_API_KEY environment variable is not set.")
        return None

    omdb_rate_limiter.wait_if_needed()

    try:
        response = requests.get(
            OMDB_BASE_URL, params={**params, "apikey": api_key}, timeout=15
        )

        if response.status_code == 401:
            logger.error("OMDb API key is invalid or unauthorized.")
            return None

        if response.status_code == 429:
            logger.warning("OMDb Rate Limit (429) for %s.", what)
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code >= 500:
            logger.warning(
                "OMDb server error (%s) for %s — skipping retries.",
                response.status_code,
                what,
            )
            return None

        response.raise_for_status()

        data = response.json()

        if data.get("Response") == "False":
            logger.warning("OMDb: nothing found for %s: %s", what, data.get("Error"))
            return None

        return data

    except requests.exceptions.RequestException as e:
        logger.error("Network/Timeout Error connecting to OMDb for %s: %s", what, e)
        raise


def fetch_omdb_data(imdb_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetches title data from OMDb by IMDb ID (e.g. 'tt1234567').
    Used to retrieve imdb_rating, which TMDB does not provide.
    """
    if not imdb_id:
        return None
    return _fetch({"i": imdb_id}, f"IMDb ID {imdb_id}")


def fetch_omdb_season_data(imdb_id: str, season: int) -> Optional[Dict[str, Any]]:
    """
    Fetches one season of a series from OMDb: its `Episodes`, each carrying
    its own imdbRating. A season's rating is computed from these.
    """
    if not imdb_id:
        return None
    return _fetch({"i": imdb_id, "Season": season}, f"IMDb ID {imdb_id} season {season}")
