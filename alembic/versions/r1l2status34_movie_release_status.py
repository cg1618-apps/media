"""Movie and Anime Movie: release_status and release_type; Rumored goes

`Rumored` leaves the airing vocabulary. An anime, TV show, cartoon or hentai
holding it becomes `Not Yet Aired`.

A film is released, not aired, so `movies.airing_status` and
`anime_movies.airing_status` become `release_status`, over a vocabulary of
their own: `Not Released`, `Released`, `Canceled`. `Not Yet Aired` and
`Rumored` become `Not Released`, `Finished Airing` and `Airing` become
`Released`, and `Canceled` stays.

The watching status `Watch When Airs` becomes `Watch When Released` on every
list row of a movie or an anime movie. The other watching types keep it.

`anime_movies.release_type` is new: `Cinema` or `ONA`, NOT NULL, and every
existing anime movie is `Cinema`. An ONA has one release date, held in both
`release_date_jp` and `release_date_tw`. No existing row is ONA, so nothing
is copied here.

Stored Add-form defaults for the two types (`form_defaults:movie` and
`form_defaults:anime-movie`) follow the rename too: an `airing_status` key
becomes `release_status` with its value mapped, and a `Watch When Airs`
default becomes `Watch When Released`.

The downgrade maps the two vocabularies back (`Not Released` -> `Not Yet
Aired`, `Released` -> `Finished Airing`), renames the columns back, drops
`release_type` and turns `Watch When Released` back into `Watch When Airs`.
It cannot tell which film was `Rumored` or `Airing` before, and it does not
need to: the previous revision accepts every value it writes.

Revision ID: r1l2status34
Revises: a1n2imanga4
Create Date: 2026-11-17 00:00:00.000000

"""

import json
import logging
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "r1l2status34"
down_revision: Union[str, Sequence[str], None] = "a1n2imanga4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

AIRING_TABLES = ("anime", "tv_shows", "cartoons", "hentai")
RELEASE_TABLES = ("movies", "anime_movies")
RELEASE_MEDIA_TYPES = ("movie", "anime-movie")
FORM_DEFAULT_KEYS = ("form_defaults:movie", "form_defaults:anime-movie")

# Frozen copies of the vocabularies, so the revision does not change when the
# app does.
TO_RELEASE = {
    "Not Yet Aired": "Not Released",
    "Rumored": "Not Released",
    "Airing": "Released",
    "Finished Airing": "Released",
    "Canceled": "Canceled",
}
TO_AIRING = {
    "Not Released": "Not Yet Aired",
    "Released": "Finished Airing",
    "Canceled": "Canceled",
}
WHEN_AIRS = "Watch When Airs"
WHEN_RELEASED = "Watch When Released"


def _map_column(bind, table: str, mapping: dict) -> int:
    changed = 0
    for old, new in mapping.items():
        if old == new:
            continue
        changed += bind.execute(
            sa.text(f"UPDATE {table} SET release_status = :new WHERE release_status = :old"),
            {"old": old, "new": new},
        ).rowcount
    return changed


def _map_list_status(bind, old: str, new: str) -> int:
    return bind.execute(
        sa.text(
            "UPDATE user_media_list SET status = :new WHERE status = :old "
            "AND media_id IN (SELECT system_id FROM media WHERE media_type IN :types)"
        ).bindparams(sa.bindparam("types", expanding=True)),
        {"old": old, "new": new, "types": list(RELEASE_MEDIA_TYPES)},
    ).rowcount


def _map_form_defaults(bind, old_key: str, new_key: str, mapping: dict, old_watch: str, new_watch: str) -> int:
    changed = 0
    rows = bind.execute(
        sa.text(
            "SELECT config_key, config_value FROM system_configs "
            "WHERE config_key IN :keys"
        ).bindparams(sa.bindparam("keys", expanding=True)),
        {"keys": list(FORM_DEFAULT_KEYS)},
    ).all()
    for key, raw in rows:
        blob = json.loads(raw)
        defaults = blob.get("defaults") or {}
        autofill = blob.get("autofill") or []
        before = json.dumps(blob, sort_keys=True)
        if old_key in defaults:
            value = defaults.pop(old_key)
            defaults[new_key] = mapping.get(value, value)
        if defaults.get("watching_status") == old_watch:
            defaults["watching_status"] = new_watch
        if old_key in autofill:
            blob["autofill"] = [new_key if f == old_key else f for f in autofill]
        if json.dumps(blob, sort_keys=True) != before:
            bind.execute(
                sa.text("UPDATE system_configs SET config_value = :v WHERE config_key = :k"),
                {"v": json.dumps(blob, ensure_ascii=False), "k": key},
            )
            changed += 1
    return changed


def rewrite(bind) -> dict:
    """
    The data half of the upgrade, run after the columns are renamed.

    Split out so tests can run the SHIPPED code against the test session,
    whose schema already has the new columns.
    """
    counts = {"rumored": 0, "release_status": 0, "list_rows": 0, "form_defaults": 0}
    for table in AIRING_TABLES:
        counts["rumored"] += bind.execute(
            sa.text(
                f"UPDATE {table} SET airing_status = 'Not Yet Aired' "
                "WHERE airing_status = 'Rumored'"
            )
        ).rowcount
    for table in RELEASE_TABLES:
        counts["release_status"] += _map_column(bind, table, TO_RELEASE)
    counts["list_rows"] = _map_list_status(bind, WHEN_AIRS, WHEN_RELEASED)
    counts["form_defaults"] = _map_form_defaults(
        bind, "airing_status", "release_status", TO_RELEASE, WHEN_AIRS, WHEN_RELEASED
    )
    logger.info("Release status for films: %s", counts)
    return counts


def fold(bind) -> dict:
    """The data half of the downgrade, run before the columns are renamed back."""
    counts = {"release_status": 0, "list_rows": 0, "form_defaults": 0}
    for table in RELEASE_TABLES:
        counts["release_status"] += _map_column(bind, table, TO_AIRING)
    counts["list_rows"] = _map_list_status(bind, WHEN_RELEASED, WHEN_AIRS)
    counts["form_defaults"] = _map_form_defaults(
        bind, "release_status", "airing_status", TO_AIRING, WHEN_RELEASED, WHEN_AIRS
    )
    logger.info("Release status folded back into airing status: %s", counts)
    return counts


def upgrade() -> None:
    for table in RELEASE_TABLES:
        op.alter_column(table, "airing_status", new_column_name="release_status")
    op.add_column(
        "anime_movies",
        sa.Column("release_type", sa.String(), nullable=False, server_default="Cinema"),
    )
    rewrite(op.get_bind())


def downgrade() -> None:
    fold(op.get_bind())
    op.drop_column("anime_movies", "release_type")
    for table in RELEASE_TABLES:
        op.alter_column(table, "release_status", new_column_name="airing_status")
