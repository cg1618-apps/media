"""f1i2veroles45: only the five roles remain, and `role.is_system` goes.

Runs the real `alembic upgrade` from the previous head against a scratch
database, because the migration acts on data that create_all - what the rest
of the suite builds from - never has: a role outside the five.

An empty custom role is deleted with its grants. A custom role holding an
account makes the upgrade fail, naming the role, and leaves everything in
place - the refusal test seeds that account, so the failure is the refusal
and not an empty database; the mirror upgrade runs on the same shape minus
the account.
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

THIS = "f1i2veroles45"
# Read from the revision itself, so reparenting it onto a new head cannot
# leave this test upgrading to a stale parent.
PREVIOUS = ScriptDirectory.from_config(Config(str(ROOT / "alembic.ini"))).get_revision(
    THIS
).down_revision


def _alembic(database, *args):
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=ROOT,
        env={**os.environ, "POSTGRES_DB": database},
        capture_output=True,
        text=True,
    )


def _role(conn, name):
    role_id = uuid.uuid4()
    conn.execute(
        text(
            "INSERT INTO role (system_id, name, label, is_system) "
            "VALUES (:id, :name, :name, :system)"
        ),
        {"id": role_id, "name": name, "system": name in ("user", "guest")},
    )
    conn.execute(
        text("INSERT INTO role_permission (role_id, permission) VALUES (:r, 'view.search')"),
        {"r": role_id},
    )
    return role_id


def _user(conn, username, role_id):
    conn.execute(
        text(
            "INSERT INTO users (id, username, hashed_password, role_id) "
            "VALUES (:id, :name, 'x', :role)"
        ),
        {"id": uuid.uuid4(), "name": username, "role": role_id},
    )


def _names(conn):
    return {row[0] for row in conn.execute(text("SELECT name FROM role"))}


def _columns(conn):
    return {
        row[0]
        for row in conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'role'"
            )
        )
    }


def test_an_empty_custom_role_is_deleted_and_is_system_dropped(scratch_databases):
    database = scratch_databases[0]
    assert _alembic(database, "upgrade", PREVIOUS).returncode == 0

    engine = sa.create_engine(_server_url(database))
    try:
        with engine.begin() as conn:
            user_role = _role(conn, "user")
            _role(conn, "guest")
            _role(conn, "friend")
            _user(conn, "member", user_role)

        result = _alembic(database, "upgrade", THIS)
        assert result.returncode == 0, result.stderr[-3000:]

        with engine.connect() as conn:
            assert _names(conn) == {"user", "guest"}
            # The deleted role's grant went with it; the kept roles' stayed.
            assert conn.execute(text("SELECT count(*) FROM role_permission")).scalar() == 2
            assert "is_system" not in _columns(conn)

        result = _alembic(database, "downgrade", PREVIOUS)
        assert result.returncode == 0, result.stderr[-3000:]
        with engine.connect() as conn:
            flags = set(conn.execute(text("SELECT is_system FROM role")).scalars())
        assert flags == {True}
    finally:
        engine.dispose()


def test_a_custom_role_holding_an_account_stops_the_upgrade(scratch_databases):
    database = scratch_databases[0]
    assert _alembic(database, "upgrade", PREVIOUS).returncode == 0

    engine = sa.create_engine(_server_url(database))
    try:
        with engine.begin() as conn:
            _role(conn, "user")
            friend = _role(conn, "friend")
            _role(conn, "spare")
            _user(conn, "buddy", friend)

        result = _alembic(database, "upgrade", THIS)
        assert result.returncode != 0
        assert "'friend' (1 account(s))" in result.stderr
        assert "'spare'" not in result.stderr

        with engine.connect() as conn:
            # Nothing changed: not even the empty custom role went.
            assert _names(conn) == {"user", "friend", "spare"}
            assert "is_system" in _columns(conn)
            version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        assert version == PREVIOUS
    finally:
        engine.dispose()
