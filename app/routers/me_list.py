"""
routers/me_list.py
The caller's own list row, for one entry.

Step 1 moved every personal fact onto user_media_list but left the only write
path inside the per-type entry endpoints, which at the time sat behind the
single admin gate. That was correct while the admin was the only account.
Step 2 created accounts that are not admins, so the write moved here, behind
`self.list` instead: a permission with no code behind it is the inert grant
app/services/rbac/permissions.py exists to forbid. It gained the
entry_visible object-level guard in _media_or_404 below (commit 4746b1bc),
closing a gap where a holder of `self.list` could write a status onto an
entry it could not see.

Deliberately narrow. Every write here is the caller's own - its list row, its
plan flags, its remark - and none can address anyone else's, because no route
takes a user id. Catalogue
writes stay where they are; nothing here can touch a detail table.

The payload keys are the type's own, not the storage column names: an anime
takes `watching_status` and a manga `reading_status`, exactly as the entry
endpoints do, because user_list.LIST_FIELDS is the single place that says
which keys a type owns.
"""

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models
from app.dependencies import get_db
from app.registry import MEDIA_REGISTRY
from app.services.domain.plan_next import set_entry_flag
from app.services.domain.remark_field import upsert_remark
from app.services.domain.user_list import (
    DEFAULT_STATUS,
    LIST_FIELD_DEFAULTS,
    LIST_FIELDS,
    STATUS_FIELD,
    apply_list_payload,
    ensure_list_row,
    list_row,
)
from app.services.rbac.enforcement import entry_visible, tier_visible
from app.services.rbac.permissions import PERM_SELF_LIST
from app.services.rbac.resolver import Viewer, require_permission
from app.utils.media_resolver import MEDIA_TABLES, TIER_TABLES
from app.utils.plan_next_kinds import PLAN_FLAG_FIELDS

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/me",
    tags=["My List"],
    # Router-level, not per-route: every route here reads or writes the
    # caller's own list, so a route added later is gated by default rather
    # than by someone remembering. require_permission answers 401 (never 403),
    # matching the one error shape the SPA knows.
    dependencies=[Depends(require_permission(PERM_SELF_LIST))],
)


def _media_or_404(
    db: Session, viewer: Viewer, media_id: UUID
) -> models.Media:
    """
    The entry, if this viewer may reach it at all.

    The visibility test is NOT decoration on a write path. Until it was added,
    both handlers resolved the entry with a bare db.get and never asked, so an
    account holding `self.list` could set a status, rating and progress on an
    entry it cannot see - and confirm that entry exists - by knowing the uuid.
    The read side has been gated since the content-label work; the write side
    never was.

    The rule is that writes follow reads: if GET answers 404 for a viewer,
    every operation on that id answers 404 too. entry_visible tests the
    media-type permission as well as the labels, so this closes both halves -
    an account without `media_type.game` cannot rate a game either.

    Same message and same status as the missing-row branch, deliberately:
    a 403 here would confirm the entry exists exactly as surely as a 200.
    """
    media = db.get(models.Media, media_id)
    if media is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    if not entry_visible(db, viewer, media.media_type, media.system_id):
        raise HTTPException(status_code=404, detail="Entry not found")
    return media


def _run_list_hook(db: Session, row, media: models.Media) -> None:
    """
    The type's progress_hook_list, as the entry endpoints run it after a list
    payload (_factory._write_list). This path writes the same row, so it
    owes the same checks: h-comic's usefulness vocabulary and region
    clears, novel's arc derivation. The hook reads the detail row, not the
    `media` supertable row.
    """
    spec = next(
        (s for s in MEDIA_REGISTRY.values() if s.owner_type == media.media_type),
        None,
    )
    if spec is None or spec.progress_hook_list is None:
        return
    entry = db.get(spec.model, media.system_id)
    if entry is not None:
        spec.progress_hook_list(row, entry)


def _caller_id(viewer: Viewer) -> UUID:
    """
    The permission is granted to a role, and a role could in principle be held
    by nothing - so this is a guard, not a formality. It never fires for a
    signed-in account.
    """
    if viewer.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials or insufficient permissions",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return viewer.user_id


def _serialize(row, media_type: str) -> dict[str, Any]:
    """
    The row as this media type's own keys. An entry the caller has never
    touched reads back the type's default status and None for the rest -
    the same values attach_list_fields puts on an untouched entry, so a
    detail page sees one shape whichever path fed it.
    """
    status_field = STATUS_FIELD[media_type]
    out: dict[str, Any] = {"media_id": None, "media_type": media_type}
    for field_name in LIST_FIELDS[media_type]:
        if field_name == status_field:
            out[field_name] = (
                row.status if row is not None else DEFAULT_STATUS[media_type]
            )
            continue
        value = getattr(row, field_name) if row is not None else None
        if value is None and field_name in LIST_FIELD_DEFAULTS:
            value = LIST_FIELD_DEFAULTS[field_name]
        out[field_name] = value
    return out


@router.get("/list/{media_id}", summary="Read My List Row")
def read_my_list_row(
    media_id: UUID,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_permission(PERM_SELF_LIST)),
):
    """The caller's row for one entry. Never creates one."""
    media = _media_or_404(db, viewer, media_id)
    user_id = _caller_id(viewer)
    row = list_row(db, user_id, media_id)
    payload = _serialize(row, media.media_type)
    payload["media_id"] = str(media_id)
    return payload


@router.put("/list/{media_id}", summary="Write My List Row")
def write_my_list_row(
    media_id: UUID,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_permission(PERM_SELF_LIST)),
):
    """
    Upsert the caller's row. A key this media type does not own is refused
    rather than dropped, so a typo is visible instead of silent - the same
    reasoning split_list_payload gives for leaving unknown keys in the
    catalogue half.
    """
    media = _media_or_404(db, viewer, media_id)
    user_id = _caller_id(viewer)

    owned = set(LIST_FIELDS[media.media_type])
    unknown = sorted(set(payload) - owned)
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{media.media_type} list rows do not hold: {', '.join(unknown)}"
            ),
        )

    row = ensure_list_row(db, user_id, media_id, media.media_type)
    apply_list_payload(row, payload, media.media_type)
    _run_list_hook(db, row, media)
    db.commit()
    db.refresh(row)

    out = _serialize(row, media.media_type)
    out["media_id"] = str(media_id)
    return out


# ---------------------------------------------------------------------------
# Plan flags
# ---------------------------------------------------------------------------
# watch_next / to_rewatch and their per-type spellings are the caller's own
# plan_next rows (services/domain/plan_next.py). The entry endpoints also take
# them, but behind manage.catalog, which is why a `user` could not set its own.


@router.put("/plan-flags/{media_id}", summary="Write My Plan Flags")
def write_my_plan_flags(
    media_id: UUID,
    payload: dict[str, bool],
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_permission(PERM_SELF_LIST)),
):
    """
    Set or clear the caller's plan flags on one entry, by the type's own keys
    (`watch_next`, `to_reread`, ...). A key the type does not have is refused
    (422), as on the list route; a key left out is untouched. Returns every
    flag the type has, as the caller now holds it.
    """
    media = _media_or_404(db, viewer, media_id)
    user_id = _caller_id(viewer)
    fields = dict(PLAN_FLAG_FIELDS.get(media.media_type, ()))
    unknown = sorted(set(payload) - set(fields))
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"{media.media_type} has no plan flag: {', '.join(unknown)}",
        )
    for field_name, planned in payload.items():
        set_entry_flag(
            db,
            media.media_type,
            media.system_id,
            bool(planned),
            kind=fields[field_name],
            user_id=user_id,
        )
    db.commit()

    held = {
        row.kind
        for row in db.query(models.PlanNext).filter(
            models.PlanNext.user_id == user_id,
            models.PlanNext.media_id == media.system_id,
        )
    }
    return {field_name: kind in held for field_name, kind in fields.items()}


# ---------------------------------------------------------------------------
# Remarks
# ---------------------------------------------------------------------------
# A remark is a personal-scope note: each account has its own on an entry or a
# group (services/domain/remark_field.py). The owner's own endpoint also writes
# it, behind manage.catalog; this is the write every account with a list uses.


def _remark_owner_or_404(db: Session, viewer: Viewer, owner_type: str, owner_id: UUID):
    """The entry or group, if this viewer may see it - the same 404 for a
    missing owner as for a hidden one, as _media_or_404 answers."""
    if owner_type in MEDIA_TABLES:
        media = db.get(models.Media, owner_id)
        if media is None or media.media_type != owner_type:
            raise HTTPException(status_code=404, detail="Entry not found")
        return _media_or_404(db, viewer, owner_id)
    if owner_type in TIER_TABLES:
        tier = db.get(TIER_TABLES[owner_type].model, owner_id)
        if tier is None or not tier_visible(db, viewer, owner_id):
            raise HTTPException(status_code=404, detail="Entry not found")
        return tier
    raise HTTPException(status_code=404, detail="Entry not found")


@router.put("/remarks/{owner_type}/{owner_id}", summary="Write My Remark")
def write_my_remark(
    owner_type: str,
    owner_id: UUID,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_permission(PERM_SELF_LIST)),
):
    """
    Set the caller's remark on an entry (`anime`, `manga`, ...) or a group
    (`collection`, `franchise`, `series`). Body `{"remark": text}`; empty or
    null clears it. Another account's remark on the same owner is untouched.
    """
    if set(payload) != {"remark"}:
        raise HTTPException(status_code=422, detail="The body is {\"remark\": text}.")
    text = payload["remark"]
    if text is not None and not isinstance(text, str):
        raise HTTPException(status_code=422, detail="remark must be text or null.")
    _remark_owner_or_404(db, viewer, owner_type, owner_id)
    user_id = _caller_id(viewer)
    upsert_remark(db, owner_type, owner_id, text, user_id)
    db.commit()
    return {"remark": text if (text or "").strip() else None}
