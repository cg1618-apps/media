"""Add character.mal_id and character.mal_link

MAL's character record, the way person carries its people record: mal_link
is what an admin pastes, mal_id is derived from it, and the MAL cast import
matches on it - hence the index. Both nullable with no backfill.

Revision ID: c1h2armal3
Revises: v1o2icemany3
Create Date: 2026-10-01 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c1h2armal3"
down_revision: Union[str, Sequence[str], None] = "v1o2icemany3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("character", sa.Column("mal_id", sa.Integer(), nullable=True))
    op.add_column("character", sa.Column("mal_link", sa.String(), nullable=True))
    op.create_index("ix_character_mal_id", "character", ["mal_id"])


def downgrade() -> None:
    op.drop_index("ix_character_mal_id", table_name="character")
    op.drop_column("character", "mal_link")
    op.drop_column("character", "mal_id")
