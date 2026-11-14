"""One account's rating, and for a grouping tier its expectation, of one
catalogue row.

The rating of a collection, franchise, series, character, person, studio or
publisher, and the expectation of the three tiers, are opinions: two people
can disagree about them and both be right, so each belongs to a user. They
used to be columns on the shared rows (`my_rating`, `*_expectation`), which
held exactly one person's view.

The owner is one FK column per owning table rather than an (owner_type,
owner_id) pair, the shape `note` and `watch_order_follow` already use: a real
foreign key cascades, so deleting the franchise or the account takes the
rating with it. Exactly one owner column is set (ck_user_rating_one_owner),
an expectation only on a tier (ck_user_rating_expectation_on_tier), and one
row per user per owner (uq_user_rating_owner, NULLS NOT DISTINCT because six
of the seven owner columns are NULL on every row).

A row holding neither value is not stored: app/services/domain/user_rating.py
deletes it, as user_novel_unit_rating does, so "never rated" and "rated, then
cleared" are one state.
"""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now

# The owner columns, in the order the constraints name them. Every reader of
# the table goes through app/services/domain/user_rating.OWNER_COLUMNS, which
# maps an owner type onto one of these.
USER_RATING_OWNER_COLUMNS = (
    "collection_id",
    "franchise_id",
    "series_id",
    "character_id",
    "person_id",
    "studio_id",
    "publisher_id",
)


def _owner_fk(table: str):
    return Column(
        UUID(as_uuid=True),
        ForeignKey(f"{table}.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )


class UserRating(Base):
    __tablename__ = "user_rating"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(" + ", ".join(USER_RATING_OWNER_COLUMNS) + ") = 1",
            name="ck_user_rating_one_owner",
        ),
        CheckConstraint(
            "expectation IS NULL OR "
            "num_nonnulls(collection_id, franchise_id, series_id) = 1",
            name="ck_user_rating_expectation_on_tier",
        ),
        UniqueConstraint(
            "user_id",
            *USER_RATING_OWNER_COLUMNS,
            name="uq_user_rating_owner",
            postgresql_nulls_not_distinct=True,
        ),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    collection_id = _owner_fk("collection")
    franchise_id = _owner_fk("franchise")
    series_id = _owner_fk("series")
    character_id = _owner_fk("character")
    person_id = _owner_fk("person")
    studio_id = _owner_fk("studio")
    publisher_id = _owner_fk("publisher")

    # One of constants.MY_RATINGS - a letter grade.
    my_rating = Column(String, nullable=True)
    # One of constants.FRANCHISE_EXPECTATIONS; tiers only.
    expectation = Column(String, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
