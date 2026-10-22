"""Drop is_main_entry from anime, comic and novel

The flag marked one entry as the main one among its alternatives. The relation
kind `alternative` (app/utils/relation_kinds.py) says that between two entries
directly, so the flag is dropped outright: its values are not carried anywhere.

Downgrade puts the three columns back empty. The values they held are gone.

Revision ID: d1r2opmain34
Revises: t1i2m3efin45
Create Date: 2026-10-22 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "d1r2opmain34"
down_revision: Union[str, Sequence[str], None] = "t1i2m3efin45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("anime", "comic", "novel")
COLUMN = "is_main_entry"


def upgrade() -> None:
    for table in TABLES:
        op.drop_column(table, COLUMN)


def downgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column(COLUMN, sa.Boolean(), nullable=True))
