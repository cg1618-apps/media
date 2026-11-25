"""Add anilist_link to studio, person and character

The entity's AniList page, entered by hand beside its MAL link. Unlike
mal_link it carries no derived id and no fill reads it, so it is one plain
nullable column per table with no index and no backfill.

Revision ID: a1n2ilistlk3
Revises: o1f2ollowimp3
Create Date: 2026-11-25 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1n2ilistlk3"
down_revision: Union[str, Sequence[str], None] = "o1f2ollowimp3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("studio", "person", "character")


def upgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column("anilist_link", sa.String(), nullable=True))


def downgrade() -> None:
    for table in TABLES:
        op.drop_column(table, "anilist_link")
