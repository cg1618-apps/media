"""
ehentai.py
Handles all HTTP interactions with E-Hentai.

Strictly responsible for fetching raw external JSON, from the site's official
gallery metadata API:

    POST https://api.e-hentai.org/api.php
    {"method": "gdata", "gidlist": [[<gid>, "<token>"]], "namespace": 1}

It answers `{"gmetadata": [...]}` with one record per requested gallery. A
gallery it cannot serve - a wrong token, an unknown id - still gets a record,
holding only `gid` and an `error` string, and an HTTP 200. `namespace: 1`
prefixes every tag with its namespace (`artist:`, `group:`, `parody:`).

No key and no cookie. exhentai.org galleries share the id space, so the same
call serves a gallery pasted from either host. The API's documented courtesy
limit is a handful of sequential requests per second; requests are spaced by
MIN_INTERVAL, and one h-comic costs one request.
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

EHENTAI_API_URL = "https://api.e-hentai.org/api.php"

# Seconds between two requests. Well under the documented courtesy limit.
MIN_INTERVAL = 1.0

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediaTracker/1.0",
    "Accept": "application/json",
}

_last_request_at = 0.0


class RateLimitExceeded(Exception):
    pass


def _pause() -> None:
    """Sleeps until MIN_INTERVAL has passed since the previous request."""
    global _last_request_at
    wait = MIN_INTERVAL - (time.time() - _last_request_at)
    if wait > 0:
        time.sleep(wait)
    _last_request_at = time.time()


def _request(gid: int, token: str) -> Optional[Any]:
    """
    Issues one paced gdata request and returns the parsed JSON.
    Returns None on any non-retryable failure; raises for retryable ones.
    """
    _pause()

    try:
        response = requests.post(
            EHENTAI_API_URL,
            json={"method": "gdata", "gidlist": [[gid, token]], "namespace": 1},
            headers=HEADERS,
            timeout=15,
        )

        if response.status_code == 404:
            logger.warning("E-Hentai has no such resource (404) for gallery %s.", gid)
            return None

        if response.status_code == 429:
            logger.warning("E-Hentai rate limit (429) for gallery %s.", gid)
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code >= 500:
            logger.warning(
                "E-Hentai server error (%s) for gallery %s — skipping retries.",
                response.status_code,
                gid,
            )
            return None

        response.raise_for_status()

        return response.json()

    except requests.exceptions.RequestException as e:
        logger.error("Network/Timeout Error connecting to E-Hentai for gallery %s: %s", gid, e)
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
def fetch_ehentai_gallery(gid: int, token: str) -> Optional[Dict[str, Any]]:
    """
    Fetches one E-Hentai gallery's metadata record by its id and token.

    Returns None for a gallery the API refuses - a wrong token, an unknown
    id - which it answers with a record holding only an `error`: an ordinary
    outcome, not an exception.
    """
    if not gid or not token:
        return None

    payload = _request(gid, token)
    records = payload.get("gmetadata") if isinstance(payload, dict) else None
    if not isinstance(records, list) or not records:
        logger.info("E-Hentai returned no record for gallery %s.", gid)
        return None

    record = records[0]
    if not isinstance(record, dict):
        return None
    if record.get("error"):
        logger.info("E-Hentai refused gallery %s: %s", gid, record["error"])
        return None
    return record
