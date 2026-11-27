"""Content labels on a person

One join table with franchise_content_label's shape: `person_content_label`.
It starts empty, so nothing becomes hidden on upgrade. A label attached later
hides the person where a content rating above the viewer's mode does
(app/services/rbac/shared_visibility.py); it does not cascade to the entries
the person is credited on.

Downgrade drops the table, and with it every label attached to a person -
which reveals what those labels hid. That is the direction a downgrade has
to go: the code it returns to cannot read them.

Revision ID: p1e2rlabel3
Revises: l1o2gfail3
Create Date: 2026-11-27 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "p1e2rlabel3"
down_revision: Union[str, Sequence[str], None] = "l1o2gfail3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "person_content_label",
        sa.Column(
            "system_id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("label_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["person_id"], ["person.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["label_id"], ["content_label.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint(
            "person_id", "label_id", name="uq_person_content_label_row"
        ),
    )
    op.create_index(
        "ix_person_content_label_person", "person_content_label", ["person_id"]
    )
    op.create_index(
        op.f("ix_person_content_label_label_id"),
        "person_content_label",
        ["label_id"],
    )
    op.create_index(
        op.f("ix_person_content_label_system_id"),
        "person_content_label",
        ["system_id"],
    )


def downgrade() -> None:
    op.drop_table("person_content_label")
