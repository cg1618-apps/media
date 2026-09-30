"""Add person.mal_id and person.mal_link

MAL's people record, the way studio carries its producer record: mal_link is
what an admin pastes, mal_id is derived from it, and the Seiyuu Fill reads the
id. Both nullable with no backfill - a person has no MAL link until someone
gives it one.

Revision ID: p1e2rsonmal3
Revises: g1i2smain34
Create Date: 2026-09-30 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "p1e2rsonmal3"
down_revision: Union[str, Sequence[str], None] = "g1i2smain34"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("person", sa.Column("mal_id", sa.Integer(), nullable=True))
    op.add_column("person", sa.Column("mal_link", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("person", "mal_link")
    op.drop_column("person", "mal_id")
