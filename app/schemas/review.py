"""Pydantic schemas for the review queue's checks under /api/data-control/check."""

from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class FlaggedMusicList(BaseModel):
    """One song list of an anime whose own status is flagged."""

    kind: str  # the song list's section key: op / ed / insert_songs / ost
    status: str


class FlaggedSong(BaseModel):
    section: str  # op / ed / insert_songs / ost
    title: Optional[str] = None
    status: str
    locator: Optional[str] = None


class MusicReviewRow(BaseModel):
    """An anime with at least one flagged song list or song."""

    system_id: UUID
    public_id: int
    anime_name_cn: Optional[str] = None
    anime_name_en: Optional[str] = None
    display_name: str
    lists: list[FlaggedMusicList]
    songs: list[FlaggedSong]


class LoneEntry(BaseModel):
    system_id: UUID
    media_type: str  # hyphenated, as on `media`
    public_id: int
    display_name: str


class AloneGroup(BaseModel):
    """A franchise or series holding exactly one media entry."""

    system_id: UUID
    public_id: int
    display_name: str
    entry: LoneEntry


class AloneGroupsReport(BaseModel):
    franchise: list[AloneGroup]
    series: list[AloneGroup]


class AloneGroupReviewed(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    system_id: UUID
    alone_reviewed_media_id: UUID


AloneGroupKind = Literal["franchise", "series"]
