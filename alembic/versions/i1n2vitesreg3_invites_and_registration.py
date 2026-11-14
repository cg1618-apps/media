"""Invites and registration: account_code.created_user_id

  * account_code.created_user_id - the account an invite created, once spent.
    ON DELETE SET NULL, so declining a registration (which deletes the
    pending account) leaves the invite row behind and still spent. user_id
    stays the reset target with CASCADE; one foreign key cannot carry both
    rules.

Nothing else changes: users.status already allows `pending`, and the two
shared accounts are seeded by the lifespan.

The downgrade drops the column. Lossy only in which account each spent invite
created.

Revision ID: i1n2vitesreg3
Revises: f1i2veroles45
Create Date: 2026-11-13 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "i1n2vitesreg3"
down_revision: Union[str, Sequence[str], None] = "f1i2veroles45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "account_code",
        sa.Column("created_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_account_code_created_user",
        "account_code",
        "users",
        ["created_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_account_code_created_user", "account_code", type_="foreignkey"
    )
    op.drop_column("account_code", "created_user_id")
