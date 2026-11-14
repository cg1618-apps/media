"""One account's personal values on one catalogue note row.

Some catalogue sections split: the row - an item, an enemy, an ending, a stat,
a song, a mod - is shared, while a few of its values are each viewer's own
(`NoteField.personal` and `NoteSection.personal_status` in
app/utils/note_sections.py): collected and the amount collected, beaten,
completion, my value, and the music and mod statuses. Those values live here,
one row per account per note, keyed by the registry's field key ("status" for
a section-level personal status) - the shape `game_choice_mark` gives a
user's done flag and note on a choice graph.

Deleting the note, or the account, takes the mark with it. A mark holding no
non-empty value is not stored: app/services/domain/note_marks.py deletes it,
so "never marked" and "marked, then cleared" are one state.
"""

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base, get_taipei_now


class NoteMark(Base):
    __tablename__ = "note_mark"
    __table_args__ = (
        UniqueConstraint("user_id", "note_id", name="uq_note_mark_user_note"),
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
    note_id = Column(
        UUID(as_uuid=True),
        ForeignKey("note.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # {field key: value}, every value a non-empty string. The keys are the
    # registry's personal values for the note's section, checked on write.
    values = Column(JSONB, nullable=False)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)
