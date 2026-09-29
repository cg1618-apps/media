"""Add games.is_main and h_game.is_main

Whether a game or h-game is the main release or a remake or remaster of one,
over its own vocabulary GAME_IS_MAIN (Main / Remake / Remaster) rather than
the shared IS_MAIN the other types' column reads. Nullable with no default and
no backfill: an existing row stays NULL until someone answers it, as the other
types' is_main does.

Revision ID: g1i2smain34
Revises: r1n2bahaname3
Create Date: 2026-09-29 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "g1i2smain34"
down_revision: Union[str, Sequence[str], None] = "r1n2bahaname3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("games", sa.Column("is_main", sa.String(), nullable=True))
    op.add_column("h_game", sa.Column("is_main", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("h_game", "is_main")
    op.drop_column("games", "is_main")
