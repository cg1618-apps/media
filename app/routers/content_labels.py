"""
routers/content_labels.py
The content-label vocabulary, and which entries and franchises carry which
labels.

Creating a label grants it to `unrestricted` and to no other mode, so a new
label immediately hides everything it is put on from everyone EXCEPT a
session sitting in the widest mode. That is the safe direction in the only
place it can be: a label exists to restrict, so it restricts until an admin
decides who else may see through it - but "everybody, the owner included" is
not a safe default, it is an entry that has silently vanished.

TWO GATES, NOT ONE, and the split is the whole reason this module does not
carry a router-level dependency any more.

  vocabulary  `admin.authz`. Minting, renaming or deleting a label changes
              WHO MAY SEE WHAT across the whole installation, which is the
              definition of that permission.
  assignment  `manage.catalog`. Putting an existing label on an entry or a
              franchise is a catalogue edit: it is submitted by the Add and
              Modify forms along with the rest of the entry, and it decides
              nothing about who holds what - only which shelf this one thing
              sits on.

The split exists because the `super` role is locked OFF admin.authz by
construction (permissions.locked_permissions) and locked ON everything else,
so while the whole router was gated on admin.authz a `super` account could
save an entry and then watch only its labels fail. Widening `super` instead
would have deleted the distinction between it and root.

Assignment replaces the whole set, structurally identical to
credits.py::replace_credits, because that is how the Add/Modify forms submit.
A franchise's set is the same call against a different join table - and it
CASCADES to that franchise's entries at read time, see
services/rbac/enforcement.py.
"""

import logging
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.domain.content_labels import (
    label_keys_for_entry,
    label_keys_for_franchise,
)
from app.services.domain.h_comic import (
    refuse_label_removal_on_entry,
    refuse_label_removal_on_franchise,
)
from app.services.rbac import cache
from app.services.rbac.enforcement import entry_visible, franchise_visible
from app.services.rbac.gated_types import required_label_keys
from app.services.rbac.permissions import PERM_ADMIN_AUTHZ, PERM_MANAGE_CATALOG
from app.services.rbac.resolver import (
    Viewer,
    get_viewer,
    require_admin_authz,
    require_manage_catalog,
)
from app.services.rbac.seed_modes import MODE_UNRESTRICTED
from app.utils.media_resolver import MEDIA_TABLES

logger = logging.getLogger(__name__)

# No router-level dependency: the two halves below are gated differently, and
# a blanket one here is what shut `super` out of the assignment routes. Each
# route names its own gate, so grepping for either permission finds every
# route that holds it.
router = APIRouter(prefix="/api/content-labels", tags=["Content Labels"])


def _to_response(row: models.ContentLabel) -> schemas.ContentLabelResponse:
    return schemas.ContentLabelResponse(
        system_id=row.system_id,
        key=row.key,
        label=row.label,
        description=row.description,
        sort_order=row.sort_order,
    )


def _get_or_404(db: Session, label_id: UUID) -> models.ContentLabel:
    row = db.get(models.ContentLabel, label_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Content label not found.")
    return row


def _grant_to_unrestricted(db: Session, label: models.ContentLabel) -> None:
    """Give a new label to `unrestricted`, and to no other mode.

    Belt to cache.mode_sets's braces. That function DERIVES the unrestricted
    set, so resolution is already correct without this row; what this keeps
    correct is the table, which is what /access-modes and anything else
    reading the rows will see. Every other mode is left alone deliberately:
    a label exists to restrict, so it restricts everywhere except the mode
    whose meaning is "no restrictions".
    """
    mode = (
        db.query(models.AccessMode)
        .filter(models.AccessMode.key == MODE_UNRESTRICTED)
        .first()
    )
    if mode is None:
        # A database seeded before the modes existed, or mid-migration. The
        # derivation covers it either way.
        return
    db.add(
        models.AccessModeLabel(mode_id=mode.system_id, label_id=label.system_id)
    )


def require_label_reader(viewer: Viewer = Depends(get_viewer)) -> Viewer:
    """
    EITHER gate may read the vocabulary.

    The list is two different screens: the admin page that administers the
    labels (admin.authz) and the checkbox picker on the Add/Modify forms
    (manage.catalog). Spelling the disjunction out rather than picking the
    wider of the two keeps it true if locked_permissions ever stops implying
    that an admin.authz holder is root.
    """
    if viewer.has(PERM_ADMIN_AUTHZ) or viewer.has(PERM_MANAGE_CATALOG):
        return viewer
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials or insufficient permissions",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _resolve_entry(db: Session, media_type: str, entry_id: UUID, viewer):
    """
    Validate the type first, so an unknown one is a 400 not a KeyError.

    Then the SAME visibility gate a read would apply. Assignment is
    `manage.catalog`, which says nothing about which objects a session
    reaches, so without this a narrowed editor who knew the id could clear the
    very label that was hiding the entry from them. A hidden entry answers as
    a missing one, in the words this router already uses for missing.
    """
    if media_type not in MEDIA_TABLES:
        raise HTTPException(status_code=400, detail=f"Unknown media type: {media_type}")
    entry = db.get(MEDIA_TABLES[media_type].model, entry_id)
    if entry is None or not entry_visible(db, viewer, media_type, entry_id):
        raise HTTPException(status_code=404, detail="Entry not found.")
    return entry


def _replace_labels(
    db: Session,
    join_model,
    owner_column,
    owner_kwargs: dict,
    owner_id: UUID,
    payload: schemas.EntryLabels,
) -> List[str]:
    """
    Replace one owner's whole label set, whichever join table holds it.

    Whole-set replace rather than add/remove, because that is how the forms
    submit - the same shape as credits.py::replace_credits. An unknown key is
    a 422 BEFORE anything is deleted, so a typo cannot clear a set and then
    fail to refill it.
    """
    wanted = sorted(set(payload.label_keys))
    rows = (
        db.query(models.ContentLabel)
        .filter(models.ContentLabel.key.in_(wanted))
        .all()
        if wanted
        else []
    )
    found = {row.key: row.system_id for row in rows}
    unknown = [key for key in wanted if key not in found]
    if unknown:
        raise HTTPException(
            status_code=422, detail=f"Unknown label(s): {', '.join(unknown)}"
        )

    db.query(join_model).filter(owner_column == owner_id).delete(
        synchronize_session=False
    )
    for position, key in enumerate(wanted):
        db.add(join_model(label_id=found[key], position=position, **owner_kwargs))
    db.commit()
    return wanted


# ==========================================
# VOCABULARY
# ==========================================


@router.get(
    "/",
    response_model=List[schemas.ContentLabelResponse],
    summary="List Labels",
)
def list_labels(
    db: Session = Depends(get_db),
    actor=Depends(require_label_reader),
):
    rows = (
        db.query(models.ContentLabel)
        .order_by(models.ContentLabel.sort_order, models.ContentLabel.key)
        .all()
    )
    return [_to_response(row) for row in rows]


@router.post(
    "/",
    response_model=schemas.ContentLabelResponse,
    status_code=201,
    summary="Create Label",
)
def create_label(
    payload: schemas.ContentLabelCreate,
    db: Session = Depends(get_db),
    actor=Depends(require_admin_authz),
):
    if (
        db.query(models.ContentLabel)
        .filter(models.ContentLabel.key == payload.key)
        .first()
    ):
        raise HTTPException(status_code=409, detail="That label key exists.")
    row = models.ContentLabel(
        key=payload.key,
        label=payload.label,
        description=payload.description,
        sort_order=payload.sort_order,
    )
    db.add(row)
    db.flush()
    _grant_to_unrestricted(db, row)
    db.commit()
    db.refresh(row)
    # The catalog just grew, so any cached "unknown permission" answer is stale.
    cache.bump()
    return _to_response(row)


@router.patch(
    "/{label_id}",
    response_model=schemas.ContentLabelResponse,
    summary="Update Label",
)
def update_label(
    label_id: UUID,
    payload: schemas.ContentLabelUpdate,
    db: Session = Depends(get_db),
    actor=Depends(require_admin_authz),
):
    row = _get_or_404(db, label_id)
    # `key` is deliberately absent: it is half of a permission name that roles
    # already hold, so renaming it would silently void every grant.
    for field in ("label", "description", "sort_order"):
        value = getattr(payload, field)
        if value is not None:
            setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.delete("/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_label(
    label_id: UUID,
    db: Session = Depends(get_db),
    actor=Depends(require_admin_authz),
):
    """Deleting a label reveals every entry that carried it - by design.

    Except a label a gated type REQUIRES: deleting it would publish every
    entry of that type at once, and the next write would only mint it again.
    That is a 409 - the label exists and is in use by the system.
    """
    row = _get_or_404(db, label_id)
    if row.key in required_label_keys():
        raise HTTPException(
            status_code=409,
            detail=f"The '{row.key}' label is required by a media type and cannot be deleted.",
        )
    db.delete(row)
    db.commit()
    cache.bump()
    return None


# ==========================================
# ENTRY ASSIGNMENT
# ==========================================


@router.get(
    "/entry/{media_type}/{entry_id}",
    response_model=List[str],
    summary="Get an Entry's Labels",
)
def get_entry_labels(
    media_type: str,
    entry_id: UUID,
    db: Session = Depends(get_db),
    actor: Viewer = Depends(require_manage_catalog),
):
    _resolve_entry(db, media_type, entry_id, actor)
    return label_keys_for_entry(db, entry_id)


@router.put(
    "/entry/{media_type}/{entry_id}",
    response_model=List[str],
    summary="Replace an Entry's Labels",
)
def replace_entry_labels(
    media_type: str,
    entry_id: UUID,
    payload: schemas.EntryLabels,
    db: Session = Depends(get_db),
    actor: Viewer = Depends(require_manage_catalog),
):
    _resolve_entry(db, media_type, entry_id, actor)
    # Before anything is deleted: an h-comic keeps its required label.
    refuse_label_removal_on_entry(db, media_type, entry_id, payload.label_keys)
    return _replace_labels(
        db,
        models.MediaContentLabel,
        models.MediaContentLabel.media_id,
        {"media_id": entry_id},
        entry_id,
        payload,
    )


# ==========================================
# FRANCHISE ASSIGNMENT
# ==========================================


def _resolve_franchise(db: Session, franchise_id: UUID, viewer) -> models.Franchise:
    """The franchise half of _resolve_entry, gated the same way."""
    row = db.get(models.Franchise, franchise_id)
    if row is None or not franchise_visible(db, viewer, franchise_id):
        raise HTTPException(status_code=404, detail="Franchise not found.")
    return row


@router.get(
    "/franchise/{franchise_id}",
    response_model=List[str],
    summary="Get a Franchise's Labels",
)
def get_franchise_labels(
    franchise_id: UUID,
    db: Session = Depends(get_db),
    actor: Viewer = Depends(require_manage_catalog),
):
    _resolve_franchise(db, franchise_id, actor)
    return label_keys_for_franchise(db, franchise_id)


@router.put(
    "/franchise/{franchise_id}",
    response_model=List[str],
    summary="Replace a Franchise's Labels",
)
def replace_franchise_labels(
    franchise_id: UUID,
    payload: schemas.EntryLabels,
    db: Session = Depends(get_db),
    actor: Viewer = Depends(require_manage_catalog),
):
    """
    A franchise's labels hide the franchise AND every entry under it.

    Nothing is written onto those entries: the cascade is a read-time join
    through media.franchise_id (services/rbac/enforcement.py), so an entry
    moved out of the franchise stops being hidden by it at once, and clearing
    the set here reveals everything it covered.
    """
    _resolve_franchise(db, franchise_id, actor)
    # An H-Comic franchise keeps the h-comic label, for the same reason.
    refuse_label_removal_on_franchise(db, franchise_id, payload.label_keys)
    return _replace_labels(
        db,
        models.FranchiseContentLabel,
        models.FranchiseContentLabel.franchise_id,
        {"franchise_id": franchise_id},
        franchise_id,
        payload,
    )
