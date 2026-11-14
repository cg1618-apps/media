"""One account's favourite quote or meme.

Whether a quote or a meme is a favourite is an opinion, so each account
keeps its own. It used to be an `is_favorite` column on the shared row,
which held one person's choice for everybody.

The item is one of two FK columns, `quote_id` or `meme_id`, each CASCADE -
the shape `user_rating` and `note` use, so deleting the quote, the meme or
the account takes the favourite with it. Exactly one is set
(ck_user_favorite_one_item), and an account favours an item once
(uq_user_favorite_quote, uq_user_favorite_meme; the NULL in the other column
keeps the two from colliding).

A row exists only while the item is a favourite: un-favouring deletes it
(app/services/domain/user_favorite.py), so "never favoured" and "favoured,
then cleared" are one state.
"""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base, get_taipei_now


class UserFavorite(Base):
    __tablename__ = "user_favorite"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(quote_id, meme_id) = 1",
            name="ck_user_favorite_one_item",
        ),
        UniqueConstraint("user_id", "quote_id", name="uq_user_favorite_quote"),
        UniqueConstraint("user_id", "meme_id", name="uq_user_favorite_meme"),
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
    quote_id = Column(
        UUID(as_uuid=True),
        ForeignKey("quote.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    meme_id = Column(
        UUID(as_uuid=True),
        ForeignKey("meme.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
