"""
Root conftest.py — runs before ALL test modules.

Sets environment variables BEFORE any app module is imported so that
database.py picks up the test DB name and security.py uses a test secret.
"""

import os

from tests import databases

# The run's own database, under a name no other run can hold - so two runs,
# in two worktrees or two sessions, never share one. Assigned, not defaulted:
# a fixed name from the shell or .env is exactly what this replaces
# (docs/testing.md, "One database per run"). Nothing connects to it until
# tests/api/conftest.py's test_engine creates it, so the unit tier still needs
# no PostgreSQL.
os.environ["POSTGRES_DB"] = databases.new_name()
os.environ.setdefault("POSTGRES_USER", "postgres")
# POSTGRES_PASSWORD is deliberately NOT defaulted here: it comes from the
# developer's .env (via pydantic-settings) or the CI job's environment.
os.environ.setdefault("JWT_SECRET_KEY", "test_secret_key_for_testing_only_do_not_use_in_prod")
os.environ.setdefault("ADMIN_PASSWORD", "testadmin123")
# APP_ENV defaults to production in the app, so a run on a machine with no .env
# would set a Secure login cookie over the test client's plain HTTP. Pinned here
# rather than in the CI job so the suite owns its own environment; the tests
# that assert production behaviour move the setting themselves.
os.environ.setdefault("APP_ENV", "development")
# HowLongToBeat is looked up by the game Replace, which is also the write hook
# behind every game create and update - so without this, any test that saves a
# game with an English name would search the live site. The client's own tests
# switch it back on and patch requests out.
os.environ.setdefault("HLTB_ENABLED", "false")



def _create_run_database() -> bool:
    """Create the run's database now, while this module is being imported.

    Now, not in a fixture or in pytest_configure: `app.main` checks the schema
    at IMPORT time (`ensure_schema`), and pytest imports tests/api/conftest.py -
    which imports `app.main` - while loading the initial conftests, BEFORE
    pytest_configure runs. This module is loaded first, being the parent.
    Leftovers from crashed runs go first; `databases.drop_leftovers` says which
    ones count.

    A server that does not answer is not an error here. The unit tier needs no
    PostgreSQL, and an API test on such a machine fails on its first
    connection, which says the same thing more precisely.
    """
    import sqlalchemy as sa

    try:
        databases.drop_leftovers()
        databases.create(os.environ["POSTGRES_DB"])
    except sa.exc.OperationalError:
        return False
    return True


_RUN_DATABASE_CREATED = _create_run_database()


def pytest_unconfigure(config):
    """Drop the run's database, ending any connection still open to it."""
    if not _RUN_DATABASE_CREATED:
        return
    import sqlalchemy as sa

    from app import database

    database.engine.dispose()
    try:
        databases.drop(os.environ["POSTGRES_DB"])
    except sa.exc.OperationalError:  # pragma: no cover - server went away
        pass
