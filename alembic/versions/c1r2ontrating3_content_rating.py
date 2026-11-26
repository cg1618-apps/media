"""Add content_rating to person, studio, publisher and image_attachment

A shared record's own rating - normal, borderline or unrestricted - which
hides it from an access mode below the rating
(app/utils/content_rating.py). NOT NULL with a server default of 'normal', so
every existing row is unrated and stays visible exactly where it was; a CHECK
per table holds the three values. On image_attachment it is read only for a
person's gallery pictures (role "work").

Additive and reversible: the downgrade drops the columns and their checks.

Revision ID: c1r2ontrating3
Revises: e1n2tityslot3
Create Date: 2026-11-26 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c1r2ontrating3"
down_revision: Union[str, Sequence[str], None] = "e1n2tityslot3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("person", "studio", "publisher", "image_attachment")

# A frozen copy of app/utils/content_rating.CONTENT_RATINGS: a migration keeps
# meaning what it meant when it ran.
RATINGS = ("normal", "borderline", "unrestricted")


def _check(table: str) -> str:
    return f"ck_{table}_content_rating"


def upgrade() -> None:
    allowed = ", ".join(f"'{rating}'" for rating in RATINGS)
    for table in TABLES:
        op.add_column(
            table,
            sa.Column(
                "content_rating",
                sa.String(),
                nullable=False,
                server_default="normal",
            ),
        )
        op.create_check_constraint(
            _check(table), table, f"content_rating IN ({allowed})"
        )


def downgrade() -> None:
    for table in TABLES:
        op.drop_constraint(_check(table), table, type_="check")
        op.drop_column(table, "content_rating")
