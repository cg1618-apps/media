"""Offer Netflix and Disney+ as main sources on anime and anime movies again

Both values are meant to be offered on every type that is watched on them:
anime, anime movie, movie, TV show and cartoon. Both had been left with NO
scope rows, which reads as "everywhere", and Calculate's scope reconcile
(`extract_system_options`) then stamped `tv-show` and `cartoon` onto them
because TV shows and cartoons name them as their original source. The first
scope row on an unscoped value narrows it rather than widening it, so both
dropped out of every other type's Main Sources picker. The reconcile now
leaves unscoped values alone; this puts the lost types back.

They get explicit rows rather than being cleared back to unscoped. Unscoped
would also offer them on manga, novel and comic, which are read rather than
watched, and explicit rows cannot be narrowed by anything - the reconcile only
adds.

Revision ID: n1d2plscope3
Revises: h2g3a4m5e6t7
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "n1d2plscope3"
down_revision: Union[str, Sequence[str], None] = "h2g3a4m5e6t7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

VALUES = ("Netflix", "Disney+")
SCOPES = ("anime", "anime-movie", "movie", "tv-show", "cartoon")


def restore(conn) -> None:
    """Additive: a scope an admin already added stays, and a database where
    either value does not exist is left without it."""
    conn.execute(
        sa.text(
            """
            INSERT INTO system_option_scope (option_id, scope)
            SELECT o.system_id, s.scope
              FROM system_option o
             CROSS JOIN unnest(CAST(:scopes AS text[])) AS s(scope)
             WHERE o.category = 'Platform'
               AND o.value = ANY(CAST(:values AS text[]))
            ON CONFLICT (option_id, scope) DO NOTHING
            """
        ),
        {"scopes": list(SCOPES), "values": list(VALUES)},
    )


def upgrade() -> None:
    restore(op.get_bind())


def downgrade() -> None:
    # Nothing to undo. Which of these rows existed before cannot be told from
    # the rows themselves, and removing any would take a value out of a picker
    # the older code offers it in just as happily.
    pass
