"""
steam_utils.py
Pure helpers for the Steam integration: reading an appid out of a store URL,
mapping storefront payloads onto game columns, and reading the header image
out of one. No I/O lives here.
"""

import logging
import re
from decimal import Decimal
from typing import Any, Dict, Optional
from urllib.parse import urlsplit

logger = logging.getLogger(__name__)

# Only the store host carries an appid we trust. A steamcommunity.com URL uses
# the same /app/<id>/ shape but is a hub link, not the store page the prices
# and Metacritic score come from.
STEAM_APPID_PATTERN = re.compile(r"store\.steampowered\.com/app/(\d+)")

# The three storefronts the price columns model, and the currency each must
# answer in. A mismatch means Steam redirected the request to another region.
REGIONS = ("us", "jp", "tw")
EXPECTED_CURRENCY = {"us": "USD", "jp": "JPY", "tw": "TWD"}


def extract_steam_appid(url: Optional[str]) -> Optional[int]:
    """
    Extracts the numeric appid from a Steam store URL.
    Returns None for an empty value or a non-store URL.
    """
    if not url:
        return None
    match = STEAM_APPID_PATTERN.search(str(url))
    return int(match.group(1)) if match else None


def steam_link_for(appid: int) -> str:
    """The canonical store URL we store, so its shape is ours and is stable."""
    return f"https://store.steampowered.com/app/{appid}/"


def steamdb_link_for(appid: int) -> str:
    """
    SteamDB's page for the same app.

    SteamDB addresses an app by exactly the appid the store URL carries, so
    the store link is the whole of the input - nothing is fetched and the two
    URLs cannot disagree.
    """
    return f"https://steamdb.info/app/{appid}/"


METACRITIC_BASE_URL = "https://www.metacritic.com"

# The platform segments of Metacritic's legacy `/game/<platform>/<slug>`
# URLs. Steam only ever hands back `pc`; the rest are here so a link pasted
# from an old console page normalises the same way.
METACRITIC_LEGACY_PLATFORMS = frozenset(
    {
        "pc", "playstation-5", "playstation-4", "playstation-3", "playstation-2",
        "playstation", "ps-vita", "psp", "xbox-series-x", "xbox-one", "xbox-360",
        "xbox", "switch", "wii-u", "wii", "3ds", "ds", "gamecube", "dreamcast",
        "nintendo-64", "game-boy-advance", "ios", "stadia",
    }
)


def metacritic_link_for(url: Optional[str]) -> Optional[str]:
    """
    The Metacritic page we store, from the `metacritic.url` Steam hands back.

    Steam answers Metacritic's legacy per-platform form with a tracking query,
    `/game/pc/<slug>?ftag=...`, and Metacritic answers that with a 301 to
    `/game/<slug>/` - one page per game, the platform gone. The stored link
    is the one it redirects to, so a link is stable and two platforms of one
    game cannot disagree. A Metacritic path of any other shape keeps its path
    and loses only the query and fragment; a URL on another host is None.
    """
    if not url:
        return None

    parts = urlsplit(str(url).strip())
    host = (parts.hostname or "").lower()
    if host != "metacritic.com" and not host.endswith(".metacritic.com"):
        return None

    segments = [s for s in parts.path.split("/") if s]
    if segments[:1] == ["game"]:
        if len(segments) == 2:
            return f"{METACRITIC_BASE_URL}/game/{segments[1]}/"
        # Only a known platform is stripped: `/game/<slug>/critic-reviews/`
        # is three segments too, and its slug is the middle one.
        if len(segments) == 3 and segments[1] in METACRITIC_LEGACY_PLATFORMS:
            return f"{METACRITIC_BASE_URL}/game/{segments[2]}/"
    return f"{METACRITIC_BASE_URL}{parts.path or '/'}"


# Steam returns every price as an integer with two implied decimals, whatever
# the currency - yen included, despite having no minor unit in the real world.
# Verified against the live storefront on 2026-09-06 with app 1245620:
# USD 5999 -> $59.99, JPY 902000 -> Y9,020, TWD 179000 -> NT$1,790.
PRICE_SCALE = Decimal(100)


def _price(block: Optional[Dict[str, Any]], key: str, cc: str) -> Optional[Decimal]:
    """
    One price out of a region's price_overview, or None.

    A region answering in the wrong currency has been redirected, and its
    numbers belong to some other storefront - dropped with a warning rather
    than written into this region's column.
    """
    if not block:
        return None

    currency = block.get("currency")
    if currency != EXPECTED_CURRENCY.get(cc):
        logger.warning(
            "Steam answered %s in %s, expected %s; dropping that region's prices.",
            cc,
            currency,
            EXPECTED_CURRENCY.get(cc),
        )
        return None

    value = block.get(key)
    if value is None:
        return None

    return Decimal(int(value)) / PRICE_SCALE


def steam_header_image_url(data: Optional[Dict[str, Any]]) -> Optional[str]:
    """
    The storefront's `header_image` - the landscape 460x215 capsule - out of
    one appdetails `data` block, or None.

    Unlike the portrait library capsule, this URL is handed to us rather than
    built, so it points at the hashed asset path newer apps use and is the one
    Steam artwork every app has.
    """
    return (data or {}).get("header_image") or None


def map_steam_to_game_data(payloads: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """
    Maps the per-region storefront payloads onto the columns Fill writes.

    `payloads` is {country code: the `data` block}, as
    `fetch_steam_appdetails` returns it. A missing region is ordinary - the
    app may not be sold there - and so is a missing `price_overview`, which is
    what a free or unreleased game answers.

    The non-price fields are read from the `us` payload, since `appdetails`
    returns them identically for every region.
    """
    primary = payloads.get("us") or next(iter(payloads.values()), {}) or {}

    metacritic = primary.get("metacritic") or {}
    achievements = primary.get("achievements") or {}

    mapped: Dict[str, Any] = {
        "metacritic_score": metacritic.get("score"),
        # Not a column: the Metacritic reference row's url.
        "metacritic_url": metacritic_link_for(metacritic.get("url")),
        "achievements_total": achievements.get("total"),
        "is_free": bool(primary.get("is_free")),
    }

    for cc in REGIONS:
        block = (payloads.get(cc) or {}).get("price_overview")
        mapped[f"price_original_{cc}"] = _price(block, "initial", cc)
        mapped[f"price_current_{cc}"] = _price(block, "final", cc)

    return mapped
