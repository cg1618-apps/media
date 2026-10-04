"""
tmdb.py
Handles all HTTP interactions with the TMDB (The Movie Database) API.
Strictly responsible for fetching raw external JSON data.
Uses IMDb ID as the entry point via TMDB's Find endpoint.
"""

import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple

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

logger = logging.getLogger(__name__)

TMDB_BASE_URL = "https://api.themoviedb.org/3"


class TMDbRateLimiter:
    """Sliding window rate limiter for TMDB API (40 requests per 10 seconds)."""

    def __init__(self, max_requests: int = 40, time_window: int = 10):
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
                logger.info(
                    "TMDB Rate Limiter: Maximum requests (%s) reached. Pausing for %.2f seconds.",
                    self.max_requests,
                    sleep_time,
                )
                time.sleep(sleep_time)

        self.request_timestamps.append(time.time())


# Global instance shared across the application
tmdb_rate_limiter = TMDbRateLimiter()


class RateLimitExceeded(Exception):
    pass


def _get_api_key() -> Optional[str]:
    api_key = settings.tmdb_api_key
    if not api_key:
        logger.error("TMDB_API_KEY environment variable is not set.")
    return api_key


def _find_tmdb_id(imdb_tt_id: str, api_key: str) -> Optional[Tuple[int, str]]:
    """
    Resolves an IMDb tt-ID to a TMDB ID and media type ('movie' or 'tv').
    Returns (tmdb_id, media_type) or None if not found.
    """
    tmdb_rate_limiter.wait_if_needed()
    url = f"{TMDB_BASE_URL}/find/{imdb_tt_id}"
    params = {"external_source": "imdb_id", "api_key": api_key}

    response = requests.get(url, params=params, timeout=15)

    if response.status_code == 429:
        logger.warning("TMDB Rate Limit (429) on Find for %s.", imdb_tt_id)
        raise RateLimitExceeded("429 Too Many Requests")

    if response.status_code == 404:
        logger.warning("TMDB Find: No results for IMDb ID %s.", imdb_tt_id)
        return None

    if response.status_code >= 500:
        logger.warning("TMDB server error (%s) on Find for %s.", response.status_code, imdb_tt_id)
        return None

    response.raise_for_status()

    data = response.json()
    movie_results = data.get("movie_results", [])
    tv_results = data.get("tv_results", [])

    if movie_results:
        return movie_results[0]["id"], "movie"
    if tv_results:
        return tv_results[0]["id"], "tv"

    logger.warning("TMDB Find: No movie or TV results for IMDb ID %s.", imdb_tt_id)
    return None


def _fetch_movie_details(tmdb_id: int, api_key: str) -> Optional[Dict[str, Any]]:
    """
    Fetches full movie details with credits appended (needed to extract director).
    """
    tmdb_rate_limiter.wait_if_needed()
    url = f"{TMDB_BASE_URL}/movie/{tmdb_id}"
    params = {"append_to_response": "credits", "api_key": api_key}

    response = requests.get(url, params=params, timeout=15)

    if response.status_code == 429:
        logger.warning("TMDB Rate Limit (429) on movie details for TMDB ID %s.", tmdb_id)
        raise RateLimitExceeded("429 Too Many Requests")

    if response.status_code == 404:
        logger.warning("TMDB: Movie %s not found.", tmdb_id)
        return None

    if response.status_code >= 500:
        logger.warning(
            "TMDB server error (%s) on movie details for %s.",
            response.status_code,
            tmdb_id,
        )
        return None

    response.raise_for_status()
    return response.json()


def _fetch_tv_details(tmdb_id: int, api_key: str) -> Optional[Dict[str, Any]]:
    """
    Fetches TV show or Cartoon details.
    """
    tmdb_rate_limiter.wait_if_needed()
    url = f"{TMDB_BASE_URL}/tv/{tmdb_id}"
    params = {"api_key": api_key}

    response = requests.get(url, params=params, timeout=15)

    if response.status_code == 429:
        logger.warning("TMDB Rate Limit (429) on TV details for TMDB ID %s.", tmdb_id)
        raise RateLimitExceeded("429 Too Many Requests")

    if response.status_code == 404:
        logger.warning("TMDB: TV show %s not found.", tmdb_id)
        return None

    if response.status_code >= 500:
        logger.warning(
            "TMDB server error (%s) on TV details for %s.",
            response.status_code,
            tmdb_id,
        )
        return None

    response.raise_for_status()
    return response.json()


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=(
        retry_if_exception_type(requests.exceptions.RequestException)
        | retry_if_exception_type(RateLimitExceeded)
    ),
    reraise=False,
)
def fetch_tmdb_tv_season_data(
    tmdb_id: int, season_number: int
) -> Optional[Dict[str, Any]]:
    """
    Fetches season-level details from TMDB for a specific TV show or Cartoon season.
    Returns raw season JSON or None.
    """
    api_key = _get_api_key()
    if not api_key:
        return None

    tmdb_rate_limiter.wait_if_needed()
    url = f"{TMDB_BASE_URL}/tv/{tmdb_id}/season/{season_number}"
    params = {"api_key": api_key}

    response = requests.get(url, params=params, timeout=15)

    if response.status_code == 429:
        logger.warning(
            "TMDB Rate Limit (429) on season details for TMDB ID %s S%s.",
            tmdb_id,
            season_number,
        )
        raise RateLimitExceeded("429 Too Many Requests")

    if response.status_code == 404:
        logger.warning("TMDB: Season %s not found for TV show %s.", season_number, tmdb_id)
        return None

    if response.status_code >= 500:
        logger.warning(
            "TMDB server error (%s) on season details for %s S%s.",
            response.status_code,
            tmdb_id,
            season_number,
        )
        return None

    response.raise_for_status()
    return response.json()


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=(
        retry_if_exception_type(requests.exceptions.RequestException)
        | retry_if_exception_type(RateLimitExceeded)
    ),
    reraise=False,
)
def fetch_tmdb_data(imdb_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetches title details from TMDB by IMDb ID (e.g. 'tt1234567').
    Makes two API calls: Find (IMDb ID → TMDB ID + media type),
    then Details (movie with credits, or TV without).
    Returns raw TMDB dict with '_media_type' key ('movie' or 'tv'), or None.
    """
    if not imdb_id:
        return None

    api_key = _get_api_key()
    if not api_key:
        return None

    find_result = _find_tmdb_id(imdb_id, api_key)
    if not find_result:
        return None

    tmdb_id_resolved, media_type = find_result

    if media_type == "movie":
        data = _fetch_movie_details(tmdb_id_resolved, api_key)
    else:
        data = _fetch_tv_details(tmdb_id_resolved, api_key)

    if data is not None:
        data["_media_type"] = media_type

    return data


# ==========================================
# Add-tab picker search
# ==========================================
# Movie, TV show and cartoon rows are keyed by IMDb id, which IMDb offers no
# API to search. So the picker searches TMDB, and only the result the admin
# picks is resolved to an IMDb id — resolving every result would cost one
# extra request each against TMDB's 40-per-10s limit.

TMDB_WEB_URL = "https://www.themoviedb.org"
TMDB_POSTER_URL = "https://image.tmdb.org/t/p/w185"
TMDB_SEARCH_KINDS = ("movie", "tv")
TMDB_KIND_LABELS = {"movie": "Movie", "tv": "TV"}
TMDB_REF_PATTERN = re.compile(r"(movie|tv)/(\d+)")


def _search_get(path: str, params: Dict[str, Any], context: str) -> Dict[str, Any]:
    """One throttled, unretried TMDB GET for a picker; any failure is an ExternalSearchError."""
    api_key = settings.tmdb_api_key
    if not api_key:
        raise ExternalSearchError("TMDB search is unavailable: TMDB_API_KEY is not configured.")

    tmdb_rate_limiter.wait_if_needed()
    try:
        response = requests.get(
            f"{TMDB_BASE_URL}{path}",
            params={**params, "api_key": api_key},
            timeout=SEARCH_TIMEOUT,
        )
    except requests.exceptions.RequestException as exc:
        logger.warning("TMDB %s failed: %s", context, exc)
        raise ExternalSearchError("TMDB could not be reached. Try again in a moment.")

    if response.status_code == 429:
        raise ExternalSearchError("TMDB is rate limiting requests. Try again in a few seconds.")
    if response.status_code in (401, 403):
        raise ExternalSearchError("TMDB rejected the configured API key.")
    if response.status_code != 200:
        logger.warning("TMDB %s answered %s.", context, response.status_code)
        raise ExternalSearchError(f"TMDB answered with an error ({response.status_code}).")

    try:
        data = response.json()
    except ValueError:
        raise ExternalSearchError("TMDB sent a response that could not be read.")
    if not isinstance(data, dict):
        raise ExternalSearchError("TMDB sent a response that could not be read.")
    return data


def _year(value: Optional[str]) -> Optional[int]:
    """'1999-03-30' -> 1999; TMDB sends '' for an unknown date."""
    if value and len(value) >= 4 and value[:4].isdigit():
        return int(value[:4])
    return None


def _map_search_result(item: Dict[str, Any], kind: str) -> Optional[Dict[str, Any]]:
    tmdb_id = item.get("id")
    title = item.get("title") if kind == "movie" else item.get("name")
    if tmdb_id is None or not title:
        return None
    original = item.get("original_title") if kind == "movie" else item.get("original_name")
    date_value = item.get("release_date") if kind == "movie" else item.get("first_air_date")
    language = item.get("original_language")
    detail = TMDB_KIND_LABELS[kind]
    if language:
        detail = f"{detail} · {language.upper()}"
    poster = item.get("poster_path")
    return {
        "external_id": f"{kind}/{tmdb_id}",
        "link": f"{TMDB_WEB_URL}/{kind}/{tmdb_id}",
        "title": title,
        "title_alt": original if original and original != title else None,
        "year": _year(date_value),
        "detail": detail,
        "cover_url": f"{TMDB_POSTER_URL}{poster}" if poster else None,
    }


@cached_search
def search_tmdb(q: str, limit: int, kinds: Tuple[str, ...]) -> List[Dict[str, Any]]:
    """
    Searches TMDB titles for the Add-tab picker, as ExternalSearchResult dicts.

    ``kinds`` is drawn from ("movie", "tv"). One kind uses that kind's search
    endpoint; both use /search/multi filtered to movie and tv results. Multi
    is one request rather than two, and TMDB ranks its movie and TV hits
    against each other — two calls would need a merge order invented here.
    Its person results are dropped, which can leave fewer than ``limit`` rows
    for a query that names a person; a title query rarely does.
    """
    if not kinds or any(kind not in TMDB_SEARCH_KINDS for kind in kinds):
        raise ValueError(f"kinds must be drawn from {TMDB_SEARCH_KINDS}, got {kinds!r}")
    wanted = set(kinds)
    path = f"/search/{kinds[0]}" if len(wanted) == 1 else "/search/multi"
    params = {"query": q, "include_adult": "false", "page": 1}
    data = _search_get(path, params, context=f"search for {q!r}")

    rows: List[Dict[str, Any]] = []
    for item in data.get("results") or []:
        # A single-kind endpoint omits media_type; multi sends it on every row.
        kind = item.get("media_type") if len(wanted) > 1 else kinds[0]
        if kind not in wanted:
            continue
        row = _map_search_result(item, kind)
        if row:
            rows.append(row)
        if len(rows) >= limit:
            break
    return rows


@cached_search
def _fetch_tmdb_imdb_id(kind: str, tmdb_id: str) -> Optional[str]:
    data = _search_get(
        f"/{kind}/{tmdb_id}/external_ids", {}, context=f"external ids of {kind}/{tmdb_id}"
    )
    imdb_id = data.get("imdb_id")
    return imdb_id if isinstance(imdb_id, str) and imdb_id.startswith("tt") else None


def resolve_tmdb_imdb_id(ref: str) -> Optional[str]:
    """
    The IMDb id ("tt…") TMDB holds for a picked search result, or None.

    ``ref`` is a search result's external_id: "movie/603" or "tv/1399".
    Anything else is a ValueError, raised before any request is made.
    One unretried request; an upstream failure is an ExternalSearchError.
    """
    match = TMDB_REF_PATTERN.fullmatch(ref or "")
    if not match:
        raise ValueError(f"Not a TMDB reference: {ref!r}. Expected 'movie/<id>' or 'tv/<id>'.")
    return _fetch_tmdb_imdb_id(match.group(1), match.group(2))
