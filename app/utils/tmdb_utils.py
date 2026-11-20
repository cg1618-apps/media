"""
tmdb_utils.py
Contains domain-specific logic to parse and transform raw JSON data from the
TMDB (The Movie Database) API into the formats required by our database models.
"""

import logging
from collections import Counter
from typing import Any, Dict, List, Optional

from app.utils.release_date import normalize

logger = logging.getLogger(__name__)

# ==========================================
# CONSTANTS & MAPPINGS
# ==========================================

TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500"


# ==========================================
# DATA TRANSFORMERS
# ==========================================


def _convert_tmdb_date(date_str: Optional[str]) -> Optional[str]:
    """
    TMDB's date string in canonical stored form.

    TMDB usually sends a full "2008-07-18", which is already canonical. The
    previous implementation flattened that to "JUL 2008", discarding a day we
    actually knew.
    """
    return normalize(date_str)


def _build_poster_url(poster_path: Optional[str]) -> Optional[str]:
    if not poster_path:
        return None
    return f"{TMDB_IMAGE_BASE_URL}{poster_path}"


def _extract_director(crew: List[Dict[str, Any]]) -> Optional[str]:
    """Returns the name of the first crew member with job 'Director'."""
    for member in crew:
        if member.get("job") == "Director":
            return member.get("name")
    return None


def _extract_episode_runtime(episodes: List[Dict[str, Any]]) -> Optional[int]:
    """Returns the most common non-null runtime (minutes) across episodes, or None."""
    runtimes = [ep.get("runtime") for ep in episodes if ep.get("runtime")]
    if not runtimes:
        return None
    return Counter(runtimes).most_common(1)[0][0]


# ==========================================
# MASTER ORCHESTRATORS
# ==========================================


# TMDB's person gender codes onto the person vocabulary (PERSON_GENDERS):
# 1 female, 2 male. 0 (not specified) and 3 (non-binary) have no value in a
# vocabulary of 男 / 女 / NULL, so they map to nothing and the column stays NULL.
TMDB_PERSON_GENDERS = {1: "女", 2: "男"}


def map_tmdb_to_person_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Transforms a raw TMDB person record into the flat dict the person
    autofill writes from: the English name, the profile photo URL, and the
    gender when TMDB says male or female.
    """
    name = raw_data.get("name")
    gender = raw_data.get("gender")
    return {
        "name_en": name.strip() if isinstance(name, str) and name.strip() else None,
        "photo_url": _build_poster_url(raw_data.get("profile_path")),
        "gender": TMDB_PERSON_GENDERS.get(gender) if isinstance(gender, int) else None,
    }


def map_tmdb_to_movie_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parses raw TMDB movie JSON (with credits appended) into the flat dict
    expected by the Movies model.
    """
    crew = raw_data.get("credits", {}).get("crew", [])

    return {
        "length_min": raw_data.get("runtime"),
        "release_date_usa": _convert_tmdb_date(raw_data.get("release_date")),
        "director": _extract_director(crew),
        "cover_image_url": _build_poster_url(raw_data.get("poster_path")),
    }


def map_tmdb_to_tv_show_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Maps TMDB season details response to a flat dict.
    Private keys (_season_air_date, _episodes) are used only for airing status derivation.
    """
    episodes = raw_data.get("episodes") or []
    return {
        "release_date": _convert_tmdb_date(raw_data.get("air_date")),
        "ep_total": len(episodes),
        "runtime_min": _extract_episode_runtime(episodes),
        "cover_image_url": _build_poster_url(raw_data.get("poster_path")),
        "_season_air_date": raw_data.get("air_date"),
        "_episodes": episodes,
    }


def map_tmdb_to_cartoon_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Maps TMDB season details response to a flat dict for Cartoon.
    Private keys (_season_air_date, _episodes) are used only for airing status derivation.
    """
    episodes = raw_data.get("episodes") or []
    return {
        "release_date": _convert_tmdb_date(raw_data.get("air_date")),
        "ep_total": len(episodes),
        "cover_image_url": _build_poster_url(raw_data.get("poster_path")),
        "runtime_min": _extract_episode_runtime(episodes),
        "_season_air_date": raw_data.get("air_date"),
        "_episodes": episodes,
    }
