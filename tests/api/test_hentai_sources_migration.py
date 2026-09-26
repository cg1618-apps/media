"""
The data migration that gives hentai its source vocabularies.

Main Sources: every Platform value anime is offered on, plus DLsite TW and
DLsite JP. Reference Sources: Official site and Twitter.

Imports the revision by file path and runs its own `restore()` against the
test session, as test_netflix_disney_scope_migration.py does: the suite
builds its schema with create_all, so a test restating the SQL would pass
while the shipped migration was wrong.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
from pathlib import Path

import pytest

from app import models
from app.utils.source_fields import (
    PLATFORM_CATEGORY,
    REFERENCE_CATEGORY,
)

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "h6e7n8srcs9_hentai_sources.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_hentai_sources", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _option(db, value, scopes, category=PLATFORM_CATEGORY):
    option = models.SystemOption(category=category, value=value)
    db.add(option)
    db.flush()
    for scope in scopes:
        db.add(models.SystemOptionScope(option_id=option.system_id, scope=scope))
    db.flush()
    return option


def _scopes(db, category, value):
    db.expire_all()
    option = (
        db.query(models.SystemOption)
        .filter_by(category=category, value=value)
        .one_or_none()
    )
    if option is None:
        return None
    return sorted(
        s.scope
        for s in db.query(models.SystemOptionScope).filter_by(
            option_id=option.system_id
        )
    )


def _run(db, revision):
    db.commit()
    revision.restore(db.connection())
    db.commit()


def test_every_anime_platform_is_offered_on_hentai(db_session, revision):
    _option(db_session, "Bahamut", ["anime", "anime-movie"])
    _option(db_session, "Prime Video", ["anime", "movie", "hentai"])
    _run(db_session, revision)

    assert _scopes(db_session, PLATFORM_CATEGORY, "Bahamut") == [
        "anime", "anime-movie", "hentai",
    ]
    assert _scopes(db_session, PLATFORM_CATEGORY, "Prime Video") == [
        "anime", "hentai", "movie",
    ]


def test_a_platform_anime_is_not_offered_on_is_left_alone(db_session, revision):
    # The mirror of the test above, with the same run widening Bahamut, so a
    # green here is the migration choosing, not the migration doing nothing.
    _option(db_session, "HBO Max", ["movie", "tv-show"])
    _option(db_session, "Bahamut", ["anime"])
    _run(db_session, revision)

    assert _scopes(db_session, PLATFORM_CATEGORY, "HBO Max") == ["movie", "tv-show"]
    assert "hentai" in _scopes(db_session, PLATFORM_CATEGORY, "Bahamut")


def test_dlsite_gains_hentai_beside_h_comic(db_session, revision):
    _option(db_session, "DLsite TW", ["h-comic"])
    _option(db_session, "DLsite JP", ["h-comic"])
    _run(db_session, revision)

    assert _scopes(db_session, PLATFORM_CATEGORY, "DLsite TW") == ["h-comic", "hentai"]
    assert _scopes(db_session, PLATFORM_CATEGORY, "DLsite JP") == ["h-comic", "hentai"]


def test_missing_values_are_created_scoped_to_hentai_only(db_session, revision):
    """Created unscoped they would be offered on every type; created with
    the hentai scope they are offered where they were asked for."""
    _run(db_session, revision)

    assert _scopes(db_session, PLATFORM_CATEGORY, "DLsite TW") == ["hentai"]
    assert _scopes(db_session, PLATFORM_CATEGORY, "DLsite JP") == ["hentai"]


def test_an_unscoped_value_is_not_narrowed(db_session, revision):
    """The first scope row on an unscoped value narrows it to that one type,
    which would take it out of every other type's picker."""
    _option(db_session, "DLsite TW", [])
    _option(db_session, "Twitter", [], category=REFERENCE_CATEGORY)
    # Made non-empty on purpose: a scoped value the same run DOES widen.
    _option(db_session, "Official site", ["anime"], category=REFERENCE_CATEGORY)
    _run(db_session, revision)

    assert _scopes(db_session, PLATFORM_CATEGORY, "DLsite TW") == []
    assert _scopes(db_session, REFERENCE_CATEGORY, "Twitter") == []
    assert _scopes(db_session, REFERENCE_CATEGORY, "Official site") == ["anime", "hentai"]


def test_official_site_and_twitter_are_offered_on_hentai(db_session, revision):
    _option(db_session, "Official site", ["anime", "h-comic"], category=REFERENCE_CATEGORY)
    _option(db_session, "Twitter", ["anime", "h-comic"], category=REFERENCE_CATEGORY)
    _option(db_session, "AniList", ["anime", "manga"], category=REFERENCE_CATEGORY)
    _run(db_session, revision)

    assert _scopes(db_session, REFERENCE_CATEGORY, "Official site") == [
        "anime", "h-comic", "hentai",
    ]
    assert _scopes(db_session, REFERENCE_CATEGORY, "Twitter") == [
        "anime", "h-comic", "hentai",
    ]
    # Only the two that were asked for.
    assert _scopes(db_session, REFERENCE_CATEGORY, "AniList") == ["anime", "manga"]


def test_reference_values_are_not_created(db_session, revision):
    """Tenrai's first write creates them; a hentai-only Twitter created here
    would be the value anime's Fill then resolves to, and anime's picker
    would not offer it."""
    _run(db_session, revision)

    assert _scopes(db_session, REFERENCE_CATEGORY, "Official site") is None
    assert _scopes(db_session, REFERENCE_CATEGORY, "Twitter") is None


def test_running_it_twice_is_harmless(db_session, revision):
    _option(db_session, "Bahamut", ["anime"])
    _run(db_session, revision)
    _run(db_session, revision)

    assert _scopes(db_session, PLATFORM_CATEGORY, "Bahamut") == ["anime", "hentai"]
    assert _scopes(db_session, PLATFORM_CATEGORY, "DLsite TW") == ["hentai"]
    assert (
        db_session.query(models.SystemOption)
        .filter_by(category=PLATFORM_CATEGORY, value="DLsite TW")
        .count()
        == 1
    )
