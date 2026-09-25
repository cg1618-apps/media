"""H-Game request/response schemas."""

from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field, field_validator

from app.schemas.game import GameCopyIO
from app.schemas.link_fields import GameRef, HGameLinkFields
from app.schemas.release_date_field import release_date_validator
from app.schemas.sources import SourceWriteFields
from app.services.domain.game_copies import derive_game_ownership
from app.services.domain.h_comic import check_usefulness, normalize_group_order
from app.services.domain.h_game import (
    check_audio_availability,
    check_h_presentation,
    check_language_availability,
    check_platform,
    check_playstyle,
)


class HGameBase(BaseModel):
    franchise_id: Optional[UUID] = None
    series_id: Optional[UUID] = None

    h_game_name_en: Optional[str] = None
    h_game_name_cn: Optional[str] = None
    h_game_name_jp: Optional[str] = None
    h_game_name_roman: Optional[str] = None
    h_game_name_alt: Optional[str] = None

    series_number: Optional[int] = None
    playstyle: Optional[str] = None

    game_type: Optional[str] = None
    base_game_id: Optional[UUID] = None

    release_status: Optional[str] = None
    release_date: Optional[str] = None
    current_patch: Optional[str] = None

    completion_level: Optional[str] = None
    # GAME_COMPLETION_FLAGS; None is the unrecorded fourth state.
    all_endings: Optional[str] = None
    all_cg: Optional[str] = None
    steam_progress_sync: Optional[bool] = None
    achievements_earned: Optional[int] = None
    achievements_total: Optional[int] = None

    hltb_main: Optional[float] = None
    hltb_main_extra: Optional[float] = None
    hltb_completionist: Optional[float] = None

    price_original_us: Optional[Decimal] = None
    price_original_jp: Optional[Decimal] = None
    price_original_tw: Optional[Decimal] = None
    price_current_us: Optional[Decimal] = None
    price_current_jp: Optional[Decimal] = None
    price_current_tw: Optional[Decimal] = None

    language_availability: Optional[str] = None
    # Lists over their vocabularies, in vocabulary order. None is unknown,
    # [] is "none of these".
    audio_availability: Optional[List[str]] = None
    animation_availability: Optional[bool] = None
    h_presentation: Optional[List[str]] = None
    platform: Optional[List[str]] = None

    igdb_id: Optional[int] = None
    igdb_link: Optional[str] = None
    steam_appid: Optional[int] = None
    steam_link: Optional[str] = None
    dlsite_link_jp: Optional[str] = None
    dlsite_link_tw: Optional[str] = None

    # The group order of the highlights section, read and written whole: a
    # list of female character names.
    highlight_group_order: Optional[List[str]] = None

    type_slots: Optional[dict] = None
    cover_image_file: Optional[str] = None

    # Personal - split off onto user_media_list by the router.
    playing_status: str = "Might Play"
    my_rating: Optional[str] = None
    usefulness: Optional[str] = None
    completed_at: Optional[datetime] = None

    # Virtual: the router factory sets these from plan_next rows.
    play_next: Optional[bool] = None
    to_replay: Optional[bool] = None
    remark: Optional[str] = None

    _validate_release_dates = release_date_validator("release_date")


class _WriteChecks(BaseModel):
    """
    The h-game vocabularies, checked on a write. Response schemas do not mix
    this in: a stored row is served as it is, and a read must never 500 on a
    value a Pull restored. The tracker PATCH has no schema, so the registry's
    progress hook checks the same things again there
    (app/services/domain/h_game.py).
    """

    @field_validator("playstyle", check_fields=False)
    @classmethod
    def _playstyle(cls, v):
        return check_playstyle(v)

    @field_validator("language_availability", check_fields=False)
    @classmethod
    def _language(cls, v):
        return check_language_availability(v)

    @field_validator("audio_availability", mode="before", check_fields=False)
    @classmethod
    def _audio(cls, v):
        return check_audio_availability(v)

    @field_validator("h_presentation", mode="before", check_fields=False)
    @classmethod
    def _h_presentation(cls, v):
        return check_h_presentation(v)

    @field_validator("platform", mode="before", check_fields=False)
    @classmethod
    def _platform(cls, v):
        return check_platform(v)

    @field_validator("usefulness", check_fields=False)
    @classmethod
    def _usefulness(cls, v):
        return check_usefulness(v)

    @field_validator("highlight_group_order", mode="before", check_fields=False)
    @classmethod
    def _group_order(cls, v):
        return normalize_group_order(v)


class HGameCreate(_WriteChecks, HGameBase, SourceWriteFields):
    # None means "not supplied", [] means "clear them" - Game's contract.
    copies: Optional[List[GameCopyIO]] = None


class HGameUpdate(_WriteChecks, HGameBase, SourceWriteFields):
    copies: Optional[List[GameCopyIO]] = None


class HGameResponse(HGameBase, HGameLinkFields):
    # Redeclared from the base as Optional: a logged-out visitor has no
    # list, so attach_list_fields sets nothing and this arrives absent.
    playing_status: Optional[str] = None
    system_id: UUID
    # The id the SPA puts in the URL. Never gated.
    public_id: int
    # A DLC's base game, as on Game.
    base_game: Optional[GameRef] = None
    copies: List[GameCopyIO] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def ownership(self) -> Optional[str]:
        """Derived from the viewer's own copy rows, never stored - as on Game."""
        return derive_game_ownership(self)

    @computed_field
    @property
    def display_name(self) -> str:
        for val in (
            self.h_game_name_cn,
            self.h_game_name_en,
            self.h_game_name_alt,
            self.h_game_name_roman,
            self.h_game_name_jp,
        ):
            if val and str(val).strip():
                return str(val).strip()
        return ""


class HGameSheetSync(HGameCreate):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
