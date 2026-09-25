"""Add h_game.art_style

A multi-choice list over H_GAME_ART_STYLES - what the game looks like,
independent of h_presentation. Nullable with no default: every existing row is
"unknown", which is what NULL means on the other h-game lists.

Revision ID: h4a5r6tstyle
Revises: g3s4ysnolink
Create Date: 2026-09-25 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "h4a5r6tstyle"
down_revision: Union[str, Sequence[str], None] = "g3s4ysnolink"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "h_game",
        sa.Column("art_style", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("h_game", "art_style")
