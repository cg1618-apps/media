"""Content labels on collections and series

Two join tables with franchise_content_label's shape, one per tier:
`collection_content_label` and `series_content_label`. Both start empty, so
nothing becomes hidden on upgrade; a label attached later cascades down at
read time (app/services/rbac/enforcement.py).

Downgrade drops both tables, and with them every label attached to a
collection or a series - which reveals what those labels hid. That is the
direction a downgrade has to go: the code it returns to cannot read them.

Revision ID: g1r2plabels3
Revises: n1s2fwrule34
Create Date: 2026-11-13 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "g1r2plabels3"
down_revision: Union[str, Sequence[str], None] = "n1s2fwrule34"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (tier, owner table)
TIERS = (("collection", "collection"), ("series", "series"))


def upgrade() -> None:
    for tier, owner in TIERS:
        table = f"{tier}_content_label"
        op.create_table(
            table,
            sa.Column(
                "system_id",
                postgresql.UUID(as_uuid=True),
                server_default=sa.text("gen_random_uuid()"),
                nullable=False,
            ),
            sa.Column(f"{tier}_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("label_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column(
                "position", sa.Integer(), server_default="0", nullable=False
            ),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(
                [f"{tier}_id"], [f"{owner}.system_id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["label_id"], ["content_label.system_id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("system_id"),
            sa.UniqueConstraint(
                f"{tier}_id", "label_id", name=f"uq_{tier}_content_label_row"
            ),
        )
        op.create_index(f"ix_{tier}_content_label_{tier}", table, [f"{tier}_id"])
        op.create_index(op.f(f"ix_{table}_label_id"), table, ["label_id"])
        op.create_index(op.f(f"ix_{table}_system_id"), table, ["system_id"])


def downgrade() -> None:
    for tier, _owner in reversed(TIERS):
        op.drop_table(f"{tier}_content_label")
