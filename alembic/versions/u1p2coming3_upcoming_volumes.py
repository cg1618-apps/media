"""Upcoming books and manga volumes

A book unit gains `release_date_jp`, `release_date_tw` and `cover_image_file`;
manga gains `next_vol_release_date_jp` and `next_vol_release_date_tw`. Every
date column is nullable and carries the same ISO check every release column
does (YYYY, YYYY-MM or YYYY-MM-DD). Nothing is backfilled: every new column
starts empty and is entered by hand.

The downgrade drops the constraints and the columns, and with them whatever
was entered.

Revision ID: u1p2coming3
Revises: b1o2okrename3
Create Date: 2026-11-17 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "u1p2coming3"
down_revision: Union[str, Sequence[str], None] = "b1o2okrename3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ISO = r"^\d{4}(-\d{2}(-\d{2})?)?$"

# (table, column) for every release-date column the revision adds. Each gets
# ck_<table>_<column>_iso, the name every release column's check follows.
DATE_COLUMNS = (
    ("book_unit", "release_date_jp"),
    ("book_unit", "release_date_tw"),
    ("manga", "next_vol_release_date_jp"),
    ("manga", "next_vol_release_date_tw"),
)

# (table, column) for the plain columns: the unit's cover key, the mirror the
# image library writes on attach (app/routers/images.py, MIRROR_COLUMNS).
PLAIN_COLUMNS = (("book_unit", "cover_image_file"),)


def _check_name(table: str, column: str) -> str:
    return f"ck_{table}_{column}_iso"


def upgrade() -> None:
    for table, column in DATE_COLUMNS + PLAIN_COLUMNS:
        op.add_column(table, sa.Column(column, sa.String(), nullable=True))
    for table, column in DATE_COLUMNS:
        op.create_check_constraint(
            _check_name(table, column), table, f"{column} ~ '{ISO}'"
        )


def downgrade() -> None:
    for table, column in DATE_COLUMNS:
        op.drop_constraint(_check_name(table, column), table, type_="check")
    for table, column in reversed(DATE_COLUMNS + PLAIN_COLUMNS):
        op.drop_column(table, column)
