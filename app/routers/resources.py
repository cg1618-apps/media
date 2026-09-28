"""
routers/resources.py
The Resources page: one site-wide tree of groups and items (links, plain
text, text with inline links). Reads follow the Quote page's gate; writes need
`manage.catalog`.

The tree is stored flat - one `resource_node` row per node, each naming its
parent - and assembled here on every read. It is one page for the whole site,
small by nature, so reading every row and nesting them in Python is simpler
than a recursive query and costs nothing measurable.
"""

import logging
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_taipei_now
from app.dependencies import get_db
from app.services.rbac.resolver import Viewer, get_viewer, require_manage_catalog
from app.utils.data_control_utils import log_deleted_record

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/resources", tags=["Resources"])

KIND_GROUP = "group"
KIND_ITEM = "item"


# ==========================================
# HELPERS
# ==========================================


def _get_or_404(db: Session, node_id) -> models.ResourceNode:
    node = (
        db.query(models.ResourceNode)
        .filter(models.ResourceNode.system_id == node_id)
        .first()
    )
    if node is None:
        raise HTTPException(status_code=404, detail="Resource not found.")
    return node


def _parse_id(node_id: str) -> uuid.UUID:
    """A malformed id names no node, so it is a 404 rather than a 500."""
    try:
        return uuid.UUID(str(node_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="Resource not found.")


def _blank(value: Optional[str]) -> bool:
    return value is None or not value.strip()


def _validate_shape(kind: str, title: Optional[str], content: Optional[str]) -> None:
    """
    What a node of each kind must carry. Mirrors the table's CHECKs so a bad
    payload is a 422 naming the problem, not an IntegrityError at commit.
    """
    if kind == KIND_GROUP:
        if _blank(title):
            raise HTTPException(status_code=422, detail="A group needs a title.")
        if content is not None:
            raise HTTPException(status_code=422, detail="A group has no content.")
    elif _blank(content):
        raise HTTPException(status_code=422, detail="An item needs content.")


def _require_group(db: Session, parent_id) -> None:
    """A parent, when named, must exist and must be a group."""
    if parent_id is None:
        return
    parent = (
        db.query(models.ResourceNode)
        .filter(models.ResourceNode.system_id == parent_id)
        .first()
    )
    if parent is None:
        raise HTTPException(status_code=422, detail="Parent does not exist.")
    if parent.kind != KIND_GROUP:
        raise HTTPException(status_code=422, detail="Parent must be a group.")


def _children_of(parent_id):
    """The filter selecting one parent's children; None is the top level."""
    if parent_id is None:
        return models.ResourceNode.parent_id.is_(None)
    return models.ResourceNode.parent_id == parent_id


def _next_sort_index(db: Session, parent_id) -> float:
    """One past the last sibling, so a new node lands at the end."""
    highest = (
        db.query(func.max(models.ResourceNode.sort_index))
        .filter(_children_of(parent_id))
        .scalar()
    )
    return 0.0 if highest is None else float(highest) + 1.0


def _sort_key(node: models.ResourceNode):
    # A NULL sort_index (a hand-edited sheet row) sinks to the end of its
    # siblings rather than failing the comparison; created_at breaks ties.
    return (
        node.sort_index is None,
        node.sort_index or 0.0,
        node.created_at or datetime.min,
    )


def _build_tree(rows: List[models.ResourceNode]) -> List[schemas.ResourceNodeResponse]:
    """Nest flat rows under their parents, each level sorted by sort_index."""
    children_of: dict = {}
    for row in rows:
        children_of.setdefault(row.parent_id, []).append(row)

    def build(parent_id) -> List[schemas.ResourceNodeResponse]:
        return [
            schemas.ResourceNodeResponse(
                **_flat(row).model_dump(exclude={"children"}),
                children=build(row.system_id),
            )
            for row in sorted(children_of.get(parent_id, []), key=_sort_key)
        ]

    return build(None)


def _flat(node: models.ResourceNode) -> schemas.ResourceNodeResponse:
    """One node with no children attached - the shape every write returns."""
    return schemas.ResourceNodeResponse(
        system_id=node.system_id,
        parent_id=node.parent_id,
        kind=node.kind,
        title=node.title,
        content=node.content,
        sort_index=node.sort_index,
        created_at=node.created_at,
        updated_at=node.updated_at,
        children=[],
    )


def _ancestors(db: Session, node_id) -> set:
    """Every id from `node_id` up to the root, `node_id` included."""
    parent_of = dict(
        db.query(models.ResourceNode.system_id, models.ResourceNode.parent_id).all()
    )
    seen = set()
    current = node_id
    while current is not None and current not in seen:
        seen.add(current)
        current = parent_of.get(current)
    return seen


# ==========================================
# READ
# ==========================================


@router.get(
    "", response_model=List[schemas.ResourceNodeResponse], summary="Get Resources"
)
def get_resources(
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """The whole page as a tree: top-level nodes, each with its children."""
    return _build_tree(db.query(models.ResourceNode).all())


# ==========================================
# WRITES (manage.catalog)
# ==========================================


@router.post(
    "",
    response_model=schemas.ResourceNodeResponse,
    status_code=201,
    summary="Create Resource Node",
)
def create_resource(
    payload: schemas.ResourceNodeCreate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """Creates a group or an item at the end of its parent's children."""
    _validate_shape(payload.kind, payload.title, payload.content)
    _require_group(db, payload.parent_id)
    now = get_taipei_now()
    node = models.ResourceNode(
        system_id=uuid.uuid4(),
        parent_id=payload.parent_id,
        kind=payload.kind,
        title=payload.title,
        content=payload.content,
        sort_index=_next_sort_index(db, payload.parent_id),
        created_at=now,
        updated_at=now,
    )
    db.add(node)
    db.commit()
    db.refresh(node)
    return _flat(node)


# Declared before "/{system_id}" on purpose: FastAPI matches in declaration
# order, so the dynamic route would otherwise swallow "reorder" as an id.
@router.patch("/reorder", summary="Reorder or Move Resource Nodes")
def reorder_resources(
    payload: schemas.ResourceReorder,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Sets the complete order of one parent's children.

    Every listed node is moved under `parent_id` and given its position as
    sort_index, so this one call both reorders siblings and moves a node into
    another group. The list must name every node already under that parent -
    a partial list would leave the unnamed ones interleaved at stale indexes,
    so it is refused rather than half-applied.
    """
    ordered = payload.ordered_ids
    if len(set(ordered)) != len(ordered):
        raise HTTPException(status_code=422, detail="ordered_ids has duplicates.")
    _require_group(db, payload.parent_id)

    nodes = (
        db.query(models.ResourceNode)
        .filter(models.ResourceNode.system_id.in_(ordered))
        .all()
        if ordered
        else []
    )
    by_id = {node.system_id: node for node in nodes}
    unknown = [str(i) for i in ordered if i not in by_id]
    if unknown:
        raise HTTPException(
            status_code=422, detail=f"Unknown resource ids: {', '.join(unknown)}."
        )

    current_children = {
        row.system_id
        for row in db.query(models.ResourceNode.system_id).filter(
            _children_of(payload.parent_id)
        )
    }
    missing = current_children - set(ordered)
    if missing:
        raise HTTPException(
            status_code=422,
            detail="ordered_ids must name every node already under this parent.",
        )

    # A group cannot move into itself or anything below it: the target's
    # ancestor chain must not contain any group being moved.
    if payload.parent_id is not None:
        chain = _ancestors(db, payload.parent_id)
        if chain & set(ordered):
            raise HTTPException(
                status_code=422,
                detail="A group cannot be moved inside itself.",
            )

    now = get_taipei_now()
    for position, node_id in enumerate(ordered):
        node = by_id[node_id]
        if node.parent_id != payload.parent_id:
            node.parent_id = payload.parent_id
            node.updated_at = now
        node.sort_index = float(position)
    db.commit()
    return {"status": "success", "reordered": len(ordered)}


@router.patch(
    "/{system_id}",
    response_model=schemas.ResourceNodeResponse,
    summary="Update Resource Node",
)
def update_resource(
    system_id: str,
    payload: schemas.ResourceNodeUpdate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """Edits a node's title and/or content. Kind and parent stay as they are."""
    node = _get_or_404(db, _parse_id(system_id))
    data = payload.model_dump(exclude_unset=True)
    # Validate the node as it WILL be before touching it, so autoflush cannot
    # write a half-validated row into the open transaction.
    _validate_shape(
        node.kind,
        data.get("title", node.title),
        data.get("content", node.content),
    )
    for key, value in data.items():
        setattr(node, key, value)
    node.updated_at = get_taipei_now()
    db.commit()
    db.refresh(node)
    return _flat(node)


@router.delete("/{system_id}", summary="Delete Resource Node")
def delete_resource(
    system_id: str,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Permanently deletes a node. A group takes everything under it with it -
    the parent_id foreign key cascades - so one call removes a whole subtree.
    """
    node = _get_or_404(db, _parse_id(system_id))

    # Stage the deleted record log before actually deleting
    log_deleted_record(db, node, "Resource")

    db.delete(node)
    db.commit()

    return {"status": "success", "message": "Resource deleted successfully."}
