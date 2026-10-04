"""franchise, series: alone_reviewed_media_id

The review queue lists every franchise and every series holding exactly one
media entry. Some are single on purpose, so a group can be marked reviewed:
the column holds the id of the lone entry that was reviewed, and the group is
listed again as soon as its lone entry is a different one.

A plain uuid with no foreign key, like `cover_entry_id` beside it. A foreign
key to `media.system_id` would close a cycle with `media.franchise_id` /
`media.series_id`, and Pull restores the Franchise and Series tabs before the
Media tab, so a restore into an empty database could not insert them.

Revision ID: a1l2onegrp3
Revises: a1n2imeacg3
Create Date: 2026-10-04 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a1l2onegrp3"
down_revision: Union[str, Sequence[str], None] = "a1n2imeacg3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("franchise", "series")


def upgrade() -> None:
    for table in TABLES:
        op.add_column(
            table,
            sa.Column("alone_reviewed_media_id", postgresql.UUID(as_uuid=True), nullable=True),
        )


def downgrade() -> None:
    for table in TABLES:
        op.drop_column(table, "alone_reviewed_media_id")
