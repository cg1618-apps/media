"""
The rules that make an h-comic an h-comic, on every write path.

Two invariants, and one place that keeps them:

  variant   The columns a region does not use are CLEARED, not merely hidden
            by the form - the same rule novel's volume-only types follow
            (derive_novel_catalog). A KR entry has no originality, animation
            status, series number or page total; a JP entry has no chapter
            total, chapters behind or highlight group order. The reader's own
            counters follow the region too: page_fin is JP's, ch_fin is KR's.

  label     Every h-comic entry carries the `h-comic` content label, and every
            franchise whose type includes `H-Comic` carries it too. A missing
            label means a PUBLIC entry, so this is never left to the admin: it
            is attached server-side, and a request that would take it off is
            refused (422). The mechanics are shared by every gated type and
            live in app/services/domain/gated_labels.py.

The write paths that reach them:

  form create / update, tracker PATCH   the registry's progress hooks
                                        (app/registry.py), which the router
                                        factory calls on all three
  Pull, sheet restore                   enforce_h_comic_invariants (variant),
                                        run after the H-Comic and User Media
                                        List tabs; gated_labels.
                                        enforce_gated_label_invariants (label)
  Calculate                             run_sync_h_comic and
                                        run_sync_gated_labels, the same two

Both invariants are idempotent, so running them twice is always safe.
"""

import logging
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.services.domain import gated_labels
from app.utils.constants import (
    H_COMIC_ANIMATION_STATUSES,
    H_COMIC_ORIGINALITY,
    H_COMIC_REGION_JP,
    H_COMIC_REGION_KR,
    H_COMIC_REGIONS,
    H_COMIC_USEFULNESS,
    FranchiseType,
    ReadStatus,
)

logger = logging.getLogger(__name__)

MEDIA_TYPE = "h-comic"
# The content label every h-comic carries. Named here as well as in
# gated_types.REQUIRED_LABEL_FOR_TYPE so this module does not have to import
# the rbac layer at module scope; a unit test pins the two together.
LABEL_KEY = "h-comic"

# Catalogue columns only one region uses, keyed by the region that CLEARS
# them.
REGION_CLEARS: dict[str, tuple[str, ...]] = {
    H_COMIC_REGION_KR: (
        "originality",
        "animation_status",
        "series_number",
        "page_total",
    ),
    H_COMIC_REGION_JP: ("ch_total", "ch_behind", "highlight_group_order"),
}

# The reader's counters, the same way.
LIST_REGION_CLEARS: dict[str, tuple[str, ...]] = {
    H_COMIC_REGION_KR: ("page_fin",),
    H_COMIC_REGION_JP: ("ch_fin",),
}


# ---------------------------------------------------------------------------
# Values
# ---------------------------------------------------------------------------


def _blank_to_none(value):
    if isinstance(value, str) and not value.strip():
        return None
    return value


def _check_vocabulary(value, allowed: tuple[str, ...], label: str):
    value = _blank_to_none(value)
    if value is None:
        return None
    if value not in allowed:
        raise ValueError(
            f"'{value}' is not a valid {label}; expected one of "
            f"{', '.join(allowed)}."
        )
    return value


def check_region(value, required: bool = True) -> Optional[str]:
    """One of H_COMIC_REGIONS. Required on a write that states the region."""
    value = _blank_to_none(value)
    if value is None:
        if required:
            raise ValueError(
                f"region is required; expected one of {', '.join(H_COMIC_REGIONS)}."
            )
        return None
    return _check_vocabulary(value, H_COMIC_REGIONS, "region")


def check_originality(value) -> Optional[str]:
    return _check_vocabulary(value, H_COMIC_ORIGINALITY, "originality")


def check_animation_status(value) -> Optional[str]:
    return _check_vocabulary(value, H_COMIC_ANIMATION_STATUSES, "animation status")


def check_usefulness(value) -> Optional[str]:
    return _check_vocabulary(value, H_COMIC_USEFULNESS, "usefulness")


def normalize_group_order(value) -> Optional[list[str]]:
    """
    A highlight group order as stored: a list of distinct, non-blank names in
    the order given. None and an empty list both mean "no manual order".
    """
    if value is None:
        return None
    if not isinstance(value, (list, tuple)):
        raise ValueError("highlight_group_order must be a list of names.")
    out: list[str] = []
    for item in value:
        if not isinstance(item, str):
            raise ValueError("highlight_group_order must be a list of names.")
        name = item.strip()
        if name and name not in out:
            out.append(name)
    return out or None


# ---------------------------------------------------------------------------
# The variant rule
# ---------------------------------------------------------------------------


def clear_h_comic_catalog(entry) -> None:
    """Clear the catalogue columns the entry's region does not use. Pure."""
    for column in REGION_CLEARS.get(getattr(entry, "region", None), ()):
        if getattr(entry, column, None) is not None:
            setattr(entry, column, None)


def clear_h_comic_list(row, entry) -> None:
    """Clear the reader's counters the entry's region does not use. Pure."""
    for column in LIST_REGION_CLEARS.get(getattr(entry, "region", None), ()):
        if getattr(row, column, None) is not None:
            setattr(row, column, None)


def _validate_catalog(entry) -> None:
    """Every h-comic vocabulary column, checked on the entry as it will be."""
    entry.region = check_region(entry.region)
    entry.originality = check_originality(entry.originality)
    entry.animation_status = check_animation_status(entry.animation_status)
    entry.highlight_group_order = normalize_group_order(entry.highlight_group_order)


def _require_h_comic_franchise(db: Session, entry) -> None:
    """
    An h-comic never sits in a mainstream franchise (D9).

    The name resolver already refuses to match one; this catches the other
    way in, a franchise named by id.
    """
    franchise_id = getattr(entry, "franchise_id", None)
    if franchise_id is None:
        return
    franchise = db.get(models.Franchise, franchise_id)
    if franchise is not None and not is_h_comic_franchise(franchise):
        raise ValueError(
            "An h-comic can only sit in a franchise of type "
            f"'{FranchiseType.H_COMIC.value}'."
        )


def h_comic_progress_hook(db: Session, entry) -> None:
    """
    The catalogue half of every form and tracker write: validate, clear by
    region, keep the label on.

    Raised as a 422 here because the tracker PATCH has no request schema to
    validate against - the dict body reaches the model unchecked, so this is
    the one place every write path passes through.
    """
    try:
        _validate_catalog(entry)
        _require_h_comic_franchise(db, entry)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    clear_h_comic_catalog(entry)
    if entry.system_id is not None:
        db.flush()
        gated_labels.ensure_entry_label(db, entry.system_id, LABEL_KEY)


def h_comic_progress_hook_list(row, entry) -> None:
    """The reader's half: usefulness is a vocabulary, and the counters follow
    the region."""
    try:
        row.usefulness = check_usefulness(row.usefulness)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    clear_h_comic_list(row, entry)


# ---------------------------------------------------------------------------
# Completion
# ---------------------------------------------------------------------------


def mark_h_comic_catalog(entry) -> None:
    """Manga's rule: a cancelled serialization stays cancelled."""
    if entry.serialization_status != "腰斬":
        entry.serialization_status = "完結"


def mark_h_comic_list(row, entry) -> None:
    """I read all of it: the region's own counter reaches the region's total."""
    row.status = ReadStatus.COMPLETED.value
    if entry.region == H_COMIC_REGION_JP and entry.page_total:
        row.page_fin = entry.page_total
    if entry.region == H_COMIC_REGION_KR and entry.ch_total:
        row.ch_fin = entry.ch_total


# ---------------------------------------------------------------------------
# The label
# ---------------------------------------------------------------------------


def franchise_types(franchise) -> list[str]:
    """A franchise's comma-separated type list, as tokens."""
    raw = (getattr(franchise, "franchise_type", None) or "").strip()
    return [t.strip() for t in raw.split(",") if t.strip()]


def is_h_comic_franchise(franchise) -> bool:
    return FranchiseType.H_COMIC.value in franchise_types(franchise)


# ---------------------------------------------------------------------------
# The paths that bypass the router: Pull, sheet restore, Calculate
# ---------------------------------------------------------------------------


def enforce_h_comic_invariants(db: Session) -> dict:
    """
    Re-establish the variant rule over the whole table. Idempotent.

    A Pull writes rows straight to the tables, so neither hook ran: this
    clears by region and clears the reader counters on every list row of an
    h-comic. The label half is gated_labels.enforce_gated_label_invariants,
    which every caller of this runs as well. Does not commit - the caller
    owns the transaction.
    """
    entries = db.query(models.HComic).all()
    by_id = {entry.system_id: entry for entry in entries}
    for entry in entries:
        clear_h_comic_catalog(entry)
        entry.highlight_group_order = _safe_group_order(entry)

    if by_id:
        rows = (
            db.query(models.UserMediaList)
            .filter(models.UserMediaList.media_id.in_(list(by_id)))
            .all()
        )
        for row in rows:
            clear_h_comic_list(row, by_id[row.media_id])
    db.flush()
    return {"entries": len(entries)}


def _safe_group_order(entry):
    """A restored order that is not a list of names is dropped, not raised."""
    try:
        return normalize_group_order(entry.highlight_group_order)
    except ValueError:
        logger.warning(
            "h-comic %s: highlight_group_order is not a list of names; cleared.",
            entry.system_id,
        )
        return None
