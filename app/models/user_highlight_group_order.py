"""One account's order of the highlight groups on one h-comic or h-game.

The h-comic and h-game highlight sections (h_comic_highlights,
h_game_highlights) are personal notes, and their read view draws one group
per female character name. Which group comes first is as much one person's
as the rows are, so the order is kept per account: a list of names, read and
written whole. Names absent from it render after it, in first-appearance
order.

`media_id` is `media.system_id`, which IS the h_comic / h_game row's
system_id (the composite FK fk_h_comic_media / fk_h_game_media pins the two
together), so deleting the entry - or the account - takes the order with it.
One row per user per entry (uq_user_highlight_group_order).

An empty or cleared order is not stored:
app/services/domain/highlight_group_order.py deletes the row, so "never
ordered" and "ordered, then cleared" are one state.
"""

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base, get_taipei_now


class UserHighlightGroupOrder(Base):
    __tablename__ = "user_highlight_group_order"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "media_id", name="uq_user_highlight_group_order"
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
    media_id = Column(
        UUID(as_uuid=True),
        ForeignKey("media.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # A list of female character names, normalised by
    # app.services.domain.h_comic.normalize_group_order: trimmed, no blanks,
    # no repeats, never empty.
    group_order = Column(JSONB, nullable=False)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
