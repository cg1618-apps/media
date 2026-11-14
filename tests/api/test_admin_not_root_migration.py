"""a1d2minroot45: the admin stops being root, upgraded and downgraded with the
real `alembic` against a scratch database - create_all, which the rest of the
suite builds from, has no `is_root` column to drop and no grant rows to set.

Seeded so each step has something to act on: the admin role holds a stray
grant the fixed set does not include, the admin account sits in
`unrestricted`, it owns one personal list row (which must be logged and
kept), and a `super` account at `unrestricted` is the mirror the NULL step
must leave alone.
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

THIS = "a1d2minroot45"
PREVIOUS = ScriptDirectory.from_config(Config(str(ROOT / "alembic.ini"))).get_revision(
    THIS
).down_revision

ADMIN_GRANTS = {
    "admin.authz",
    "manage.pipelines",
    "manage.requests",
    "manage.announcements",
    "manage.options",
    "manage.images",
    "manage.resources",
}


def _alembic(database, *args):
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=ROOT,
        env={**os.environ, "POSTGRES_DB": database},
        capture_output=True,
        text=True,
    )


def _seed(conn):
    roles = {}
    for name, is_root in (("admin", True), ("super", False)):
        roles[name] = uuid.uuid4()
        conn.execute(
            text(
                "INSERT INTO role (system_id, name, label, is_root) "
                "VALUES (:id, :name, :name, :root)"
            ),
            {"id": roles[name], "name": name, "root": is_root},
        )
    conn.execute(
        text("INSERT INTO role_permission (role_id, permission) VALUES (:r, 'view.search')"),
        {"r": roles["admin"]},
    )
    users = {}
    for username, role in (("admin", "admin"), ("cg1618", "super")):
        users[username] = uuid.uuid4()
        conn.execute(
            text(
                "INSERT INTO users (id, username, hashed_password, role_id, "
                "mode_ceiling, mode_default) VALUES (:id, :name, 'x', :role, "
                "'unrestricted', 'unrestricted')"
            ),
            {"id": users[username], "name": username, "role": roles[role]},
        )
    franchise = uuid.uuid4()
    conn.execute(
        text("INSERT INTO franchise (system_id, franchise_name_en) VALUES (:id, 'F')"),
        {"id": franchise},
    )
    anime = uuid.uuid4()
    conn.execute(
        text(
            "INSERT INTO media (system_id, media_type, franchise_id, display_name, "
            "public_id) VALUES (:id, 'anime', :f, 'A', 1)"
        ),
        {"id": anime, "f": franchise},
    )
    conn.execute(
        text("INSERT INTO anime (system_id, anime_name_en) VALUES (:id, 'A')"),
        {"id": anime},
    )
    conn.execute(
        text(
            "INSERT INTO user_media_list (system_id, user_id, media_id, status) "
            "VALUES (:id, :u, :m, 'Completed')"
        ),
        {"id": uuid.uuid4(), "u": users["admin"], "m": anime},
    )
    return roles


def test_the_admin_migration_upgrades_and_downgrades(scratch_databases):
    database = scratch_databases[0]
    assert _alembic(database, "upgrade", PREVIOUS).returncode == 0

    engine = sa.create_engine(_server_url(database))
    try:
        with engine.begin() as conn:
            roles = _seed(conn)

        result = _alembic(database, "upgrade", THIS)
        assert result.returncode == 0, result.stderr[-3000:]
        # The admin's personal row is logged, and kept.
        assert "1 user_media_list row(s) belong to an admin-role account" in result.stderr

        with engine.connect() as conn:
            grants = set(
                conn.execute(
                    text("SELECT permission FROM role_permission WHERE role_id = :r"),
                    {"r": roles["admin"]},
                ).scalars()
            )
            modes = dict(
                (row[0], (row[1], row[2]))
                for row in conn.execute(
                    text("SELECT username, mode_ceiling, mode_default FROM users")
                )
            )
            role_columns = set(
                conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_name = 'role'"
                    )
                ).scalars()
            )
            kept = conn.execute(text("SELECT count(*) FROM user_media_list")).scalar()

        assert grants == ADMIN_GRANTS
        assert modes == {
            "admin": (None, None),
            "cg1618": ("unrestricted", "unrestricted"),
        }
        assert "is_root" not in role_columns
        assert kept == 1

        result = _alembic(database, "downgrade", PREVIOUS)
        assert result.returncode == 0, result.stderr[-3000:]
        with engine.connect() as conn:
            roots = dict(conn.execute(text("SELECT name, is_root FROM role")).all())
            admin_rows = conn.execute(
                text("SELECT count(*) FROM role_permission WHERE role_id = :r"),
                {"r": roles["admin"]},
            ).scalar()
            admin_mode = conn.execute(
                text("SELECT mode_ceiling, mode_default FROM users WHERE username = 'admin'")
            ).one()
        assert roots == {"admin": True, "super": False}
        assert admin_rows == 0
        assert tuple(admin_mode) == ("unrestricted", "unrestricted")
    finally:
        engine.dispose()
