"""A game may name the platform it is exclusive to

Anime carries an Exclusive Source, drawn from the streaming Platform
vocabulary and tied to one of its main access rows. A game names the platform
family it is exclusive to instead - Nintendo, PlayStation, Xbox, PC or Mobile
- through its own tag field, exclusive_platform, whose vocabulary is the new
"Exclusive Platform" category. The field needs no column: tags live in
media_tag. This revision seeds the five values, each scoped to game alone.

Self-contained, as every revision is: the values are frozen here rather than
imported from app.utils.game_vocabulary, whose seed_exclusive_platforms does
the same for a create_all database.

Reversible: the downgrade deletes the category's values, and with them their
scope rows and any tag rows naming them (both cascade).

Revision ID: g1x2clusive3
Revises: r1e2lcascade3
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "g1x2clusive3"
down_revision: Union[str, Sequence[str], None] = "r1e2lcascade3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CATEGORY = "Exclusive Platform"
VALUES: tuple[str, ...] = ("Nintendo", "PlayStation", "Xbox", "PC", "Mobile")
SCOPE = "game"


def seed(bind) -> None:
    """Insert each value not already present, and its game scope. Idempotent."""
    for sort_order, value in enumerate(VALUES):
        option_id = bind.execute(
            sa.text(
                "SELECT system_id FROM system_option WHERE category = :category AND value = :value"
            ),
            {"category": CATEGORY, "value": value},
        ).scalar()
        if option_id is None:
            option_id = bind.execute(
                sa.text(
                    "INSERT INTO system_option "
                    "(system_id, category, value, sort_order, created_at, updated_at) "
                    "VALUES (gen_random_uuid(), :category, :value, :sort_order, now(), now()) "
                    "RETURNING system_id"
                ),
                {"category": CATEGORY, "value": value, "sort_order": sort_order},
            ).scalar()
        bind.execute(
            sa.text(
                "INSERT INTO system_option_scope (option_id, scope) "
                "SELECT :option_id, :scope WHERE NOT EXISTS ("
                "SELECT 1 FROM system_option_scope WHERE option_id = :option_id AND scope = :scope)"
            ),
            {"option_id": option_id, "scope": SCOPE},
        )


def upgrade() -> None:
    seed(op.get_bind())


def downgrade() -> None:
    op.get_bind().execute(
        sa.text("DELETE FROM system_option WHERE category = :category"),
        {"category": CATEGORY},
    )
