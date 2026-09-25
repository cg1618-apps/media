"""
The rules that make a hentai a hentai, on every write path.

One invariant, and one place that keeps it:

  label     Every hentai entry carries the `hentai` content label, and every
            franchise whose type includes `Hentai` carries it too. A missing
            label means a PUBLIC entry, so this is never left to the admin: it
            is attached server-side, and a request that would take it off is
            refused (422). The mechanics are shared by every gated type and
            live in app/services/domain/gated_labels.py.

Beside it, the vocabulary columns are checked on every write, and a franchise
named by id must be of the h-comic family (FRANCHISE_FAMILY_FOR_TYPE), which a
hentai shares with the h-comic it adapts.

The write paths that reach them:

  form create / update, tracker PATCH   the registry's progress hooks
                                        (app/registry.py), which the router
                                        factory calls on all three
  Pull, sheet restore                   enforce_hentai_invariants, run after
                                        the Hentai, Franchise and label tabs
  Calculate                             run_sync_hentai, the same function

The invariant is idempotent, so running it twice is always safe.
"""

from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.services.domain import gated_labels
from app.services.domain.hierarchy import check_entry_franchise_family
from app.utils.constants import (
    H_COMIC_ORIGINALITY,
    H_COMIC_USEFULNESS,
    HENTAI_SOURCE_MATERIALS,
    AiringStatus,
    FranchiseType,
)

MEDIA_TYPE = "hentai"
# The content label every hentai carries. Named here as well as in
# gated_types.REQUIRED_LABEL_FOR_TYPE so this module does not have to import
# the rbac layer at module scope; a unit test pins the two together.
LABEL_KEY = "hentai"

AIRING_STATUSES: tuple[str, ...] = tuple(s.value for s in AiringStatus)


# ---------------------------------------------------------------------------
# Values
# ---------------------------------------------------------------------------


def _check_vocabulary(value, allowed: tuple[str, ...], label: str) -> Optional[str]:
    if isinstance(value, str) and not value.strip():
        value = None
    if value is None:
        return None
    if value not in allowed:
        raise ValueError(
            f"'{value}' is not a valid {label}; expected one of "
            f"{', '.join(allowed)}."
        )
    return value


def check_source_material(value) -> Optional[str]:
    return _check_vocabulary(value, HENTAI_SOURCE_MATERIALS, "source material")


def check_originality(value) -> Optional[str]:
    return _check_vocabulary(value, H_COMIC_ORIGINALITY, "originality")


def check_airing_status(value) -> Optional[str]:
    return _check_vocabulary(value, AIRING_STATUSES, "airing status")


def check_usefulness(value) -> Optional[str]:
    return _check_vocabulary(value, H_COMIC_USEFULNESS, "usefulness")


# ---------------------------------------------------------------------------
# The write hooks
# ---------------------------------------------------------------------------


def hentai_progress_hook(db: Session, entry) -> None:
    """
    The catalogue half of every form and tracker write: validate, keep the
    franchise in the family, keep the label on.

    Raised as a 422 here because the tracker PATCH has no request schema to
    validate against - the dict body reaches the model unchecked, so this is
    the one place every write path passes through.
    """
    try:
        entry.source_material = check_source_material(entry.source_material)
        entry.originality = check_originality(entry.originality)
        entry.airing_status = check_airing_status(entry.airing_status)
        check_entry_franchise_family(
            db, getattr(entry, "franchise_id", None), MEDIA_TYPE
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if entry.system_id is not None:
        db.flush()
        gated_labels.ensure_entry_label(db, entry.system_id, LABEL_KEY)


def hentai_progress_hook_list(row, entry) -> None:
    """The viewer's half: usefulness is a vocabulary."""
    try:
        row.usefulness = check_usefulness(row.usefulness)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ---------------------------------------------------------------------------
# The paths that bypass the router: Pull, sheet restore, Calculate
# ---------------------------------------------------------------------------


def enforce_hentai_invariants(db: Session) -> dict:
    """
    Re-attach every missing label, on entries and on Hentai franchises.
    Idempotent.

    A Pull writes rows straight to the tables, so the hook never ran. Does
    not commit - the caller owns the transaction.
    """
    entries = db.query(models.Hentai).all()
    for entry in entries:
        gated_labels.ensure_entry_label(db, entry.system_id, LABEL_KEY)
    for franchise in gated_labels.franchises_of_type(db, FranchiseType.HENTAI.value):
        gated_labels.ensure_franchise_labels(db, franchise)
    db.flush()
    return {"entries": len(entries)}
