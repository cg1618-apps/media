"""Character entity ORM models: characters, their tags and their per-entry castings."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Sequence,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class Character(Base, NameFallbackMixin):
    """
    One fictional character, shared across every entry they appear in.

    Shaped like Person deliberately, with ONE deviation: there is no unique
    constraint over the names. uq_person_name works because a human's full
    name is nearly unique; character names are not - "Yuki" and "Ichika" recur
    across unrelated works - and a character has no owning franchise to scope
    a constraint to, so any uniqueness rule here would refuse legitimate rows.
    Duplicates are found by the name-match search the cast editor runs and
    fixed by the merge endpoint. Do not "restore" a constraint to match the
    siblings; test_two_unrelated_characters_may_share_a_name will stop you.
    See the design spec's Decision G.
    """

    __tablename__ = "character"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
            name="ck_character_has_a_name",
        ),
        UniqueConstraint(
            "public_id",
            name="uq_character_public_id",
            # Deferred so a Pull can permute public_id across rows inside
            # one transaction: the sheet can hand row A an id row B still
            # holds until the restore reaches B. Only the end state has to
            # be unique, and it is still checked, at COMMIT.
            deferrable=True,
            initially="DEFERRED",
        ),
    )

    _name_fields = ["name_en", "name_cn", "name_jp", "name_alt"]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # Short, stable, per-table id shown in SPA URLs; system_id remains the
    # join key and never leaves the API.
    public_id = Column(
        Integer,
        Sequence("character_public_id_seq"),
        # server_default as well as the Sequence: the sequence lets
        # SQLAlchemy fill this in, the DEFAULT lets a raw INSERT do it too.
        server_default=text("nextval('character_public_id_seq'::regclass)"),
        nullable=False,
    )
    name_en = Column(String, nullable=True, index=True)
    name_cn = Column(String, nullable=True)
    name_jp = Column(String, nullable=True)
    name_alt = Column(String, nullable=True)
    # One of "en" | "cn" | "jp" | "alt", or NULL for the fallback chain.
    display_name_field = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    # One of constants.MY_RATINGS.
    my_rating = Column(String, nullable=True)
    # Storage key under static/covers/. The canonical portrait; a casting may
    # override it with its own photo_file for how the character looks in that
    # entry.
    photo_file = Column(String, nullable=True)
    # photo_file's focal point, "X% Y%"; NULL centres it. Reset whenever the
    # photo changes - see media.cover_image_focus.
    photo_focus = Column(String, nullable=True)
    # The entry whose picture stands in when photo_file is NULL: a
    # media.system_id this character is cast on. No FK, like
    # franchise.cover_entry_id - a stale id falls through to the automatic
    # choice (app/services/domain/entity_photos.py).
    photo_fallback_entry_id = Column(UUID(as_uuid=True), nullable=True)
    # One of character_roles.CHARACTER_ROLES, or NULL: what the character is
    # to their story overall. character_casting.role is what they are in one
    # entry; when this is NULL it is filled from the castings' highest-ranked
    # role (domain/casting.py fill_character_roles), never overwritten once
    # set. Calculate All's cast sync also fills a casting's empty role from
    # it (domain/casting_sync.py).
    role = Column(String, nullable=True)
    remark = Column(Text, nullable=True)
    # MAL's character record, as person carries its people record: mal_link
    # is what an admin pastes, mal_id is derived from it and is what the cast
    # import matches a MAL character on. Not unique, like person.mal_id - a
    # duplicate is fixed by the merge endpoint, not refused.
    mal_id = Column(Integer, nullable=True, index=True)
    mal_link = Column(String, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    castings = relationship(
        "CharacterCasting",
        back_populates="character",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    tags = relationship(
        "CharacterTag",
        back_populates="character",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    identities = relationship(
        "CharacterIdentity",
        back_populates="character",
        order_by="CharacterIdentity.position",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    _DISPLAY_FIELDS = {
        "en": "name_en", "cn": "name_cn", "jp": "name_jp", "alt": "name_alt",
    }

    @property
    def names_dict(self) -> dict:
        """Every name variation, for resolution and for the detail page."""
        return {
            "en": self.name_en,
            "cn": self.name_cn,
            "jp": self.name_jp,
            "alt": self.name_alt,
        }

    @property
    def display_name(self) -> str:
        """
        The name to show. Like Person and Studio, the choice is DATA:
        display_name_field names the winner, and the chain below is only the
        fallback for when that is NULL or names an empty column.
        """
        chosen = self._DISPLAY_FIELDS.get(self.display_name_field or "")
        if chosen:
            value = getattr(self, chosen)
            if value and value.strip():
                return value.strip()
        sequence = [
            ("EN", self.name_en),
            ("CN", self.name_cn),
            ("JP", self.name_jp),
            ("Alt", self.name_alt),
        ]
        return self.get_fallback_name(sequence, "EN")


class CharacterTag(Base):
    """
    One vocabulary value attached to one character - media_tag's twin.

    `field` is one of credit_roles.CHARACTER_TAG_FIELD_KEYS (appearance,
    trait), each backed by its own system_option category. A separate table
    rather than more media_tag rows, because media_tag.media_id is a real FK
    up to `media` and a character is not an entry.
    """

    __tablename__ = "character_tag"
    __table_args__ = (
        UniqueConstraint(
            "character_id", "field", "option_id", name="uq_character_tag_row"
        ),
        Index("ix_character_tag_character", "character_id"),
    )

    system_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        # Declared as well as the Python default so a raw INSERT gets an id
        # too, as media_content_label does.
        server_default=text("gen_random_uuid()"),
        index=True,
    )
    character_id = Column(
        UUID(as_uuid=True),
        ForeignKey("character.system_id", ondelete="CASCADE"),
        nullable=False,
    )
    # One of credit_roles.CHARACTER_TAG_FIELD_KEYS.
    field = Column(String, nullable=False)
    option_id = Column(
        UUID(as_uuid=True),
        ForeignKey("system_option.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime, default=get_taipei_now)

    character = relationship("Character", back_populates="tags")


class CharacterIdentity(Base, NameFallbackMixin):
    """
    One more identity of a character - an alter ego, a disguise, a civilian
    name. The character row itself is the MAIN identity; only the others are
    rows here, so names, photo and remark are never held twice.

    Visibility is the character's: the identity's own page answers 404
    whenever its character's would. Its public_id is what that page's URL
    carries, as a character's does.

    uq_character_identity_owner is redundant as a key - system_id alone is
    unique - but it is what character_casting's fk_casting_identity
    references, so a cast row's identity always belongs to that row's
    character.
    """

    __tablename__ = "character_identity"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
            name="ck_character_identity_has_a_name",
        ),
        UniqueConstraint(
            "system_id", "character_id", name="uq_character_identity_owner"
        ),
        UniqueConstraint(
            "public_id",
            name="uq_character_identity_public_id",
            # Deferred so a Pull can permute public_id across rows inside
            # one transaction: the sheet can hand row A an id row B still
            # holds until the restore reaches B. Only the end state has to
            # be unique, and it is still checked, at COMMIT.
            deferrable=True,
            initially="DEFERRED",
        ),
    )

    _name_fields = ["name_en", "name_cn", "name_jp", "name_alt"]
    _DISPLAY_FIELDS = Character._DISPLAY_FIELDS

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # Short, stable, per-table id shown in SPA URLs; system_id remains the
    # join key.
    public_id = Column(
        Integer,
        Sequence("character_identity_public_id_seq"),
        # server_default as well as the Sequence: the sequence lets
        # SQLAlchemy fill this in, the DEFAULT lets a raw INSERT do it too.
        server_default=text("nextval('character_identity_public_id_seq'::regclass)"),
        nullable=False,
    )
    character_id = Column(
        UUID(as_uuid=True),
        ForeignKey("character.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name_en = Column(String, nullable=True)
    name_cn = Column(String, nullable=True)
    name_jp = Column(String, nullable=True)
    name_alt = Column(String, nullable=True)
    # One of "en" | "cn" | "jp" | "alt", or NULL for the fallback chain.
    display_name_field = Column(String, nullable=True)
    # One of constants.GENDERS, or NULL: the same as the character's,
    # resolved on read (services/domain/character_identities.py), never copied.
    gender = Column(String, nullable=True)
    remark = Column(Text, nullable=True)
    # Storage key under static/covers/character-identity/. NULL shows the
    # character's picture.
    photo_file = Column(String, nullable=True)
    photo_focus = Column(String, nullable=True)
    position = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    character = relationship("Character", back_populates="identities")

    # The same rule as the character's own name: display_name_field names the
    # winner, the EN -> CN -> JP -> Alt chain is the fallback.
    names_dict = Character.names_dict
    display_name = Character.display_name


class CharacterCasting(Base):
    """
    One character, in one entry.

    THE cast record - there is no second one. No media_credit row with
    role="seiyuu" exists anywhere, because a seiyuu reaches an anime through
    the character they voice; deriving the entry's seiyuu list from these rows
    is what keeps "who is in this anime" to a single answer. See Decision A.

    Who voices the character is not a column here but CharacterCastingVoice
    rows beneath this one: a character may have several seiyuu in one entry
    (a child and an adult voice, a recast mid-season), and one seiyuu may
    voice several characters, which is simply one person on several castings.

    The entry endpoint is a FK-less (media_type, entry_id) pair, the same
    contract media_credit and media_relation use.
    """

    __tablename__ = "character_casting"
    __table_args__ = (
        # One casting per character per IDENTITY per entry: identity_id NULL is
        # the main identity, and NULLS NOT DISTINCT makes two NULLs collide,
        # so the main identity is still cast at most once per entry.
        UniqueConstraint(
            "character_id",
            "identity_id",
            "media_type",
            "entry_id",
            name="uq_character_casting",
            postgresql_nulls_not_distinct=True,
        ),
        # The identity must be one of THIS row's character's. A NULL
        # identity_id is not checked (MATCH SIMPLE). Deferred, so character
        # merge can move an identity and its cast rows to the survivor in one
        # flush and only the end state is checked, at COMMIT.
        ForeignKeyConstraint(
            ["identity_id", "character_id"],
            ["character_identity.system_id", "character_identity.character_id"],
            name="fk_casting_identity",
            deferrable=True,
            initially="DEFERRED",
        ),
        # Redundant as a key - system_id alone is unique - but it is what
        # character_casting_voice's composite FK references, so a voice row's
        # media_type and entry_id can never disagree with its casting's.
        UniqueConstraint(
            "system_id", "media_type", "entry_id", name="uq_character_casting_entry"
        ),
        Index("ix_character_casting_entry", "media_type", "entry_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    character_id = Column(
        UUID(as_uuid=True),
        ForeignKey("character.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # NULL is the main identity (the character row itself); otherwise one of
    # the character's character_identity rows - see fk_casting_identity.
    identity_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    # One of casting.CASTING_MEDIA_TYPES (hyphenated keys).
    media_type = Column(String, nullable=False)
    entry_id = Column(UUID(as_uuid=True), nullable=False)
    # One of constants.CHARACTER_ROLES.
    role = Column(String, nullable=True)
    position = Column(Integer, nullable=False, default=0, server_default="0")
    # Storage key: this character AS SHE APPEARS in this entry. NULL falls back
    # to character.photo_file at read time.
    photo_file = Column(String, nullable=True)
    # photo_file's focal point, "X% Y%"; NULL centres it. Falls back with the
    # photo: a casting with no photo_file shows the character's photo_focus.
    photo_focus = Column(String, nullable=True)
    remark = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)

    character = relationship("Character", back_populates="castings")
    voices = relationship(
        "CharacterCastingVoice",
        back_populates="casting",
        order_by="CharacterCastingVoice.position",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class CharacterCastingVoice(Base):
    """
    One seiyuu voicing one casting.

    media_type and entry_id repeat the casting's, held equal by a composite FK
    onto uq_character_casting_entry. They are here so the seiyuu-in-entry
    question - which entries does this person voice in, may this viewer see
    them - reads one table, exactly as media_credit answers it for every
    other role, and so ck_casting_voice_scope can still be a CHECK.

    person_id is ON DELETE CASCADE: this row IS the person's link to the work,
    the way a media_credit row is. Deleting a seiyuu removes their voice and
    leaves the casting - the character's link to the work - in place, which
    is what Decision H protected when person_id sat on the casting with SET
    NULL.
    """

    __tablename__ = "character_casting_voice"
    __table_args__ = (
        ForeignKeyConstraint(
            ["casting_id", "media_type", "entry_id"],
            [
                "character_casting.system_id",
                "character_casting.media_type",
                "character_casting.entry_id",
            ],
            name="fk_casting_voice_casting",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        UniqueConstraint("casting_id", "person_id", name="uq_casting_voice"),
        # Characters reach the ACG types (CASTING_MEDIA_TYPES); seiyuu reach
        # only the ones with voice acting (VOICED_MEDIA_TYPES).
        # Enforced here rather than by convention because the Fill pipeline and
        # any future migration write these rows without going through the API.
        CheckConstraint(
            "media_type IN ('anime', 'anime-movie', 'hentai')",
            name="ck_casting_voice_scope",
        ),
        Index("ix_character_casting_voice_entry", "media_type", "entry_id"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    casting_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    media_type = Column(String, nullable=False)
    entry_id = Column(UUID(as_uuid=True), nullable=False)
    person_id = Column(
        UUID(as_uuid=True),
        ForeignKey("person.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position = Column(Integer, nullable=False, default=0, server_default="0")
    # What distinguishes this voice from the casting's others - "child",
    # "ep 13-", "drama CD". Free text.
    remark = Column(Text, nullable=True)
    created_at = Column(DateTime, default=get_taipei_now)

    casting = relationship("CharacterCasting", back_populates="voices")
