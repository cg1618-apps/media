"""
Counts of the catalogue, for a viewer with no list of its own.

Seasonal and Statistics are built from the viewer's own list for an account
that keeps one. A guest, a shared account and anyone else without `self.list`
gets their catalogue version instead (docs/viewers.md, "Seasonal and
Statistics"): what aired when, and how many entries of each kind there are.
That is a fact about the catalogue, not anybody's opinion.

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

# The genre vocabularies counted by Statistics: Genre Main on the eight
# mainstream types, and Game Genre on game. The adult genres are left out on
# purpose: they are a separate vocabulary for the gated types, and a page
# meant for every viewer does not mix them in.
GENRE_FIELDS: tuple[str, ...] = ("genre_main", "game_genre")

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


def type_counts(db: Session, viewer: Optional[Viewer]) -> dict[str, int]:
    """Entries per media type, over the types and labels the viewer may see.
    A type with no visible entry is absent rather than zero."""
    query = db.query(models.Media.media_type, func.count(models.Media.system_id))
    query = apply_media_visibility(query, db, viewer)
    return dict(query.group_by(models.Media.media_type).all())


def genre_counts(db: Session, viewer: Optional[Viewer]) -> list[dict]:
    """Entries per genre value, most first: `{"genre": "奇幻", "entry_count": 4}`.
    One entry carrying a genre twice (main and sub are separate fields; only
    main is counted) counts once."""
    query = (
        db.query(
            models.SystemOption.value,
            func.count(func.distinct(models.MediaTag.media_id)),
        )
        .select_from(models.MediaTag)
        .join(models.SystemOption, models.SystemOption.system_id == models.MediaTag.option_id)
        .join(models.Media, models.Media.system_id == models.MediaTag.media_id)
        .filter(models.MediaTag.field.in_(GENRE_FIELDS))
    )
    query = apply_media_visibility(query, db, viewer)
    rows = query.group_by(models.SystemOption.value).all()
    out = [{"genre": value, "entry_count": count} for value, count in rows]
    return sorted(out, key=lambda row: (-row["entry_count"], row["genre"]))
