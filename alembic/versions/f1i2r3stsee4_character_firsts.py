"""character and character_identity: first_mention, first_appearance, first_encounter

Three nullable free-text columns on each table, recording where the character
(or the identity) is first named, first shown and first met by the main
character. An identity's are its own; nothing is copied from the character.
Existing rows start NULL.

The downgrade drops the six columns and the values they held.

Revision ID: f1i2r3stsee4
Revises: i1d2p3ubid45
Create Date: 2026-10-13 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "f1i2r3stsee4"
down_revision: Union[str, Sequence[str], None] = "i1d2p3ubid45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("character", "character_identity")
COLUMNS = ("first_mention", "first_appearance", "first_encounter")


def upgrade() -> None:
    for table in TABLES:
        for column in COLUMNS:
            op.add_column(table, sa.Column(column, sa.Text(), nullable=True))


def downgrade() -> None:
    for table in TABLES:
        for column in reversed(COLUMNS):
            op.drop_column(table, column)
