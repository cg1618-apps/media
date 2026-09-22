"""Favourite slots on a series and on an entry

The favourite 3x3 grids on the statistics page could only hold franchises,
because `type_slots` existed on exactly one table. Three of the grids are not
franchise grids: favourite comic *series*, favourite movie *entries* and
favourite game *entries*.

Each tier gets the same column rather than a generic (grid, slot) -> owner
table. A new table would need its own Sheets tab and its own Backup/Pull
support before any of this travelled between the two machines, whereas a
column on a table that already has a tab travels the day it is added. It also
keeps one shape for the reader: `type_slots` means the same thing wherever it
appears, a map of grid key -> slot 1..9.

The entry-tier column sits on `movies` and `games`, not on the `media`
supertable that would have served all nine types at once. media.py's
promotion rule requires both that every type has the field and that something
queries across types by it; nothing does - each grid reads one type's list -
so a later favourite-entry grid pays for its own column.

Revision ID: f2a3vslots45
Revises: f1r2anlabel3
Create Date: 2026-09-22 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "f2a3vslots45"
down_revision: Union[str, Sequence[str], None] = "f1r2anlabel3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in ("series", "movies", "games"):
        op.add_column(
            table, sa.Column("type_slots", postgresql.JSONB(), nullable=True)
        )


def downgrade() -> None:
    for table in ("games", "movies", "series"):
        op.drop_column(table, "type_slots")
