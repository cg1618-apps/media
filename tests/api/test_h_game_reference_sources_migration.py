"""
The data migration that offers h-game its reference sources: every
Reference Source value game is offered, plus Twitter.

Imports the revision by file path and runs its own `restore()` against the
test session, as test_hentai_sources_migration.py does: the suite builds its
schema with create_all, so a test restating the SQL would pass while the
shipped migration was wrong.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
from pathlib import Path

import pytest

from app import models
from app.utils.source_fields import REFERENCE_CATEGORY

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "h8g9refsrc0_h_game_reference_sources.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_h_game_references", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _option(db, value, scopes):
    option = (
        db.query(models.SystemOption)
        .filter_by(category=REFERENCE_CATEGORY, value=value)
        .one_or_none()
    )
    if option is None:
        option = models.SystemOption(category=REFERENCE_CATEGORY, value=value)
        db.add(option)
        db.flush()
    db.query(models.SystemOptionScope).filter_by(option_id=option.system_id).delete()
    for scope in scopes:
        db.add(models.SystemOptionScope(option_id=option.system_id, scope=scope))
    db.flush()
    return option


def _scopes(db, value):
    db.expire_all()
    option = (
        db.query(models.SystemOption)
        .filter_by(category=REFERENCE_CATEGORY, value=value)
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


def test_every_game_reference_is_offered_on_h_game(db_session, revision):
    for value in ("SteamDB", "HowLongToBeat", "Metacritic"):
        _option(db_session, value, ["game"])
    _option(db_session, "Official site", ["anime", "game", "h-comic"])
    _run(db_session, revision)

    for value in ("SteamDB", "HowLongToBeat", "Metacritic"):
        assert _scopes(db_session, value) == ["game", "h-game"]
    assert _scopes(db_session, "Official site") == [
        "anime", "game", "h-comic", "h-game",
    ]


def test_a_reference_game_is_not_offered_on_is_left_alone(db_session, revision):
    # The mirror of the test above, with the same run widening SteamDB, so a
    # green here is the migration choosing, not the migration doing nothing.
    _option(db_session, "AniList", ["anime", "manga"])
    _option(db_session, "SteamDB", ["game"])
    _run(db_session, revision)

    assert _scopes(db_session, "AniList") == ["anime", "manga"]
    assert "h-game" in _scopes(db_session, "SteamDB")


def test_twitter_is_offered_on_h_game(db_session, revision):
    _option(db_session, "Twitter", ["anime", "h-comic", "hentai"])
    _run(db_session, revision)

    assert _scopes(db_session, "Twitter") == ["anime", "h-comic", "h-game", "hentai"]


def test_an_unscoped_value_is_not_narrowed(db_session, revision):
    """The first scope row on an unscoped value narrows it to that one type,
    which would take it out of every other type's picker."""
    _option(db_session, "Wikipedia", [])
    _option(db_session, "Twitter", [])
    # Made non-empty on purpose: a scoped value the same run DOES widen.
    _option(db_session, "SteamDB", ["game"])
    _run(db_session, revision)

    assert _scopes(db_session, "Wikipedia") == []
    assert _scopes(db_session, "Twitter") == []
    assert _scopes(db_session, "SteamDB") == ["game", "h-game"]


def test_twitter_is_not_created(db_session, revision):
    """Tenrai's first write creates it; an h-game-only Twitter created here
    would be the value anime's Fill then resolves to."""
    db_session.query(models.SystemOption).filter_by(
        category=REFERENCE_CATEGORY, value="Twitter"
    ).delete()
    _run(db_session, revision)

    assert _scopes(db_session, "Twitter") is None


def test_running_it_twice_is_harmless(db_session, revision):
    _option(db_session, "SteamDB", ["game"])
    _run(db_session, revision)
    _run(db_session, revision)

    assert _scopes(db_session, "SteamDB") == ["game", "h-game"]
