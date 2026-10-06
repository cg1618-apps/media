"""
routers/character_identity.py
A character's other identities. Admin-only, reads included: the public reads
them through GET /api/character, nested in each character.

An identity is created under an existing character and stays with it - there
is no way to move one. Visibility is the character's: an identity of a
character this caller cannot see answers 404, as the character does.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.domain.character_identities import (
    identity_casting_count,
    identity_response,
)
from app.services.domain.entity_photos import character_media
from app.services.rbac.resolver import Viewer, require_manage_catalog
from app.services.rbac.shared_visibility import (
    apply_shared_visibility,
    require_visible_shared,
)

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


def _load(db: Session, viewer: Viewer, system_id: UUID) -> models.CharacterIdentity:
    identity = db.get(models.CharacterIdentity, system_id)
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


@router.get("/{system_id}", response_model=schemas.IdentityAdminResponse, summary="Get Identity")
def get_identity(
    system_id: UUID,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    return _admin_response(db, _load(db, admin, system_id), admin)


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
    position = (
        db.query(models.CharacterIdentity)
        .filter(models.CharacterIdentity.character_id == character.system_id)
        .count()
    )
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
