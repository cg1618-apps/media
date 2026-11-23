"""Add person.imdb_id and person.imdb_link

A person's IMDb name page, the way movie, tv_show and cartoon carry their
title page: imdb_link is what an admin pastes, imdb_id (the nm id) is derived
from it, and the Person (TMDB) Fill resolves it through TMDB's /find. Both
nullable with no backfill - a person has no IMDb link until someone gives it
one.

Revision ID: p1i2mdbperson3
Revises: s1c2ountries3
Create Date: 2026-11-20 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "p1i2mdbperson3"
down_revision: Union[str, Sequence[str], None] = "s1c2ountries3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("person", sa.Column("imdb_id", sa.String(), nullable=True))
    op.add_column("person", sa.Column("imdb_link", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("person", "imdb_link")
    op.drop_column("person", "imdb_id")
