"""s1w2itches345: the feature switches, the entity split and the media-type
grants, upgraded and downgraded with the real `alembic` against a scratch
database - create_all, which the rest of the suite builds from, has no grant
rows to convert.

Seeded so each step has something to act on: `user` holds view.entities and
one gated type, `guest` holds a gated type and is missing an ordinary one,
and two accounts exist, so "cg1618 on, everyone else off" can fail either way.
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

THIS = "s1w2itches345"
PREVIOUS = ScriptDirectory.from_config(Config(str(ROOT / "alembic.ini"))).get_revision(
    THIS
).down_revision

ENTITY = {"view.studio", "view.publisher", "view.person", "view.character"}
GATED = {"media_type.h-comic", "media_type.h-game", "media_type.hentai"}
FEATURES = (
    "feature_quotes_memes",
    "feature_favourites",
    "feature_music_status",
    "feature_mod_status",
)


def _alembic(database, *args):
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=ROOT,
        env={**os.environ, "POSTGRES_DB": database},
        capture_output=True,
        text=True,
    )


def _role(conn, name, permissions):
    role_id = uuid.uuid4()
    conn.execute(
        text("INSERT INTO role (system_id, name, label) VALUES (:id, :name, :name)"),
        {"id": role_id, "name": name},
    )
    for permission in permissions:
        conn.execute(
            text("INSERT INTO role_permission (role_id, permission) VALUES (:r, :p)"),
            {"r": role_id, "p": permission},
        )
    return role_id


def _grants(conn, name):
    return set(
        conn.execute(
            text(
                "SELECT p.permission FROM role_permission p "
                "JOIN role r ON r.system_id = p.role_id WHERE r.name = :n"
            ),
            {"n": name},
        ).scalars()
    )


def test_the_switches_migration_upgrades_and_downgrades(scratch_databases):
    database = scratch_databases[0]
    assert _alembic(database, "upgrade", PREVIOUS).returncode == 0

    engine = sa.create_engine(_server_url(database))
    try:
        with engine.begin() as conn:
            user_role = _role(
                conn, "user", {"view.entities", "view.search", "media_type.anime"}
            )
            _role(conn, "guest", {"media_type.anime", "media_type.hentai"})
            for username in ("cg1618", "member"):
                conn.execute(
                    text(
                        "INSERT INTO users (id, username, hashed_password, role_id) "
                        "VALUES (:id, :name, 'x', :role)"
                    ),
                    {"id": uuid.uuid4(), "name": username, "role": user_role},
                )

        result = _alembic(database, "upgrade", THIS)
        assert result.returncode == 0, result.stderr[-3000:]

        with engine.connect() as conn:
            features = {
                row[0]: tuple(row[1:])
                for row in conn.execute(
                    text(f"SELECT username, {', '.join(FEATURES)} FROM users")
                )
            }
            user, guest = _grants(conn, "user"), _grants(conn, "guest")

        assert features == {"cg1618": (True,) * 4, "member": (False,) * 4}
        # The entity key is carried onto all four kinds and is gone itself.
        assert ENTITY <= user and "view.entities" not in user
        # Gated types: granted to user, taken from guest.
        assert GATED <= user
        assert not GATED & guest
        # An ordinary type a role was missing is granted once.
        assert "media_type.manga" in guest and "media_type.manga" in user
        # The guest never held the entity key, so it gains none.
        assert not ENTITY & guest

        result = _alembic(database, "downgrade", PREVIOUS)
        assert result.returncode == 0, result.stderr[-3000:]
        with engine.connect() as conn:
            user = _grants(conn, "user")
            columns = set(
                conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_name = 'users'"
                    )
                ).scalars()
            )
        assert "view.entities" in user and not ENTITY & user
        assert not set(FEATURES) & columns
    finally:
        engine.dispose()
