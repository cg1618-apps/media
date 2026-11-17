"""Every progress count and total becomes a float

ep_fin, ep_total, ep_previous, issue_fin, issue_total, page_fin, page_total,
and manga's and h-comic's ch_total and manga's vol_total become double
precision, as vol_fin, ch_fin, arc_fin, ch_fin_in_arc and novel's totals
already are. Every existing integer converts exactly.

The downgrade floors each value back to an integer: a partial unit is not a
finished one, so 2.5 episodes reads as 2.

Revision ID: p1r2ogfloat3
Revises: e1p2special3
Create Date: 2026-11-17 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "p1r2ogfloat3"
down_revision: Union[str, Sequence[str], None] = "e1p2special3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = (
    ("anime", "ep_previous"),
    ("anime", "ep_total"),
    ("tv_shows", "ep_total"),
    ("cartoons", "ep_total"),
    ("hentai", "ep_total"),
    ("comic", "issue_total"),
    ("h_comic", "page_total"),
    ("h_comic", "ch_total"),
    ("manga", "vol_total"),
    ("manga", "ch_total"),
    ("user_media_list", "ep_fin"),
    ("user_media_list", "issue_fin"),
    ("user_media_list", "page_fin"),
)


def upgrade() -> None:
    for table, column in COLUMNS:
        op.alter_column(table, column, type_=sa.Float(), existing_nullable=True)


def downgrade() -> None:
    for table, column in COLUMNS:
        op.alter_column(
            table,
            column,
            type_=sa.Integer(),
            existing_nullable=True,
            postgresql_using=f"floor({column})::integer",
        )
