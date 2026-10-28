"""Game copy vocabularies, and drop the current prices

price_current_us / _jp / _tw are dropped from games and h_game. They held
Steam's sale-inclusive price, which was only ever displayed and is stale as
soon as a sale ends; price_original_* (the list price) stays and serves every
statistic. The values are not carried anywhere.

game_copy.storefront `Physical` becomes `Physical Store`. The admin's stored
Add-form defaults for game and h-game are rewritten to match: a default copy's
`Physical` storefront is renamed, a default copy's `Free` ownership is cleared
(Free is an acquisition, not an ownership, and no longer in the ownership
vocabulary), and a stored default for a dropped price column is removed.

Downgrade puts the six columns back empty and renames the storefront back,
in the copy rows and in the stored defaults. The prices and a cleared `Free`
ownership default are gone.

Revision ID: g1a2mevocab34
Revises: i1m2dbseason34
Create Date: 2026-10-28 00:00:00.000000

"""

import json
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "g1a2mevocab34"
down_revision: Union[str, Sequence[str], None] = "i1m2dbseason34"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("games", "h_game")
PRICE_COLUMNS = ("price_current_us", "price_current_jp", "price_current_tw")
OLD_STOREFRONT = "Physical"
NEW_STOREFRONT = "Physical Store"
DEFAULTS_KEYS = ("form_defaults:game", "form_defaults:h-game")


def _rewrite_defaults(rewrite) -> None:
    """Applies `rewrite` to each stored game / h-game form-defaults blob."""
    conn = op.get_bind()
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
        if not isinstance(defaults, dict):
            continue
        if rewrite(defaults):
            conn.execute(
                sa.text(
                    "UPDATE system_configs SET config_value = :value "
                    "WHERE config_key = :key"
                ),
                {"value": json.dumps(blob, ensure_ascii=False), "key": key},
            )


def _default_copies(defaults: dict) -> list:
    copies = defaults.get("copies")
    return [c for c in copies if isinstance(c, dict)] if isinstance(copies, list) else []


def _upgrade_defaults(defaults: dict) -> bool:
    changed = False
    for column in PRICE_COLUMNS:
        if column in defaults:
            del defaults[column]
            changed = True
    for copy in _default_copies(defaults):
        if copy.get("storefront") == OLD_STOREFRONT:
            copy["storefront"] = NEW_STOREFRONT
            changed = True
        if copy.get("ownership") == "Free":
            copy["ownership"] = ""
            changed = True
    return changed


def _downgrade_defaults(defaults: dict) -> bool:
    changed = False
    for copy in _default_copies(defaults):
        if copy.get("storefront") == NEW_STOREFRONT:
            copy["storefront"] = OLD_STOREFRONT
            changed = True
    return changed


def upgrade() -> None:
    for table in TABLES:
        for column in PRICE_COLUMNS:
            op.drop_column(table, column)
    op.execute(
        sa.text(
            "UPDATE game_copy SET storefront = :new WHERE storefront = :old"
        ).bindparams(new=NEW_STOREFRONT, old=OLD_STOREFRONT)
    )
    _rewrite_defaults(_upgrade_defaults)


def downgrade() -> None:
    _rewrite_defaults(_downgrade_defaults)
    op.execute(
        sa.text(
            "UPDATE game_copy SET storefront = :old WHERE storefront = :new"
        ).bindparams(new=NEW_STOREFRONT, old=OLD_STOREFRONT)
    )
    for table in TABLES:
        for column in PRICE_COLUMNS:
            op.add_column(table, sa.Column(column, sa.Numeric(10, 2), nullable=True))
