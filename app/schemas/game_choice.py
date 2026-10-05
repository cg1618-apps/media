"""Game choice graph request/response schemas."""

from typing import List, Optional
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class GameChoiceNodeCreate(BaseModel):
    """
    One new point. `kind` and `title` are plain strings here and checked by
    the router, so a bad value answers with the same one-line `detail` every
    other refusal on this router carries.
    """

    game_id: UUID
    kind: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    sort_index: Optional[int] = None


class GameChoiceNodeUpdate(BaseModel):
    """Partial: only the fields sent are changed. The game never changes."""

    kind: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    sort_index: Optional[int] = None


class GameChoiceNodeResponse(BaseModel):
    """A stored point. The table's `system_id` is sent as `id`."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(validation_alias=AliasChoices("system_id", "id"))
    game_id: UUID
    kind: str
    title: str
    content: Optional[str] = None
    sort_index: int


class GameChoiceEdgeCreate(BaseModel):
    game_id: UUID
    from_node_id: UUID
    to_node_id: UUID
    # Blank means "continues to" and is stored as NULL.
    option: Optional[str] = None
    sort_index: Optional[int] = None


class GameChoiceEdgeUpdate(BaseModel):
    """
    Only the option text and the order. Repointing an arrow is deleting it and
    drawing the right one, so this never has to re-check the two ends.
    """

    option: Optional[str] = None
    sort_index: Optional[int] = None


class GameChoiceEdgeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(validation_alias=AliasChoices("system_id", "id"))
    game_id: UUID
    from_node_id: UUID
    to_node_id: UUID
    option: Optional[str] = None
    sort_index: int


class GameChoiceMarkWrite(BaseModel):
    """The whole of the viewer's mark on one point or option."""

    done: bool = False
    note: Optional[str] = None


class GameChoiceMarkResponse(BaseModel):
    """
    The viewer's mark. `id` is None when the write left nothing to keep - not
    done and no note - and the row was removed rather than stored empty.
    """

    model_config = ConfigDict(from_attributes=True)

    id: Optional[UUID] = Field(default=None, validation_alias=AliasChoices("system_id", "id"))
    node_id: Optional[UUID] = None
    edge_id: Optional[UUID] = None
    done: bool = False
    note: Optional[str] = None


class GameChoiceGraphResponse(BaseModel):
    """Everything one game's graph draws, plus the viewer's own marks."""

    nodes: List[GameChoiceNodeResponse]
    edges: List[GameChoiceEdgeResponse]
    marks: List[GameChoiceMarkResponse]
