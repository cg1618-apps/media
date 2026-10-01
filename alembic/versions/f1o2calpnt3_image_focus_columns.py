"""Add an image focal point beside every cropped image column

Each column is named after the image column it qualifies, `_file` becoming
`_focus`: media.cover_image_focus, person.photo_focus, character.photo_focus,
character_casting.photo_focus, studio.logo_focus and publisher.logo_focus.
The value is "X% Y%" (integers 0-100), applied as CSS object-position where
the image is cropped. All nullable with no backfill - NULL centres the image,
which is what every page did before a focus could be set.

quote.image_file and meme.image_file get none: those images are shown
uncropped, so a focal point would change nothing.

Revision ID: f1o2calpnt3
Revises: p1e2rsonmal3
Create Date: 2026-10-01 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1o2calpnt3"
down_revision: Union[str, Sequence[str], None] = "p1e2rsonmal3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table, column), in the order they are added.
FOCUS_COLUMNS = (
    ("media", "cover_image_focus"),
    ("person", "photo_focus"),
    ("character", "photo_focus"),
    ("character_casting", "photo_focus"),
    ("studio", "logo_focus"),
    ("publisher", "logo_focus"),
)


def upgrade() -> None:
    for table, column in FOCUS_COLUMNS:
        op.add_column(table, sa.Column(column, sa.String(), nullable=True))


def downgrade() -> None:
    for table, column in reversed(FOCUS_COLUMNS):
        op.drop_column(table, column)
