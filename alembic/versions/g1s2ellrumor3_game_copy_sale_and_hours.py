"""Game copy sale price and hours played; Rumored leaves the game release statuses

game_copy gains sell_price (Numeric(10, 2), like price_paid), sell_currency
(the price_currency vocabulary) and hours_played (decimal hours). All three
start empty.

"Rumored" is no longer a game release status. Every games and h_game row
holding it - the two share GAME_RELEASE_STATUSES - becomes "Unreleased", and so
does a stored game or h-game Add-form default.

Downgrade drops the three columns and their values. It does not put Rumored
back: nothing records which Unreleased rows held it, and Unreleased is a valid
status either side of the revision.

Revision ID: g1s2ellrumor3
Revises: a1n2imanga4
Create Date: 2026-11-17 00:00:00.000000

"""

import json
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "g1s2ellrumor3"
down_revision: Union[str, Sequence[str], None] = "a1n2imanga4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("games", "h_game")
OLD_STATUS = "Rumored"
NEW_STATUS = "Unreleased"
DEFAULTS_KEYS = ("form_defaults:game", "form_defaults:h-game")


def retire_rumored(conn) -> None:
    """Moves every Rumored release status, stored or defaulted, to Unreleased."""
    for table in TABLES:
        conn.execute(
            sa.text(
                f"UPDATE {table} SET release_status = :new WHERE release_status = :old"
            ),
            {"new": NEW_STATUS, "old": OLD_STATUS},
        )

    rows = conn.execute(
        sa.text(
            "SELECT config_key, config_value FROM system_configs "
            "WHERE config_key IN :keys"
        ).bindparams(sa.bindparam("keys", expanding=True)),
        {"keys": list(DEFAULTS_KEYS)},
    ).fetchall()
    for key, raw in rows:
        try:
            blob = json.loads(raw)
        except (TypeError, ValueError):
            continue
        defaults = blob.get("defaults") if isinstance(blob, dict) else None
        if not isinstance(defaults, dict) or defaults.get("release_status") != OLD_STATUS:
            continue
        defaults["release_status"] = NEW_STATUS
        conn.execute(
            sa.text(
                "UPDATE system_configs SET config_value = :value WHERE config_key = :key"
            ),
            {"value": json.dumps(blob, ensure_ascii=False), "key": key},
        )


def upgrade() -> None:
    op.add_column("game_copy", sa.Column("sell_price", sa.Numeric(10, 2), nullable=True))
    op.add_column("game_copy", sa.Column("sell_currency", sa.String(), nullable=True))
    op.add_column("game_copy", sa.Column("hours_played", sa.Float(), nullable=True))
    retire_rumored(op.get_bind())


def downgrade() -> None:
    op.drop_column("game_copy", "hours_played")
    op.drop_column("game_copy", "sell_currency")
    op.drop_column("game_copy", "sell_price")
