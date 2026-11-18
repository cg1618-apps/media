"""The 劇情 Story sections go; seed Side Quest Type

The 劇情 Story group leaves the registry with its three prose sections,
`main_plot`, `side_plot` and `character_arcs`, and every row in them is
deleted. A row's note marks and any rows nested under it go with it, by the
`ON DELETE CASCADE` on `note_mark.note_id` and `note.parent_id` - none of the
three sections is personal or nestable, so in practice there are none.

Deleting rather than moving is the owner's decision: what the sections held
was moved onto the 劇情&任務 strands by hand before the release.

It also seeds the new `Side Quest Type` suggestion category, with no scope
rows, as n1o2tesrwk3 seeded the other guide categories.

Revision ID: s1q2uests345
Revises: u1p2coming3
Create Date: 2026-11-18 00:00:00.000000

"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "s1q2uests345"
down_revision: Union[str, Sequence[str], None] = "u1p2coming3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger(f"alembic.runtime.migration.{revision}")

# The deleted rows are gone: nothing a downgrade could run brings them back.
# Reverting this is restoring the dump the deploy takes before it runs.
irreversible = True

# Frozen copies, not imports: a migration that imports app code breaks the day
# a later revision changes it.
RETIRED_SECTIONS = ("main_plot", "side_plot", "character_arcs")
SUGGESTION_SEEDS = (
    (
        "Side Quest Type",
        ("主要支線", "委託", "懸賞", "角色任務", "活動任務", "隱藏任務", "收集"),
    ),
)


def delete_story_rows(bind) -> int:
    """Delete every row of the three sections. Returns how many went.

    Split out so a test can run the SHIPPED statement against its own
    session rather than restating it."""
    return bind.execute(
        sa.text("DELETE FROM note WHERE section IN :sections").bindparams(
            sa.bindparam("sections", expanding=True)
        ),
        {"sections": list(RETIRED_SECTIONS)},
    ).rowcount


def seed_side_quest_types(bind) -> None:
    """Additive and idempotent: an existing value keeps what it has."""
    for category, values in SUGGESTION_SEEDS:
        for sort_order, value in enumerate(values):
            exists = bind.execute(
                sa.text(
                    "SELECT 1 FROM system_option "
                    "WHERE category = :category AND value = :value"
                ),
                {"category": category, "value": value},
            ).scalar()
            if exists:
                continue
            bind.execute(
                sa.text(
                    "INSERT INTO system_option "
                    "(system_id, category, value, sort_order, created_at, updated_at) "
                    "VALUES (gen_random_uuid(), :category, :value, :sort_order, "
                    "now(), now())"
                ),
                {"category": category, "value": value, "sort_order": sort_order},
            )


def upgrade() -> None:
    bind = op.get_bind()
    deleted = delete_story_rows(bind)
    logger.info("deleted %d 劇情 Story row(s)", deleted)
    seed_side_quest_types(bind)


def downgrade() -> None:
    # See `irreversible` above.
    pass
