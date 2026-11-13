"""
The access modes' admin surface.

An access mode is a named ceiling on which OBJECTS a session may reach. The
four modes, their order and what each shows are fixed in code
(services/rbac/seed_modes.py, services/rbac/labels.py); this router reads
them and edits the adjustable parts - a mode's name, description and display
order. There is no route that creates, deletes or regrants a mode.

Everything here is `admin.authz`: this is the authorization surface, and a
`super` manages the catalogue and is deliberately refused.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.rbac import cache
from app.services.rbac.labels import labels_shown_in
from app.services.rbac.resolver import require_admin_authz
from app.services.rbac.seed_modes import (
    MODE_ORDER,
    MODE_UNRESTRICTED,
    field_groups_shown_in,
    mode_rank,
)

router = APIRouter(
    prefix="/api/access-modes",
    tags=["Access Modes"],
    dependencies=[Depends(require_admin_authz)],
)


def _get_or_404(db: Session, mode_id: UUID) -> models.AccessMode:
    row = db.get(models.AccessMode, mode_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Access mode not found.")
    return row


def _label_keys(db: Session, mode: models.AccessMode) -> List[str]:
    """The same answer cache.mode_sets resolves: `unrestricted` shows every
    label row, a row the code does not name included; the rest what the code
    says."""
    if mode.key == MODE_UNRESTRICTED:
        return [
            key
            for (key,) in db.query(models.ContentLabel.key).order_by(
                models.ContentLabel.sort_order, models.ContentLabel.key
            )
        ]
    return list(labels_shown_in(mode.key))


def _to_response(db: Session, mode: models.AccessMode) -> schemas.AccessModeResponse:
    """What the mode shows is DERIVED from its key - the same derivation
    cache.mode_sets resolves with - so the page cannot show an admin a set
    that differs from what a session in the mode gets."""
    return schemas.AccessModeResponse(
        system_id=mode.system_id,
        key=mode.key,
        label=mode.label,
        description=mode.description,
        sort_order=mode.sort_order,
        is_system=mode.is_system,
        label_keys=_label_keys(db, mode),
        field_group_keys=list(field_groups_shown_in(mode.key)),
        user_count=_accounts_reaching(db, mode),
        rank=mode_rank(mode.key),
    )


def _accounts_reaching(db: Session, mode: models.AccessMode) -> int:
    """How many accounts may use this mode: those whose ceiling ranks at or
    above it. Zero for a key with no rank, which no ceiling reaches."""
    rank = mode_rank(mode.key)
    if rank is None:
        return 0
    return (
        db.query(models.User)
        .filter(models.User.mode_ceiling.in_(MODE_ORDER[rank:]))
        .count()
    )


@router.get("/", response_model=List[schemas.AccessModeResponse])
def list_modes(db: Session = Depends(get_db)):
    modes = (
        db.query(models.AccessMode)
        .order_by(models.AccessMode.sort_order, models.AccessMode.key)
        .all()
    )
    return [_to_response(db, mode) for mode in modes]


@router.get("/{mode_id}", response_model=schemas.AccessModeResponse)
def get_mode(mode_id: UUID, db: Session = Depends(get_db)):
    return _to_response(db, _get_or_404(db, mode_id))


@router.patch("/{mode_id}", response_model=schemas.AccessModeResponse)
def update_mode(
    mode_id: UUID, payload: schemas.AccessModeUpdate, db: Session = Depends(get_db)
):
    mode = _get_or_404(db, mode_id)
    for field in ("label", "description", "sort_order"):
        value = getattr(payload, field)
        if value is not None:
            setattr(mode, field, value)
    db.commit()
    cache.bump()
    return _to_response(db, mode)
