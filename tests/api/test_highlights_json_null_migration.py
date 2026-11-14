"""h1i2ghlights3 over group orders that are JSON null, upgraded and
downgraded with the real `alembic` against a scratch database.

A cell holding the JSON scalar null (jsonb_typeof 'null') is not SQL NULL,
and an installed database has whole tables of them. PostgreSQL does not
promise to evaluate an AND left to right, so a guard written as
`jsonb_typeof(x) = 'array' AND jsonb_array_length(x) > 0` can still call
jsonb_array_length on the scalar and abort the upgrade. Only the real command
against real rows shows that: the planner, not the Python, picks the order.

Seeded so the guard has to discriminate. Many h-comics and an h-game hold
JSON null; one h-comic holds a scalar string and one an empty array, which
are "no order" as well; and one h-comic and one h-game hold a real order,
the mirror that must still move to the owner.
"""

import os
import subprocess
import sys
import uuid

import sqlalchemy as sa
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text

from tests.api.test_migrations_build_the_schema import (  # noqa: F401 - fixture
    ROOT,
    _server_url,
    scratch_databases,
)

THIS = "h1i2ghlights3"
PREVIOUS = ScriptDirectory.from_config(Config(str(ROOT / "alembic.ini"))).get_revision(
    THIS
).down_revision

# Enough rows that the planner treats the table as a table, as the owner's
# database (135 JSON-null h-comics) did.
JSON_NULL_ROWS = 150


def _alembic(database, *args):
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=ROOT,
        env={**os.environ, "POSTGRES_DB": database},
        capture_output=True,
        text=True,
    )


def _entry(conn, franchise, media_type, table, name_column, public_id, order_sql):
    entry = uuid.uuid4()
    conn.execute(
        text(
            "INSERT INTO media (system_id, media_type, franchise_id, display_name, "
            "public_id) VALUES (:id, :t, :f, 'E', :p)"
        ),
        {"id": entry, "t": media_type, "f": franchise, "p": public_id},
    )
    conn.execute(
        text(
            f"INSERT INTO {table} (system_id, {name_column}, highlight_group_order) "
            f"VALUES (:id, 'E', {order_sql})"
        ),
        {"id": entry},
    )
    return entry


def _seed(conn):
    # Roles are seeded by the app at startup, not by the chain.
    role = uuid.uuid4()
    conn.execute(
        text("INSERT INTO role (system_id, name, label) VALUES (:id, 'super', 'super')"),
        {"id": role},
    )
    owner = uuid.uuid4()
    conn.execute(
        text(
            "INSERT INTO users (id, username, hashed_password, role_id, status, "
            "is_installation_owner) VALUES (:id, 'cg1618', 'x', :role, 'active', true)"
        ),
        {"id": owner, "role": role},
    )
    franchise = uuid.uuid4()
    conn.execute(
        text("INSERT INTO franchise (system_id, franchise_name_en) VALUES (:id, 'F')"),
        {"id": franchise},
    )
    public_id = iter(range(1, 10_000))

    def h_comic(order_sql):
        return _entry(
            conn, franchise, "h-comic", "h_comic", "h_comic_name_cn", next(public_id), order_sql
        )

    def h_game(order_sql):
        return _entry(
            conn, franchise, "h-game", "h_game", "h_game_name_cn", next(public_id), order_sql
        )

    for _ in range(JSON_NULL_ROWS):
        h_comic("'null'::jsonb")
    h_game("'null'::jsonb")
    h_comic("'\"Ana\"'::jsonb")
    h_comic("'[]'::jsonb")
    h_comic("NULL")
    ordered = {
        h_comic("'[\"Bea\", \"Ana\"]'::jsonb"): ["Bea", "Ana"],
        h_game("'[\"Cy\"]'::jsonb"): ["Cy"],
    }
    conn.execute(text("ANALYZE h_comic; ANALYZE h_game"))
    return owner, ordered


def test_json_null_group_orders_do_not_stop_the_upgrade(scratch_databases):
    database = scratch_databases[0]
    result = _alembic(database, "upgrade", PREVIOUS)
    assert result.returncode == 0, result.stderr[-3000:]

    engine = sa.create_engine(_server_url(database))
    try:
        with engine.begin() as conn:
            owner, ordered = _seed(conn)

        result = _alembic(database, "upgrade", THIS)
        assert result.returncode == 0, result.stderr[-3000:]

        with engine.connect() as conn:
            moved = {
                row.media_id: (row.user_id, row.group_order)
                for row in conn.execute(
                    text("SELECT user_id, media_id, group_order FROM user_highlight_group_order")
                )
            }
        # Only the two real orders move; JSON null, a scalar, an empty array
        # and SQL NULL are all "no order".
        assert moved == {media: (owner, order) for media, order in ordered.items()}

        result = _alembic(database, "downgrade", PREVIOUS)
        assert result.returncode == 0, result.stderr[-3000:]

        with engine.connect() as conn:
            back = {
                row.system_id: row.highlight_group_order
                for table in ("h_comic", "h_game")
                for row in conn.execute(
                    text(
                        f"SELECT system_id, highlight_group_order FROM {table} "
                        "WHERE highlight_group_order IS NOT NULL"
                    )
                )
            }
        # The owner's orders come back; nothing else is invented.
        assert back == ordered
    finally:
        engine.dispose()
