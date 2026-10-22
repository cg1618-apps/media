"""watch_order_follow: a user follows at most one watch order per group

One row per (user, group): following a watch order copies the order's owner -
exactly one of franchise_id, series_id, collection_id - onto the row, and
uq_watch_order_follow_group (UNIQUE NULLS NOT DISTINCT over user_id and the
three owner columns) makes "one followed order per group" a database rule.
The copy stays true because a list's owner can no longer be changed.

Every foreign key cascades: deleting the user, the order or its owner takes
the follow with it. Nothing is backfilled; nobody follows anything yet.

The downgrade drops the table, and with it every follow.

Revision ID: w1o2follow34
Revises: t1i2m3efin45
Create Date: 2026-10-22 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "w1o2follow34"
down_revision: Union[str, Sequence[str], None] = "t1i2m3efin45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "watch_order_follow"


def upgrade() -> None:
    op.create_table(
        TABLE,
        sa.Column("system_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("list_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("franchise_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("series_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("collection_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name="fk_watch_order_follow_user",
        ),
        sa.ForeignKeyConstraint(
            ["list_id"],
            ["watch_order_list.system_id"],
            ondelete="CASCADE",
            name="fk_watch_order_follow_list",
        ),
        sa.ForeignKeyConstraint(
            ["franchise_id"],
            ["franchise.system_id"],
            ondelete="CASCADE",
            name="fk_watch_order_follow_franchise",
        ),
        sa.ForeignKeyConstraint(
            ["series_id"],
            ["series.system_id"],
            ondelete="CASCADE",
            name="fk_watch_order_follow_series",
        ),
        sa.ForeignKeyConstraint(
            ["collection_id"],
            ["collection.system_id"],
            ondelete="CASCADE",
            name="fk_watch_order_follow_collection",
        ),
        sa.CheckConstraint(
            "num_nonnulls(franchise_id, series_id, collection_id) = 1",
            name="ck_watch_order_follow_one_owner",
        ),
        sa.UniqueConstraint(
            "user_id",
            "franchise_id",
            "series_id",
            "collection_id",
            name="uq_watch_order_follow_group",
            postgresql_nulls_not_distinct=True,
        ),
    )
    op.create_index(f"ix_{TABLE}_system_id", TABLE, ["system_id"])
    op.create_index(f"ix_{TABLE}_user_id", TABLE, ["user_id"])
    op.create_index(f"ix_{TABLE}_list_id", TABLE, ["list_id"])


def downgrade() -> None:
    op.drop_table(TABLE)
