"""character_casting.credited_name

The name a character goes by in one entry - "AAA" in season 1 - when it is
not the character's own or the identity's. Free text, nullable: NULL is no
override. Nothing is backfilled; every existing cast row has none.

The downgrade drops the column, and with it every credited name written.

Revision ID: c1r2e3dited4
Revises: f1i2r3stsee4
Create Date: 2026-10-13 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "c1r2e3dited4"
down_revision: Union[str, Sequence[str], None] = "f1i2r3stsee4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "character_casting"
COLUMN = "credited_name"


def upgrade() -> None:
    op.add_column(TABLE, sa.Column(COLUMN, sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column(TABLE, COLUMN)
