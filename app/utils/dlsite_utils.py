"""
dlsite_utils.py
Pure helpers for the DLsite integration: reading a product id out of a work
URL, and mapping DLsite's product record onto h-game fields. No I/O lives here.

The JP and TW links are the same page. DLsite has no separate Taiwanese
catalogue: its Traditional Chinese storefront is `www.dlsite.com` with
`?locale=zh_TW`, so both links carry the same product id and either one keys
the same record.
"""

import logging
import re
from typing import Any, Dict, Optional

from app.utils.release_date import normalize

logger = logging.getLogger(__name__)

# RJ is a doujin work (maniax / home), VJ a commercial one (pro / soft), BJ a
# book. The digits are six for older works and eight for newer ones. Matched
# case-insensitively and returned upper-case, the way DLsite spells them.
DLSITE_PRODUCT_ID_PATTERN = re.compile(r"\b((?:RJ|VJ|BJ)\d{6,8})\b", re.IGNORECASE)


def extract_dlsite_product_id(url: Optional[str]) -> Optional[str]:
    """
    Extracts the product id (`RJ173356`, `VJ013799`, ...) from a DLsite URL.
    Returns None for an empty value or a URL that carries no product id.
    """
    if not url:
        return None
    match = DLSITE_PRODUCT_ID_PATTERN.search(str(url))
    return match.group(1).upper() if match else None


def dlsite_product_id_for(entry) -> Optional[str]:
    """
    The product id an h-game's DLsite fill keys off: the JP link's, else the
    TW link's. A JP link that carries no id does not hide a usable TW one.
    """
    return extract_dlsite_product_id(
        getattr(entry, "dlsite_link_jp", None)
    ) or extract_dlsite_product_id(getattr(entry, "dlsite_link_tw", None))


def _cover_url(image_main: Any) -> Optional[str]:
    """DLsite's main image, given a scheme: its URLs are protocol-relative."""
    if not isinstance(image_main, dict):
        return None
    url = image_main.get("url")
    if not url:
        return None
    url = str(url)
    if url.startswith("//"):
        return f"https:{url}"
    return url


def _release_day(regist_date: Any) -> Optional[str]:
    """`regist_date` is "YYYY-MM-DD HH:MM:SS" in Japan time; the column is a day."""
    if not regist_date:
        return None
    day = normalize(str(regist_date).strip()[:10])
    if day is None:
        logger.warning("DLsite regist_date '%s' is not a date.", regist_date)
    return day


def map_dlsite_to_h_game_data(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    One DLsite product record, as the three things the h-game fill writes.

    `maker_name` is the circle for a doujin work and the brand for a
    commercial one; either way it is who made the game, which is the studio.
    """
    raw = raw or {}
    maker = (raw.get("maker_name") or "").strip() or None
    return {
        "release_date": _release_day(raw.get("regist_date")),
        "maker_name": maker,
        "cover_image_url": _cover_url(raw.get("image_main")),
    }
