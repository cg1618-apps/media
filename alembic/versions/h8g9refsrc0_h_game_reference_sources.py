"""Offer h-game the reference sources game is offered, plus Twitter

No Reference Source value carried an `h-game` scope, so the h-game picker
offered only the values carrying no scope at all - Wikipedia and Fandom wiki.
SteamDB, HowLongToBeat, Metacritic and Official site were scoped to `game`
alone.

Every Reference Source value scoped to `game` gains an `h-game` scope, and so
does Twitter, which h-comic and hentai are offered too. A value that exists
and carries no scope rows is left alone: it is already offered everywhere,
and its first scope row would narrow it to h-game. Twitter is not created
when missing, because Tenrai's first write for any type creates it, and an
h-game-only one made here would then be the value anime's Fill resolves to.

Revision ID: h8g9refsrc0
Revises: h4g5amefx6
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "h8g9refsrc0"
down_revision: Union[str, Sequence[str], None] = "h4g5amefx6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCOPE = "h-game"
FOLLOWS = "game"
ALSO = ("Twitter",)


def restore(conn) -> None:
    """Additive and idempotent: a scope an admin already set stays."""
    conn.execute(
        sa.text(
            """
            INSERT INTO system_option_scope (option_id, scope)
            SELECT o.system_id, :scope
              FROM system_option o
             WHERE o.category = 'Reference Source'
               AND (
                   EXISTS (SELECT 1 FROM system_option_scope s
                            WHERE s.option_id = o.system_id AND s.scope = :follows)
                   OR (o.value = ANY(CAST(:also AS text[]))
                       AND EXISTS (SELECT 1 FROM system_option_scope s
                                    WHERE s.option_id = o.system_id))
               )
            ON CONFLICT (option_id, scope) DO NOTHING
            """
        ),
        {"scope": SCOPE, "follows": FOLLOWS, "also": list(ALSO)},
    )


def upgrade() -> None:
    restore(op.get_bind())


def downgrade() -> None:
    # Nothing to undo. Which scope rows existed before cannot be told from the
    # rows themselves, and the older code offers every value here just as
    # happily - it simply leaves them out of the h-game picker.
    pass
