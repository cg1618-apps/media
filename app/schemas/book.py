"""Book request/response schemas."""

from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field

from app.schemas.image_focus import ImageFocus
from app.schemas.link_fields import BookLinkFields
from app.schemas.release_date_field import release_date_validator
from app.schemas.sources import SourceWriteFields
from app.services.domain.book_units import unit_display_key


class BookUnitWrite(BaseModel):
    """
    One unit as the client sends it. system_id present means "update this
    row"; absent means "insert". Rows the payload omits are deleted — see
    write_book_units.
    """

    system_id: Optional[UUID] = None
    unit_kind: Literal["volume", "arc", "story", "chapter"]
    position: float
    unit_key: Optional[str] = None
    name_cn: Optional[str] = None
    name_en: Optional[str] = None
    ch_count: Optional[float] = None
    release_date_jp: Optional[str] = None
    release_date_tw: Optional[str] = None
    # No cover_image_file: the unit's cover is the image library's to write,
    # on attach and clear (app/routers/images.py), so a units save sent from
    # a form loaded before the cover changed cannot put the old one back.
    # No my_rating or remark: they are the reader's, not the unit's, and are
    # written by PUT /api/me/book-units/{unit_id}. A client still sending
    # either has the key ignored, like every catalogue write's personal field.

    _validate_release_dates = release_date_validator("release_date_jp", "release_date_tw")


class BookUnitResponse(BaseModel):
    system_id: UUID
    unit_kind: str
    position: float
    unit_key: Optional[str] = None
    name_cn: Optional[str] = None
    name_en: Optional[str] = None
    ch_count: Optional[float] = None
    release_date_jp: Optional[str] = None
    release_date_tw: Optional[str] = None
    cover_image_file: Optional[str] = None
    # The viewer's own (user_list.attach_unit_ratings); null for a guest.
    remark: Optional[str] = None
    my_rating: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def display_key(self) -> str:
        return unit_display_key(self.unit_kind, self.position, self.unit_key)


class BookBase(BaseModel):
    franchise_id: Optional[UUID] = None
    series_id: Optional[UUID] = None

    book_name_en: Optional[str] = None
    book_name_cn: Optional[str] = None
    book_name_roman: Optional[str] = None
    book_name_jp: Optional[str] = None
    book_name_alt: Optional[str] = None

    region: Optional[str] = None
    type: Optional[str] = None
    version: Optional[str] = None
    anime_studio: Optional[str] = None
    is_main: Optional[str] = None
    serialization_status: Optional[str] = None
    reading_status: str = "Might Read"

    vol_total_original: Optional[float] = None
    vol_total_tw: Optional[float] = None
    vol_fin: Optional[float] = 0
    arc_total: Optional[float] = None
    arc_fin: Optional[float] = 0
    ch_total: Optional[float] = None
    ch_fin: Optional[float] = 0
    ch_fin_in_arc: float = 0
    progress_display: Optional[str] = None

    my_rating: Optional[str] = None
    # Pinned to the viewer's dashboard (user_media_list.is_pinged).
    is_pinged: bool = False
    mal_rating: Optional[float] = None
    mal_rank: Optional[str] = None
    anilist_rating: Optional[int] = None
    anilist_rank: Optional[int] = None
    anilist_popularity_rank: Optional[int] = None

    release_date_jp: Optional[str] = None
    release_date_tw: Optional[str] = None
    end_date: Optional[str] = None


    mal_id: Optional[int] = None
    mal_link: Optional[str] = None
    openlibrary_link: Optional[str] = None
    openlibrary_id: Optional[str] = None

    # Popped out of the payload by the router before the model is built;
    # see MediaTypeSpec.nested_collections.
    units: Optional[List[BookUnitWrite]] = None

    read_next: Optional[bool] = None
    to_reread: Optional[bool] = None
    cover_image_file: Optional[str] = None
    cover_image_focus: ImageFocus = None
    completed_at: Optional[datetime] = None

    _validate_release_dates = release_date_validator("release_date_jp", "release_date_tw", "end_date")


class BookCreate(BookBase, SourceWriteFields):
    pass


class BookUpdate(BookBase, SourceWriteFields):
    pass


class BookResponse(BookBase, BookLinkFields):
    # Redeclared from the base as Optional: a logged-out visitor has no
    # list, so attach_list_fields sets nothing and this arrives absent.
    # Only the READ side moves - Create/Update/SheetSync keep the base's
    # default, because a write that omits a status still means the
    # default rather than 'nobody'.
    reading_status: Optional[str] = None
    system_id: UUID
    # The id the SPA puts in the URL. Never gated: a viewer allowed to see the
    # entry must be able to link to it.
    public_id: int
    units: List[BookUnitResponse] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def display_name(self) -> str:
        for val in (
            self.book_name_cn,
            self.book_name_en,
            self.book_name_alt,
            self.book_name_roman,
            self.book_name_jp,
        ):
            if val and str(val).strip():
                return str(val).strip()
        return ""


class BookSheetSync(BookCreate):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
