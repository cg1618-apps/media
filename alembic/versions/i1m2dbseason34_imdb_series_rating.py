"""imdb_series_rating: a season's own IMDb rating, the show's beside it

tv_shows and cartoons gain imdb_series_rating, the IMDb rating of the whole
show the entry's imdb_id names. imdb_rating on a season entry - every TV show,
and a cartoon whose airing_type is TV - becomes that season's own rating, the
mean of its episodes' ratings.

What those rows hold today is the show's rating, so the upgrade moves it into
imdb_series_rating and clears imdb_rating; the next Fill computes the season's.
A movie cartoon, or one of any other airing_type, is left as it is: its
imdb_rating is the title's own and has no season to differ from.

The downgrade puts the show rating back into imdb_rating wherever one is
held - a season rating Fill computed since is replaced by it - and drops the
column.

Revision ID: i1m2dbseason34
Revises: w1o2follow34
Create Date: 2026-10-24 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "i1m2dbseason34"
down_revision: Union[str, Sequence[str], None] = "w1o2follow34"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMN = "imdb_series_rating"


def upgrade() -> None:
    for table in ("tv_shows", "cartoons"):
        op.add_column(table, sa.Column(COLUMN, sa.String(), nullable=True))
    op.execute(
        f"UPDATE tv_shows SET {COLUMN} = imdb_rating, imdb_rating = NULL "
        "WHERE imdb_rating IS NOT NULL"
    )
    op.execute(
        f"UPDATE cartoons SET {COLUMN} = imdb_rating, imdb_rating = NULL "
        "WHERE imdb_rating IS NOT NULL AND airing_type = 'TV'"
    )


def downgrade() -> None:
    for table in ("tv_shows", "cartoons"):
        op.execute(
            f"UPDATE {table} SET imdb_rating = {COLUMN} WHERE {COLUMN} IS NOT NULL"
        )
        op.drop_column(table, COLUMN)
