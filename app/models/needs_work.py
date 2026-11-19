"""NeedsWork ORM model - an entry or group whose data is not complete yet.

待補充 Needs Work: a sequel not added yet, names missing, an official name not
released yet. The row's existence is the flag - clearing the mark deletes the
row - so the table holds only what is actually marked, the shape plan_next
and user_favorite use.

The owner is any of the fifteen OWNER_TABLES keys: the twelve media types,
whose row is reached through `media_id`, and one column each for collection,
franchise and series. No single FK spans them, so there are four nullable
foreign keys with a CHECK that exactly one is set - the shape `note` and
`meme` use (see app/models/note.py for the full reasoning). All four CASCADE,
as all four of theirs do, so deleting the owner takes its mark with it.

One mark per owner: each owner column is UNIQUE on its own. A UNIQUE column
treats NULLs as distinct, so the three NULL columns on every row never
collide, and two rows naming the same owner always do.

`note` is optional free text, and it is also how the Needs Work page groups
its rows: marks with the same note are listed together. It is stored trimmed,
and a blank note is stored as NULL.

Column order matters: `format_model_for_sheet` walks __table__.columns in
declaration order, so this is also the Google Sheets column order of the
Needs Work tab.
"""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now


class NeedsWork(Base):
    __tablename__ = "needs_work"
    __table_args__ = (
        CheckConstraint(
            "num_nonnulls(media_id, collection_id, franchise_id, series_id) = 1",
            name="ck_needs_work_one_owner",
        ),
        UniqueConstraint("media_id", name="uq_needs_work_media"),
        UniqueConstraint("collection_id", name="uq_needs_work_collection"),
        UniqueConstraint("franchise_id", name="uq_needs_work_franchise"),
        UniqueConstraint("series_id", name="uq_needs_work_series"),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )

    # --- The owner: exactly one is set. Each is UNIQUE (above), which also
    # gives every owner lookup its index. ---
    media_id = Column(
        UUID(as_uuid=True),
        ForeignKey("media.system_id", ondelete="CASCADE"),
        nullable=True,
    )
    collection_id = Column(
        UUID(as_uuid=True),
        ForeignKey("collection.system_id", ondelete="CASCADE"),
        nullable=True,
    )
    franchise_id = Column(
        UUID(as_uuid=True),
        ForeignKey("franchise.system_id", ondelete="CASCADE"),
        nullable=True,
    )
    series_id = Column(
        UUID(as_uuid=True),
        ForeignKey("series.system_id", ondelete="CASCADE"),
        nullable=True,
    )

    note = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    media = relationship("Media", lazy="joined")

    # Read back from whichever owner column is set, as on Note and Meme.
    # Properties rather than columns, so they stay out of the sheet row.
    @property
    def owner_type(self):
        if self.media_id is not None:
            return self.media.media_type if self.media is not None else None
        if self.collection_id is not None:
            return "collection"
        if self.franchise_id is not None:
            return "franchise"
        if self.series_id is not None:
            return "series"
        return None

    @property
    def owner_id(self):
        return self.media_id or self.collection_id or self.franchise_id or self.series_id
