"""A series may relate to other series

`series_relation` holds one row per side of a relation: (series_id,
related_series_id) with the remark series_id's page gives the other series.
A relation is always the pair of rows, written and removed together by
SERIES_RELATIONS in app/services/domain/peer_relation.py. Both ends cascade
with their series.

Revision ID: s1e2rrelate3
Revises: f1r2filterrm3
Create Date: 2026-11-26 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "s1e2rrelate3"
down_revision: Union[str, Sequence[str], None] = "f1r2filterrm3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "series_relation",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("series_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("related_series_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "series_id <> related_series_id", name="ck_series_relation_not_self"
        ),
        sa.ForeignKeyConstraint(["series_id"], ["series.system_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["related_series_id"], ["series.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint("series_id", "related_series_id", name="uq_series_relation"),
    )
    op.create_index(op.f("ix_series_relation_system_id"), "series_relation", ["system_id"])
    op.create_index(op.f("ix_series_relation_series_id"), "series_relation", ["series_id"])
    op.create_index(
        op.f("ix_series_relation_related_series_id"),
        "series_relation",
        ["related_series_id"],
    )


def downgrade() -> None:
    """Drops every relation: they exist nowhere else."""
    op.drop_index(op.f("ix_series_relation_related_series_id"), table_name="series_relation")
    op.drop_index(op.f("ix_series_relation_series_id"), table_name="series_relation")
    op.drop_index(op.f("ix_series_relation_system_id"), table_name="series_relation")
    op.drop_table("series_relation")
