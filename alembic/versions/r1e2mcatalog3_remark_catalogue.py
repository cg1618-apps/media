"""備註 Remark becomes a catalogue section; every existing remark moves to 備註列表

`remark` turns from a personal-scope singleton (one row per owner per author)
into a catalogue-scope singleton (one shared row per owner, written under
manage.catalog and read by everyone who can see the owner). The rows it holds
today are personal assessments, so none of them is published: each becomes a
備註列表 Remark List row instead, which is personal.

  remark rows   every one is turned into a `remark_list` row IN PLACE - same
                system_id, owner, author, content and timestamps, so nothing
                attached to it (a note_mark, a sheet's id) loses its row, and
                a remark is never handed to another account. `links` becomes
                [] (the empty form remark_list rows store), and `sort_index`
                one below the lowest of that author's remark_list rows on the
                same owner, so the old remark reads first; 0 when there are
                none. A NULL sort_index reads as 0, as the notes router
                orders it.
  index         ix_note_one_remark_per_owner loses `author_id`: same name,
                same predicate, NULLS NOT DISTINCT, one row per owner.

Downgrade puts the per-author index back and nothing else. The catalogue
remarks written since are one per owner, so they are valid per-author rows
too, and stay; the moved rows stay in 備註列表, because a remark_list row the
migration moved cannot be told from one somebody typed.

Revision ID: r1e2mcatalog3
Revises: n1l2inkpairs3
Create Date: 2026-11-17 00:00:00.000000

"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "r1e2mcatalog3"
down_revision: Union[str, Sequence[str], None] = "n1l2inkpairs3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger(f"alembic.runtime.migration.{revision}")

INDEX = "ix_note_one_remark_per_owner"
OWNER_COLUMNS = ["media_id", "collection_id", "franchise_id", "series_id"]
PREDICATE = "section = 'remark'"

# One statement, so every subquery reads the table as it was before the
# update: the moved rows never count towards each other's minimum.
_MOVE = sa.text(
    """
    UPDATE note AS n
    SET section = 'remark_list',
        links = '[]'::jsonb,
        sort_index = COALESCE(
            (
                SELECT MIN(COALESCE(m.sort_index, 0)) - 1
                FROM note AS m
                WHERE m.section = 'remark_list'
                  AND m.author_id = n.author_id
                  AND m.media_id IS NOT DISTINCT FROM n.media_id
                  AND m.collection_id IS NOT DISTINCT FROM n.collection_id
                  AND m.franchise_id IS NOT DISTINCT FROM n.franchise_id
                  AND m.series_id IS NOT DISTINCT FROM n.series_id
            ),
            0
        )
    WHERE n.section = 'remark'
    """
)


def _create_index(conn, columns) -> None:
    conn.execute(
        sa.text(
            f"CREATE UNIQUE INDEX {INDEX} ON note ({', '.join(columns)}) "
            f"NULLS NOT DISTINCT WHERE {PREDICATE}"
        )
    )


def index_per_owner(conn) -> None:
    """The catalogue shape: one remark per owner."""
    conn.execute(sa.text(f"DROP INDEX IF EXISTS {INDEX}"))
    _create_index(conn, OWNER_COLUMNS)


def index_per_author(conn) -> None:
    """The personal shape this revision replaces: one per owner per author."""
    conn.execute(sa.text(f"DROP INDEX IF EXISTS {INDEX}"))
    _create_index(conn, [*OWNER_COLUMNS, "author_id"])


def move_remarks(conn) -> int:
    """Every remark row becomes a remark_list row; returns how many moved."""
    moved = conn.execute(_MOVE).rowcount
    logger.info("moved %d remark row(s) to remark_list", moved)
    return moved


def upgrade() -> None:
    conn = op.get_bind()
    # Dropped first: the per-owner index cannot exist while two authors hold
    # a remark on one owner, and after the move no remark row is left.
    conn.execute(sa.text(f"DROP INDEX IF EXISTS {INDEX}"))
    move_remarks(conn)
    index_per_owner(conn)


def downgrade() -> None:
    index_per_author(op.get_bind())
