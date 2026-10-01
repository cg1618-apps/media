"""Character request/response schemas."""

from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.schemas.image_focus import ImageFocus
from app.utils.character_roles import check_character_role
from app.utils.entity_vocab import check_gender, check_my_rating

# MergeRequest is not redefined here - schemas.MergeRequest (app/schemas/staff.py)
# is the one shape {"source_id": UUID} and the character router reuses it.


class CharacterBase(BaseModel):
    name_en: Optional[str] = None
    name_cn: Optional[str] = None
    name_jp: Optional[str] = None
    name_alt: Optional[str] = None
    display_name_field: Optional[str] = None
    gender: Optional[str] = None
    my_rating: Optional[str] = None
    photo_file: Optional[str] = None
    photo_focus: ImageFocus = None
    # The entry whose picture stands in when photo_file is NULL; see
    # app/services/domain/entity_photos.py. A write must name an entry this
    # character is cast on (the router checks; 422 otherwise).
    photo_fallback_entry_id: Optional[UUID] = None
    # What the character is to their story overall - CHARACTER_ROLES or None.
    # Independent of each casting's own role.
    role: Optional[str] = None
    remark: Optional[str] = None

    @model_validator(mode="after")
    def _display_field_is_known(self):
        if self.display_name_field not in (None, "en", "cn", "jp", "alt"):
            raise ValueError("display_name_field must be en, cn, jp or alt.")
        return self


class CharacterWrite(CharacterBase):
    """
    What Create and Update share: gender, my_rating and role are closed
    vocabularies (app/utils/entity_vocab.py, app/utils/character_roles.py),
    "" meaning NULL.

    Not on CharacterBase, which CharacterResponse also extends: a response
    reports what is stored and has no business refusing it.
    """

    @field_validator("gender")
    @classmethod
    def _known_gender(cls, v):
        return check_gender(v)

    @field_validator("my_rating")
    @classmethod
    def _known_rating(cls, v):
        return check_my_rating(v)

    @field_validator("role")
    @classmethod
    def _known_role(cls, v):
        return check_character_role(v)


def _has_a_name(payload: CharacterBase) -> bool:
    return any(
        (payload.name_en, payload.name_cn, payload.name_jp, payload.name_alt)
    )


class CharacterCreate(CharacterWrite):
    """
    A character to create.

    Deliberately NO unslotted `name` field and NO `roles`, unlike PersonCreate:
    a character holds no roles, and there is no find-or-create path (see
    Decision G on the router) that would need name_slot_for to place an
    unslotted name into one of the four columns.
    """

    @model_validator(mode="after")
    def _at_least_one_name(self):
        """
        Mirrors ck_character_has_a_name, so a nameless character is a 422 from
        the API rather than a 500 surfacing the database's IntegrityError.
        """
        if not _has_a_name(self):
            raise ValueError("A character needs at least one name.")
        return self


class CharacterUpdate(CharacterWrite):
    @model_validator(mode="after")
    def _at_least_one_name(self):
        """Mirrors ck_character_has_a_name; see CharacterCreate."""
        if not _has_a_name(self):
            raise ValueError("A character needs at least one name.")
        return self


class CharacterResponse(CharacterBase):
    system_id: UUID
    # The id the SPA puts in the URL. Never gated: a viewer allowed to see the
    # entry must be able to link to it.
    public_id: int
    display_name: str = ""
    # Castings, not credits: this counts CharacterCasting rows, filtered
    # through the same visibility check the entries list uses, so the number
    # on the card and the list on the page can never disagree.
    casting_count: int = 0
    # Resolved per viewer by app/services/domain/entity_photos.py: the storage
    # key to show (photo_file, else a visible entry's picture), or None.
    display_photo_file: Optional[str] = None
    # The focal point stored beside whichever source display_photo_file came
    # from, or None (centred).
    display_photo_focus: Optional[str] = None
    # Hyphenated media types of the visible entries this character is cast
    # on, sorted and distinct; restricted is True when one is a gated type.
    media_types: List[str] = []
    restricted: bool = False

    model_config = ConfigDict(from_attributes=True)
