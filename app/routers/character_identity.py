"""
routers/character_identity.py
A character's other identities. Two reads are public - one identity, by
public_id or UUID, and the entries it is cast on - for the identity's own
page; listing and every write are admin-only. Every identity also reaches the
public nested in its character, through GET /api/character.

An identity is created under an existing character and stays with it - there
is no way to move one. Visibility is the character's: an identity of a
character this caller cannot see answers 404, as the character does.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.domain.casting_entries import casting_entry_groups
from app.services.domain.character_identities import (
    fold_into_main,
    identity_casting_count,
    identity_response,
)
from app.services.domain.entity_photos import character_media
from app.services.rbac.resolver import Viewer, get_viewer, require_manage_catalog
from app.services.rbac.shared_visibility import (
    apply_shared_visibility,
    require_visible_shared,
)
from app.utils.entity_ref import find_entity

router = APIRouter(prefix="/api/character-identity", tags=["Character Identity"])

NOT_FOUND = "Identity not found."


def _admin_response(
    db: Session, identity: models.CharacterIdentity, viewer: Viewer
) -> schemas.IdentityAdminResponse:
    character = identity.character
    media = character_media(db, viewer, [character])[character.system_id]
    base = identity_response(identity, character, media)
    return schemas.IdentityAdminResponse(
        **base.model_dump(),
        character_display_name=character.display_name,
        character_public_id=character.public_id,
        casting_count=identity_casting_count(db, identity.system_id),
    )


def _load(db: Session, viewer: Viewer, ref: UUID | str) -> models.CharacterIdentity:
    """The identity `ref` names - a UUID, or as a path segment a public_id or
    a UUID - 404 when it is missing or its character is hidden from `viewer`."""
    if isinstance(ref, UUID):
        identity = db.get(models.CharacterIdentity, ref)
    else:
        identity = find_entity(db, models.CharacterIdentity, ref)
    if identity is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(db, viewer, models.Character, identity.character_id, NOT_FOUND)
    return identity


@router.get("/", response_model=List[schemas.IdentityAdminResponse], summary="List Identities")
def list_identities(
    character_id: Optional[UUID] = None,
    name: Optional[str] = Query(default=None, description="Substring of any of the four names."),
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    visible_characters = apply_shared_visibility(
        db.query(models.Character.system_id), models.Character, db, admin
    )
    query = db.query(models.CharacterIdentity).filter(
        models.CharacterIdentity.character_id.in_(visible_characters)
    )
    if character_id is not None:
        query = query.filter(models.CharacterIdentity.character_id == character_id)
    if name:
        term = f"%{name}%"
        query = query.filter(
            or_(
                models.CharacterIdentity.name_en.ilike(term),
                models.CharacterIdentity.name_cn.ilike(term),
                models.CharacterIdentity.name_jp.ilike(term),
                models.CharacterIdentity.name_alt.ilike(term),
            )
        )
    identities = query.order_by(models.CharacterIdentity.position).all()
    out = [_admin_response(db, i, admin) for i in identities]
    out.sort(key=lambda r: (r.character_display_name.casefold(), r.position))
    return out


@router.get("/{ref}/entries", summary="Entries This Identity Is Cast On")
def get_identity_entries(
    ref: str,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    The entries this identity appears in, grouped by media type - the cast
    rows naming it, and none of its character's main-identity rows. The same
    shape and visibility rule as GET /api/character/{system_id}/entries; an
    identity whose character is hidden from this viewer answers 404.
    """
    identity = _load(db, viewer, ref)
    rows = (
        db.query(models.CharacterCasting)
        .filter(models.CharacterCasting.identity_id == identity.system_id)
        .order_by(models.CharacterCasting.position)
        .all()
    )
    return {"groups": casting_entry_groups(db, viewer, rows)}


@router.get("/{ref}", response_model=schemas.IdentityDetailResponse, summary="Get Identity")
def get_identity(
    ref: str,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """One identity, by its public_id or its UUID, for the identity page."""
    identity = _load(db, viewer, ref)
    character = identity.character
    # The photo fallback is resolved for THIS viewer: an entry's picture it
    # may not see never stands in for the identity's.
    media = character_media(db, viewer, [character])[character.system_id]
    return schemas.IdentityDetailResponse(
        **identity_response(identity, character, media).model_dump(),
        character_public_id=character.public_id,
        character_display_name=character.display_name,
    )


@router.post("/", response_model=schemas.IdentityAdminResponse, summary="Create Identity")
def create_identity(
    payload: schemas.IdentityCreate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """A plain create under an existing character, placed after its others."""
    character = db.get(models.Character, payload.character_id)
    if character is None:
        raise HTTPException(status_code=404, detail="Character not found.")
    require_visible_shared(db, admin, models.Character, character.system_id, "Character not found.")
    last = (
        db.query(func.max(models.CharacterIdentity.position))
        .filter(models.CharacterIdentity.character_id == character.system_id)
        .scalar()
    )
    position = 0 if last is None else last + 1
    identity = models.CharacterIdentity(**payload.model_dump(), position=position)
    db.add(identity)
    db.commit()
    db.refresh(identity)
    return _admin_response(db, identity, admin)


@router.put("/{system_id}", response_model=schemas.IdentityAdminResponse, summary="Update Identity")
def update_identity(
    system_id: UUID,
    payload: schemas.IdentityUpdate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """Replaces the identity's fields. Its character never changes; a
    character_id in the body is ignored. A null position keeps the current one."""
    identity = _load(db, admin, system_id)
    data = payload.model_dump()
    if data.get("position") is None:
        data.pop("position", None)
    for key, value in data.items():
        setattr(identity, key, value)
    db.commit()
    db.refresh(identity)
    return _admin_response(db, identity, admin)


@router.delete("/{system_id}", summary="Delete Identity")
def delete_identity(
    system_id: UUID,
    castings: int = Query(..., description="Cast-row count the admin confirmed"),
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Deletes an identity. Its cast rows are not deleted: they fold into the
    main identity (character_identities.fold_into_main).

    `castings` is the count the confirmation showed and is required, as on
    character delete: a count that moved underneath the dialog is 409.
    """
    identity = _load(db, admin, system_id)
    actual = identity_casting_count(db, system_id)
    if actual != castings:
        raise HTTPException(
            status_code=409,
            detail=f"This identity now has {actual} cast rows, not {castings}. Reload and confirm again.",
        )
    fold_into_main(db, identity)
    db.delete(identity)
    db.commit()
    return {"status": "success", "castings_folded": actual}
