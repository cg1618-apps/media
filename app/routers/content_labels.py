"""
routers/content_labels.py
The label reference, and which entries and groups carry which labels.

Labels are defined in app/services/rbac/labels.py, with the lowest mode that
shows each; there is no route that creates, renames or deletes one. What this
router serves:

  reference   GET /. Every label, what it marks, which modes show it, which
              label it also carries, and how many entries, collections,
              franchises and series carry it. Read by `admin.authz` or `manage.catalog`: the admin
              reads it to see what a restriction does, super because super is
              the one attaching labels, and the Add/Modify picker draws from
              it.
  assignment  `manage.catalog`. Putting a label on an entry or a group
              (collection, franchise, series) is a catalogue edit, submitted
              by the Add and Modify forms along with the rest of the record.

Assignment replaces the whole set, structurally identical to
credits.py::replace_credits, because that is how the Add/Modify forms submit.
A group's set is the same call against a different join table - and it
CASCADES down the tree at read time (a collection to its franchises, their
series and entries; a franchise to its series and entries; a series to its
entries), see services/rbac/enforcement.py.
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
    GROUP_LABEL_TABLES,
    label_keys_for_entry,
    label_keys_for_group,
)
from app.services.domain.gated_labels import (
    refuse_label_removal_on_entry,
    refuse_label_removal_on_franchise,
)
from app.services.domain.label_rules import (
    refuse_nsfw_removal,
    with_required_labels,
)
from app.services.domain.label_tags import sync_tags_to_labels
from app.services.rbac.enforcement import (
    collection_visible,
    entry_visible,
    franchise_visible,
    series_visible,
)
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
    row: models.ContentLabel, counts: dict[str, dict[UUID, int]]
) -> schemas.ContentLabelResponse:
    """One row of the reference. Which modes show the label, and which label it
    also carries, are generated from the code rule rather than written as
    prose anywhere, so they cannot drift from it."""
    definition = label_by_key(row.key)
    return schemas.ContentLabelResponse(
        system_id=row.system_id,
        key=row.key,
        label=row.label,
        description=row.description,
        sort_order=row.sort_order,
        lowest_mode=definition.lowest_mode if definition else None,
        modes=list(modes_showing(row.key)) if definition else [MODE_UNRESTRICTED],
        also_carries=[] if row.key == NSFW else [NSFW],
        entry_count=counts["entry"].get(row.system_id, 0),
        collection_count=counts["collection"].get(row.system_id, 0),
        franchise_count=counts["franchise"].get(row.system_id, 0),
        series_count=counts["series"].get(row.system_id, 0),
    )


def _counts(db: Session) -> dict[str, dict[UUID, int]]:
    """{owner kind: {label id: how many of that kind carry it}}, one query
    per join table."""
    tables = {"entry": models.MediaContentLabel} | {
        tier: join_model for tier, (join_model, _owner) in GROUP_LABEL_TABLES.items()
    }
    return {
        kind: dict(
            db.query(join_model.label_id, func.count())
            .group_by(join_model.label_id)
            .all()
        )
        for kind, join_model in tables.items()
    }


def require_label_reader(viewer: Viewer = Depends(get_viewer)) -> Viewer:
    """
    EITHER gate may read the vocabulary.

    The list is two different screens: the admin page that administers the
    labels (admin.authz) and the checkbox picker on the Add/Modify forms
    (manage.catalog). Spelling the disjunction out rather than picking the
    wider of the two keeps both screens reachable: the admin holds
    admin.authz and not manage.catalog, super the reverse.
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
    after_write=None,
) -> List[str]:
    """
    Replace one owner's whole label set, whichever join table holds it.

    Whole-set replace rather than add/remove, because that is how the forms
    submit - the same shape as credits.py::replace_credits. An unknown key,
    and a write dropping `nsfw` while another label stays, are each a 422
    BEFORE anything is deleted, so a bad request cannot clear a set and then
    fail to refill it.
    """
    current = {
        key
        for (key,) in db.query(models.ContentLabel.key)
        .join(join_model, join_model.label_id == models.ContentLabel.system_id)
        .filter(owner_column == owner_id)
    }
    # Every other label is stored with nsfw: dropping it while one stays is
    # refused, and a first label brings it. See services/domain/label_rules.
    refuse_nsfw_removal(current, payload.label_keys)
    wanted = sorted(with_required_labels(payload.label_keys))
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
    # In the same transaction: an entry's Label tags follow its labels.
    if after_write is not None:
        after_write(wanted)
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
    """Every label, what it marks, which modes show it and how many entries
    and groups carry it. Read-only: labels are defined in
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
        # The 標籤 Label tags of nsfw, ecchi and erotica follow the set
        # (services/domain/label_tags.py), on the types with that field.
        after_write=lambda keys: sync_tags_to_labels(db, media_type, entry_id, keys),
    )


# ==========================================
# GROUP ASSIGNMENT
# ==========================================

# Per tier: the 404 word, and the visibility gate a read of it applies.
_GROUPS = {
    "collection": ("Collection", models.Collection, collection_visible),
    "franchise": ("Franchise", models.Franchise, franchise_visible),
    "series": ("Series", models.Series, series_visible),
}


def _resolve_group(db: Session, tier: str, group_id: UUID, viewer):
    """The group half of _resolve_entry, gated the same way: a group this
    session cannot see answers as a missing one."""
    word, model, visible = _GROUPS[tier]
    row = db.get(model, group_id)
    if row is None or not visible(db, viewer, group_id):
        raise HTTPException(status_code=404, detail=f"{word} not found.")
    return row


def _replace_group_labels(
    db: Session, tier: str, group_id: UUID, payload: schemas.EntryLabels
) -> List[str]:
    join_model, owner_column = GROUP_LABEL_TABLES[tier]
    return _replace_labels(
        db,
        join_model,
        owner_column,
        {owner_column.key: group_id},
        group_id,
        payload,
    )


@router.get(
    "/collection/{collection_id}",
    response_model=List[str],
    summary="Get a Collection's Labels",
)
def get_collection_labels(
    collection_id: UUID,
    db: Session = Depends(get_db),
    actor: Viewer = Depends(require_manage_catalog),
):
    _resolve_group(db, "collection", collection_id, actor)
    return label_keys_for_group(db, "collection", collection_id)


@router.put(
    "/collection/{collection_id}",
    response_model=List[str],
    summary="Replace a Collection's Labels",
)
def replace_collection_labels(
    collection_id: UUID,
    payload: schemas.EntryLabels,
    db: Session = Depends(get_db),
    actor: Viewer = Depends(require_manage_catalog),
):
    """
    A collection's labels hide the collection, every franchise in it, their
    series and every entry under them. Nothing is written onto any of those:
    the cascade is read-time, so clearing the set reveals what it covered.
    """
    _resolve_group(db, "collection", collection_id, actor)
    return _replace_group_labels(db, "collection", collection_id, payload)


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
    _resolve_group(db, "franchise", franchise_id, actor)
    return label_keys_for_group(db, "franchise", franchise_id)


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
    A franchise's labels hide the franchise, its series and every entry under
    it.

    Nothing is written onto those entries: the cascade is a read-time join
    through media.franchise_id (services/rbac/enforcement.py), so an entry
    moved out of the franchise stops being hidden by it at once, and clearing
    the set here reveals everything it covered.
    """
    _resolve_group(db, "franchise", franchise_id, actor)
    # A franchise of a gated type keeps that type's label, for the same
    # reason (H-Comic keeps h-comic, Hentai keeps hentai).
    refuse_label_removal_on_franchise(db, franchise_id, payload.label_keys)
    return _replace_group_labels(db, "franchise", franchise_id, payload)


@router.get(
    "/series/{series_id}",
    response_model=List[str],
    summary="Get a Series' Labels",
)
def get_series_labels(
    series_id: UUID,
    db: Session = Depends(get_db),
    actor: Viewer = Depends(require_manage_catalog),
):
    _resolve_group(db, "series", series_id, actor)
    return label_keys_for_group(db, "series", series_id)


@router.put(
    "/series/{series_id}",
    response_model=List[str],
    summary="Replace a Series' Labels",
)
def replace_series_labels(
    series_id: UUID,
    payload: schemas.EntryLabels,
    db: Session = Depends(get_db),
    actor: Viewer = Depends(require_manage_catalog),
):
    """A series' labels hide the series and every entry in it, read-time
    through media.series_id."""
    _resolve_group(db, "series", series_id, actor)
    return _replace_group_labels(db, "series", series_id, payload)
