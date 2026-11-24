"""The viewer's pin on a list row: user_media_list.is_pinged

A pinned entry is drawn in the dashboard's Pinged division, above Watching.
Personal, like the status and the rating, so it is a column on the viewer's
own list row. NOT NULL with a server default of false, so every existing row
reads unpinned.

Revision ID: p1i2nged3
Revises: c1o2mprel3
Create Date: 2026-11-24 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "p1i2nged3"
down_revision: Union[str, Sequence[str], None] = "c1o2mprel3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_media_list",
        sa.Column(
            "is_pinged", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )


def downgrade() -> None:
    op.drop_column("user_media_list", "is_pinged")
