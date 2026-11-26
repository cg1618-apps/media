"""An account may rate a character identity: user_rating.identity_id

A character's other identity takes the viewer's own rating as a character
does. One more owner column on user_rating, a real foreign key to
character_identity that cascades, so deleting the identity or the account
takes the rating with it. The two constraints that list the owner columns -
ck_user_rating_one_owner and uq_user_rating_owner - are rebuilt to name it.

Reversible: the downgrade deletes every identity rating (there is nowhere
else to keep one), then restores the constraints and drops the column.

Revision ID: u1i2dentrate3
Revises: g1m2ainplat3
Create Date: 2026-11-26 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "u1i2dentrate3"
down_revision: Union[str, Sequence[str], None] = "g1m2ainplat3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copies of app/models/user_rating.USER_RATING_OWNER_COLUMNS, before and
# after: a migration keeps meaning what it meant when it ran.
BEFORE = (
    "collection_id",
    "franchise_id",
    "series_id",
    "character_id",
    "person_id",
    "studio_id",
    "publisher_id",
)
AFTER = BEFORE + ("identity_id",)


def _rebuild_constraints(columns: tuple[str, ...]) -> None:
    op.drop_constraint("ck_user_rating_one_owner", "user_rating", type_="check")
    op.drop_constraint("uq_user_rating_owner", "user_rating", type_="unique")
    op.create_check_constraint(
        "ck_user_rating_one_owner",
        "user_rating",
        "num_nonnulls(" + ", ".join(columns) + ") = 1",
    )
    op.create_unique_constraint(
        "uq_user_rating_owner",
        "user_rating",
        ["user_id", *columns],
        postgresql_nulls_not_distinct=True,
    )


def upgrade() -> None:
    op.add_column(
        "user_rating",
        sa.Column("identity_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "user_rating_identity_id_fkey",
        "user_rating",
        "character_identity",
        ["identity_id"],
        ["system_id"],
        ondelete="CASCADE",
    )
    op.create_index(
        op.f("ix_user_rating_identity_id"),
        "user_rating",
        ["identity_id"],
        unique=False,
    )
    _rebuild_constraints(AFTER)


def downgrade() -> None:
    op.execute("DELETE FROM user_rating WHERE identity_id IS NOT NULL")
    _rebuild_constraints(BEFORE)
    op.drop_index(op.f("ix_user_rating_identity_id"), table_name="user_rating")
    op.drop_constraint(
        "user_rating_identity_id_fkey", "user_rating", type_="foreignkey"
    )
    op.drop_column("user_rating", "identity_id")
