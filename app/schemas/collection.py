"""Collection request/response schemas."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CollectionBase(BaseModel):
    collection_name_en: Optional[str] = None
    collection_name_cn: Optional[str] = None
    collection_name_roman: Optional[str] = None
    collection_name_jp: Optional[str] = None
    collection_name_alt: Optional[str] = None
    cover_franchise_id: Optional[UUID] = None
    no_built_in_orders: Optional[bool] = False
    remark: Optional[str] = None


class CollectionCreate(CollectionBase):
    pass


class CollectionUpdate(CollectionBase):
    pass


class CollectionResponse(CollectionBase):
    system_id: UUID
    # The VIEWER'S own rating, from user_rating (services.domain.user_rating
    # .attach_ratings); null for a guest. Not on the Base: a catalogue write
    # does not carry it - PUT /api/me/ratings/... does.
    my_rating: Optional[str] = None
    collection_expectation: Optional[str] = None
    # The id the SPA puts in the URL. Never gated: a viewer allowed to see the
    # entry must be able to link to it.
    public_id: int
    # Nullable in the database, and a blank Google Sheets cell parses to None on
    # Pull. Keeping these optional stops one timestamp-less row from failing
    # validation for the whole list endpoint.
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CollectionSheetSync(CollectionCreate):
    """Schema for Google Sheets Collection Sync operations, including timestamps."""

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
