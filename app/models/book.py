"""Book ORM model."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class Book(Base, NameFallbackMixin):
    """Books: light novels, novels, web novels, short-story collections, guides
    and setting books - see BOOK_TYPES."""

    __tablename__ = "book"
    __table_args__ = (
        # Pins this row to a media row of its own type: with media's
        # UNIQUE (system_id, media_type) on the other end, this table's row can
        # never attach itself to another type's media row.
        ForeignKeyConstraint(
            ["system_id", "media_type"],
            ["media.system_id", "media.media_type"],
            name="fk_book_media",
            ondelete="CASCADE",
            # Deferred because the parent row is written *after* this one: the
            # media row copies public_id, which a Sequence default does not
            # mint until this INSERT runs. Both rows land in one transaction
            # and the pairing is still checked, at COMMIT.
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint("media_type = 'book'", name="ck_book_media_type"),
        CheckConstraint(
            r"release_date_jp ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_book_release_date_jp_iso",
        ),
        CheckConstraint(
            r"release_date_tw ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_book_release_date_tw_iso",
        ),
        CheckConstraint(
            r"end_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_book_end_date_iso",
        ),
    )
    _name_fields = [
        "book_name_en",
        "book_name_cn",
        "book_name_roman",
        "book_name_jp",
        "book_name_alt",
    ]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # The discriminator half of the composite FK up to `media`. Constant per
    # table and pinned by ck_book_media_type; it exists so the FK can carry
    # the type, not because a row could ever be anything else.
    media_type = Column(String, nullable=False, server_default="book")

    book_name_en = Column(String, nullable=True)
    book_name_cn = Column(String, nullable=True)
    book_name_roman = Column(String, nullable=True)
    book_name_jp = Column(String, nullable=True)
    book_name_alt = Column(String, nullable=True)

    region = Column(String, nullable=True)
    type = Column(String, nullable=True)
    version = Column(String, nullable=True)
    is_main = Column(String, nullable=True)
    serialization_status = Column(String, nullable=True)

    vol_total_original = Column(Float, nullable=True)
    vol_total_tw = Column(Float, nullable=True)
    arc_total = Column(Float, nullable=True)
    ch_total = Column(Float, nullable=True)
    # Chapters read into the arc *currently* being read, which is the arc at
    # position arc_fin + 1. Zero for every book with no arc rows.

    mal_rating = Column(Float, nullable=True)
    mal_rank = Column(String, nullable=True)
    # AniList's averageScore is an integer 0-100 and both ranks are
    # positions. mal_rank next door is a String for historical reasons; that
    # is not a reason to repeat it.
    anilist_rating = Column(Integer, nullable=True)
    anilist_rank = Column(Integer, nullable=True)
    anilist_popularity_rank = Column(Integer, nullable=True)

    # The original's first publication, and the Taiwanese edition's. The
    # original is a Japanese one for most of this collection, as Anime's is.
    release_date_jp = Column(String, nullable=True)
    release_date_tw = Column(String, nullable=True)
    end_date = Column(String, nullable=True)


    mal_id = Column(Integer, nullable=True)
    mal_link = Column(String, nullable=True)
    # An Open Library *work* URL and the OL...W id derived from it. String, not
    # Integer like comicvine_id: the trailing W is what separates a work from an
    # edition (OL...M) or an author (OL...A).
    openlibrary_link = Column(String, nullable=True)
    openlibrary_id = Column(String, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    units = relationship(
        "BookUnit",
        back_populates="book",
        cascade="all, delete-orphan",
        order_by="BookUnit.position",
    )

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.book_name_cn),
            ("EN", self.book_name_en),
            ("Alt", self.book_name_alt),
            ("roman", self.book_name_roman),
            ("JP", self.book_name_jp),
        ]
        return self.get_fallback_name(sequence, "CN")


class BookUnit(Base):
    """
    One volume, arc, story or chapter belonging to exactly one Book.

    Replaces the two parallel JSONB lists (book_name_each_cn/_en) that could
    drift out of alignment, because they were matched by list position and
    nothing else. One row now holds both languages.

    The kind asymmetry matters (Decision B in the design doc): volume rows are
    optional enrichment and nothing derives from them — vol_total_original /
    vol_total_tw remain the denominators. Arc rows are authoritative, because
    ch_count lives nowhere else.
    """

    __tablename__ = "book_unit"
    __table_args__ = (
        CheckConstraint(
            "unit_kind IN ('volume','arc','story','chapter')",
            name="ck_book_unit_kind",
        ),
        # ch_count is the arc's chapter count; it means nothing on other kinds.
        CheckConstraint(
            "unit_kind = 'arc' OR ch_count IS NULL",
            name="ck_book_unit_ch_count_arc_only",
        ),
        Index("ix_book_unit_book_kind_position", "book_id", "unit_kind", "position"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    book_id = Column(
        UUID(as_uuid=True),
        ForeignKey("book.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    unit_kind = Column(String, nullable=False)
    # Float, matching the half-volume convention on vol_fin.
    # Deliberately NOT unique: the editor reorders by swapping adjacent
    # values, and a unique constraint would fire mid-swap.
    position = Column(Float, nullable=False)
    unit_key = Column(String, nullable=True)
    name_cn = Column(String, nullable=True)
    name_en = Column(String, nullable=True)
    ch_count = Column(Float, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    book = relationship("Book", back_populates="units")
