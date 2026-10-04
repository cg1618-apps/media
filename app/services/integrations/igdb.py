"""
igdb.py
Handles all HTTP interactions with the IGDB API (v4).

Strictly responsible for fetching raw external JSON. Three things here differ
from every other integration in this package and are the reason this module
does not simply copy comicvine.py:

1. **Queries are POSTs with an APIcalypse body**, not GETs with query params.
   The body is a small DSL: `fields a,b; where id = 5; limit 10;`.
2. **Auth is a refreshed OAuth bearer token**, not a static key. IGDB
   authenticates through Twitch: a client id + secret are exchanged at
   id.twitch.tv for a bearer token that expires. The token is cached module
   level and refreshed shortly before expiry. Both credentials must be set;
   a missing one fails closed to None rather than calling out.
3. **The rate limit is 4 requests/second** — Tenrai's shape rather than Comic
   Vine's hourly quota — so the limiter is a sliding window and the pipeline
   spec gets no `budget`: there is no quota to exhaust mid-run.

Time to beat, verified against the live IGDB API reference on 2026-09-06:
the resource is `game_time_to_beats` (plural; the older singular
`time_to_beat` endpoint is gone), it is filtered on `game_id` rather than
`id`, and `hastily` / `normally` / `completely` are **integers in SECONDS**.
They are converted to hours here because the `hltb_*` columns are hours.
"""

import logging
import time
from datetime import datetime, timezone
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

logger = logging.getLogger(__name__)

IGDB_BASE_URL = "https://api.igdb.com/v4"
TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token"

# Refresh this many seconds before the token actually expires, so a request
# never goes out holding a token that dies in flight.
TOKEN_EXPIRY_MARGIN = 60

# Exactly the fields the mapper reads. IGDB returns nothing that is not asked
# for, so this list is the contract with app/utils/igdb_utils.py.
GAME_FIELDS = (
    "name,summary,first_release_date,cover.url,genres.name,themes.name,"
    "game_modes.name,platforms.name,involved_companies.company.name,"
    "involved_companies.developer,involved_companies.publisher,parent_game,url,"
    # The Steam appid, which is what the whole Steam integration keys off.
    # Both spellings are requested: `category` is the legacy enum (Steam = 1)
    # and `external_game_source` its replacement. Asking for both is the safe
    # superset while IGDB migrates.
    "external_games.category,external_games.external_game_source,external_games.uid"
)
# The picker search maps these onto ExternalSearchResult; `platforms` feeds
# the one-line `detail` that tells a remaster from the original.
SEARCH_FIELDS = (
    "name,summary,first_release_date,cover.url,url,platforms.abbreviation,platforms.name"
)

# How many platforms the picker's detail line names before it stops.
SEARCH_DETAIL_PLATFORMS = 3

TIME_TO_BEAT_FIELDS = "game_id,hastily,normally,completely,count"

SECONDS_PER_HOUR = 3600.0


class IGDBRateLimiter:
    """
    Sliding-window throttle for the IGDB API.

    IGDB documents 4 requests per second. Unlike Comic Vine's 200/hour there is
    no long-horizon quota, so a backfill never has to be abandoned part-way —
    it just paces itself.
    """

    # (max_requests, time_window_seconds)
    DEFAULT_LIMITS = ((4, 1),)

    def __init__(self, limits=None):
        self.limits = tuple(limits) if limits else self.DEFAULT_LIMITS
        self.max_window = max(window for _, window in self.limits)
        self.request_timestamps: List[float] = []

    def _sleep_time(self, now: float) -> float:
        """Longest wait any window demands before another request may go out."""
        sleep_time = 0.0
        for max_requests, window in self.limits:
            recent = [t for t in self.request_timestamps if now - t < window]
            if len(recent) >= max_requests:
                blocking = recent[len(recent) - max_requests]
                sleep_time = max(sleep_time, window - (now - blocking))
        return sleep_time

    def wait_if_needed(self):
        while True:
            now = time.time()
            self.request_timestamps = [
                t for t in self.request_timestamps if now - t < self.max_window
            ]

            sleep_time = self._sleep_time(now)
            if sleep_time <= 0:
                break

            logger.info("IGDB Rate Limiter: pausing for %.2f seconds.", sleep_time)
            time.sleep(sleep_time)

        self.request_timestamps.append(time.time())


# Global instance shared across the application
igdb_rate_limiter = IGDBRateLimiter()

# {"token": str, "expires_at": float}. Module level so one token serves the
# whole process; a Fill run of 300 games costs one Twitch call, not 300.
_TOKEN_CACHE: Dict[str, Any] = {}


class RateLimitExceeded(Exception):
    pass


def _get_token(timeout: float = 15) -> Optional[str]:
    """
    Returns a valid bearer token, fetching a new one only when the cached one
    is missing or close to expiry. Returns None when either credential is
    unset or Twitch refuses — the caller then degrades to a logged no-op.
    """
    client_id = settings.igdb_client_id
    client_secret = settings.igdb_client_secret
    if not client_id or not client_secret:
        logger.error("IGDB_CLIENT_ID / IGDB_CLIENT_SECRET are not both set.")
        return None

    cached = _TOKEN_CACHE.get("token")
    expires_at = _TOKEN_CACHE.get("expires_at", 0)
    if cached and time.time() < expires_at - TOKEN_EXPIRY_MARGIN:
        return cached

    try:
        response = requests.post(
            TWITCH_TOKEN_URL,
            params={
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "client_credentials",
            },
            timeout=timeout,
        )
        if response.status_code >= 400:
            logger.error(
                "Twitch refused the IGDB client credentials (%s); IGDB calls will be skipped.",
                response.status_code,
            )
            return None

        payload = response.json() or {}
        token = payload.get("access_token")
        if not token:
            logger.error("Twitch returned no access_token for the IGDB credentials.")
            return None

        _TOKEN_CACHE["token"] = token
        _TOKEN_CACHE["expires_at"] = time.time() + float(payload.get("expires_in", 0))
        return token

    except requests.exceptions.RequestException as e:
        logger.error("Network/Timeout Error obtaining an IGDB token from Twitch: %s", e)
        return None


def _request(endpoint: str, body: str, context: str) -> Optional[Any]:
    """
    Issues one throttled IGDB request and returns the parsed JSON.
    Returns None on any non-retryable failure; raises for retryable ones.
    """
    token = _get_token()
    if not token:
        return None

    igdb_rate_limiter.wait_if_needed()

    url = f"{IGDB_BASE_URL}/{endpoint}"
    headers = {
        "Client-ID": settings.igdb_client_id,
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }

    try:
        response = requests.post(url, data=body, headers=headers, timeout=15)

        if response.status_code == 401:
            # The cached token was rejected; drop it so the next call refetches.
            _TOKEN_CACHE.clear()
            logger.error("IGDB rejected the bearer token (401) for %s.", context)
            return None

        if response.status_code == 404:
            logger.warning("IGDB has no such resource (404) for %s.", context)
            return None

        if response.status_code == 429:
            logger.warning("IGDB rate limit (429) for %s.", context)
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code >= 500:
            logger.warning(
                "IGDB server error (%s) for %s — skipping retries.",
                response.status_code,
                context,
            )
            return None

        response.raise_for_status()

        return response.json()

    except requests.exceptions.RequestException as e:
        logger.error("Network/Timeout Error connecting to IGDB for %s: %s", context, e)
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
def fetch_igdb_game(igdb_id: int) -> Optional[Dict[str, Any]]:
    """
    Fetches a single game by its IGDB ID.
    Returns the first result object, or None if unavailable.
    """
    if not igdb_id:
        return None

    results = _request(
        "games",
        f"fields {GAME_FIELDS}; where id = {int(igdb_id)}; limit 1;",
        context=f"game {igdb_id}",
    )

    if not results:
        return None

    return results[0]


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=(
        retry_if_exception_type(requests.exceptions.RequestException)
        | retry_if_exception_type(RateLimitExceeded)
    ),
    reraise=False,
)
def fetch_igdb_time_to_beat(igdb_id: int) -> Optional[Dict[str, Any]]:
    """
    Average completion times for one game, keyed by the `hltb_*` columns and
    converted to HOURS.

    Verified against the live IGDB API reference on 2026-09-06: the resource is
    `game_time_to_beats` (the singular `time_to_beat` endpoint of earlier API
    versions no longer exists), it is filtered on `game_id`, and `hastily` /
    `normally` / `completely` are integers in SECONDS. Storing them unconverted
    would silently put 162000 in `hltb_main`.

    Returns None when IGDB has no submissions for the game — most games have
    none, and that is not an error.
    """
    if not igdb_id:
        return None

    results = _request(
        "game_time_to_beats",
        f"fields {TIME_TO_BEAT_FIELDS}; where game_id = {int(igdb_id)}; limit 1;",
        context=f"time to beat for game {igdb_id}",
    )

    if not results:
        return None

    record = results[0] or {}

    def hours(seconds: Any) -> Optional[float]:
        if seconds in (None, 0):
            return None
        try:
            return round(float(seconds) / SECONDS_PER_HOUR, 1)
        except (TypeError, ValueError):
            return None

    return {
        "hltb_main": hours(record.get("hastily")),
        "hltb_main_extra": hours(record.get("normally")),
        "hltb_completionist": hours(record.get("completely")),
    }


def _search_request(body: str) -> List[Dict[str, Any]]:
    """
    One IGDB request for the Add-tab picker: a single attempt with
    ``SEARCH_TIMEOUT``, raising ``ExternalSearchError`` on any failure.

    Fill's ``_request`` retries through tenacity and degrades to None; a search
    box can do neither, so this is a separate path rather than a flag on that one.
    """
    if not settings.igdb_client_id or not settings.igdb_client_secret:
        raise ExternalSearchError("IGDB is not configured (IGDB_CLIENT_ID / IGDB_CLIENT_SECRET).")

    token = _get_token(timeout=SEARCH_TIMEOUT)
    if not token:
        raise ExternalSearchError("Could not obtain an IGDB token from Twitch.")

    igdb_rate_limiter.wait_if_needed()

    headers = {
        "Client-ID": settings.igdb_client_id,
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    try:
        response = requests.post(
            f"{IGDB_BASE_URL}/games", data=body, headers=headers, timeout=SEARCH_TIMEOUT
        )
    except requests.exceptions.RequestException as e:
        logger.error("IGDB search failed to connect: %s", e)
        raise ExternalSearchError("IGDB could not be reached.") from e

    if response.status_code == 401:
        _TOKEN_CACHE.clear()
        raise ExternalSearchError("IGDB rejected the access token (401).")
    if response.status_code == 429:
        raise ExternalSearchError("IGDB rate limit reached; try again in a moment.")
    if response.status_code >= 400:
        raise ExternalSearchError(f"IGDB answered with an error ({response.status_code}).")

    try:
        payload = response.json()
    except ValueError as e:
        raise ExternalSearchError("IGDB returned a response that is not JSON.") from e
    if not isinstance(payload, list):
        raise ExternalSearchError("IGDB returned an unexpected response.")
    return payload


def _release_year(seconds: Any) -> Optional[int]:
    """IGDB's ``first_release_date`` is Unix seconds, UTC."""
    if seconds is None:
        return None
    try:
        return datetime.fromtimestamp(int(seconds), tz=timezone.utc).year
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def _absolute_cover_url(game: Dict[str, Any]) -> Optional[str]:
    """IGDB cover URLs are protocol-relative (``//images.igdb.com/...``)."""
    url = (game.get("cover") or {}).get("url")
    if not url:
        return None
    return f"https:{url}" if url.startswith("//") else url


def _platforms_detail(game: Dict[str, Any]) -> Optional[str]:
    """``"PC · PS5 · XSX"``: the first few platforms, abbreviated where IGDB has one."""
    names = [
        p.get("abbreviation") or p.get("name")
        for p in (game.get("platforms") or [])
        if isinstance(p, dict)
    ]
    names = [n for n in names if n]
    if not names:
        return None
    shown = " · ".join(names[:SEARCH_DETAIL_PLATFORMS])
    extra = len(names) - SEARCH_DETAIL_PLATFORMS
    return f"{shown} +{extra}" if extra > 0 else shown


def _map_search_result(game: Dict[str, Any]) -> Dict[str, Any]:
    """One IGDB game onto ``ExternalSearchResult``. ``external_id`` carries the
    numeric id because ``link`` is the www slug page, which ``extract_igdb_id``
    cannot parse — the SPA writes ``igdb_id`` from it separately."""
    return {
        "external_id": str(game["id"]),
        "link": game.get("url"),
        "title": game["name"],
        "title_alt": None,
        "year": _release_year(game.get("first_release_date")),
        "detail": _platforms_detail(game),
        "cover_url": _absolute_cover_url(game),
    }


@cached_search
def search_igdb_games(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Searches games by name for the Add-tab picker, so the admin can pick the
    right entry and store its ID. One attempt, no retry; any failure raises
    ``ExternalSearchError``. Returns ``ExternalSearchResult``-shaped dicts.
    """
    if not query or not query.strip():
        return []

    # An APIcalypse search term is a quoted string; a stray quote would end it.
    term = query.strip().replace('"', "")

    results = _search_request(f'search "{term}"; fields {SEARCH_FIELDS}; limit {int(limit)};')
    return [
        _map_search_result(game)
        for game in results
        if isinstance(game, dict) and game.get("id") is not None and game.get("name")
    ]
