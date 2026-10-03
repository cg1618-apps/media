"""Drop anime.seiyuu, the Need/Done seiyuu flag

The column was a to-do flag, never a cast list - a seiyuu is cast through
character_casting_voice, which this does not touch. It is dropped outright:
its values are not carried anywhere.

Downgrade puts the column back empty. The values it held are gone.

Revision ID: s1e2iyuudrop3
Revises: m1s2ongstat3
Create Date: 2026-10-03 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "s1e2iyuudrop3"
down_revision: Union[str, Sequence[str], None] = "m1s2ongstat3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("anime", "seiyuu")


def downgrade() -> None:
    op.add_column("anime", sa.Column("seiyuu", sa.String(), nullable=True))
