"""Originality 原創 becomes 原版; h-comic and hentai links become auto-fillable

1. `h_comic.originality` and `hentai.originality` - one shared vocabulary,
   H_COMIC_ORIGINALITY - rename `原創` to `原版`. `同人` is unchanged.
2. The admin's stored Add-form defaults for h-comic and hentai follow: a
   default originality of `原創` becomes `原版`.
3. The same two blobs' stored auto-fill lists gain the links that just became
   auto-fillable - `mal_link` on h-comic, `mal_link` and `anidb_link` on
   hentai - when the list is stored and lacks them. A list saved before this
   revision could not have chosen them, because /defaults did not offer them;
   adding them makes a configured type behave like an unconfigured one, which
   copies them by default. A null list already means the built-in set and is
   left alone.

The vocabularies and keys are frozen copies, not imported from app code.

Downgrade renames `原版` back to `原創` in both tables and both defaults, and
takes the links off the stored auto-fill lists: the code before this revision
cannot copy them, so a list naming them would only be carrying dead keys.

Revision ID: o1r2iginal35
Revises: v1i2ewextras3
Create Date: 2026-11-14 00:00:00.000000

"""

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "o1r2iginal35"
down_revision: Union[str, Sequence[str], None] = "v1i2ewextras3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("h_comic", "hentai")
OLD = "原創"
NEW = "原版"
# The stored form-defaults key per type, and the links that type now copies.
AUTOFILL_LINKS = {
    "form_defaults:h-comic": ("mal_link",),
    "form_defaults:hentai": ("mal_link", "anidb_link"),
}


def _rewrite_defaults(conn, rewrite) -> None:
    """Applies `rewrite(blob, links)` to each stored h-comic / hentai blob."""
    rows = conn.execute(
        sa.text(
            "SELECT config_key, config_value FROM system_configs "
            "WHERE config_key IN :keys"
        ).bindparams(sa.bindparam("keys", expanding=True)),
        {"keys": list(AUTOFILL_LINKS)},
    ).fetchall()
    for key, raw in rows:
        try:
            blob = json.loads(raw)
        except (TypeError, ValueError):
            continue
        if not isinstance(blob, dict):
            continue
        if rewrite(blob, AUTOFILL_LINKS[key]):
            conn.execute(
                sa.text(
                    "UPDATE system_configs SET config_value = :value "
                    "WHERE config_key = :key"
                ),
                {"value": json.dumps(blob, ensure_ascii=False), "key": key},
            )


def _rename_default(blob: dict, old: str, new: str) -> bool:
    defaults = blob.get("defaults")
    if isinstance(defaults, dict) and defaults.get("originality") == old:
        defaults["originality"] = new
        return True
    return False


def _upgrade_blob(blob: dict, links: tuple[str, ...]) -> bool:
    changed = _rename_default(blob, OLD, NEW)
    autofill = blob.get("autofill")
    if isinstance(autofill, list):
        for link in links:
            if link not in autofill:
                autofill.append(link)
                changed = True
    return changed


def _downgrade_blob(blob: dict, links: tuple[str, ...]) -> bool:
    changed = _rename_default(blob, NEW, OLD)
    autofill = blob.get("autofill")
    if isinstance(autofill, list):
        kept = [key for key in autofill if key not in links]
        if len(kept) != len(autofill):
            blob["autofill"] = kept
            changed = True
    return changed


def _rename_rows(conn, old: str, new: str) -> None:
    for table in TABLES:
        conn.execute(
            sa.text(
                f"UPDATE {table} SET originality = :new WHERE originality = :old"
            ),
            {"new": new, "old": old},
        )


def apply_upgrade(conn) -> None:
    _rename_rows(conn, OLD, NEW)
    _rewrite_defaults(conn, _upgrade_blob)


def apply_downgrade(conn) -> None:
    _rewrite_defaults(conn, _downgrade_blob)
    _rename_rows(conn, NEW, OLD)


def upgrade() -> None:
    apply_upgrade(op.get_bind())


def downgrade() -> None:
    apply_downgrade(op.get_bind())
