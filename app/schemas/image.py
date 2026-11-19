"""Image library request/response schemas."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    system_id: UUID
    storage_key: str
    thumb_key: Optional[str] = None
    checksum: str
    original_filename: Optional[str] = None
    byte_size: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    uploaded_by: Optional[UUID] = None
    uploaded_at: Optional[datetime] = None

    # Computed per request rather than stored: whether the bytes are on THIS
    # machine, and what this image is currently used for.
    missing: bool = False
    attachments: List["AttachmentOut"] = []
    # Cast rows using this image as their photo. They hold the storage key
    # directly, with no attachment row, so they are counted separately.
    cast_photo_count: int = 0


class AttachmentIn(BaseModel):
    owner_type: str
    owner_id: UUID
    role: str = "cover"


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    system_id: UUID
    image_id: UUID
    owner_type: str
    owner_id: UUID
    role: str
    position: int


class ImageListOut(BaseModel):
    images: List[ImageOut]
    total: int


class WorkImageOut(BaseModel):
    """One picture in a person's gallery of works: the attachment, and what
    the SPA needs of its image to draw it."""

    # The attachment's id - what PATCH, DELETE and the reorder PUT name.
    system_id: UUID
    image_id: UUID
    storage_key: str
    thumb_key: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    caption: Optional[str] = None
    position: int


class WorkImageCaptionIn(BaseModel):
    """PATCH /api/person/{id}/work-images/{attachment_id}. Blank is NULL."""

    caption: Optional[str] = Field(default=None, max_length=500)

    @field_validator("caption")
    @classmethod
    def _blank_is_null(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None


class WorkImagesReorder(BaseModel):
    """PUT /api/person/{id}/work-images: every picture's attachment id, in
    the new display order."""

    attachment_ids: List[UUID]


ImageOut.model_rebuild()
