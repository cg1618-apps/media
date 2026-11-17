"""Add anime.original_or_remake

Whether an anime is the original work or a remake of one, over its own
vocabulary ANIME_ORIGINAL_OR_REMAKE (Original / Remake). A column of its own
because anime's is_main already answers 本傳 / 外傳 / 前傳 / 後傳 / 總集篇.

NOT NULL with a server default of `Original`, so the add itself fills every
existing row with `Original`, as tv_shows.airing_type was added in
s1e2rfields3.

Downgrade drops the column and its values.

Revision ID: a1n2remake34
Revises: c1o2micrmk3
Create Date: 2026-11-17 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1n2remake34"
down_revision: Union[str, Sequence[str], None] = "c1o2micrmk3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def add_column(conn) -> None:
    """The column, filled with `Original` on every existing row by its default."""
    conn.execute(
        sa.text(
            "ALTER TABLE anime ADD COLUMN original_or_remake VARCHAR "
            "NOT NULL DEFAULT 'Original'"
        )
    )


def drop_column(conn) -> None:
    conn.execute(sa.text("ALTER TABLE anime DROP COLUMN original_or_remake"))


def upgrade() -> None:
    add_column(op.get_bind())


def downgrade() -> None:
    drop_column(op.get_bind())
