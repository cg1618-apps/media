"""Seed the Country common option category from the studios

A studio's Country field now suggests from the `Country` common option
category. It is seeded with every distinct country a studio already holds,
most-used first, so each database starts from its own vocabulary rather than
from a list written here. No scope rows: a studio is not a media type.

Additive and idempotent: a value already in the category keeps what it has.

Revision ID: c1o2untryopt3
Revises: w1o2rkimage3
Create Date: 2026-11-20 00:00:00.000000

"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c1o2untryopt3"
down_revision: Union[str, Sequence[str], None] = "w1o2rkimage3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

CATEGORY = "Country"


def studio_countries(bind) -> list[str]:
    """Every distinct non-blank studio country, most-used first, then by name."""
    return list(
        bind.execute(
            sa.text(
                "SELECT btrim(country) AS value FROM studio "
                "WHERE country IS NOT NULL AND btrim(country) <> '' "
                "GROUP BY btrim(country) "
                "ORDER BY count(*) DESC, btrim(country)"
            )
        ).scalars()
    )


def seed_countries(bind) -> int:
    """Insert each studio country not already in the category. Returns how many."""
    added = 0
    for sort_order, value in enumerate(studio_countries(bind)):
        exists = bind.execute(
            sa.text(
                "SELECT 1 FROM system_option WHERE category = :category AND value = :value"
            ),
            {"category": CATEGORY, "value": value},
        ).scalar()
        if exists:
            continue
        bind.execute(
            sa.text(
                "INSERT INTO system_option "
                "(system_id, category, value, sort_order, created_at, updated_at) "
                "VALUES (gen_random_uuid(), :category, :value, :sort_order, now(), now())"
            ),
            {"category": CATEGORY, "value": value, "sort_order": sort_order},
        )
        added += 1
    return added


def upgrade() -> None:
    added = seed_countries(op.get_bind())
    logger.info("seeded %d Country common option(s)", added)


def downgrade() -> None:
    """The category leaves the code with this revision, so its rows go too -
    values added by hand since the upgrade included."""
    op.get_bind().execute(
        sa.text("DELETE FROM system_option WHERE category = :category"),
        {"category": CATEGORY},
    )
