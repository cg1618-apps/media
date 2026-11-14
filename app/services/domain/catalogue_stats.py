"""
Counts of the catalogue, for the Statistics page's catalogue sections.

Seasonal and Statistics are built from the viewer's own list for an account
that keeps one. The catalogue sections - entries and franchises per type,
anime per season, the MAL and AniList score distributions - are facts about
the catalogue rather than anybody's opinion, and every holder of
`view.statistics` sees them (docs/viewers.md, "Seasonal and Statistics").

Every count runs through the same two gates the entry routers use
(rbac/enforcement.py): the media types the viewer's role holds, and the labels
its mode shows. So a count never reveals an entry the viewer could not open:
a type it does not hold counts as nothing, and a label its mode hides takes
its entries out of every total.
"""

from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.services.rbac.enforcement import apply_entry_visibility, apply_media_visibility
from app.services.rbac.resolver import Viewer
from app.utils.media_resolver import MEDIA_TABLES

# Newest first within a year: autumn, summer, spring, winter.
_SEASON_RANK = {"FAL": 0, "SUM": 1, "SPR": 2, "WIN": 3}


def _season_sort_key(row: dict) -> tuple:
    season, year = row["season"].split(" ", 1)
    return (-int(year) if year.isdigit() else 0, _SEASON_RANK.get(season, 9))


def anime_season_counts(db: Session, viewer: Optional[Viewer]) -> list[dict]:
    """
    One row per season present among the anime the viewer may see, newest
    first: `{"season": "SPR 2024", "entry_count": 3}`.

    A season is `release_season` plus the year of `release_date`, the same
    pair `?airing_season=` filters the anime list on (registry.py). An anime
    missing either is in no season.
    """
    year = func.substr(models.Anime.release_date, 1, 4)
    query = db.query(
        models.Anime.release_season, year, func.count(models.Anime.system_id)
    )
    query = apply_entry_visibility(query, models.Anime, "anime", db, viewer)
    rows = (
        query.filter(
            models.Anime.release_season.isnot(None),
            models.Anime.release_date.isnot(None),
            func.length(models.Anime.release_date) >= 4,
        )
        .group_by(models.Anime.release_season, year)
        .all()
    )
    out = [
        {"season": f"{season} {yr}", "entry_count": count}
        for season, yr, count in rows
    ]
    return sorted(out, key=_season_sort_key)


def type_counts(db: Session, viewer: Optional[Viewer]) -> list[dict]:
    """
    One row per media type with a visible entry, over the types and labels the
    viewer may see: `{"media_type": "anime", "entry_count": 4,
    "franchise_count": 2}`. A type with no visible entry is absent.

    `franchise_count` is the distinct franchises holding at least one of those
    visible entries, counted through `media.franchise_id` in the same grouped
    query, so it is narrowed exactly as the entry count is. Not
    `franchise.franchise_type`: that is a free comma-joined string with its
    own vocabulary (ACG, "TV, Movie") which does not map onto the media types,
    and it knows nothing about visibility.
    """
    query = db.query(
        models.Media.media_type,
        func.count(models.Media.system_id),
        func.count(func.distinct(models.Media.franchise_id)),
    )
    query = apply_media_visibility(query, db, viewer)
    rows = query.group_by(models.Media.media_type).all()
    return [
        {
            "media_type": media_type,
            "entry_count": entries,
            "franchise_count": franchises,
        }
        for media_type, entries, franchises in rows
    ]


# The two published scores: (column, bucket width, top bucket's lower bound).
# MAL's is 0-10 in one-point buckets; AniList's averageScore is 0-100 in
# ten-point buckets. A perfect score is folded into the top bucket rather than
# given one of its own, so 10 counts with 9.x and 100 with 90-99.
SCORE_SCALES: dict[str, tuple[str, int, int]] = {
    "mal": ("mal_rating", 1, 9),
    "anilist": ("anilist_rating", 10, 90),
}

# The media types carrying each score, read off the models rather than listed:
# a type that gains the column is counted without touching this file.
SCORED_TYPES: dict[str, tuple[str, ...]] = {
    key: tuple(
        media_type
        for media_type, ref in MEDIA_TABLES.items()
        if hasattr(ref.model, column)
    )
    for key, (column, _width, _top) in SCORE_SCALES.items()
}


def score_distributions(
    db: Session, viewer: Optional[Viewer]
) -> dict[str, list[dict]]:
    """
    Per score, one row per (media type, bucket) holding at least one visible
    scored entry: `{"media_type": "anime", "bucket": 8, "entry_count": 3}`.
    `bucket` is the bucket's lower bound - 8 is 8.0 to 8.99 on MAL, 80 is 80
    to 89 on AniList. An entry with no score is in no bucket.

    Per type rather than pooled, so the page can narrow to one type without a
    second request; it pools them itself.
    """
    out: dict[str, list[dict]] = {}
    for key, (column, width, top) in SCORE_SCALES.items():
        rows: list[dict] = []
        for media_type in SCORED_TYPES[key]:
            model = MEDIA_TABLES[media_type].model
            score = getattr(model, column)
            bucket = func.least(func.floor(score / width) * width, top)
            query = db.query(bucket, func.count(model.system_id)).filter(
                score.isnot(None)
            )
            query = apply_entry_visibility(query, model, media_type, db, viewer)
            for lower, count in query.group_by(bucket).all():
                rows.append(
                    {
                        "media_type": media_type,
                        "bucket": int(lower),
                        "entry_count": count,
                    }
                )
        out[key] = sorted(rows, key=lambda row: (row["media_type"], -row["bucket"]))
    return out
