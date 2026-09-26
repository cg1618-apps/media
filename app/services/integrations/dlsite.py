"""
dlsite.py
Handles all HTTP interactions with DLsite.

Strictly responsible for fetching raw external JSON. DLsite publishes no API,
so this reads the JSON the storefront's own pages load:

    GET https://www.dlsite.com/maniax/api/=/product.json?workno=<id>

It answers a list holding one product record, or an empty list for an id it
does not know. The `maniax` path serves every catalogue - a doujin RJ work, a
commercial VJ work and a BJ book alike - so there is no routing on the id's
prefix. No key, no cookie: adult works are served without the age-check
cookie the HTML pages want.

Being undocumented, it has no published rate limit either. Requests are spaced
by MIN_INTERVAL as a courtesy, and one h-game costs one request.
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

DLSITE_BASE_URL = "https://www.dlsite.com/maniax/api/=/product.json"

# Seconds between two requests. A courtesy, not a documented ceiling.
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


def _request(product_id: str) -> Optional[Any]:
    """
    Issues one paced DLsite request and returns the parsed JSON.
    Returns None on any non-retryable failure; raises for retryable ones.
    """
    _pause()

    try:
        response = requests.get(
            DLSITE_BASE_URL,
            params={"workno": product_id},
            headers=HEADERS,
            timeout=15,
        )

        if response.status_code == 404:
            logger.warning("DLsite has no such resource (404) for %s.", product_id)
            return None

        if response.status_code == 429:
            logger.warning("DLsite rate limit (429) for %s.", product_id)
            raise RateLimitExceeded("429 Too Many Requests")

        if response.status_code >= 500:
            logger.warning(
                "DLsite server error (%s) for %s — skipping retries.",
                response.status_code,
                product_id,
            )
            return None

        response.raise_for_status()

        return response.json()

    except requests.exceptions.RequestException as e:
        logger.error("Network/Timeout Error connecting to DLsite for %s: %s", product_id, e)
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
def fetch_dlsite_product(product_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetches one DLsite product record by its id (`RJ173356`, `VJ013799`).

    Returns None for an unknown or withdrawn id, which DLsite answers with an
    empty list - an ordinary outcome, not an error.
    """
    if not product_id:
        return None

    results = _request(product_id)
    if not isinstance(results, list) or not results:
        logger.info("DLsite has no product record for %s.", product_id)
        return None

    record = results[0]
    return record if isinstance(record, dict) else None
