"""Offer hentai the source vocabularies it is watched and looked up on

Main Sources: every Platform value anime is offered on, plus DLsite TW and
DLsite JP. Before this no Platform value carried a `hentai` scope, so the
picker offered only whatever happened to be unscoped.

Reference Sources: Official site and Twitter, the two links Tenrai returns
and autofill_hentai_from_mal now writes.

A value that exists and carries no scope rows is left alone: it is already
offered everywhere, and its first scope row would narrow it to hentai. A
Platform value that does not exist is created scoped to hentai only; a
Reference Source value is not created, because Tenrai's first write for any
type creates it, and a hentai-only one made here would then be the value
anime's Fill resolves to.

Prime Video reaches hentai through the anime rule: h5c6malsrc7 gives the
unscoped value explicit rows for the watched types, anime among them.

Revision ID: h6e7n8srcs9
Revises: h5c6malsrc7
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h6e7n8srcs9"
down_revision: Union[str, Sequence[str], None] = "h5c6malsrc7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCOPE = "hentai"

# (category, value, sort_order to create it with, or None to never create it)
VALUES = (
    ("Platform", "DLsite TW", 20),
    ("Platform", "DLsite JP", 21),
    ("Reference Source", "Official site", None),
    ("Reference Source", "Twitter", None),
)


def _add_scope(conn, option_id) -> None:
    conn.execute(
        sa.text(
            "INSERT INTO system_option_scope (option_id, scope) "
            "VALUES (:option_id, :scope) "
            "ON CONFLICT (option_id, scope) DO NOTHING"
        ),
        {"option_id": option_id, "scope": SCOPE},
    )


def _offer(conn, category: str, value: str, sort_order) -> None:
    option_id = conn.execute(
        sa.text(
            "SELECT system_id FROM system_option "
            "WHERE category = :category AND value = :value"
        ),
        {"category": category, "value": value},
    ).scalar()

    if option_id is None:
        if sort_order is None:
            return
        option_id = conn.execute(
            sa.text(
                "INSERT INTO system_option "
                "(system_id, category, value, sort_order, created_at, updated_at) "
                "VALUES (gen_random_uuid(), :category, :value, :sort_order, now(), now()) "
                "RETURNING system_id"
            ),
            {"category": category, "value": value, "sort_order": sort_order},
        ).scalar()
        _add_scope(conn, option_id)
        return

    scoped = conn.execute(
        sa.text("SELECT 1 FROM system_option_scope WHERE option_id = :option_id LIMIT 1"),
        {"option_id": option_id},
    ).scalar()
    if scoped:
        _add_scope(conn, option_id)


def restore(conn) -> None:
    """Additive and idempotent: a scope an admin already set stays."""
    conn.execute(
        sa.text(
            """
            INSERT INTO system_option_scope (option_id, scope)
            SELECT o.system_id, :scope
              FROM system_option o
             WHERE o.category = 'Platform'
               AND EXISTS (
                   SELECT 1 FROM system_option_scope s
                    WHERE s.option_id = o.system_id AND s.scope = 'anime'
               )
            ON CONFLICT (option_id, scope) DO NOTHING
            """
        ),
        {"scope": SCOPE},
    )
    for category, value, sort_order in VALUES:
        _offer(conn, category, value, sort_order)


def upgrade() -> None:
    restore(op.get_bind())


def downgrade() -> None:
    # Nothing to undo. Which scope rows existed before cannot be told from the
    # rows themselves, and the older code offers every value here just as
    # happily - it simply has no hentai picker that asks for them.
    pass
