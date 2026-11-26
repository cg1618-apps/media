"""Add type_slots to studio and person

The favourite-entity 3x3 grids (Anime Studio, Anime Director, Female Seiyuu,
...) store a row's slot the way the media grids do: a `{gridKey: 1..9}` map
on the row itself. One nullable JSONB column per table, no backfill.

Revision ID: e1n2tityslot3
Revises: a1n2ilistlk3
Create Date: 2026-11-26 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e1n2tityslot3"
down_revision: Union[str, Sequence[str], None] = "a1n2ilistlk3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("studio", "person")


def upgrade() -> None:
    for table in TABLES:
        op.add_column(
            table,
            sa.Column("type_slots", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        )


def downgrade() -> None:
    for table in TABLES:
        op.drop_column(table, "type_slots")
