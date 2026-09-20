"""Content labels on a franchise

A label could only be attached to a media entry, because the only join table
was `media_content_label`, whose `media_id` is a real foreign key up to the
`media` supertable. A franchise has no row there, so restricting a whole
franchise meant labelling each of its entries by hand and remembering to
label the next one.

`franchise_content_label` is that table's twin for the grouping tier. It is a
second table rather than a nullable owner pair on the first, because a pair of
nullable columns can name both owners or neither and nothing in the database
would say which was meant.

The label cascades down at READ time, not here: an entry is hidden when it
carries a hidden label OR when `media.franchise_id` names a franchise that
does. Nothing is copied onto the entries, so moving an entry between
franchises changes what hides it immediately and un-labelling the franchise
reveals everything it covered.

Revision ID: f1r2anlabel3
Revises: s3t4orylist5
Create Date: 2026-09-20 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f1r2anlabel3"
down_revision: Union[str, Sequence[str], None] = "s3t4orylist5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "franchise_content_label",
        sa.Column(
            "system_id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("franchise_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("label_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "position", sa.Integer(), server_default="0", nullable=False
        ),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["franchise_id"], ["franchise.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["label_id"], ["content_label.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint(
            "franchise_id", "label_id", name="uq_franchise_content_label_row"
        ),
    )
    op.create_index(
        "ix_franchise_content_label_franchise",
        "franchise_content_label",
        ["franchise_id"],
    )
    op.create_index(
        op.f("ix_franchise_content_label_label_id"),
        "franchise_content_label",
        ["label_id"],
    )
    op.create_index(
        op.f("ix_franchise_content_label_system_id"),
        "franchise_content_label",
        ["system_id"],
    )


def downgrade() -> None:
    # Reversible, and the rows it drops are the only copy of which franchises
    # were restricted. Nothing else reads this table, so a downgrade reveals
    # every franchise it covered rather than breaking anything.
    op.drop_index(
        op.f("ix_franchise_content_label_system_id"),
        table_name="franchise_content_label",
    )
    op.drop_index(
        op.f("ix_franchise_content_label_label_id"),
        table_name="franchise_content_label",
    )
    op.drop_index(
        "ix_franchise_content_label_franchise",
        table_name="franchise_content_label",
    )
    op.drop_table("franchise_content_label")
