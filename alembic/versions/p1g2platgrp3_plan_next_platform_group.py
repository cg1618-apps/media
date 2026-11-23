"""Add plan_next.platform_group

The optional group a queued game is filed under on the Plan page's Do next
tab - PC, Console, Handheld Console or Switch - so the queue reads one
platform at a time. Nullable with no backfill: a row with none is shown
ungrouped, which is what every existing row is.

Revision ID: p1g2platgrp3
Revises: p1i2mdbperson3
Create Date: 2026-11-23 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "p1g2platgrp3"
down_revision: Union[str, Sequence[str], None] = "p1i2mdbperson3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("plan_next", sa.Column("platform_group", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("plan_next", "platform_group")
