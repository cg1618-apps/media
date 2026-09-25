"""H-Game ORM model."""

import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class HGame(Base, NameFallbackMixin):
    """
    Adult games, seen in the `unrestricted` access mode only.

    What `h_comic` is to `manga`, this is to `games`: a table of its own that
    reuses Game's machinery - the IGDB and Steam fill, purchase records
    (`game_copy`), DLC chains and the game note sections - without sharing
    Game's table. The unit is the purchasable, as for Game: a DLC is a row
    here with a base_game_id.

    Game columns it does not keep: hours_played, the two Metacritic figures,
    all_achievements and all_collected. Its own: playstyle, all_cg, the
    language / audio / animation / H-presentation / art style / platform
    fields and the two DLsite links. The fixed-choice fields carry vocabularies from
    app/utils/constants.py and, as on Game, no CHECK constraint; the
    multi-choice ones are JSONB lists validated on every write path
    (app/services/domain/h_game.py).

    Every row carries the `h-game` content label, attached server-side on
    every write path - REQUIRED_LABEL_FOR_TYPE in
    app/services/rbac/gated_types.py is what makes this a gated type.
    """

    __tablename__ = "h_game"
    __table_args__ = (
        # Pins this row to a media row of its own type: with media's
        # UNIQUE (system_id, media_type) on the other end, this table's row can
        # never attach itself to another type's media row.
        ForeignKeyConstraint(
            ["system_id", "media_type"],
            ["media.system_id", "media.media_type"],
            name="fk_h_game_media",
            ondelete="CASCADE",
            # Deferred because the parent row is written *after* this one: the
            # media row copies public_id, which a Sequence default does not
            # mint until this INSERT runs. Both rows land in one transaction
            # and the pairing is still checked, at COMMIT.
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint("media_type = 'h-game'", name="ck_h_game_media_type"),
        CheckConstraint(
            r"release_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_h_game_release_date_iso",
        ),
        CheckConstraint(
            "game_type <> 'Base Game' OR base_game_id IS NULL",
            name="ck_h_game_base_no_parent",
        ),
        CheckConstraint(
            "base_game_id IS NULL OR base_game_id <> system_id",
            name="ck_h_game_not_self_parent",
        ),
    )

    _name_fields = [
        "h_game_name_en",
        "h_game_name_cn",
        "h_game_name_roman",
        "h_game_name_jp",
        "h_game_name_alt",
    ]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # The discriminator half of the composite FK up to `media`. Constant per
    # table and pinned by ck_h_game_media_type.
    media_type = Column(String, nullable=False, server_default="h-game")

    h_game_name_en = Column(String, nullable=True)
    h_game_name_cn = Column(String, nullable=True)
    h_game_name_jp = Column(String, nullable=True)
    h_game_name_roman = Column(String, nullable=True)
    h_game_name_alt = Column(String, nullable=True)

    # The entry's position in its series.
    series_number = Column(Integer, nullable=True)
    # One of H_GAME_PLAYSTYLES.
    playstyle = Column(String, nullable=True)

    # GAME_TYPES. Self-reference, SET NULL for Game's reason: deleting a base
    # game must not delete the DLC rows that were bought separately.
    game_type = Column(String, nullable=True)
    base_game_id = Column(
        UUID(as_uuid=True),
        ForeignKey("h_game.system_id", ondelete="SET NULL"),
        nullable=True,
    )

    release_status = Column(String, nullable=True)  # GAME_RELEASE_STATUSES
    release_date = Column(String, nullable=True)
    current_patch = Column(String, nullable=True)

    completion_level = Column(String, nullable=True)  # COMPLETION_LEVELS
    # GAME_COMPLETION_FLAGS, NULL the unrecorded fourth state - as on Game.
    all_endings = Column(String, nullable=True)
    all_cg = Column(String, nullable=True)
    # Whether Steam may write this entry's progress; NULL counts as
    # permission, as on Game.
    steam_progress_sync = Column(Boolean, nullable=True)
    achievements_earned = Column(Integer, nullable=True)
    achievements_total = Column(Integer, nullable=True)

    # The three public time-to-beat tiers, from IGDB.
    hltb_main = Column(Float, nullable=True)
    hltb_main_extra = Column(Float, nullable=True)
    hltb_completionist = Column(Float, nullable=True)

    price_original_us = Column(Numeric(10, 2), nullable=True)
    price_original_jp = Column(Numeric(10, 2), nullable=True)
    price_original_tw = Column(Numeric(10, 2), nullable=True)
    price_current_us = Column(Numeric(10, 2), nullable=True)
    price_current_jp = Column(Numeric(10, 2), nullable=True)
    price_current_tw = Column(Numeric(10, 2), nullable=True)

    # One of H_GAME_LANGUAGE_AVAILABILITY.
    language_availability = Column(String, nullable=True)
    # A list over H_GAME_AUDIO_AVAILABILITY, in vocabulary order.
    audio_availability = Column(JSONB, nullable=True)
    # NULL is "unknown", not "no".
    animation_availability = Column(Boolean, nullable=True)
    # A list over H_GAME_H_PRESENTATIONS, in vocabulary order.
    h_presentation = Column(JSONB, nullable=True)
    # A list over H_GAME_ART_STYLES, in vocabulary order: what the game looks
    # like, independent of h_presentation.
    art_style = Column(JSONB, nullable=True)
    # A list over H_GAME_PLATFORMS, in vocabulary order. Hand-set, never
    # filled from IGDB, and not Game's game_platform tag field.
    platform = Column(JSONB, nullable=True)

    igdb_id = Column(Integer, nullable=True)
    igdb_link = Column(String, nullable=True)
    # Adopted as a pair from IGDB or pasted in, exactly as on Game.
    steam_appid = Column(Integer, nullable=True)
    steam_link = Column(String, nullable=True)
    # Plain links: nothing fetches DLsite, so there is no id column.
    dlsite_link_jp = Column(String, nullable=True)
    dlsite_link_tw = Column(String, nullable=True)

    # The owner's order of the highlight GROUPS (one group per female
    # character name), read and written whole - h_comic's column, for the
    # h_game_highlights section.
    highlight_group_order = Column(JSONB, nullable=True)

    # Favourite-grid slot per grid key, as on Game.
    type_slots = Column(JSONB, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    # The purchase records, shared with Game: game_copy.game_id points at
    # media.system_id, which every entry shares with its media row.
    copies = relationship(
        "GameCopy",
        primaryjoin="HGame.system_id == foreign(GameCopy.game_id)",
        # Game.copies writes the same column. The two never meet on one row:
        # a copy's game_id is one entry's id, which is a game's or an
        # h-game's, never both.
        overlaps="copies",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="GameCopy.position",
    )

    base_game = relationship(
        "HGame",
        remote_side="HGame.system_id",
        viewonly=True,
        lazy="selectin",
    )

    @property
    def names_dict(self) -> dict:
        return {
            "en": self.h_game_name_en,
            "cn": self.h_game_name_cn,
            "roman": self.h_game_name_roman,
            "jp": self.h_game_name_jp,
            "alt": self.h_game_name_alt,
        }

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.h_game_name_cn),
            ("EN", self.h_game_name_en),
            ("Alt", self.h_game_name_alt),
            ("Roman", self.h_game_name_roman),
            ("JP", self.h_game_name_jp),
        ]
        return self.get_fallback_name(sequence, "CN")
