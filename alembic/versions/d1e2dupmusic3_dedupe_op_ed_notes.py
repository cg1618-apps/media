"""note: fold OP and ED rows that are twins of one another into one

The OP and ED rows were minted by a migration once per database, so the same
row carries a different uuid on every machine. Pull matched Note rows on the
uuid alone and inserted the sheet's copy beside the local one, which turned
one OP into two identical ones on every anime the migration touched. Pull now
matches such a row by content instead (see _match_note_twin in
app/services/pipelines/pull.py); this removes the copies it already made.

Two rows are twins when they share the owner, the section and every content
column. The earliest row is kept. Two identical rows written on purpose - two
unnamed OPs with the same type and status - cannot be told apart from a twin
and fold too; they differ in nothing, so re-adding one loses nothing.

Revision ID: d1e2dupmusic3
Revises: r1e2sourcepg3
Create Date: 2026-09-28 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "d1e2dupmusic3"
down_revision: Union[str, Sequence[str], None] = "r1e2sourcepg3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The deleted copies are gone; a downgrade cannot tell which rows to restore.
irreversible = True


def dedupe(bind) -> None:
    """
    The data half of the migration, against any bind.

    Split out so tests can run the SHIPPED statement against the test session -
    the suite has no Alembic harness.

    NULLIF on the JSONB columns because an empty value is SQL NULL or JSON
    null depending on how the row was written, and the two must partition
    together.
    """
    bind.execute(
        sa.text(
            """
            DELETE FROM note
             WHERE system_id IN (
                SELECT system_id FROM (
                    SELECT system_id,
                           row_number() OVER (
                               PARTITION BY media_id, section, parent_id,
                                            locator, kind, status, title,
                                            content,
                                            NULLIF(links, 'null'::jsonb),
                                            NULLIF(entries, 'null'::jsonb),
                                            NULLIF(fields, 'null'::jsonb)
                               ORDER BY created_at, system_id
                           ) AS copy
                      FROM note
                     WHERE section IN ('op', 'ed')
                       AND media_id IS NOT NULL
                ) ranked
                WHERE copy > 1
             )
            """
        )
    )


def upgrade() -> None:
    dedupe(op.get_bind())


def downgrade() -> None:
    # See `irreversible` above: nothing to undo that can be undone.
    pass
