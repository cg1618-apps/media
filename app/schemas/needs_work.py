"""待補充 Needs Work request/response schemas."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator


class NeedsWorkWrite(BaseModel):
    """{note?}. Marking is the PUT itself; the note is optional."""

    model_config = ConfigDict(extra="forbid")

    note: Optional[str] = None

    @field_validator("note")
    @classmethod
    def _trimmed_or_none(cls, v):
        # The note is also the page's grouping key, so "a" and " a " must be
        # one group, and a blank note is no note.
        if v is None:
            return None
        v = str(v).strip()
        return v or None


class NeedsWorkMark(BaseModel):
    """One owner's mark. `flagged` false means no mark: the rest is null."""

    owner_type: str
    owner_id: UUID
    flagged: bool
    note: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class NeedsWorkItem(BaseModel):
    """One marked owner on the Needs Work page."""

    owner_type: str
    owner_id: UUID
    type_label: str
    is_tier: bool
    display_name: Optional[str] = None
    # The SPA detail path, e.g. /anime/<uuid>.
    nav_path: str
    note: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class NeedsWorkGroup(BaseModel):
    """Every mark that carries one note; `note` null is the unnoted group."""

    note: Optional[str] = None
    items: List[NeedsWorkItem]
