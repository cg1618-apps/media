"""Add a person's Twitter, Instagram and pixiv links; allow an unscoped role

Three nullable link columns on `person`, with no backfill.

`person_role.scope` becomes nullable: a person may hold a role in no media
type yet. That puts a nullable column in `uq_person_role`'s key, so the
constraint is rebuilt NULLS NOT DISTINCT - without it two (person, role, NULL)
rows would commit cleanly, the same trap uq_person_name documents.

The downgrade deletes the unscoped rows before restoring NOT NULL: there is
no scope to give them, and the person keeps every scoped row.

Revision ID: p1s2ocialscope3
Revises: p1g2platgrp3
Create Date: 2026-11-23 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "p1s2ocialscope3"
down_revision: Union[str, Sequence[str], None] = "p1g2platgrp3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LINK_COLUMNS = ("twitter_link", "ig_link", "pixiv_link")


def upgrade() -> None:
    for column in LINK_COLUMNS:
        op.add_column("person", sa.Column(column, sa.String(), nullable=True))
    op.alter_column("person_role", "scope", existing_type=sa.String(), nullable=True)
    op.drop_constraint("uq_person_role", "person_role", type_="unique")
    op.create_unique_constraint(
        "uq_person_role",
        "person_role",
        ["person_id", "role", "scope"],
        postgresql_nulls_not_distinct=True,
    )


def downgrade() -> None:
    op.execute("DELETE FROM person_role WHERE scope IS NULL")
    op.drop_constraint("uq_person_role", "person_role", type_="unique")
    op.create_unique_constraint(
        "uq_person_role", "person_role", ["person_id", "role", "scope"]
    )
    op.alter_column("person_role", "scope", existing_type=sa.String(), nullable=False)
    for column in reversed(LINK_COLUMNS):
        op.drop_column("person", column)
