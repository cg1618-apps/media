"""character_identity.public_id

An identity gets a page of its own, so it gets the short id that page's URL
carries, declared exactly as character.public_id is: its own sequence, a
DEFAULT drawing from it, and a unique constraint deferred so a Pull can
permute ids across rows inside one transaction.

Existing rows are numbered 1..n in (created_at, system_id) order, so the
numbering is the same on every database that holds the same rows, and the
sequence is moved past them. The downgrade drops the column and its sequence;
nothing else depends on either.

Revision ID: i1d2p3ubid45
Revises: h1c2i3dentty
Create Date: 2026-10-06 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "i1d2p3ubid45"
down_revision: Union[str, Sequence[str], None] = "h1c2i3dentty"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "character_identity"
SEQUENCE = "character_identity_public_id_seq"
CONSTRAINT = "uq_character_identity_public_id"


def upgrade() -> None:
    op.execute(f"CREATE SEQUENCE {SEQUENCE}")
    op.add_column(TABLE, sa.Column("public_id", sa.Integer(), nullable=True))
    op.execute(
        f"""
        UPDATE {TABLE} AS t SET public_id = n.rn
        FROM (
            SELECT system_id,
                   row_number() OVER (ORDER BY created_at NULLS FIRST, system_id) AS rn
            FROM {TABLE}
        ) AS n
        WHERE t.system_id = n.system_id
        """
    )
    # is_called=false: the next nextval returns exactly max + 1 (1 on an
    # empty table).
    op.execute(
        f"SELECT setval('{SEQUENCE}', "
        f"COALESCE((SELECT MAX(public_id) FROM {TABLE}), 0) + 1, false)"
    )
    op.alter_column(
        TABLE,
        "public_id",
        nullable=False,
        server_default=sa.text(f"nextval('{SEQUENCE}'::regclass)"),
    )
    op.execute(f"ALTER SEQUENCE {SEQUENCE} OWNED BY {TABLE}.public_id")
    op.create_unique_constraint(
        CONSTRAINT, TABLE, ["public_id"], deferrable=True, initially="DEFERRED"
    )


def downgrade() -> None:
    op.drop_constraint(CONSTRAINT, TABLE, type_="unique")
    # OWNED BY: dropping the column drops the sequence with it. IF EXISTS
    # covers a database where the ownership was never recorded.
    op.drop_column(TABLE, "public_id")
    op.execute(f"DROP SEQUENCE IF EXISTS {SEQUENCE}")
