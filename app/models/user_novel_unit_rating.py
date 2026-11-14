"""One reader's rating of, and remark on, one novel unit.

novel_unit.my_rating was a per-unit personal rating on a shared row. It cannot
live on user_media_list, which is keyed by media_id, because a unit is a part
of an entry rather than an entry. A two-column join table is the smallest thing
that is correct.

The remark sits beside the rating for the same reason: it was a column on the
shared novel_unit row holding one person's note. A row holding neither a
rating nor a remark is deleted rather than kept (novel_unit_writer and
routes/me_ratings), so "never touched" and "cleared" are one state.
"""

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class UserNovelUnitRating(Base):
    __tablename__ = "user_novel_unit_rating"
    __table_args__ = (
        UniqueConstraint("user_id", "unit_id", name="uq_user_novel_unit"),
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
    unit_id = Column(
        UUID(as_uuid=True),
        ForeignKey("novel_unit.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # One of constants.MY_RATINGS - a letter grade, not a number.
    my_rating = Column(String, nullable=True)
    # The reader's own note on the unit.
    remark = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
