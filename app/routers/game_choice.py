"""
routers/game_choice.py
Handles the game choice graph - one shared graph per game or h-game of blocks
(story parts) and the edges out of them, and each user's personal marks on it.

An edge is a BRANCH - a `choice` the player makes or a `condition` the game
decides - or a plain `link`. A branch has a title, may exist before it leads
anywhere, and then leads to exactly one block; a link carries no text and
always leads to another block.

Reads are gated on seeing the game, exactly as a note's owner is; the graph is
ordinary catalogue data. Every write to the graph needs manage.catalog, as a
relation does. Marks are personal: writing one needs a signed-in account
holding self.personal_notes, as a personal note does, and a read returns only
the viewer's own.

Kept apart from the generic media factory, as media_relation is. The graph
endpoint does not send saves: the page already holds the viewer's own `saves`
notes, so the notes router stays the only place deciding whose saves a viewer
sees.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.models.game_choice import BRANCH_KINDS, EDGE_KINDS, LINK_KIND, NODE_KINDS
from app.services.domain.game_choice import (
    GRAPH_OWNER_TYPES,
    clear_save_links,
    graph_for_game,
    node_of_game,
    write_mark,
)
from app.services.rbac.enforcement import require_visible_media
from app.services.rbac.permissions import PERM_SELF_PERSONAL_NOTES
from app.services.rbac.resolver import Viewer, get_viewer, require_manage_catalog
from app.utils.data_control_utils import log_deleted_record

router = APIRouter(prefix="/api/game-choice", tags=["Game Choice"])

GAME_NOT_FOUND = "Game not found."


# ==========================================
# HELPERS
# ==========================================


def _require_game(db: Session, viewer: Viewer, game_id) -> None:
    """
    The game must exist, be visible to this viewer, and be a game.

    Hidden answers exactly as missing (404), so this cannot be used to learn
    that a labelled entry exists. A visible entry of another media type is a
    422: the id is real, it just cannot own a graph.
    """
    media_type = require_visible_media(
        db, viewer, game_id, GAME_NOT_FOUND, require_media_row=True
    )
    if media_type not in GRAPH_OWNER_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Only a game or an h-game has a choice graph, not '{media_type}'.",
        )


def _get_node_or_404(db: Session, node_id: str) -> models.GameChoiceNode:
    row = db.get(models.GameChoiceNode, _uuid_or_404(node_id, "Node not found."))
    if row is None:
        raise HTTPException(status_code=404, detail="Node not found.")
    return row


def _get_edge_or_404(db: Session, edge_id: str) -> models.GameChoiceEdge:
    row = db.get(models.GameChoiceEdge, _uuid_or_404(edge_id, "Edge not found."))
    if row is None:
        raise HTTPException(status_code=404, detail="Edge not found.")
    return row


def _uuid_or_404(value: str, detail: str) -> uuid.UUID:
    """A path id that is not a uuid names nothing, so it answers as missing."""
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=404, detail=detail)


def _validate_kind(kind) -> str:
    if kind not in NODE_KINDS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown node kind '{kind}'. Expected one of: {', '.join(NODE_KINDS)}.",
        )
    return kind


def _validate_title(title) -> str:
    cleaned = (title or "").strip()
    if not cleaned:
        raise HTTPException(status_code=422, detail="A node needs a title.")
    return cleaned


def _blank_to_none(value):
    """Trimmed text, or None for a blank one."""
    return (value or "").strip() or None


def _validated_edge(
    db: Session, game_id, *, kind, from_node_id, to_node_id, title, content
) -> tuple[str, str | None, str | None]:
    """
    Check one edge as it would be stored - a new one, or a PATCH merged onto
    the row - and return its (kind, title, content), trimmed, blanks as None.

    The CHECKs on the table say the same about each row, so Pull cannot write
    what this refuses; the same-game rule is the router's alone, because a
    CHECK cannot see across rows.
    """
    if kind not in EDGE_KINDS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown edge kind '{kind}'. Expected one of: {', '.join(EDGE_KINDS)}.",
        )
    title, content = _blank_to_none(title), _blank_to_none(content)
    if kind == LINK_KIND:
        if to_node_id is None:
            raise HTTPException(status_code=422, detail="A link must lead to a block.")
        if title is not None or content is not None:
            raise HTTPException(
                status_code=422, detail="A link carries no title or description."
            )
        if to_node_id == from_node_id:
            raise HTTPException(
                status_code=422, detail="A link cannot lead back to its own block."
            )
    elif title is None:
        raise HTTPException(status_code=422, detail="A branch needs a title.")
    # 422, not 404: the missing thing is a value in the payload, and the edge's
    # game_id is denormalised, so every end it names must belong to that game.
    for end in (from_node_id, to_node_id):
        if end is not None and node_of_game(db, end, game_id) is None:
            raise HTTPException(
                status_code=422,
                detail="Both ends of an edge must be blocks of the same game.",
            )
    return kind, title, content


def _authorize_mark(viewer: Viewer) -> None:
    """
    A mark is a personal note on the graph, so it takes the personal-note
    gate: a signed-in account holding self.personal_notes. 401 otherwise, in
    the shape require_permission answers with.
    """
    if viewer.user_id is None or not viewer.has(PERM_SELF_PERSONAL_NOTES):
        raise HTTPException(
            status_code=401,
            detail="You may not write personal notes.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _viewer_marks_user(viewer: Viewer):
    """Whose marks the graph read returns: the viewer's, if they may hold any."""
    if viewer.user_id is None or not viewer.has(PERM_SELF_PERSONAL_NOTES):
        return None
    return viewer.user_id


def _mark_response(row, *, node_id=None, edge_id=None) -> dict:
    """The stored mark, or the empty one a removed mark reads back as."""
    if row is None:
        return {
            "id": None,
            "node_id": node_id,
            "edge_id": edge_id,
            "done": False,
            "note": None,
        }
    return schemas.GameChoiceMarkResponse.model_validate(row).model_dump()


# ==========================================
# READS
# ==========================================


@router.get(
    "/graph",
    response_model=schemas.GameChoiceGraphResponse,
    summary="Get One Game's Choice Graph",
)
def get_graph(
    game_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """Every node and edge of the game's graph, and the viewer's own marks."""
    _require_game(db, viewer, game_id)
    return graph_for_game(db, game_id, _viewer_marks_user(viewer))


# ==========================================
# NODES (manage.catalog)
# ==========================================


@router.post(
    "/nodes",
    response_model=schemas.GameChoiceNodeResponse,
    status_code=201,
    summary="Create Node",
)
def create_node(
    payload: schemas.GameChoiceNodeCreate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    _require_game(db, admin, payload.game_id)
    row = models.GameChoiceNode(
        system_id=uuid.uuid4(),
        game_id=payload.game_id,
        kind=_validate_kind(payload.kind),
        title=_validate_title(payload.title),
        content=_blank_to_none(payload.content),
        sort_index=payload.sort_index or 0,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch(
    "/nodes/{node_id}",
    response_model=schemas.GameChoiceNodeResponse,
    summary="Update Node",
)
def update_node(
    node_id: str,
    payload: schemas.GameChoiceNodeUpdate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """Changes only the fields sent. A node never moves to another game."""
    row = _get_node_or_404(db, node_id)
    _require_game(db, admin, row.game_id)
    data = payload.model_dump(exclude_unset=True)
    if "kind" in data:
        row.kind = _validate_kind(data["kind"])
    if "title" in data:
        row.title = _validate_title(data["title"])
    if "content" in data:
        row.content = _blank_to_none(data["content"])
    if "sort_index" in data:
        row.sort_index = data["sort_index"] or 0
    db.commit()
    db.refresh(row)
    return row


@router.delete(
    "/nodes/{node_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Node",
)
def delete_node(
    node_id: str,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Removes the node, in one commit with everything that goes with it:

    - every edge OUT of it, and every mark on the node or those edges, by
      foreign key;
    - every LINK into it, deleted here: a link cannot lead nowhere;
    - every BRANCH into it survives, leading nowhere again (ON DELETE SET
      NULL), so its title, description and marks are kept;
    - every save sitting on it loses its `choice_node`.

    Each node and edge that goes is logged to the deleted-record log.
    """
    row = _get_node_or_404(db, node_id)
    _require_game(db, admin, row.game_id)
    Edge = models.GameChoiceEdge
    going_out = db.query(Edge).filter(Edge.from_node_id == row.system_id).all()
    links_in = (
        db.query(Edge)
        .filter(
            Edge.to_node_id == row.system_id,
            Edge.kind == LINK_KIND,
            Edge.from_node_id != row.system_id,
        )
        .all()
    )
    # Nothing below commits until the end, so the log, the save links and the
    # deletes land together.
    for edge in going_out + links_in:
        log_deleted_record(db, edge, "Game Choice Edge")
    log_deleted_record(db, row, "Game Choice Node")
    clear_save_links(db, row.system_id)
    for link in links_in:
        db.delete(link)
    # The links must be gone before the node's SET NULL reaches them.
    db.flush()
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ==========================================
# EDGES (manage.catalog)
# ==========================================


@router.post(
    "/edges",
    response_model=schemas.GameChoiceEdgeResponse,
    status_code=201,
    summary="Create Edge",
)
def create_edge(
    payload: schemas.GameChoiceEdgeCreate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Draws one branch or link out of a block of the game. Rejoining and cycles
    are allowed, and a branch may lead back to its own block; a link may not.
    """
    _require_game(db, admin, payload.game_id)
    kind, title, content = _validated_edge(
        db,
        payload.game_id,
        kind=payload.kind,
        from_node_id=payload.from_node_id,
        to_node_id=payload.to_node_id,
        title=payload.title,
        content=payload.content,
    )
    row = models.GameChoiceEdge(
        system_id=uuid.uuid4(),
        game_id=payload.game_id,
        kind=kind,
        from_node_id=payload.from_node_id,
        to_node_id=payload.to_node_id,
        title=title,
        content=content,
        sort_index=payload.sort_index or 0,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch(
    "/edges/{edge_id}",
    response_model=schemas.GameChoiceEdgeResponse,
    summary="Update Edge",
)
def update_edge(
    edge_id: str,
    payload: schemas.GameChoiceEdgeUpdate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Changes only the fields sent, then validates the merged row as a new one.
    `to_node_id: null` clears a branch's next part. A branch may switch
    between choice and condition; a branch never becomes a link, nor a link a
    branch.
    """
    row = _get_edge_or_404(db, edge_id)
    _require_game(db, admin, row.game_id)
    data = payload.model_dump(exclude_unset=True)
    kind = data.get("kind", row.kind)
    if kind != row.kind and not (kind in BRANCH_KINDS and row.kind in BRANCH_KINDS):
        raise HTTPException(
            status_code=422,
            detail="An edge may only switch between choice and condition.",
        )
    to_node_id = data["to_node_id"] if "to_node_id" in data else row.to_node_id
    kind, title, content = _validated_edge(
        db,
        row.game_id,
        kind=kind,
        from_node_id=row.from_node_id,
        to_node_id=to_node_id,
        title=data["title"] if "title" in data else row.title,
        content=data["content"] if "content" in data else row.content,
    )
    row.kind, row.to_node_id, row.title, row.content = kind, to_node_id, title, content
    if "sort_index" in data:
        row.sort_index = data["sort_index"] or 0
    db.commit()
    db.refresh(row)
    return row


@router.post(
    "/edges/{edge_id}/next",
    response_model=schemas.GameChoiceNextResponse,
    status_code=201,
    summary="Create The Next Block Of A Branch",
)
def create_next(
    edge_id: str,
    payload: schemas.GameChoiceNextCreate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Creates a new block in the branch's game and points the branch at it, in
    one transaction. The block goes after every block already in the game.
    A link always leads somewhere already (422); so may a branch (409).
    """
    edge = _get_edge_or_404(db, edge_id)
    _require_game(db, admin, edge.game_id)
    if edge.kind == LINK_KIND:
        raise HTTPException(
            status_code=422, detail="Only a branch takes a next block, not a link."
        )
    if edge.to_node_id is not None:
        raise HTTPException(
            status_code=409, detail="This branch already leads to a block."
        )
    last = (
        db.query(func.max(models.GameChoiceNode.sort_index))
        .filter(models.GameChoiceNode.game_id == edge.game_id)
        .scalar()
    )
    node = models.GameChoiceNode(
        system_id=uuid.uuid4(),
        game_id=edge.game_id,
        kind=_validate_kind(payload.kind),
        title=_validate_title(payload.title),
        content=_blank_to_none(payload.content),
        sort_index=0 if last is None else last + 1,
    )
    db.add(node)
    # The block must exist before the branch's foreign key names it.
    db.flush()
    edge.to_node_id = node.system_id
    db.commit()
    db.refresh(node)
    db.refresh(edge)
    return {"node": node, "edge": edge}


@router.delete(
    "/edges/{edge_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Edge",
)
def delete_edge(
    edge_id: str,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """Removes one edge and its marks. The blocks it joins are untouched."""
    row = _get_edge_or_404(db, edge_id)
    _require_game(db, admin, row.game_id)
    log_deleted_record(db, row, "Game Choice Edge")
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ==========================================
# MARKS (personal)
# ==========================================


@router.put(
    "/nodes/{node_id}/mark",
    response_model=schemas.GameChoiceMarkResponse,
    summary="Mark A Node",
)
def mark_node(
    node_id: str,
    payload: schemas.GameChoiceMarkWrite,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    Sets the viewer's own mark on one node. Not done and no note removes it,
    and the response then carries `id: null`.
    """
    _authorize_mark(viewer)
    node = _get_node_or_404(db, node_id)
    _require_game(db, viewer, node.game_id)
    row = write_mark(
        db,
        viewer.user_id,
        node.game_id,
        node_id=node.system_id,
        done=payload.done,
        note=payload.note,
    )
    db.commit()
    if row is not None:
        db.refresh(row)
    return _mark_response(row, node_id=node.system_id)


@router.put(
    "/edges/{edge_id}/mark",
    response_model=schemas.GameChoiceMarkResponse,
    summary="Mark An Edge",
)
def mark_edge(
    edge_id: str,
    payload: schemas.GameChoiceMarkWrite,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    The same as marking a node, for one branch. A link is only the arrow
    between two blocks, so it takes no mark (422).
    """
    _authorize_mark(viewer)
    edge = _get_edge_or_404(db, edge_id)
    _require_game(db, viewer, edge.game_id)
    if edge.kind == LINK_KIND:
        raise HTTPException(
            status_code=422, detail="Only blocks and branches can be marked."
        )
    row = write_mark(
        db,
        viewer.user_id,
        edge.game_id,
        edge_id=edge.system_id,
        done=payload.done,
        note=payload.note,
    )
    db.commit()
    if row is not None:
        db.refresh(row)
    return _mark_response(row, edge_id=edge.system_id)
