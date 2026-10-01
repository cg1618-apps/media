"""Person and Studio request/response schemas."""

from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.schemas.image_focus import ImageFocus
from app.utils.credit_roles import PERSON_ROLES, legal_scopes
from app.utils.entity_vocab import check_gender, check_my_rating


class PersonRoleIn(BaseModel):
    """
    One role a person is offered under, in one media type.

    Validated rather than free text because the frontend is now a routine
    writer of these strings: one typo'd `source.role` in a fieldMeta.js
    descriptor would otherwise mint a person holding a role no dropdown
    queries, invisible until someone wonders why a name they just typed is
    never suggested.

    scope is REQUIRED. Every person_role row carries one, because there is no
    "offered everywhere" state to fall back on - see the design spec's
    Decision B for why removing it is what makes auto-scoping on write safe.
    """

    role: str
    scope: str

    # from_attributes so a PersonRole ORM row validates straight into this.
    # PersonResponse's own from_attributes does NOT reach a nested model in
    # pydantic v2, so /api/search - which hands the ORM person to the response
    # model rather than building it field by field the way person.py does -
    # would fail on `roles` without this.
    model_config = ConfigDict(from_attributes=True)

    @field_validator("role")
    @classmethod
    def _known_role(cls, v: str) -> str:
        if v not in PERSON_ROLES:
            raise ValueError(
                f"'{v}' is not a person role. Expected one of: "
                + ", ".join(PERSON_ROLES)
            )
        return v

    @model_validator(mode="after")
    def _scope_is_legal_for_role(self):
        """
        Checked as a PAIR, not per field. A per-field validator cannot see the
        role, so it could never reject (composer, manga) - a scope that is a
        real media type but names a credit that does not exist.
        """
        allowed = legal_scopes(self.role)
        if self.scope not in allowed:
            raise ValueError(
                f"'{self.scope}' is not a scope for the {self.role} role. "
                "Expected one of: " + ", ".join(allowed)
            )
        return self


class PersonBase(BaseModel):
    name_en: Optional[str] = None
    name_cn: Optional[str] = None
    name_jp: Optional[str] = None
    name_alt: Optional[str] = None
    display_name_field: Optional[str] = None
    gender: Optional[str] = None
    my_rating: Optional[str] = None
    photo_file: Optional[str] = None
    photo_focus: ImageFocus = None
    # The entry whose cover stands in when photo_file is NULL; see
    # app/services/domain/entity_photos.py. A write must name an entry this
    # person is credited or cast on (the router checks; 422 otherwise).
    photo_fallback_entry_id: Optional[UUID] = None
    remark: Optional[str] = None
    # MAL's people record; mal_id is derived from mal_link on every write.
    mal_id: Optional[int] = None
    mal_link: Optional[str] = None

    @model_validator(mode="after")
    def _display_field_is_known(self):
        if self.display_name_field not in (None, "en", "cn", "jp", "alt"):
            raise ValueError("display_name_field must be en, cn, jp or alt.")
        return self


class PersonWrite(PersonBase):
    """
    What Create and Update share: gender and my_rating are closed
    vocabularies (app/utils/entity_vocab.py), "" meaning NULL.

    Not on PersonBase, which PersonResponse also extends: a response reports
    what is stored and has no business refusing it.
    """

    @field_validator("gender")
    @classmethod
    def _known_gender(cls, v):
        return check_gender(v)

    @field_validator("my_rating")
    @classmethod
    def _known_rating(cls, v):
        return check_my_rating(v)


def _has_a_name(payload: PersonBase) -> bool:
    return any(
        (payload.name_en, payload.name_cn, payload.name_jp, payload.name_alt)
    )


class PersonCreate(PersonWrite):
    """
    A person to create, either fully slotted or as one unslotted `name`.

    The admin form fills the labelled name columns itself. Every other writer -
    ensureSourceValues.js posting a name typed into a media form's dropdown -
    holds one string and no way to know which column it belongs in, so it sends
    `name` and the endpoint places it through name_slot_for, the same rule
    resolve_person and the reshape migration use. Duplicating that rule in the
    frontend would let one name land in two different columns.
    """

    name: Optional[str] = None
    roles: List[PersonRoleIn] = []

    @model_validator(mode="after")
    def _named_somehow(self):
        """
        Mirrors ck_person_has_a_name, so a nameless person is a 422 from the
        API rather than a 500 surfacing the database's IntegrityError.
        """
        if not (self.name and self.name.strip()) and not _has_a_name(self):
            raise ValueError("A person needs at least one name.")
        return self


class PersonUpdate(PersonWrite):
    roles: List[PersonRoleIn] = []

    @model_validator(mode="after")
    def _at_least_one_name(self):
        """Mirrors ck_person_has_a_name; see PersonCreate._named_somehow."""
        if not _has_a_name(self):
            raise ValueError("A person needs at least one name.")
        return self


class PersonResponse(PersonBase):
    system_id: UUID
    # The id the SPA puts in the URL. Never gated: a viewer allowed to see the
    # entry must be able to link to it.
    public_id: int
    display_name: str = ""
    # Every (role, scope) the person holds. The admin form edits the whole set
    # at once - PUT replaces it - so it has to be readable in one request; a
    # form that reconstructed it by asking each role list who is in it would
    # issue a query per legal pair and still guess.
    roles: List[PersonRoleIn] = []
    credit_count: int = 0
    # Resolved per viewer by app/services/domain/entity_photos.py: the storage
    # key to show (photo_file, else a visible entry's cover), or None.
    display_photo_file: Optional[str] = None
    # The focal point stored beside whichever source display_photo_file came
    # from, or None (centred).
    display_photo_focus: Optional[str] = None
    # Hyphenated media types of the visible entries this person is credited
    # or cast on, sorted and distinct; restricted is True when one is a gated
    # type.
    media_types: List[str] = []
    restricted: bool = False

    model_config = ConfigDict(from_attributes=True)


class StudioBase(BaseModel):
    name_en: Optional[str] = None
    name_cn: Optional[str] = None
    name_jp: Optional[str] = None
    name_alt: Optional[str] = None
    display_name_field: Optional[str] = None
    my_rating: Optional[str] = None
    logo_file: Optional[str] = None
    logo_focus: ImageFocus = None
    remark: Optional[str] = None
    founded_date: Optional[str] = None
    defunct_date: Optional[str] = None
    country: Optional[str] = None
    website_url: Optional[str] = None
    mal_id: Optional[int] = None
    mal_link: Optional[str] = None

    @model_validator(mode="after")
    def at_least_one_name(self):
        """
        Mirrors ck_studio_has_a_name, so a nameless studio is a 422 from the
        API rather than a 500 surfacing the database's IntegrityError.
        """
        if not any(
            (self.name_en, self.name_cn, self.name_jp, self.name_alt)
        ):
            raise ValueError("A studio needs at least one name.")
        if self.display_name_field not in (None, "en", "cn", "jp", "alt"):
            raise ValueError("display_name_field must be en, cn, jp or alt.")
        return self


class StudioCreate(StudioBase):
    pass


class StudioUpdate(StudioBase):
    pass


class StudioResponse(StudioBase):
    system_id: UUID
    # The id the SPA puts in the URL. Never gated: a viewer allowed to see the
    # entry must be able to link to it.
    public_id: int
    display_name: str = ""
    credit_count: int = 0
    # Hyphenated media types of the visible entries this studio is credited
    # on, sorted and distinct; restricted is True when one is a gated type.
    # Same semantics as PersonResponse's, from the same visible pair set as
    # credit_count (credits.credit_summaries).
    media_types: List[str] = []
    restricted: bool = False

    model_config = ConfigDict(from_attributes=True)


class MergeRequest(BaseModel):
    source_id: UUID


class MembershipRef(BaseModel):
    """
    One end of a club membership, as a page links to it: the other person.

    `position` is the member's place in the club's member list. On a
    person's list of clubs it is still that club-side position, and the list
    itself is ordered by the clubs' display names.
    """

    system_id: UUID
    public_id: int
    display_name: str
    position: int = 0


class ClubsReplace(BaseModel):
    """PUT /api/person/{id}/clubs: every club this person belongs to."""

    club_ids: List[UUID]


class MembersReplace(BaseModel):
    """PUT /api/person/{id}/members: this club's members, in display order."""

    member_ids: List[UUID]
