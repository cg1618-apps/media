"""Add hentai.anidb_id and hentai.anidb_link

The AniDB anime a hentai entry is filled from after MAL, for what MAL left
blank - mostly the cover of an OVA MAL does not list. The pair mirrors
mal_id / mal_link: the link is what gets pasted, and anidb_id is extracted
from it on every write and at the start of every run. Both nullable with no
default: an existing row has no AniDB link.

Revision ID: a1n2idblink3
Revises: h6n7otesect8
Create Date: 2026-09-27 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1n2idblink3"
down_revision: Union[str, Sequence[str], None] = "h6n7otesect8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("hentai", sa.Column("anidb_id", sa.Integer(), nullable=True))
    op.add_column("hentai", sa.Column("anidb_link", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("hentai", "anidb_link")
    op.drop_column("hentai", "anidb_id")
