"""A studio may relate to other studios

`studio_relation` holds one row per side of a relation: (studio_id,
related_studio_id) with the remark studio_id's page gives the other studio.
A relation is always the pair of rows, written and removed together by
app/services/domain/studio_relation.py. Both ends cascade with their studio.

Revision ID: s1r2elation3
Revises: c1o2untryopt3
Create Date: 2026-11-20 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "s1r2elation3"
down_revision: Union[str, Sequence[str], None] = "c1o2untryopt3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "studio_relation",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("studio_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("related_studio_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "studio_id <> related_studio_id", name="ck_studio_relation_not_self"
        ),
        sa.ForeignKeyConstraint(
            ["studio_id"], ["studio.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["related_studio_id"], ["studio.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint(
            "studio_id", "related_studio_id", name="uq_studio_relation"
        ),
    )
    op.create_index(
        op.f("ix_studio_relation_system_id"), "studio_relation", ["system_id"]
    )
    op.create_index(
        op.f("ix_studio_relation_studio_id"), "studio_relation", ["studio_id"]
    )
    op.create_index(
        op.f("ix_studio_relation_related_studio_id"),
        "studio_relation",
        ["related_studio_id"],
    )


def downgrade() -> None:
    """Drops every relation: they exist nowhere else."""
    op.drop_index(
        op.f("ix_studio_relation_related_studio_id"), table_name="studio_relation"
    )
    op.drop_index(op.f("ix_studio_relation_studio_id"), table_name="studio_relation")
    op.drop_index(op.f("ix_studio_relation_system_id"), table_name="studio_relation")
    op.drop_table("studio_relation")
