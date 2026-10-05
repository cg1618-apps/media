"""Game choice graph request/response schemas."""

from typing import List, Optional
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class GameChoiceNodeCreate(BaseModel):
    """
    One new block. `kind` and `title` are plain strings here and checked by
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
    """A stored block. The table's `system_id` is sent as `id`."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(validation_alias=AliasChoices("system_id", "id"))
    game_id: UUID
    kind: str
    title: str
    content: Optional[str] = None
    sort_index: int


class GameChoiceEdgeCreate(BaseModel):
    """
    One new edge: a branch (`choice` or `condition`) or a `link`. Like the
    node, `kind` and `title` are plain strings checked by the router. A
    branch's `to_node_id` may be left out: it leads nowhere yet.
    """

    game_id: UUID
    kind: Optional[str] = None
    from_node_id: UUID
    to_node_id: Optional[UUID] = None
    title: Optional[str] = None
    content: Optional[str] = None
    sort_index: Optional[int] = None


class GameChoiceEdgeUpdate(BaseModel):
    """
    Partial: only the fields sent are changed, and the merged row is
    validated as a new one would be. `to_node_id: null` clears a branch's next
    part. `kind` may only switch between choice and condition. The block an
    edge hangs from and its game never change.
    """

    kind: Optional[str] = None
    to_node_id: Optional[UUID] = None
    title: Optional[str] = None
    content: Optional[str] = None
    sort_index: Optional[int] = None


class GameChoiceEdgeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(validation_alias=AliasChoices("system_id", "id"))
    game_id: UUID
    kind: str
    from_node_id: UUID
    to_node_id: Optional[UUID] = None
    title: Optional[str] = None
    content: Optional[str] = None
    sort_index: int


class GameChoiceNextCreate(BaseModel):
    """The block a branch's /next creates. `kind` defaults to a part."""

    title: Optional[str] = None
    kind: Optional[str] = "part"
    content: Optional[str] = None


class GameChoiceNextResponse(BaseModel):
    """The new block, and the branch now leading to it."""

    node: GameChoiceNodeResponse
    edge: GameChoiceEdgeResponse


class GameChoiceMarkWrite(BaseModel):
    """The whole of the viewer's mark on one block or edge."""

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
