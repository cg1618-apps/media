"""needs_work: 待補充 Needs Work marks on entries and groups

One row marks one owner - an entry of any media type, a collection, a
franchise or a series - as not complete yet, with an optional note the Needs
Work page groups by. The owner is four nullable foreign keys with a CHECK
that exactly one is set, the shape `note` and `meme` use, each ON DELETE
CASCADE and each UNIQUE, so an owner holds one mark.

A new, empty table: the downgrade drops it, and with it every mark.

Revision ID: n1w2needswork3
Revises: s1q2uests345
Create Date: 2026-11-19 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "n1w2needswork3"
down_revision: Union[str, Sequence[str], None] = "s1q2uests345"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "needs_work",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("collection_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("franchise_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("series_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "num_nonnulls(media_id, collection_id, franchise_id, series_id) = 1",
            name="ck_needs_work_one_owner",
        ),
        sa.ForeignKeyConstraint(
            ["media_id"], ["media.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["collection_id"], ["collection.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["franchise_id"], ["franchise.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["series_id"], ["series.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint("media_id", name="uq_needs_work_media"),
        sa.UniqueConstraint("collection_id", name="uq_needs_work_collection"),
        sa.UniqueConstraint("franchise_id", name="uq_needs_work_franchise"),
        sa.UniqueConstraint("series_id", name="uq_needs_work_series"),
    )
    op.create_index(
        op.f("ix_needs_work_system_id"), "needs_work", ["system_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_needs_work_system_id"), table_name="needs_work")
    op.drop_table("needs_work")
