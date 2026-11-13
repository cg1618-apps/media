"""
routers/content_labels.py
The label reference, and which entries and franchises carry which labels.

Labels are defined in app/services/rbac/labels.py, with the lowest mode that
shows each; there is no route that creates, renames or deletes one. What this
router serves:

  reference   GET /. Every label, what it marks, which modes show it, which
              label it also carries, and how many entries and franchises
              carry it. Read by `admin.authz` or `manage.catalog`: the admin
              reads it to see what a restriction does, super because super is
              the one attaching labels, and the Add/Modify picker draws from
              it.
  assignment  `manage.catalog`. Putting a label on an entry or a franchise is
              a catalogue edit, submitted by the Add and Modify forms along
              with the rest of the entry.

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
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.domain.content_labels import (
    label_keys_for_entry,
    label_keys_for_franchise,
)
from app.services.domain.gated_labels import (
    refuse_label_removal_on_entry,
    refuse_label_removal_on_franchise,
)
from app.services.rbac.enforcement import entry_visible, franchise_visible
from app.services.rbac.labels import label_by_key, modes_showing
from app.services.rbac.permissions import PERM_ADMIN_AUTHZ, PERM_MANAGE_CATALOG
from app.services.rbac.resolver import (
    Viewer,
    get_viewer,
    require_manage_catalog,
)
from app.services.rbac.seed_modes import MODE_UNRESTRICTED
from app.utils.media_resolver import MEDIA_TABLES

logger = logging.getLogger(__name__)

# The label every other label also carries.
NSFW = "nsfw"

# No router-level dependency: the two halves below are gated differently, and
# a blanket one here is what shut `super` out of the assignment routes. Each
# route names its own gate, so grepping for either permission finds every
# route that holds it.
router = APIRouter(prefix="/api/content-labels", tags=["Content Labels"])


def _to_response(
    row: models.ContentLabel, counts: dict[UUID, tuple[int, int]]
) -> schemas.ContentLabelResponse:
    """One row of the reference. Which modes show the label, and which label it
    also carries, are generated from the code rule rather than written as
    prose anywhere, so they cannot drift from it."""
    definition = label_by_key(row.key)
    entries, franchises = counts.get(row.system_id, (0, 0))
    return schemas.ContentLabelResponse(
        system_id=row.system_id,
        key=row.key,
        label=row.label,
        description=row.description,
        sort_order=row.sort_order,
        lowest_mode=definition.lowest_mode if definition else None,
        modes=list(modes_showing(row.key)) if definition else [MODE_UNRESTRICTED],
        also_carries=[] if row.key == NSFW else [NSFW],
        entry_count=entries,
        franchise_count=franchises,
    )


def _counts(db: Session) -> dict[UUID, tuple[int, int]]:
    """{label id: (entries carrying it, franchises carrying it)}, two queries."""
    entries = dict(
        db.query(models.MediaContentLabel.label_id, func.count())
        .group_by(models.MediaContentLabel.label_id)
        .all()
    )
    franchises = dict(
        db.query(models.FranchiseContentLabel.label_id, func.count())
        .group_by(models.FranchiseContentLabel.label_id)
        .all()
    )
    return {
        label_id: (entries.get(label_id, 0), franchises.get(label_id, 0))
        for label_id in set(entries) | set(franchises)
    }


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
    summary="The Label Reference",
)
def list_labels(
    db: Session = Depends(get_db),
    actor=Depends(require_label_reader),
):
    """Every label, what it marks, which modes show it and how many entries and
    franchises carry it. Read-only: labels are defined in
    app/services/rbac/labels.py, and there is no route that creates, renames or
    deletes one."""
    rows = (
        db.query(models.ContentLabel)
        .order_by(models.ContentLabel.sort_order, models.ContentLabel.key)
        .all()
    )
    counts = _counts(db)
    return [_to_response(row, counts) for row in rows]


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
    # Before anything is deleted: a gated entry keeps its required label.
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
    # A franchise of a gated type keeps that type's label, for the same
    # reason (H-Comic keeps h-comic, Hentai keeps hentai).
    refuse_label_removal_on_franchise(db, franchise_id, payload.label_keys)
    return _replace_labels(
        db,
        models.FranchiseContentLabel,
        models.FranchiseContentLabel.franchise_id,
        {"franchise_id": franchise_id},
        franchise_id,
        payload,
    )
