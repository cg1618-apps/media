"""
hltb.py
Handles all HTTP interactions with HowLongToBeat.

HowLongToBeat publishes **no API**. What this module calls is the endpoint
the site's own search box posts to, and the site changes that endpoint's
path and its authentication from time to time - which is why the path is
read out of the site's own JavaScript rather than written down here. The
lookup is the same three steps the maintained `howlongtobeatpy` package
takes:

1. **Find the endpoint.** GET the home page, then each `/_next/static/chunks/`
   script it loads, until one contains a `fetch("/api/...", {method:"POST"})`
   - today `/api/search/site`. Cached for the life of the process; a 404
   from it drops the cache and discovers again, once.
2. **Get a token.** GET `<endpoint>/init?t=<ms>` answers `{"token": ...}`,
   sent back as the `x-auth-token` header. The token is bound to the client's
   address and User-Agent, so one fixed User-Agent is sent on every request.
   Cached until the search answers 403, which refreshes it, once - the same
   retry the site's own script makes.
3. **Search.** POST the search body. The answer's `data` is the result list.

Every failure - a network error, a refused token, a 429, a body that is not
JSON, an endpoint that cannot be found - is logged and answered as None.
Nothing here raises into a pipeline: a missing HowLongToBeat link is
ordinary, and the run goes on.

Requests are spaced by MIN_INTERVAL, at most one a second; HowLongToBeat
publishes no limit, and its own script answers 429 with "please wait a
minute". HLTB_ENABLED=false (settings.hltb_enabled) sends nothing at all.
"""

import json
import logging
import re
import time
from typing import Any, Dict, Iterable, List, Optional

import requests

from app.config import settings
from app.utils.hltb_utils import pick_hltb_game_id

logger = logging.getLogger(__name__)

BASE_URL = "https://howlongtobeat.com"
# Where the search lived when this was written; used only when discovery
# finds nothing, so a home page that fails to parse is not an outage.
FALLBACK_SEARCH_PATH = "/api/search/site"

# Seconds. Every request waits until this long after the previous one.
MIN_INTERVAL = 1.0
TIMEOUT = 15

# The token is bound to this, so it must be the same on every request.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)
HEADERS = {"User-Agent": USER_AGENT, "Referer": f"{BASE_URL}/", "Origin": BASE_URL}

_CHUNK_SCRIPT = re.compile(r'<script[^>]+src="([^"]*/_next/static/chunks/[^"]+)"')
# The site's search call: a fetch of an /api/ path with method POST. Matching
# on the method rather than the path is what survives a rename.
_SEARCH_CALL = re.compile(
    r'fetch\s*\(\s*["\'`](/api/[a-zA-Z0-9_/]+)[^"\'`]*["\'`]\s*,\s*\{[^}]*'
    r'method:\s*["\']POST["\']',
    re.IGNORECASE | re.DOTALL,
)

_last_request_at = 0.0
_search_path: Optional[str] = None
# The token from the last init, or None.
_token: Optional[str] = None


def reset() -> None:
    """Forget the discovered endpoint and the token. Used by the tests."""
    global _search_path, _token, _last_request_at
    _search_path = None
    _token = None
    _last_request_at = 0.0


def _pause() -> None:
    global _last_request_at
    wait = MIN_INTERVAL - (time.monotonic() - _last_request_at)
    if wait > 0:
        time.sleep(wait)
    _last_request_at = time.monotonic()


def _get(url: str, **kwargs) -> requests.Response:
    _pause()
    return requests.get(url, headers=HEADERS, timeout=TIMEOUT, **kwargs)


def _discover_search_path() -> str:
    """Step 1: the endpoint the site's own script posts searches to."""
    home = _get(f"{BASE_URL}/")
    if home.status_code == 200:
        for src in _CHUNK_SCRIPT.findall(home.text or ""):
            url = src if src.startswith("http") else f"{BASE_URL}{src}"
            script = _get(url)
            if script.status_code != 200:
                continue
            match = _SEARCH_CALL.search(script.text or "")
            if match:
                return match.group(1).rstrip("/")
    logger.warning(
        "HowLongToBeat: could not find the search endpoint in the site's "
        "scripts; trying %s.",
        FALLBACK_SEARCH_PATH,
    )
    return FALLBACK_SEARCH_PATH


def _fetch_token(path: str) -> Optional[str]:
    """Step 2: a fresh token from `<path>/init`, or None."""
    response = _get(f"{BASE_URL}{path}/init", params={"t": int(time.time() * 1000)})
    if response.status_code != 200:
        logger.warning("HowLongToBeat: token request answered %s.", response.status_code)
        return None
    token = response.json().get("token")
    if not token:
        logger.warning("HowLongToBeat: token request answered no token.")
        return None
    return str(token)


def _search_body(term: str) -> Dict[str, Any]:
    return {
        "searchType": "games",
        "searchTerms": term.split(),
        "searchPage": 1,
        "size": 20,
        "searchOptions": {
            "games": {
                "userId": 0,
                "platform": "",
                "sortCategory": "popular",
                "rangeCategory": "main",
                "rangeTime": {"min": 0, "max": 0},
                "gameplay": {"perspective": "", "flow": "", "genre": "", "difficulty": ""},
                "rangeYear": {"min": "", "max": ""},
                "modifier": "",
            },
            "users": {"sortCategory": "postcount"},
            "lists": {"sortCategory": "follows"},
            "filter": "",
            "sort": 0,
            "randomizer": 0,
        },
        "useCache": True,
    }


def _post_search(path: str, token: str, term: str) -> requests.Response:
    """Step 3."""
    headers = {**HEADERS, "Content-Type": "application/json", "x-auth-token": token}
    _pause()
    return requests.post(
        f"{BASE_URL}{path}",
        headers=headers,
        data=json.dumps(_search_body(term)),
        timeout=TIMEOUT,
    )


def _search(term: str) -> Optional[List[Dict[str, Any]]]:
    global _search_path, _token

    rediscovered = refreshed = False
    while True:
        if _search_path is None:
            _search_path = _discover_search_path()
        if _token is None:
            _token = _fetch_token(_search_path)
            if _token is None:
                return None

        response = _post_search(_search_path, _token, term)

        if response.status_code == 403 and not refreshed:
            _token, refreshed = None, True
            continue
        if response.status_code == 404 and not rediscovered:
            _search_path, _token, rediscovered = None, None, True
            continue
        if response.status_code == 429:
            logger.warning("HowLongToBeat rate limit (429) searching for %r.", term)
            return None
        if response.status_code != 200:
            logger.warning(
                "HowLongToBeat search answered %s for %r.", response.status_code, term
            )
            if response.status_code in (403, 404):
                _search_path = _token = None
            return None

        data = response.json().get("data")
        return data if isinstance(data, list) else []


def search_hltb(term: str) -> Optional[List[Dict[str, Any]]]:
    """
    HowLongToBeat's search results for `term` - the `data` list, possibly
    empty - or None when the search could not be made.
    """
    term = (term or "").strip()
    if not term or not settings.hltb_enabled:
        return None
    try:
        return _search(term)
    except (requests.exceptions.RequestException, ValueError, AttributeError) as e:
        # RequestException: the network. ValueError: a body that is not JSON
        # (a challenge page, a maintenance page). AttributeError: JSON of the
        # wrong shape.
        logger.warning("HowLongToBeat search failed for %r: %s", term, e)
        return None


def find_hltb_game_id(
    term: str, names: Iterable[Optional[str]], year: Optional[int]
) -> Optional[int]:
    """
    The HowLongToBeat game_id for a game, searched by `term` and matched
    against all of `names` (see hltb_utils.pick_hltb_game_id), or None when
    the search failed or found no single confident match.
    """
    results = search_hltb(term)
    if results is None:
        return None
    game_id = pick_hltb_game_id(results, names, year)
    if game_id is None:
        logger.info(
            "HowLongToBeat: no single confident match for %r among %d results.",
            term,
            len(results),
        )
    return game_id
