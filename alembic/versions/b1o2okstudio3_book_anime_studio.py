"""A book may name the studio that animated its adaptation

Manga has carried `anime_studio` since before credits existed: the studio of
the anime adapted from it, kept as a plain column because it points at the
adaptation rather than at anyone who made the manga. A light novel is adapted
as often as a manga is, so book gains the same column, shown beside its
Taiwanese publisher on the detail page's Production card.

Revision ID: b1o2okstudio3
Revises: r1e2lcascade3
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "b1o2okstudio3"
down_revision: Union[str, Sequence[str], None] = "r1e2lcascade3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("book", sa.Column("anime_studio", sa.String(), nullable=True))


def downgrade() -> None:
    """The studios go with the column; nothing else reads it."""
    op.drop_column("book", "anime_studio")
