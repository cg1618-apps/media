"""Add hentai.ep_total

A hentai is tracked like a cartoon: the work's episode count here, the
viewer's ep_fin on user_media_list, which already has the column. Nullable
with no backfill - Fill takes it from Tenrai, then AniDB, where it is blank.

Revision ID: h1e2ntaiep3
Revises: c1h2armal3
Create Date: 2026-10-02 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h1e2ntaiep3"
down_revision: Union[str, Sequence[str], None] = "c1h2armal3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("hentai", sa.Column("ep_total", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("hentai", "ep_total")
