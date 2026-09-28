"""resource_node: the site-wide Resources page

One table holds the whole page: groups and items, nested to any depth through
a self-referential parent_id, ordered together inside each parent by
sort_index. The FK is DEFERRABLE INITIALLY DEFERRED so a Pull can restore a
child row before its parent and let the commit decide.

Revision ID: r1e2sourcepg3
Revises: c3p4photofb5
Create Date: 2026-09-28 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "r1e2sourcepg3"
down_revision: Union[str, Sequence[str], None] = "c3p4photofb5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "resource_node",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("sort_index", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["resource_node.system_id"],
            ondelete="CASCADE",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.CheckConstraint(
            "kind IN ('group', 'item')", name="ck_resource_node_kind"
        ),
        sa.CheckConstraint(
            "kind <> 'group' OR (title IS NOT NULL AND btrim(title) <> '' "
            "AND content IS NULL)",
            name="ck_resource_node_group_shape",
        ),
        sa.CheckConstraint(
            "kind <> 'item' OR (content IS NOT NULL AND btrim(content) <> '')",
            name="ck_resource_node_item_shape",
        ),
    )
    op.create_index("ix_resource_node_system_id", "resource_node", ["system_id"])
    op.create_index("ix_resource_node_parent_id", "resource_node", ["parent_id"])


def downgrade() -> None:
    op.drop_index("ix_resource_node_parent_id", table_name="resource_node")
    op.drop_index("ix_resource_node_system_id", table_name="resource_node")
    op.drop_table("resource_node")
