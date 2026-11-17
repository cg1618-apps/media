"""Anime ORM model."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKeyConstraint,
    Integer,
    String,
    Time,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class Anime(Base, NameFallbackMixin):
    """
    The granular media entry. Contains all metadata for tracking, production, and sources.
    """

    __tablename__ = "anime"
    __table_args__ = (
        CheckConstraint(
            r"release_date_jp ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_anime_release_date_jp_iso",
        ),
        CheckConstraint(
            r"release_date_tw ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_anime_release_date_tw_iso",
        ),
        # Pins this row to a media row of its own type: with media's
        # UNIQUE (system_id, media_type) on the other end, an anime row can
        # never attach itself to a manga's media row.
        ForeignKeyConstraint(
            ["system_id", "media_type"],
            ["media.system_id", "media.media_type"],
            name="fk_anime_media",
            ondelete="CASCADE",
            # Deferred because the parent row is written *after* this one: the
            # media row copies public_id, which a Sequence default does not
            # mint until this INSERT runs. Both rows land in one transaction
            # and the pairing is still checked, at COMMIT.
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint("media_type = 'anime'", name="ck_anime_media_type"),
    )
    _name_fields = [
        "anime_name_en",
        "anime_name_cn",
        "anime_name_roman",
        "anime_name_jp",
        "anime_name_alt",
    ]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # The discriminator half of the composite FK up to `media`. Constant per
    # table and pinned by ck_anime_media_type; it exists so the FK can carry
    # the type, not because a row could ever be anything else.
    media_type = Column(String, nullable=False, server_default="anime")

    anime_name_en = Column(String, nullable=True)
    anime_name_cn = Column(String, nullable=True)
    anime_name_roman = Column(String, nullable=True)
    anime_name_jp = Column(String, nullable=True)
    anime_name_alt = Column(String, nullable=True)

    season_part = Column(String, nullable=True)
    airing_type = Column(String, nullable=True)
    airing_status = Column(String, nullable=True)
    is_main = Column(String, nullable=True)
    # ANIME_ORIGINAL_OR_REMAKE - Original / Remake. Not is_main's question
    # (本傳 / 外傳 / ...), so a column of its own. Never NULL: a row that says
    # nothing is the original. No CHECK constraint, matching is_main; the
    # write schemas refuse anything else.
    original_or_remake = Column(
        String, nullable=False, default="Original", server_default="Original"
    )

    ep_previous = Column(Integer, nullable=True)
    ep_total = Column(Integer, nullable=True)
    # Where a special sits among the episodes, as a label: 0, 14.5, 17.5A.
    # Text, canonical per app/utils/ep_special.py; nothing sorts it or does
    # arithmetic on it.
    ep_special = Column(String, nullable=True)
    # Minutes per episode.
    runtime_min = Column(Integer, nullable=True)

    mal_rating = Column(Float, nullable=True)
    mal_rank = Column(String, nullable=True)
    # AniList's averageScore is an integer 0-100 and both ranks are
    # positions. mal_rank next door is a String for historical reasons; that
    # is not a reason to repeat it.
    anilist_rating = Column(Integer, nullable=True)
    anilist_rank = Column(Integer, nullable=True)
    anilist_popularity_rank = Column(Integer, nullable=True)

    # The season is the Japanese airing's: release_season and the year of
    # release_date_jp, never of release_date_tw.
    release_season = Column(String, nullable=True)
    release_date_jp = Column(String, nullable=True)
    release_date_tw = Column(String, nullable=True)

    broadcast_day = Column(String, nullable=True)
    broadcast_time = Column(Time, nullable=True)

    mal_id = Column(Integer, nullable=True)
    mal_link = Column(String, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    # Relationships

    @property
    def names_dict(self) -> dict:
        """Returns all name variations for hierarchy resolution."""
        return {
            "en": self.anime_name_en,
            "cn": self.anime_name_cn,
            "roman": self.anime_name_roman,
            "jp": self.anime_name_jp,
            "alt": self.anime_name_alt,
        }

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.anime_name_cn),
            ("EN", self.anime_name_en),
            ("Alt", self.anime_name_alt),
            ("roman", self.anime_name_roman),
            ("JP", self.anime_name_jp),
        ]
        return self.get_fallback_name(sequence, "CN")
