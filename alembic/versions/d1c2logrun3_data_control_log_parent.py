"""A data control log row may name the batch run it ran under

`data_control_logs.parent_id` points an operation's row (Fill Anime, Pull
Franchise, the Backup at the end) at the row of the run that ran it (Fill
All, Pull All). A run's row has none, and every row written before this
revision has none, so the existing log reads as it did: one row per run.
Deleting a run's row deletes its operations.

Revision ID: d1c2logrun3
Revises: r1o2ledesc3
Create Date: 2026-11-26 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d1c2logrun3"
down_revision: Union[str, Sequence[str], None] = "r1o2ledesc3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("data_control_logs", sa.Column("parent_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "data_control_logs_parent_id_fkey",
        "data_control_logs",
        "data_control_logs",
        ["parent_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        op.f("ix_data_control_logs_parent_id"), "data_control_logs", ["parent_id"]
    )


def downgrade() -> None:
    """
    Drops the link and keeps every row: an operation's row then lists as a
    run of its own, beside the run it ran under.
    """
    op.drop_index(op.f("ix_data_control_logs_parent_id"), table_name="data_control_logs")
    op.drop_constraint(
        "data_control_logs_parent_id_fkey", "data_control_logs", type_="foreignkey"
    )
    op.drop_column("data_control_logs", "parent_id")
