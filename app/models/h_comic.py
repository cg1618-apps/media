"""H-Comic ORM model."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKeyConstraint,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class HComic(Base, NameFallbackMixin):
    """
    Adult comics, seen in the `unrestricted` access mode only.

    One table, two variants keyed on `region` (JP or KR), the same pattern as
    novel's `type`. The variants share most of their columns; the ones a
    region does not use are CLEARED on every write path rather than merely
    hidden by the form (app/services/domain/h_comic.py):

        JP only   originality, animation_status, series_number, page_total
        KR only   ch_total, ch_behind, highlight_group_order

    A name column the region does not use (`h_comic_name_jp` on KR,
    `h_comic_name_kr` on JP) is kept, because a name is harmless.

    Every row carries the `h-comic` content label, attached server-side on
    every write path - REQUIRED_LABEL_FOR_TYPE in
    app/services/rbac/gated_types.py is what makes this a gated type.
    """

    __tablename__ = "h_comic"
    __table_args__ = (
        # Pins this row to a media row of its own type: with media's
        # UNIQUE (system_id, media_type) on the other end, this table's row can
        # never attach itself to another type's media row.
        ForeignKeyConstraint(
            ["system_id", "media_type"],
            ["media.system_id", "media.media_type"],
            name="fk_h_comic_media",
            ondelete="CASCADE",
            # Deferred because the parent row is written *after* this one: the
            # media row copies public_id, which a Sequence default does not
            # mint until this INSERT runs. Both rows land in one transaction
            # and the pairing is still checked, at COMMIT.
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint("media_type = 'h-comic'", name="ck_h_comic_media_type"),
        CheckConstraint(
            r"release_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_h_comic_release_date_iso",
        ),
        CheckConstraint(
            r"end_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_h_comic_end_date_iso",
        ),
    )
    _name_fields = [
        "h_comic_name_en",
        "h_comic_name_cn",
        "h_comic_name_alt",
        "h_comic_name_jp",
        "h_comic_name_kr",
    ]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # The discriminator half of the composite FK up to `media`. Constant per
    # table and pinned by ck_h_comic_media_type; it exists so the FK can carry
    # the type, not because a row could ever be anything else.
    media_type = Column(String, nullable=False, server_default="h-comic")

    h_comic_name_en = Column(String, nullable=True)
    h_comic_name_cn = Column(String, nullable=True)
    h_comic_name_alt = Column(String, nullable=True)
    h_comic_name_jp = Column(String, nullable=True)  # JP
    h_comic_name_kr = Column(String, nullable=True)  # KR

    # One of H_COMIC_REGIONS. Required by the write schemas; nullable here so
    # a Pull of a row with a blank cell reports rather than rolls back a tab.
    region = Column(String, nullable=True)
    originality = Column(String, nullable=True)  # JP, H_COMIC_ORIGINALITY
    animation_status = Column(String, nullable=True)  # JP, hand-set
    # The entry's position in its series, like a volume number. JP.
    series_number = Column(Integer, nullable=True)
    serialization_status = Column(String, nullable=True)
    page_total = Column(Integer, nullable=True)  # JP
    ch_total = Column(Integer, nullable=True)  # KR
    # Chapters behind the official source. Hand-set, never derived. KR.
    ch_behind = Column(Integer, nullable=True)

    release_date = Column(String, nullable=True)
    end_date = Column(String, nullable=True)

    # The owner's order of the KR highlight GROUPS (one group per female
    # character name): a list of names, read and written whole. Names absent
    # from it render after it, in first-appearance order. KR.
    highlight_group_order = Column(JSONB, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.h_comic_name_cn),
            ("EN", self.h_comic_name_en),
            ("Alt", self.h_comic_name_alt),
            ("JP", self.h_comic_name_jp),
            ("KR", self.h_comic_name_kr),
        ]
        return self.get_fallback_name(sequence, "CN")
