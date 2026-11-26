"""A data control log row records when it started and how many entries failed

`data_control_logs.started_at` is when the operation began; with
`timestamp`, written when it ended, it gives the duration the Details popup
shows. `rows_failed` counts the entries the operation could not process,
whose names ride in `details_json` under `failed`. Rows written before this
revision have no start and no failures.

Revision ID: l1o2gfail3
Revises: d1c2logrun3
Create Date: 2026-11-26 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "l1o2gfail3"
down_revision: Union[str, Sequence[str], None] = "d1c2logrun3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "data_control_logs", sa.Column("started_at", sa.DateTime(), nullable=True)
    )
    op.add_column(
        "data_control_logs",
        sa.Column("rows_failed", sa.Integer(), nullable=True, server_default="0"),
    )


def downgrade() -> None:
    """Drops both columns. A Partial row keeps its status and its `failed` list."""
    op.drop_column("data_control_logs", "rows_failed")
    op.drop_column("data_control_logs", "started_at")
