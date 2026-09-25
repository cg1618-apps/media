"""Hentai ORM model."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKeyConstraint,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class Hentai(Base, NameFallbackMixin):
    """
    Adult anime, seen in the `unrestricted` access mode only.

    One entry is one episode, so there is no episode count and watch orders
    treat an entry as whole. Tenrai fills three things from `mal_link`:
    airing_status, release_date and the cover (autofill_hentai_from_mal).

    Every row carries the `hentai` content label, attached server-side on
    every write path - REQUIRED_LABEL_FOR_TYPE in
    app/services/rbac/gated_types.py is what makes this a gated type.
    """

    __tablename__ = "hentai"
    __table_args__ = (
        # Pins this row to a media row of its own type: with media's
        # UNIQUE (system_id, media_type) on the other end, this table's row can
        # never attach itself to another type's media row.
        ForeignKeyConstraint(
            ["system_id", "media_type"],
            ["media.system_id", "media.media_type"],
            name="fk_hentai_media",
            ondelete="CASCADE",
            # Deferred because the parent row is written *after* this one: the
            # media row copies public_id, which a Sequence default does not
            # mint until this INSERT runs. Both rows land in one transaction
            # and the pairing is still checked, at COMMIT.
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint("media_type = 'hentai'", name="ck_hentai_media_type"),
        CheckConstraint(
            r"release_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_hentai_release_date_iso",
        ),
    )
    _name_fields = [
        "hentai_name_en",
        "hentai_name_cn",
        "hentai_name_roman",
        "hentai_name_jp",
        "hentai_name_alt",
    ]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # The discriminator half of the composite FK up to `media`. Constant per
    # table and pinned by ck_hentai_media_type; it exists so the FK can carry
    # the type, not because a row could ever be anything else.
    media_type = Column(String, nullable=False, server_default="hentai")

    hentai_name_en = Column(String, nullable=True)
    hentai_name_cn = Column(String, nullable=True)
    hentai_name_roman = Column(String, nullable=True)
    hentai_name_jp = Column(String, nullable=True)
    hentai_name_alt = Column(String, nullable=True)

    # One of HENTAI_SOURCE_MATERIALS: what the episode adapts, or Original.
    source_material = Column(String, nullable=True)
    # One of H_COMIC_ORIGINALITY.
    originality = Column(String, nullable=True)
    # The entry's position in its series.
    series_number = Column(Integer, nullable=True)
    # One of AiringStatus, anime's vocabulary.
    airing_status = Column(String, nullable=True)
    release_date = Column(String, nullable=True)

    # The MyAnimeList entry Tenrai fills airing_status, release_date and the
    # cover from. mal_id is extracted from mal_link, as for anime.
    mal_id = Column(Integer, nullable=True)
    mal_link = Column(String, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.hentai_name_cn),
            ("EN", self.hentai_name_en),
            ("Alt", self.hentai_name_alt),
            ("roman", self.hentai_name_roman),
            ("JP", self.hentai_name_jp),
        ]
        return self.get_fallback_name(sequence, "CN")
