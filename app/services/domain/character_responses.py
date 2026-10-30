"""
services/domain/character_responses.py
The CharacterResponse a character is answered as, for one character or a page
of them.

Shared by routers/character.py and the search page's character bucket
(services/domain/search.py), so a search card and a library card are built
from the same fields by the same code.
"""

from typing import Iterable, Optional, Sequence
from uuid import UUID

from sqlalchemy.orm import Session

from app import models, schemas
from app.services.domain.character_identities import (
    identities_by_character,
    identity_response,
)
from app.services.domain.character_tags import character_tag_values
from app.services.domain.entity_photos import EntityMedia, character_media
from app.services.rbac.personal_gate import strip_personal


def character_response(
    db: Session,
    character: models.Character,
    viewer=None,
    media: Optional[EntityMedia] = None,
    tags: Optional[dict[str, list[str]]] = None,
    identities: Optional[list] = None,
) -> schemas.CharacterResponse:
    # casting_count, the picture and the media types all count only castings
    # on entries the viewer may see, exactly as person._to_response counts
    # credit_count - a number is a smaller leak than a title, but "cast in 3
    # things, you can see 2" is still one.
    #
    # `media`, `tags` and `identities` are passed in by character_responses,
    # which resolves a whole page in one pass each; a single-entity route
    # leaves them None and pays for one.
    if media is None:
        media = character_media(db, viewer, [character])[character.system_id]
    if tags is None:
        tags = character_tag_values(db, [character.system_id])[character.system_id]
    if identities is None:
        identities = identities_by_character(db, [character.system_id])[character.system_id]
    response = schemas.CharacterResponse(
        system_id=character.system_id,
        public_id=character.public_id,
        name_en=character.name_en,
        name_cn=character.name_cn,
        name_jp=character.name_jp,
        name_alt=character.name_alt,
        display_name_field=character.display_name_field,
        display_name=character.display_name,
        gender=character.gender,
        my_rating=character.my_rating,
        photo_file=character.photo_file,
        photo_focus=character.photo_focus,
        photo_fallback_entry_id=media.photo_fallback_entry_id,
        role=character.role,
        mal_id=character.mal_id,
        mal_link=character.mal_link,
        remark=character.remark,
        first_mention=character.first_mention,
        first_appearance=character.first_appearance,
        first_encounter=character.first_encounter,
        casting_count=media.count,
        display_photo_file=media.display_photo_file,
        display_photo_focus=media.display_photo_focus,
        media_types=media.media_types,
        restricted=media.restricted,
        appearance=tags["appearance"],
        trait=tags["trait"],
        identities=[identity_response(i, character, media) for i in identities],
    )
    return strip_personal(viewer, "character", response)


def character_responses(
    db: Session,
    viewer,
    characters: Sequence[models.Character],
    only_identities: Optional[Iterable[UUID]] = None,
) -> list[schemas.CharacterResponse]:
    """
    A page of characters, in the order given, in three queries however long
    the page is: the castings (entity_photos.character_media), the tags, and
    the identities.

    `only_identities`, when given, narrows each character's `identities` to
    those ids - the franchise and series hubs list only the identities cast
    there.
    """
    ids = [c.system_id for c in characters]
    media = character_media(db, viewer, characters)
    tags = character_tag_values(db, ids)
    identities = identities_by_character(db, ids)
    if only_identities is not None:
        keep = set(only_identities)
        identities = {
            character_id: [i for i in rows if i.system_id in keep]
            for character_id, rows in identities.items()
        }
    return [
        character_response(
            db,
            character,
            viewer,
            media[character.system_id],
            tags[character.system_id],
            identities[character.system_id],
        )
        for character in characters
    ]
