"""
Test databases: one per run, one per scratch use, none with a fixed name.

The platform's rule (`docs/registry.md`, "How an app's tests use the shared
server"): what makes two test runs collide is a shared database NAME, not the
shared server. So every database a test touches is created here under a name
nobody else can hold, and dropped when its user is done with it.

Names are `media_test_<epoch>_<hex>`. The epoch is part of the unique suffix
and is what makes leftover cleanup safe: a database with no connections is
only dropped once it is older than LEFTOVER_AGE, so a run that has just
created its database and not yet connected to it cannot lose it to a
neighbour's cleanup.

This module imports nothing from `app` at module scope, because the root
conftest imports it to pick the run's name BEFORE any app module reads the
environment.
"""

import re
import time
import uuid
from contextlib import contextmanager

PREFIX = "media_test"
LEFTOVER_AGE = 2 * 60 * 60  # seconds
_NAME = re.compile(rf"^{PREFIX}_(\d+)_[0-9a-f]+$")


def new_name() -> str:
    """A database name no other run or test can be using."""
    return f"{PREFIX}_{int(time.time())}_{uuid.uuid4().hex[:8]}"


def server_url(database: str) -> str:
    """The configured server, pointed at one named database.

    `render_as_string(hide_password=False)` rather than `str()`: SQLAlchemy's
    URL.__str__ masks the password as `***`, so str() hands back a URL that
    connects to the right host as the right user and fails authentication.
    """
    import sqlalchemy as sa

    from app.config import settings

    url = sa.engine.url.make_url(settings.sqlalchemy_database_url)
    return url.set(database=database).render_as_string(hide_password=False)


def _admin():
    import sqlalchemy as sa

    return sa.create_engine(server_url("postgres"), isolation_level="AUTOCOMMIT")


def create(name: str, template: str | None = None) -> None:
    from sqlalchemy import text

    assert _NAME.match(name), f"not a test database name: {name!r}"
    clause = f' TEMPLATE "{template}"' if template else ""
    admin = _admin()
    try:
        with admin.connect() as conn:
            conn.execute(text(f'CREATE DATABASE "{name}"{clause}'))
    finally:
        admin.dispose()


def drop(name: str) -> None:
    """Drop one test database, ending any session still connected to it."""
    from sqlalchemy import text

    assert _NAME.match(name), f"refusing to drop a non-test database: {name!r}"
    admin = _admin()
    try:
        with admin.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
    finally:
        admin.dispose()


def drop_leftovers(now: float | None = None) -> list[str]:
    """Drop test databases a crashed or interrupted run left behind.

    Only names this module mints, only with no connections, and only once
    older than LEFTOVER_AGE - a database with connections, or a young one,
    belongs to a run in progress.
    """
    from sqlalchemy import text

    now = time.time() if now is None else now
    admin = _admin()
    dropped = []
    try:
        with admin.connect() as conn:
            rows = conn.execute(
                text(
                    "select d.datname from pg_database d "
                    "where d.datname like :prefix and not exists ("
                    "  select 1 from pg_stat_activity a where a.datname = d.datname)"
                ),
                {"prefix": f"{PREFIX}\\_%"},
            ).scalars()
            for name in rows:
                match = _NAME.match(name)
                if match and now - int(match.group(1)) > LEFTOVER_AGE:
                    conn.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
                    dropped.append(name)
    finally:
        admin.dispose()
    return dropped


@contextmanager
def scratch(template: str | None = None):
    """A fresh database for one use - empty, or a copy of `template` - dropped
    afterwards whatever happens."""
    name = new_name()
    create(name, template=template)
    try:
        yield name
    finally:
        drop(name)
