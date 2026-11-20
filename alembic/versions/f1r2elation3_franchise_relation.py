"""A franchise may relate to other franchises

`franchise_relation` holds one row per side of a relation: (franchise_id,
related_franchise_id) with the remark franchise_id's page gives the other franchise.
A relation is always the pair of rows, written and removed together by
FRANCHISE_RELATIONS in app/services/domain/peer_relation.py. Both ends cascade with their franchise.

Revision ID: f1r2elation3
Revises: s1r2elation3
Create Date: 2026-11-20 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f1r2elation3"
down_revision: Union[str, Sequence[str], None] = "s1r2elation3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "franchise_relation",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("franchise_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("related_franchise_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "franchise_id <> related_franchise_id", name="ck_franchise_relation_not_self"
        ),
        sa.ForeignKeyConstraint(
            ["franchise_id"], ["franchise.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["related_franchise_id"], ["franchise.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint(
            "franchise_id", "related_franchise_id", name="uq_franchise_relation"
        ),
    )
    op.create_index(
        op.f("ix_franchise_relation_system_id"), "franchise_relation", ["system_id"]
    )
    op.create_index(
        op.f("ix_franchise_relation_franchise_id"), "franchise_relation", ["franchise_id"]
    )
    op.create_index(
        op.f("ix_franchise_relation_related_franchise_id"),
        "franchise_relation",
        ["related_franchise_id"],
    )


def downgrade() -> None:
    """Drops every relation: they exist nowhere else."""
    op.drop_index(
        op.f("ix_franchise_relation_related_franchise_id"), table_name="franchise_relation"
    )
    op.drop_index(op.f("ix_franchise_relation_franchise_id"), table_name="franchise_relation")
    op.drop_index(op.f("ix_franchise_relation_system_id"), table_name="franchise_relation")
    op.drop_table("franchise_relation")
