"""H-Comic request/response schemas."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

from app.schemas.link_fields import HComicLinkFields
from app.schemas.release_date_field import release_date_validator
from app.schemas.sources import SourceWriteFields
from app.services.domain.h_comic import (
    check_animation_status,
    check_originality,
    check_region,
    check_usefulness,
    normalize_group_order,
)


class HComicBase(BaseModel):
    franchise_id: Optional[UUID] = None
    series_id: Optional[UUID] = None

    h_comic_name_en: Optional[str] = None
    h_comic_name_cn: Optional[str] = None
    h_comic_name_alt: Optional[str] = None
    h_comic_name_jp: Optional[str] = None
    h_comic_name_kr: Optional[str] = None

    region: Optional[str] = None
    originality: Optional[str] = None
    animation_status: Optional[str] = None
    series_number: Optional[int] = None
    serialization_status: Optional[str] = None
    page_total: Optional[int] = None
    ch_total: Optional[int] = None
    ch_behind: Optional[int] = None

    release_date: Optional[str] = None
    end_date: Optional[str] = None

    mal_id: Optional[int] = None
    mal_link: Optional[str] = None

    # KR only; cleared on JP. The group order of the highlights section, read
    # and written whole: a list of female character names.
    highlight_group_order: Optional[List[str]] = None

    # Personal - split off onto user_media_list by the router.
    reading_status: str = "Might Read"
    my_rating: Optional[str] = None
    page_fin: int = 0
    ch_fin: int = 0
    usefulness: Optional[str] = None
    completed_at: Optional[datetime] = None

    read_next: Optional[bool] = None
    to_reread: Optional[bool] = None
    remark: Optional[str] = None
    cover_image_file: Optional[str] = None

    _validate_release_dates = release_date_validator("release_date", "end_date")


class _WriteChecks(BaseModel):
    """
    The h-comic vocabularies, checked on a write. Response schemas do not mix
    this in: a stored row is served as it is, and a read must never 500 on a
    value a Pull restored.

    Region is required on every write that names it - including a PUT that
    sends it as null. A PUT that leaves it out keeps the stored one. The
    tracker PATCH has no schema, so the registry's progress hook checks the
    same things again there (app/services/domain/h_comic.py).
    """

    @field_validator("region", check_fields=False)
    @classmethod
    def _region(cls, v):
        return check_region(v, required=True)

    @field_validator("originality", check_fields=False)
    @classmethod
    def _originality(cls, v):
        return check_originality(v)

    @field_validator("animation_status", check_fields=False)
    @classmethod
    def _animation_status(cls, v):
        return check_animation_status(v)

    @field_validator("usefulness", check_fields=False)
    @classmethod
    def _usefulness(cls, v):
        return check_usefulness(v)

    @field_validator("highlight_group_order", mode="before", check_fields=False)
    @classmethod
    def _group_order(cls, v):
        return normalize_group_order(v)


class HComicCreate(_WriteChecks, HComicBase, SourceWriteFields):
    region: str


class HComicUpdate(_WriteChecks, HComicBase, SourceWriteFields):
    pass


class HComicResponse(HComicBase, HComicLinkFields):
    # Redeclared from the base as Optional: a logged-out visitor has no
    # list, so attach_list_fields sets nothing and this arrives absent.
    reading_status: Optional[str] = None
    system_id: UUID
    # The id the SPA puts in the URL. Never gated: a viewer allowed to see the
    # entry must be able to link to it.
    public_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # "derived" when the served animation_status comes from adaptation
    # relations to hentai entries, "manual" when it is the stored hand-set
    # value, None on a KR entry (which has none) or on a path that did not
    # attach it. Set by h_comic.attach_animation_status.
    animation_status_source: Optional[str] = None
    # The derived value itself, swapped into animation_status below and never
    # served on its own.
    animation_status_derived: Optional[str] = Field(default=None, exclude=True)

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="after")
    def _serve_the_effective_animation_status(self):
        if self.animation_status_derived is not None:
            self.animation_status = self.animation_status_derived
        return self

    @computed_field
    @property
    def display_name(self) -> str:
        for val in (
            self.h_comic_name_cn,
            self.h_comic_name_en,
            self.h_comic_name_alt,
            self.h_comic_name_jp,
            self.h_comic_name_kr,
        ):
            if val and str(val).strip():
                return str(val).strip()
        return ""


class HComicSheetSync(HComicCreate):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
