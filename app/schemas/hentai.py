"""Hentai request/response schemas."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field, field_validator

from app.schemas.link_fields import HentaiLinkFields
from app.schemas.release_date_field import release_date_validator
from app.schemas.sources import SourceWriteFields
from app.services.domain.hentai import (
    check_airing_status,
    check_originality,
    check_source_material,
    check_usefulness,
)


class HentaiBase(BaseModel):
    franchise_id: Optional[UUID] = None
    series_id: Optional[UUID] = None

    hentai_name_en: Optional[str] = None
    hentai_name_cn: Optional[str] = None
    hentai_name_roman: Optional[str] = None
    hentai_name_jp: Optional[str] = None
    hentai_name_alt: Optional[str] = None

    source_material: Optional[str] = None
    originality: Optional[str] = None
    series_number: Optional[int] = None
    airing_status: Optional[str] = None
    release_date: Optional[str] = None

    mal_id: Optional[int] = None
    mal_link: Optional[str] = None

    # Personal - split off onto user_media_list by the router.
    watching_status: str = "Might Watch"
    my_rating: Optional[str] = None
    usefulness: Optional[str] = None
    completed_at: Optional[datetime] = None

    watch_next: Optional[bool] = None
    to_rewatch: Optional[bool] = None
    remark: Optional[str] = None
    cover_image_file: Optional[str] = None

    _validate_release_dates = release_date_validator("release_date")


class _WriteChecks(BaseModel):
    """
    The hentai vocabularies, checked on a write. Response schemas do not mix
    this in: a stored row is served as it is, and a read must never 500 on a
    value a Pull restored. The tracker PATCH has no schema, so the registry's
    progress hook checks the same things again there
    (app/services/domain/hentai.py).
    """

    @field_validator("source_material", check_fields=False)
    @classmethod
    def _source_material(cls, v):
        return check_source_material(v)

    @field_validator("originality", check_fields=False)
    @classmethod
    def _originality(cls, v):
        return check_originality(v)

    @field_validator("airing_status", check_fields=False)
    @classmethod
    def _airing_status(cls, v):
        return check_airing_status(v)

    @field_validator("usefulness", check_fields=False)
    @classmethod
    def _usefulness(cls, v):
        return check_usefulness(v)


class HentaiCreate(_WriteChecks, HentaiBase, SourceWriteFields):
    pass


class HentaiUpdate(_WriteChecks, HentaiBase, SourceWriteFields):
    pass


class HentaiResponse(HentaiBase, HentaiLinkFields):
    # Redeclared from the base as Optional: a logged-out visitor has no
    # list, so attach_list_fields sets nothing and this arrives absent.
    watching_status: Optional[str] = None
    system_id: UUID
    # The id the SPA puts in the URL. Never gated: a viewer allowed to see the
    # entry must be able to link to it.
    public_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def display_name(self) -> str:
        for val in (
            self.hentai_name_cn,
            self.hentai_name_en,
            self.hentai_name_alt,
            self.hentai_name_roman,
            self.hentai_name_jp,
        ):
            if val and str(val).strip():
                return str(val).strip()
        return ""


class HentaiSheetSync(HentaiCreate):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
