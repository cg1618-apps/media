"""order_follow gains an importance; order_follow_skip holds a follower's skips

The owner's request: a follow carries an importance - the lowest rung of the
step ladder (Optional < Normal < Recommended < Essential) the follower wants to
be shown next - and a follower may mark a step of a followed order to skip, so
it is never shown as next.

`order_follow.importance` is NOT NULL with server default 'Normal', so every
existing follow becomes a Normal follow: every step but Optional ones.

`order_follow_skip` is one row per skipped step of one follow. Exactly one of
item_id (a hand-built order's step) and media_id (a built-in order's generated
step, named by its entry) is set; every foreign key cascades. Nothing is
backfilled; nobody has skipped anything yet.

The downgrade drops the table and the column, and with them every skip and
every follow's importance.

Revision ID: o1f2ollowimp3
Revises: e1n2tremark3
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "o1f2ollowimp3"
down_revision: Union[str, Sequence[str], None] = "e1n2tremark3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "order_follow_skip"


def upgrade() -> None:
    op.add_column(
        "order_follow",
        sa.Column(
            "importance", sa.String(), nullable=False, server_default="Normal"
        ),
    )
    op.create_table(
        TABLE,
        sa.Column("system_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("follow_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("item_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["follow_id"],
            ["order_follow.system_id"],
            ondelete="CASCADE",
            name="fk_order_follow_skip_follow",
        ),
        sa.ForeignKeyConstraint(
            ["item_id"],
            ["order_item.system_id"],
            ondelete="CASCADE",
            name="fk_order_follow_skip_item",
        ),
        sa.ForeignKeyConstraint(
            ["media_id"],
            ["media.system_id"],
            ondelete="CASCADE",
            name="fk_order_follow_skip_media",
        ),
        sa.CheckConstraint(
            "num_nonnulls(item_id, media_id) = 1",
            name="ck_order_follow_skip_one_step",
        ),
        sa.UniqueConstraint(
            "follow_id",
            "item_id",
            "media_id",
            name="uq_order_follow_skip_step",
            postgresql_nulls_not_distinct=True,
        ),
    )
    op.create_index(f"ix_{TABLE}_system_id", TABLE, ["system_id"])
    op.create_index(f"ix_{TABLE}_follow_id", TABLE, ["follow_id"])


def downgrade() -> None:
    op.drop_table(TABLE)
    op.drop_column("order_follow", "importance")
