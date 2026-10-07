"""
A character's other identities: their responses and the cast rows they own.

The character row is the main identity, so everything an identity leaves
blank is answered by its character - gender (display_gender) and the picture
(display_photo_file). Deleting an identity never deletes cast history: its
rows fold into the main identity's (fold_into_main).
"""

from typing import Iterable
from uuid import UUID

from sqlalchemy.orm import Session

from app import models, schemas
from app.services.domain.entity_photos import EntityMedia
from app.services.domain.merge_fill import absorb_casting


def identities_by_character(
    db: Session, character_ids: Iterable[UUID]
) -> dict[UUID, list[models.CharacterIdentity]]:
    """Every identity of each character, in position order. One query."""
    ids = list(character_ids)
    out: dict[UUID, list[models.CharacterIdentity]] = {i: [] for i in ids}
    if not ids:
        return out
    for identity in (
        db.query(models.CharacterIdentity)
        .filter(models.CharacterIdentity.character_id.in_(ids))
        .order_by(models.CharacterIdentity.position, models.CharacterIdentity.created_at)
    ):
        out[identity.character_id].append(identity)
    return out


def identity_response(
    identity: models.CharacterIdentity,
    character: models.Character,
    media: EntityMedia,
) -> schemas.IdentityResponse:
    own_photo = bool(identity.photo_file)
    return schemas.IdentityResponse(
        system_id=identity.system_id,
        public_id=identity.public_id,
        character_id=identity.character_id,
        name_en=identity.name_en,
        name_cn=identity.name_cn,
        name_jp=identity.name_jp,
        name_alt=identity.name_alt,
        display_name_field=identity.display_name_field,
        display_name=identity.display_name,
        gender=identity.gender,
        display_gender=identity.gender or character.gender,
        remark=identity.remark,
        photo_file=identity.photo_file,
        photo_focus=identity.photo_focus,
        display_photo_file=identity.photo_file if own_photo else media.display_photo_file,
        display_photo_focus=identity.photo_focus if own_photo else media.display_photo_focus,
        position=identity.position,
    )


def identity_casting_count(db: Session, identity_id: UUID) -> int:
    return (
        db.query(models.CharacterCasting)
        .filter(models.CharacterCasting.identity_id == identity_id)
        .count()
    )


def fold_into_main(db: Session, identity: models.CharacterIdentity) -> int:
    """
    Hand every cast row of `identity` to its character's main identity: the
    row itself when the main identity is not cast in that entry, otherwise
    absorbed into the main identity's row there. Returns the rows handled.
    """
    rows = (
        db.query(models.CharacterCasting)
        .filter(models.CharacterCasting.identity_id == identity.system_id)
        .all()
    )
    for row in rows:
        main = (
            db.query(models.CharacterCasting)
            .filter(
                models.CharacterCasting.character_id == identity.character_id,
                models.CharacterCasting.identity_id.is_(None),
                models.CharacterCasting.media_type == row.media_type,
                models.CharacterCasting.entry_id == row.entry_id,
            )
            .first()
        )
        if main is None:
            row.identity_id = None
        else:
            absorb_casting(main, row)
            db.delete(row)
        db.flush()
    return len(rows)
