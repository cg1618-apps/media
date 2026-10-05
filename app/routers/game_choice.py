"""
routers/game_choice.py
Handles the game choice graph - one shared graph of points and options per
game or h-game, and each user's personal marks on it.

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
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.models.game_choice import NODE_KINDS
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
    Removes the node. Its edges and every mark on it go by foreign key; every
    save sitting on it loses its `choice_node`, in the same transaction.
    """
    row = _get_node_or_404(db, node_id)
    _require_game(db, admin, row.game_id)
    edges = (
        db.query(models.GameChoiceEdge)
        .filter(
            (models.GameChoiceEdge.from_node_id == row.system_id)
            | (models.GameChoiceEdge.to_node_id == row.system_id)
        )
        .all()
    )
    # Neither call commits: the single commit below covers the log, the save
    # links and the delete together.
    for edge in edges:
        log_deleted_record(db, edge, "Game Choice Edge")
    log_deleted_record(db, row, "Game Choice Node")
    clear_save_links(db, row.system_id)
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
    Draws one option from a node to another of the same game. Rejoining and
    cycles are allowed; a self-loop is not.
    """
    _require_game(db, admin, payload.game_id)
    if payload.from_node_id == payload.to_node_id:
        raise HTTPException(
            status_code=422, detail="An option cannot lead back to its own node."
        )
    # 422, not 404: the missing thing is a value in the payload, and the edge's
    # game_id is denormalised, so both ends must belong to the game it names.
    for end in (payload.from_node_id, payload.to_node_id):
        if node_of_game(db, end, payload.game_id) is None:
            raise HTTPException(
                status_code=422,
                detail="Both ends of an option must be nodes of the same game.",
            )
    row = models.GameChoiceEdge(
        system_id=uuid.uuid4(),
        game_id=payload.game_id,
        from_node_id=payload.from_node_id,
        to_node_id=payload.to_node_id,
        option=_blank_to_none(payload.option),
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
    """The option text and the order only; repointing is delete and redraw."""
    row = _get_edge_or_404(db, edge_id)
    _require_game(db, admin, row.game_id)
    data = payload.model_dump(exclude_unset=True)
    if "option" in data:
        row.option = _blank_to_none(data["option"])
    if "sort_index" in data:
        row.sort_index = data["sort_index"] or 0
    db.commit()
    db.refresh(row)
    return row


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
    """Removes one option and its marks. The two nodes are untouched."""
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
    """The same as marking a node, for one option."""
    _authorize_mark(viewer)
    edge = _get_edge_or_404(db, edge_id)
    _require_game(db, viewer, edge.game_id)
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
