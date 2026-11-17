"""Anime request/response schemas."""

from datetime import datetime, time
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field, field_validator

from app.schemas.image_focus import ImageFocus
from app.schemas.link_fields import AnimeLinkFields
from app.schemas.release_date_field import release_date_validator
from app.schemas.sources import SourceWriteFields
from app.utils.constants import ANIME_ORIGINAL_OR_REMAKE
from app.utils.ep_special import normalize_ep_special


class AnimeBase(BaseModel):
    """
    Core schema for Anime entries.
    Field names must strictly match SQLAlchemy models for automated parsing.
    """

    franchise_id: Optional[UUID] = None
    series_id: Optional[UUID] = None

    anime_name_en: Optional[str] = None
    anime_name_cn: Optional[str] = None
    anime_name_roman: Optional[str] = None
    anime_name_jp: Optional[str] = None
    anime_name_alt: Optional[str] = None

    season_part: Optional[str] = None
    airing_type: Optional[str] = None
    airing_status: Optional[str] = None
    watching_status: str = "Might Watch"
    is_main: Optional[str] = None
    # ANIME_ORIGINAL_OR_REMAKE. Never empty; checked on a write by
    # AnimeWriteChecks.
    original_or_remake: str = "Original"

    ep_previous: Optional[float] = None
    ep_total: Optional[float] = None
    ep_fin: Optional[float] = 0
    # "Paused at": free text, stored stripped and NULL when blank.
    time_fin: Optional[str] = None
    # Text: specials are numbered 0, 14.5, 17.5A. A write normalizes it
    # (AnimeWriteChecks).
    ep_special: Optional[str] = None
    runtime_min: Optional[int] = None

    my_rating: Optional[str] = None
    mal_rating: Optional[float] = None
    mal_rank: Optional[str] = None
    anilist_rating: Optional[int] = None
    anilist_rank: Optional[int] = None
    anilist_popularity_rank: Optional[int] = None

    release_season: Optional[str] = None
    release_date_jp: Optional[str] = None
    release_date_tw: Optional[str] = None

    broadcast_day: Optional[str] = None
    broadcast_time: Optional[time] = None
    my_watch_day: Optional[str] = None

    mal_id: Optional[int] = None
    mal_link: Optional[str] = None

    watch_next: Optional[bool] = None
    cover_image_file: Optional[str] = None
    cover_image_focus: ImageFocus = None
    completed_at: Optional[datetime] = None

    _validate_release_dates = release_date_validator("release_date_jp", "release_date_tw")


class AnimeWriteChecks(BaseModel):
    """
    The anime vocabulary checked on a write. Response schemas do not mix this
    in: a stored row is served as it is, and a read must never 500 on a value
    a Pull restored.
    """

    @field_validator("original_or_remake", check_fields=False)
    @classmethod
    def _original_or_remake(cls, v):
        if v not in ANIME_ORIGINAL_OR_REMAKE:
            raise ValueError(
                f"'{v}' is not a valid original_or_remake; expected one of "
                f"{', '.join(ANIME_ORIGINAL_OR_REMAKE)}."
            )
        return v

    # mode="before": a client still sending the number 17.5 gets "17.5",
    # where a str field would refuse it.
    @field_validator("ep_special", mode="before", check_fields=False)
    @classmethod
    def _ep_special(cls, v):
        return normalize_ep_special(v)


class AnimeCreate(AnimeWriteChecks, AnimeBase, SourceWriteFields):
    pass


class AnimeUpdate(AnimeWriteChecks, AnimeBase, SourceWriteFields):
    pass


class AnimeResponse(AnimeBase, AnimeLinkFields):
    # Redeclared from the base as Optional: a logged-out visitor has no
    # list, so attach_list_fields sets nothing and this arrives absent.
    # Only the READ side moves - Create/Update/SheetSync keep the base's
    # default, because a write that omits a status still means the
    # default rather than 'nobody'.
    watching_status: Optional[str] = None
    system_id: UUID
    # The id the SPA puts in the URL. Never gated: a viewer allowed to see the
    # entry must be able to link to it.
    public_id: int
    # Optional to match the other seven Response schemas. Nothing gates them
    # any more - they are served to every viewer and displayed to none.
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def cum_ep_fin(self) -> float:
        """Dynamically calculates cumulative finished episodes."""
        prev = self.ep_previous or 0
        curr = self.ep_fin or 0
        return prev + curr

    @computed_field
    @property
    def cum_ep_total(self) -> float | None:
        """Dynamically calculates cumulative total episodes. Returns None if total is unknown."""
        prev = self.ep_previous or 0
        if self.ep_total is not None:
            return prev + self.ep_total
        return None



class AnimeSheetSync(AnimeCreate):
    """Schema for Google Sheets Anime Sync operations, including timestamps."""

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
