"""m1c2eiling345: from held mode sets to a ceiling and a default, and back.

Runs the real `alembic upgrade` from the previous head against a scratch
database seeded with `user_access_mode` rows, because the conversion is data
and create_all - what the rest of the suite builds from - has no data to
convert. Then downgrades and checks the grants come back.

The five accounts are the five shapes the plan names:

  admin    all four, default unrestricted -> unrestricted / unrestricted
  cg1618   safe only                      -> unrestricted / borderline (owner)
  member   safe + normal, default safe    -> normal / safe
  gappy    safe + borderline, no default  -> borderline / borderline, LOGGED
  parked   nothing                        -> NULL / NULL

`member` also carries one denial on two of its grants, which must become one
account-wide row.
"""

import os
import subprocess
import sys
import uuid

import sqlalchemy as sa
from sqlalchemy import text

from tests.api.test_migrations_build_the_schema import (  # noqa: F401 - fixture
    ROOT,
    _server_url,
    scratch_databases,
)

PREVIOUS = "r1e2quests34"
THIS = "m1c2eiling345"
ORDER = ("safe", "normal", "borderline", "unrestricted")


def _alembic(database, *args):
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=ROOT,
        env={**os.environ, "POSTGRES_DB": database},
        capture_output=True,
        text=True,
    )


def _seed(conn):
    role_id = uuid.uuid4()
    conn.execute(
        text(
            "INSERT INTO role (system_id, name, label) VALUES (:id, 'mig-role', 'M')"
        ),
        {"id": role_id},
    )
    modes = {}
    for sort_order, key in enumerate(reversed(ORDER)):
        modes[key] = uuid.uuid4()
        conn.execute(
            text(
                "INSERT INTO access_mode (system_id, key, label, sort_order, is_system) "
                "VALUES (:id, :key, :key, :s, true)"
            ),
            {"id": modes[key], "key": key, "s": sort_order * 10},
        )
    label_id = uuid.uuid4()
    conn.execute(
        text(
            "INSERT INTO content_label (system_id, key, label, sort_order) "
            "VALUES (:id, 'nsfw', 'NSFW', 0)"
        ),
        {"id": label_id},
    )

    users = {}
    for name in ("admin", "cg1618", "member", "gappy", "parked"):
        users[name] = uuid.uuid4()
        conn.execute(
            text(
                "INSERT INTO users (id, username, hashed_password, role_id) "
                "VALUES (:id, :name, 'x', :role)"
            ),
            {"id": users[name], "name": name, "role": role_id},
        )

    held = {
        "admin": (ORDER, "unrestricted"),
        "cg1618": (("safe",), "safe"),
        "member": (("safe", "normal"), "safe"),
        "gappy": (("safe", "borderline"), None),
    }
    grants = {}
    for name, (keys, default) in held.items():
        for key in keys:
            grant_id = uuid.uuid4()
            grants[(name, key)] = grant_id
            conn.execute(
                text(
                    "INSERT INTO user_access_mode (system_id, user_id, mode_id, is_default) "
                    "VALUES (:id, :u, :m, :d)"
                ),
                {"id": grant_id, "u": users[name], "m": modes[key], "d": key == default},
            )
    for key in ("safe", "normal"):
        conn.execute(
            text(
                "INSERT INTO user_access_mode_denial "
                "(system_id, user_access_mode_id, field_group_key) "
                "VALUES (:id, :g, 'sources_other')"
            ),
            {"id": uuid.uuid4(), "g": grants[("member", key)]},
        )
    return users


def test_the_migration_converts_held_sets_and_downgrades_back(scratch_databases):
    database = scratch_databases[0]

    result = _alembic(database, "upgrade", PREVIOUS)
    assert result.returncode == 0, result.stderr[-3000:]

    engine = sa.create_engine(_server_url(database))
    try:
        with engine.begin() as conn:
            users = _seed(conn)

        result = _alembic(database, "upgrade", THIS)
        assert result.returncode == 0, result.stderr[-3000:]
        # The gap is filled, and the deploy log says so - for gappy only.
        assert "'gappy'" in result.stderr
        assert "'member'" not in result.stderr

        with engine.connect() as conn:
            pairs = {
                name: (ceiling, default)
                for name, ceiling, default in conn.execute(
                    text("SELECT username, mode_ceiling, mode_default FROM users")
                )
            }
            denials = conn.execute(
                text(
                    "SELECT user_id, field_group_key FROM user_access_mode_denial"
                )
            ).all()
            tables = {
                row[0]
                for row in conn.execute(
                    text(
                        "SELECT table_name FROM information_schema.tables "
                        "WHERE table_schema = 'public'"
                    )
                )
            }

        assert pairs == {
            "admin": ("unrestricted", "unrestricted"),
            "cg1618": ("unrestricted", "borderline"),
            "member": ("normal", "safe"),
            "gappy": ("borderline", "borderline"),
            "parked": (None, None),
        }
        # Two denials on two grants of one account are one account-wide row.
        assert [(row[0], row[1]) for row in denials] == [
            (users["member"], "sources_other")
        ]
        assert "user_access_mode" not in tables

        result = _alembic(database, "downgrade", PREVIOUS)
        assert result.returncode == 0, result.stderr[-3000:]

        with engine.connect() as conn:
            held = {}
            for name, key, is_default in conn.execute(
                text(
                    "SELECT u.username, m.key, g.is_default FROM user_access_mode g "
                    "JOIN users u ON u.id = g.user_id "
                    "JOIN access_mode m ON m.system_id = g.mode_id"
                )
            ):
                held.setdefault(name, {})[key] = is_default
            member_denials = conn.execute(
                text(
                    "SELECT m.key, d.field_group_key FROM user_access_mode_denial d "
                    "JOIN user_access_mode g ON g.system_id = d.user_access_mode_id "
                    "JOIN access_mode m ON m.system_id = g.mode_id"
                )
            ).all()

        assert held["admin"] == {key: key == "unrestricted" for key in ORDER}
        assert held["cg1618"] == {key: key == "borderline" for key in ORDER}
        assert held["member"] == {"safe": True, "normal": False}
        assert held["gappy"] == {
            "safe": False,
            "normal": False,
            "borderline": True,
        }
        assert "parked" not in held
        # Each denial is copied onto every grant up to the ceiling.
        assert sorted(member_denials) == [
            ("normal", "sources_other"),
            ("safe", "sources_other"),
        ]
    finally:
        engine.dispose()
