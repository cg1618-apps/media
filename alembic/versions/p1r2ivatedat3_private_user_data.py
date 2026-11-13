"""Remove list visibility and two field groups

Everything per user is private to its account, so `users.list_is_public` -
which decided whether a public profile, the community aggregate and notes by
author could read somebody's list - has nothing left to decide, and goes.

So do two field groups. `personal_notes` decided whether a mode could read
ANOTHER user's personal notes, which nobody can any more. `sources_other`
withheld the `other` source bucket, and every viewer gets the other sources.
Their rows go from every mode (access_mode_field_group), from every
per-account denial (user_access_mode_denial), and from the legacy guest-role
grants that ensure_access_mode_seed reads to seed `safe` (role_permission).
`sources_restricted` is untouched and is the only group left.

The visible effect of the second part: an `other`-bucket source is shown to
every viewer, `safe` included. The count is logged.

Downgrade re-adds the column as false - every list private, the safe
direction - and re-grants both groups to every mode, which is what the seed
did. The per-account denials the upgrade deleted are NOT restored: nothing
recorded them.

Raw SQL rather than ORM models, which would break as soon as a later revision
adds a column the model declares.

Revision ID: p1r2ivatedat3
Revises: r1e2quests34
Create Date: 2026-11-13 00:00:00.000000

"""
import logging
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "p1r2ivatedat3"
down_revision: Union[str, Sequence[str], None] = "r1e2quests34"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

REMOVED_GROUPS = ("sources_other", "personal_notes")


def remove_field_group_rows(conn) -> None:
    """Every row naming a removed group: per-account denials, mode grants, and
    the legacy guest-role grants ensure_access_mode_seed reads. Its own
    function so the test suite, which has no Alembic harness, can run it."""
    groups = sa.bindparam("groups", value=list(REMOVED_GROUPS), expanding=True)
    conn.execute(
        sa.text(
            "DELETE FROM user_access_mode_denial WHERE field_group_key IN :groups"
        ).bindparams(groups)
    )
    conn.execute(
        sa.text(
            "DELETE FROM access_mode_field_group WHERE field_group_key IN :groups"
        ).bindparams(groups)
    )
    perms = sa.bindparam(
        "perms",
        value=[f"field_group.{key}" for key in REMOVED_GROUPS],
        expanding=True,
    )
    conn.execute(
        sa.text("DELETE FROM role_permission WHERE permission IN :perms").bindparams(
            perms
        )
    )


def upgrade() -> None:
    conn = op.get_bind()
    remove_field_group_rows(conn)
    op.drop_column("users", "list_is_public")

    shown = conn.execute(
        sa.text("SELECT count(*) FROM media_source WHERE bucket = 'other'")
    ).scalar_one()
    logger.info(
        "p1r2ivatedat3: %s other-bucket source rows are now shown to every viewer",
        shown,
    )


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "list_is_public",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    conn = op.get_bind()
    for key in REMOVED_GROUPS:
        conn.execute(
            sa.text(
                """
                INSERT INTO access_mode_field_group
                    (system_id, mode_id, field_group_key)
                SELECT gen_random_uuid(), system_id, :key FROM access_mode
                ON CONFLICT ON CONSTRAINT uq_access_mode_field_group DO NOTHING
                """
            ),
            {"key": key},
        )
