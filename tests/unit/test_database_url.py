"""
The connection URL built from the POSTGRES_* parts, when DATABASE_URL is unset.

The host is `127.0.0.1`, not `localhost`. The platform's dev database publishes
on `127.0.0.1:5432` only, and on Windows `localhost` resolves to `::1` first -
which nothing answers, so every NEW connection waited out a 21-second TCP
timeout before falling back to IPv4. A pooled app hides that; a test suite that
opens a fresh engine per scratch database and per Alembic subprocess pays it
every time.
"""

from sqlalchemy.engine import make_url

from app.config import Settings


def _settings(**overrides) -> Settings:
    """A Settings that ignores this machine's .env, so the parts are known."""
    values = {
        "jwt_secret_key": "a-real-secret",
        "admin_password": "a-real-password",
        "postgres_user": "postgres",
        "postgres_password": "p@ss word",
        "postgres_db": "media_test_x",
        "database_url": None,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_the_built_url_names_the_ipv4_loopback():
    url = make_url(_settings().sqlalchemy_database_url)
    assert url.host == "127.0.0.1"
    assert url.port == 5432
    assert url.database == "media_test_x"


def test_the_password_survives_quoting():
    """The mirror: the URL is still a working one, not just a different host."""
    url = make_url(_settings().sqlalchemy_database_url)
    assert url.username == "postgres"
    assert url.password == "p@ss word"


def test_database_url_is_still_honoured_verbatim():
    verbatim = "postgresql://u:p@db:5432/media"
    assert _settings(database_url=verbatim).sqlalchemy_database_url == verbatim
