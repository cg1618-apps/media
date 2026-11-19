"""
routers/needs_work.py
待補充 Needs Work: mark an entry or a group as not complete yet, and the page
that lists every mark grouped by its note.

One gate for every route, at router level: `manage.requests`
(require_handle_requests), the permission whoever handles incomplete-data
reports holds - only the `super` and `admin` roles. 401 when refused, the
one error shape the SPA knows.

The rules themselves live in app/services/domain/needs_work.py.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app import schemas
from app.dependencies import get_db
from app.services.domain import needs_work as service
from app.services.rbac.resolver import require_handle_requests

router = APIRouter(
    prefix="/api/needs-work",
    tags=["Needs Work"],
    dependencies=[Depends(require_handle_requests)],
)


def _mark_out(owner_type: str, owner_id: UUID, row) -> schemas.NeedsWorkMark:
    if row is None:
        return schemas.NeedsWorkMark(
            owner_type=owner_type, owner_id=owner_id, flagged=False
        )
    return schemas.NeedsWorkMark(
        owner_type=owner_type,
        owner_id=owner_id,
        flagged=True,
        note=row.note,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=List[schemas.NeedsWorkGroup], summary="Needs Work")
def list_needs_work(db: Session = Depends(get_db)):
    """Every mark, grouped by note; the unnoted group last."""
    return service.grouped(db)


@router.get(
    "/{owner_type}/{owner_id}",
    response_model=schemas.NeedsWorkMark,
    summary="One owner's mark",
)
def get_mark(owner_type: str, owner_id: UUID, db: Session = Depends(get_db)):
    try:
        service.require_owner(db, owner_type, owner_id)
    except service.OwnerNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return _mark_out(owner_type, owner_id, service.get_mark(db, owner_type, owner_id))


@router.put(
    "/{owner_type}/{owner_id}",
    response_model=schemas.NeedsWorkMark,
    summary="Mark an owner as needing work",
)
def put_mark(
    owner_type: str,
    owner_id: UUID,
    payload: schemas.NeedsWorkWrite,
    db: Session = Depends(get_db),
):
    """Mark the owner, or change its note. Idempotent."""
    try:
        row = service.set_mark(db, owner_type, owner_id, payload.note)
    except service.OwnerNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return _mark_out(owner_type, owner_id, row)


@router.delete(
    "/{owner_type}/{owner_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Clear an owner's mark",
)
def delete_mark(owner_type: str, owner_id: UUID, db: Session = Depends(get_db)):
    try:
        service.clear_mark(db, owner_type, owner_id)
    except service.OwnerNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
