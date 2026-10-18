"""user_media_list.time_fin

"Paused at": where the viewer paused playback - "1:10:00" into a movie,
"14:35" into an episode - for the six watching types. Free text, nullable:
NULL is nothing paused. Nothing is backfilled; no existing row has one.

The downgrade drops the column, and with it every paused position written.

Revision ID: t1i2m3efin45
Revises: q1u2alityrm3
Create Date: 2026-10-18 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "t1i2m3efin45"
down_revision: Union[str, Sequence[str], None] = "q1u2alityrm3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "user_media_list"
COLUMN = "time_fin"


def upgrade() -> None:
    op.add_column(TABLE, sa.Column(COLUMN, sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column(TABLE, COLUMN)
