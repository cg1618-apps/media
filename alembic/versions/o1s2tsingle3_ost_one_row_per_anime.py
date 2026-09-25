"""OST is one row per anime

The `ost` note section holds one entry per anime - a type and a status - rather
than a list of songs. The registry marks it singleton and the note router
refuses a second row; this revision makes the data agree and lets the database
enforce it.

What this revision does:

  note   deletes every `ost` row but one per anime, keeping the most recently
         updated. The extra rows are duplicates: every anime carrying an OST
         held two rows with the same type and status, written in two batches.
  note   a partial unique index, ix_note_one_ost_per_owner, on media_id where
         section = 'ost'. `ost` is anime-only, so media_id is the whole owner.

It refuses to run if any `ost` row carries a song name, a remark, a link,
a locator, entries or structured fields: the section has no place for them
any more, so deleting or clearing them would lose something a person wrote.
Such a row is moved by hand first.

Downgrade drops the index and leaves the rows alone. The deleted duplicates
said nothing their kept twin does not, so there is nothing to restore.

Revision ID: o1s2tsingle3
Revises: h1c2o3m4i5c6
Create Date: 2026-09-25 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "o1s2tsingle3"
down_revision: Union[str, Sequence[str], None] = "h1c2o3m4i5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CARRYING_EXTRA = """
SELECT count(*) FROM note
WHERE section = 'ost'
  AND (
    title IS NOT NULL
    OR content IS NOT NULL
    OR locator IS NOT NULL
    OR (links IS NOT NULL AND links <> 'null'::jsonb AND links <> '[]'::jsonb)
    OR (entries IS NOT NULL AND entries <> 'null'::jsonb AND entries <> '[]'::jsonb)
    OR (fields IS NOT NULL AND fields <> 'null'::jsonb AND fields <> '{}'::jsonb)
  )
"""

DELETE_ALL_BUT_LATEST = """
DELETE FROM note
WHERE section = 'ost'
  AND system_id NOT IN (
    SELECT DISTINCT ON (media_id) system_id
    FROM note
    WHERE section = 'ost'
    ORDER BY media_id, updated_at DESC NULLS LAST,
             created_at DESC NULLS LAST, system_id
  )
"""


def upgrade() -> None:
    bind = op.get_bind()
    carrying = bind.execute(sa.text(CARRYING_EXTRA)).scalar()
    if carrying:
        raise RuntimeError(
            f"{carrying} 'ost' note row(s) carry a song name, remark, link or "
            "other field the one-entry OST section cannot hold. Move them by "
            "hand before upgrading."
        )
    op.execute(DELETE_ALL_BUT_LATEST)
    op.create_index(
        "ix_note_one_ost_per_owner",
        "note",
        ["media_id"],
        unique=True,
        postgresql_where=sa.text("section = 'ost'"),
    )


def downgrade() -> None:
    op.drop_index("ix_note_one_ost_per_owner", table_name="note")
