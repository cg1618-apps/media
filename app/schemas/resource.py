"""Resources page request/response schemas."""

from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ResourceNodeCreate(BaseModel):
    kind: Literal["group", "item"]
    # The group to create the node in; omitted or null is the top level.
    parent_id: Optional[UUID] = None
    title: Optional[str] = None
    content: Optional[str] = None


class ResourceNodeUpdate(BaseModel):
    """
    The two editable fields. `kind` and `parent_id` are not here on purpose:
    a node's kind is fixed, and moving it goes through the reorder endpoint,
    which rewrites the whole sibling order it lands in.
    """

    title: Optional[str] = None
    content: Optional[str] = None


class ResourceNodeResponse(BaseModel):
    system_id: UUID
    parent_id: Optional[UUID] = None
    kind: str
    title: Optional[str] = None
    content: Optional[str] = None
    sort_index: Optional[float] = None
    # Nullable in the database, and a blank Google Sheets cell parses to None
    # on Pull, so one timestamp-less row must not fail the whole tree.
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # Built by the router from the flat rows, never read off the ORM object:
    # the model declares no relationship, so there is nothing to lazy-load.
    children: List["ResourceNodeResponse"] = []

    model_config = ConfigDict(from_attributes=True)


ResourceNodeResponse.model_rebuild()


class ResourceReorder(BaseModel):
    """
    The complete new order of one parent's children.

    Every id listed is moved under `parent_id` (null is the top level) and
    given its position as sort_index, so the same call reorders siblings and
    moves a node into another group.
    """

    parent_id: Optional[UUID] = None
    ordered_ids: List[UUID]
