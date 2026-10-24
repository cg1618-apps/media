"""
omdb_utils.py
Contains domain-specific logic to parse and transform raw JSON data from the
OMDb (Open Movie Database) API into the formats required by our database models.
Used solely to extract IMDb ratings, which TMDB does not provide.
"""

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


# ==========================================
# DATA TRANSFORMERS
# ==========================================


def _convert_imdb_rating(rating_str: Optional[str]) -> Optional[str]:
    """Returns the rating string as-is, or None if missing or 'N/A'."""
    if not rating_str or rating_str.strip() == "N/A":
        return None
    return rating_str.strip()


# ==========================================
# MASTER ORCHESTRATORS
# ==========================================


def map_omdb_to_movie_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extracts OMDb fields relevant to the Movies model.
    """
    return {
        "imdb_rating": _convert_imdb_rating(raw_data.get("imdbRating")),
    }


def season_rating(season_raw: Optional[Dict[str, Any]]) -> Optional[str]:
    """
    A season's IMDb rating: the plain mean of its episodes' ratings, to one
    decimal like IMDb's own. Unrated episodes ("N/A") are left out, and a
    season with none rated has no rating. Unweighted because OMDb's season
    listing carries no vote counts - those cost one request per episode.
    """
    if not season_raw:
        return None
    ratings = []
    for episode in season_raw.get("Episodes") or []:
        rating = _convert_imdb_rating(episode.get("imdbRating"))
        if rating is None:
            continue
        try:
            ratings.append(float(rating))
        except ValueError:
            continue
    if not ratings:
        return None
    return f"{sum(ratings) / len(ratings):.1f}"


def map_omdb_to_tv_data(
    raw_data: Dict[str, Any], season_raw: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Extracts OMDb fields relevant to the TvShows and Cartoons models: the
    show's rating, and the season's from its episodes. A season with no rated
    episodes takes the show's rating only when the show has one season, where
    the two are the same thing; otherwise it has none.
    """
    series = _convert_imdb_rating(raw_data.get("imdbRating"))
    season = season_rating(season_raw)
    if season is None and (raw_data.get("totalSeasons") or "").strip() == "1":
        season = series
    return {
        "imdb_rating": season,
        "imdb_series_rating": series,
    }
