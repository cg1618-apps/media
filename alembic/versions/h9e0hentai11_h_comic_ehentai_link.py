"""Add h_comic.ehentai_link

The E-Hentai gallery an h-comic's second fill source reads. No id column: the
gallery id and token are read out of the URL, as DLsite's product id is out of
an h-game's DLsite links. Nullable with no default.

Revision ID: h9e0hentai11
Revises: h6n7otesect8
Create Date: 2026-09-27 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h9e0hentai11"
down_revision: Union[str, Sequence[str], None] = "h6n7otesect8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("h_comic", sa.Column("ehentai_link", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("h_comic", "ehentai_link")
