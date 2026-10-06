"""
routers/casting.py
Read and wholesale-replace one media entry's cast.

Not a part of /api/credits, whose payload is Dict[str, List[str]] - bare
names keyed by role. A cast row is richer than that: it names a character, an
optional seiyuu, a role, a display position, a photo, and a remark, and each
of those needs its own column rather than collapsing into a name string -
and the seiyuu are a list of their own, one character may have several.
Keeping the two endpoints apart also keeps /api/credits' role vocabulary
(credit_roles_for) untouched by a concern - character casting - that only
four of the eight media types even have.

Mirrors app/routers/credits.py's shape: `_resolve_entry` validates media_type
before doing anything else, so an unknown type is a 400 rather than a
KeyError; a hidden entry answers exactly as an absent one does (404, not
403); and only PUT requires an admin.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.dependencies import get_db
from app.schemas.image_focus import ImageFocus
from app.services.domain import casting as casting_service
from app.services.domain import mal_cast as mal_cast_service
from app.services.rbac.enforcement import entry_visible, filter_visible_pairs
from app.services.rbac.resolver import Viewer, get_viewer, require_manage_catalog
from app.utils.media_resolver import MEDIA_TABLES

router = APIRouter(prefix="/api/casting", tags=["Casting"])


class CastVoiceIn(BaseModel):
    person_id: UUID
    # What tells this voice apart from the casting's others - "child", "ep 13-".
    remark: Optional[str] = None


class CastRowIn(BaseModel):
    character_id: UUID
    # NULL is the character's main identity; otherwise one of ITS identities
    # (casting_service._validate_rows checks which).
    identity_id: Optional[UUID] = None
    # In display order. Empty on a type nobody voices (casting.VOICED_MEDIA_TYPES).
    voices: List[CastVoiceIn] = []
    # Optional: NULL means no role recorded. One of CHARACTER_ROLES otherwise,
    # checked by casting_service._validate_row.
    role: Optional[str] = None
    position: Optional[int] = None
    photo_file: Optional[str] = None
    photo_focus: ImageFocus = None
    remark: Optional[str] = None

    @field_validator("role", mode="before")
    @classmethod
    def _blank_role_is_none(cls, v):
        """
        A select's empty option arrives as "" - and "" is neither None nor
        a CHARACTER_ROLES value, so without this one blank role refused the
        whole cast. Blank or whitespace means no role, as NULL does.
        """
        if isinstance(v, str) and not v.strip():
            return None
        return v


class CastIn(BaseModel):
    cast: List[CastRowIn] = []


def _resolve_entry(db: Session, media_type: str, entry_id: UUID, viewer):
    """
    Validate media_type first, so an unknown type is a 400 not a KeyError.

    `viewer` is required and the visibility test is not optional: the GET above
    has asked since the content-label work and the PUT below never did, so a
    holder of manage.catalog lacking the label could rewrite an entry it cannot
    read. Writes follow reads (decision 9), and the 404 message is the one a
    genuinely missing entry gets.
    """
    if media_type not in MEDIA_TABLES:
        raise HTTPException(status_code=400, detail=f"Unknown media type: {media_type}")

    model = MEDIA_TABLES[media_type].model
    entry = db.get(model, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found.")
    if not entry_visible(db, viewer, media_type, entry_id):
        raise HTTPException(status_code=404, detail="Entry not found.")
    return entry


@router.get("/sources", summary="Entries in a franchise that have a cast")
def get_cast_sources(
    franchise_id: UUID,
    exclude: Optional[UUID] = None,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    What the cast editor offers to import a cast from: every entry in
    `franchise_id` that already has one, of any castable type, newest-made
    first. `exclude` leaves out the entry being edited. Keyed on the
    franchise rather than an entry, because the Add form has a franchise
    before its entry exists.

    Declared before /{media_type}/{entry_id}; it has one segment and that
    route two, so the two cannot match the same path either way.
    """
    counts = (
        db.query(
            models.CharacterCasting.media_type,
            models.CharacterCasting.entry_id,
            func.count(models.CharacterCasting.system_id),
        )
        .join(models.Media, models.Media.system_id == models.CharacterCasting.entry_id)
        .filter(models.Media.franchise_id == franchise_id)
        .group_by(models.CharacterCasting.media_type, models.CharacterCasting.entry_id)
        .all()
    )
    visible = filter_visible_pairs(
        db, admin, [(t, e) for t, e, _ in counts if e != exclude]
    )
    if not visible:
        return {"sources": []}
    entries = {
        m.system_id: m
        for m in db.query(models.Media).filter(
            models.Media.system_id.in_({e for _, e in visible})
        )
    }
    sources = [
        {
            "media_type": media_type,
            "entry_id": str(entry_id),
            "public_id": entries[entry_id].public_id,
            "display_name": entries[entry_id].display_name,
            "cast_count": count,
            "created_at": entries[entry_id].created_at,
        }
        for media_type, entry_id, count in counts
        if (media_type, entry_id) in visible and entry_id in entries
    ]
    sources.sort(key=lambda s: s["created_at"] or datetime.min, reverse=True)
    for source in sources:
        del source["created_at"]
    return {"sources": sources}


class MalCastIn(BaseModel):
    media_type: str
    # The MAL page of the entry being cast: /anime/<id> for a voiced type,
    # /manga/<id> otherwise.
    mal_link: str
    # The characters the editor's form holds, saved or not. A MAL character
    # no mal_id matches may match one of these by name - and only these.
    character_ids: List[UUID] = []


@router.post("/mal", summary="Build a cast from MyAnimeList")
def import_mal_cast(
    payload: MalCastIn,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    The MAL entry's cast as cast rows, for the editor to append and save.
    Characters are matched on mal_id, then by name among the form's own
    `character_ids` that have none; seiyuu on mal_id then name. Any
    missing are created and committed here, the cast itself is not; new
    characters' portraits download after the response. 422 for
    a bad link or an unknown type, 502 when MAL answers with no cast. Keyed
    on the link rather than an entry, like /sources, so Add can use it.
    """
    try:
        result, portraits = mal_cast_service.mal_cast_rows(
            db, admin, payload.media_type, payload.mal_link, payload.character_ids
        )
    except mal_cast_service.MalCastError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except mal_cast_service.MalCastUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    db.commit()
    background_tasks.add_task(mal_cast_service.download_portraits, portraits)
    return result


@router.get("/{media_type}/{entry_id}", summary="Get an entry's cast")
def get_casting(
    media_type: str,
    entry_id: UUID,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """The entry's cast, ordered by position."""
    _resolve_entry(db, media_type, entry_id, viewer)

    return {"cast": casting_service.casting_rows(db, media_type, entry_id)}


@router.put("/{media_type}/{entry_id}", summary="Replace an entry's cast")
def replace_casting(
    media_type: str,
    entry_id: UUID,
    payload: CastIn,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """Replaces the whole cast in the order submitted."""
    _resolve_entry(db, media_type, entry_id, admin)

    rows = [row.model_dump(exclude_none=True) for row in payload.cast]
    try:
        casting_service.replace_casting(db, media_type, entry_id, rows)
    except casting_service.CastingValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    db.commit()
    return {"status": "success"}
