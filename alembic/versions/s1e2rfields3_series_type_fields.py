"""Series types: anime JP/TW dates and runtime, TV show airing type and runtime, cartoon runtime_min, no novel read_order

anime: `release_date` becomes `release_date_jp` and `release_date_tw`, the
pair an anime movie already has, each under its own ISO CHECK. Both are filled
from the old value, which stood for both. The season stays the JP airing's.
`runtime_min` is new: minutes per episode, empty until Fill or a hand writes
it.

tv_shows: `airing_type` is new, `TV` or `Special`, and every existing show is
`TV` - the column's server default, so the add fills it. `runtime_min` is new
and empty.

cartoons: `length_ep_min` is renamed `runtime_min`; the values stay.

novel: `read_order` is dropped with its values.

The downgrade folds the two anime dates back into one `release_date`, JP
first, so a TW date that differed from JP is lost; drops the new columns; puts
`length_ep_min` back under its old name; and adds `read_order` back empty.

Revision ID: s1e2rfields3
Revises: r1l2status34
Create Date: 2026-11-17 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "s1e2rfields3"
down_revision: Union[str, Sequence[str], None] = "r1l2status34"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ISO = r"^\d{4}(-\d{2}(-\d{2})?)?$"


def _iso_check(table: str, column: str) -> None:
    op.create_check_constraint(
        f"ck_{table}_{column}_iso", table, f"{column} ~ '{ISO}'"
    )


def upgrade() -> None:
    op.add_column("anime", sa.Column("release_date_jp", sa.String(), nullable=True))
    op.add_column("anime", sa.Column("release_date_tw", sa.String(), nullable=True))
    op.execute(
        "UPDATE anime SET release_date_jp = release_date, release_date_tw = release_date"
    )
    op.drop_constraint("ck_anime_release_date_iso", "anime", type_="check")
    op.drop_column("anime", "release_date")
    _iso_check("anime", "release_date_jp")
    _iso_check("anime", "release_date_tw")
    op.add_column("anime", sa.Column("runtime_min", sa.Integer(), nullable=True))

    op.add_column(
        "tv_shows",
        sa.Column("airing_type", sa.String(), nullable=True, server_default="TV"),
    )
    op.add_column("tv_shows", sa.Column("runtime_min", sa.Integer(), nullable=True))

    op.alter_column("cartoons", "length_ep_min", new_column_name="runtime_min")

    op.drop_column("novel", "read_order")


def downgrade() -> None:
    op.add_column("novel", sa.Column("read_order", sa.Float(), nullable=True))

    op.alter_column("cartoons", "runtime_min", new_column_name="length_ep_min")

    op.drop_column("tv_shows", "runtime_min")
    op.drop_column("tv_shows", "airing_type")

    op.drop_column("anime", "runtime_min")
    op.add_column("anime", sa.Column("release_date", sa.String(), nullable=True))
    op.execute("UPDATE anime SET release_date = COALESCE(release_date_jp, release_date_tw)")
    op.drop_constraint("ck_anime_release_date_jp_iso", "anime", type_="check")
    op.drop_constraint("ck_anime_release_date_tw_iso", "anime", type_="check")
    op.drop_column("anime", "release_date_jp")
    op.drop_column("anime", "release_date_tw")
    _iso_check("anime", "release_date")
