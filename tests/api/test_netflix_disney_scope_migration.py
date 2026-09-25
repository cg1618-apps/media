"""
The data migration that offers Netflix and Disney+ on anime and anime movies
again.

Imports the revision by file path and runs its own `restore()` against the
test session, as test_guide_structured_migration.py does: the suite builds its
schema with create_all, so a test restating the SQL would pass while the
shipped migration was wrong.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
from pathlib import Path

import pytest

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "n1d2plscope3_netflix_disney_on_anime.py"

WATCHED = ["anime", "anime-movie", "cartoon", "movie", "tv-show"]


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_netflix_disney", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _platform(db, value, scopes, category="Platform"):
    option = models.SystemOption(category=category, value=value)
    db.add(option)
    db.flush()
    for scope in scopes:
        db.add(models.SystemOptionScope(option_id=option.system_id, scope=scope))
    db.flush()
    return option


def _scopes(db, option):
    db.expire_all()
    return sorted(
        s.scope
        for s in db.query(models.SystemOptionScope).filter_by(
            option_id=option.system_id
        )
    )


def test_the_narrowed_values_are_offered_on_every_watched_type(db_session, revision):
    # The state the reconcile left them in.
    netflix = _platform(db_session, "Netflix", ["tv-show", "cartoon"])
    disney = _platform(db_session, "Disney+", ["tv-show", "cartoon"])
    db_session.commit()

    revision.restore(db_session.connection())
    db_session.commit()

    assert _scopes(db_session, netflix) == WATCHED
    assert _scopes(db_session, disney) == WATCHED


def test_an_admin_added_scope_is_kept(db_session, revision):
    netflix = _platform(db_session, "Netflix", ["tv-show", "comic"])
    db_session.commit()

    revision.restore(db_session.connection())
    db_session.commit()

    assert _scopes(db_session, netflix) == sorted([*WATCHED, "comic"])


def test_other_platforms_and_other_categories_are_untouched(db_session, revision):
    # Made non-empty on purpose: without these rows there is nothing the
    # migration could wrongly widen, and the assertions would pass vacuously.
    hbo = _platform(db_session, "HBO Max", ["tv-show"])
    reference = _platform(db_session, "Netflix", ["tv-show"], category="Reference Source")
    netflix = _platform(db_session, "Netflix", ["tv-show"])
    db_session.commit()

    revision.restore(db_session.connection())
    db_session.commit()

    assert _scopes(db_session, hbo) == ["tv-show"]
    assert _scopes(db_session, reference) == ["tv-show"]
    # The mirror: the same run did widen the Platform value.
    assert _scopes(db_session, netflix) == WATCHED


def test_running_it_twice_is_harmless(db_session, revision):
    netflix = _platform(db_session, "Netflix", [])
    db_session.commit()

    revision.restore(db_session.connection())
    revision.restore(db_session.connection())
    db_session.commit()

    assert _scopes(db_session, netflix) == WATCHED
