"""Pydantic schemas for /api/requests."""

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.utils.constants import REQUEST_KINDS, REQUEST_STATUSES

# Literals built from the constants rather than a str checked in the service,
# so a bad value is the same 422 FastAPI gives every other malformed payload
# and the vocabulary is still declared once.
RequestKind = Literal[REQUEST_KINDS]
RequestStatus = Literal[REQUEST_STATUSES]

# The description is the request; an empty one says nothing to the handler.
Description = Field(min_length=1)


class UserRequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: RequestKind
    description: str = Description
    remark: Optional[str] = None
    # Both or neither. A key from REQUEST_TARGET_TABLES and the row's
    # system_id; a target that does not exist is a 422.
    target_type: Optional[str] = None
    target_id: Optional[UUID] = None
    page_path: Optional[str] = None


class UserRequestUpdate(BaseModel):
    """The author's edit: the description and the remark, nothing else."""

    model_config = ConfigDict(extra="forbid")

    description: Optional[str] = Field(default=None, min_length=1)
    remark: Optional[str] = None


class UserRequestStatusUpdate(BaseModel):
    """A handler's decision. `response` is optional for done and declined."""

    model_config = ConfigDict(extra="forbid")

    status: RequestStatus
    response: Optional[str] = None


class UserRequestTarget(BaseModel):
    """What the request is about, resolved when it is read.

    `label` is the target's current name, or the name copied at filing when
    the target has since been deleted (`missing`), in which case `nav_path`
    is null.
    """

    type: str
    type_label: Optional[str] = None
    id: UUID
    label: Optional[str] = None
    nav_path: Optional[str] = None
    missing: bool = True


class UserRequestResponse(BaseModel):
    id: UUID
    kind: str
    status: str
    description: str
    remark: Optional[str] = None
    page_path: Optional[str] = None
    target: Optional[UserRequestTarget] = None
    # Null once the account is deleted: the SPA shows "deleted account".
    author_username: Optional[str] = None
    response: Optional[str] = None
    handled_by_username: Optional[str] = None
    handled_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # Whether the caller may edit it now: their own, and still open.
    can_edit: bool = False


class UserRequestSummary(BaseModel):
    open: int
