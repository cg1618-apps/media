"""
The data half of the revision that gives h-comic its own main sources, two
reference sources, and takes Prime Video out of every read type's picker.

Imports the revision by file path and runs its own functions against the
test session, as test_netflix_disney_scope_migration.py does: the suite builds
its schema with create_all, so a test restating the SQL would pass while the
shipped migration was wrong.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
from pathlib import Path

import pytest

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "h5c6malsrc7_h_comic_mal_and_sources.py"

WATCH_PLATFORMS = [
    "DLsite TW",
    "DLsite JP",
    "Toptoon TW",
    "Toptoon KR",
    "Toomics TW",
    "Toomics KR",
    "Lezhin TW",
    "Lezhin KR",
]
ORIGIN_PLATFORMS = ["DLsite", "Toptoon", "Toomics", "Lezhin"]
H_COMIC_PLATFORMS = WATCH_PLATFORMS + ORIGIN_PLATFORMS
WATCHED = ["anime", "anime-movie", "cartoon", "movie", "tv-show"]


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_h_comic_sources", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _option(db, value, scopes, category="Platform"):
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


def _usages(db, option):
    db.expire_all()
    return sorted(
        u.usage
        for u in db.query(models.SystemOptionUsage).filter_by(
            option_id=option.system_id
        )
    )


def _platform(db, value):
    return db.query(models.SystemOption).filter_by(category="Platform", value=value).one()


def _run(db, revision):
    conn = db.connection()
    revision.scope_prime_video(conn)
    revision.seed_platforms(conn)
    revision.scope_references(conn)
    db.commit()


def test_the_platforms_are_offered_on_h_comic_in_order(db_session, revision):
    _run(db_session, revision)

    rows = (
        db_session.query(models.SystemOption)
        .filter(
            models.SystemOption.category == "Platform",
            models.SystemOption.value.in_(H_COMIC_PLATFORMS),
        )
        .order_by(models.SystemOption.sort_order)
        .all()
    )
    assert [r.value for r in rows] == H_COMIC_PLATFORMS
    for row in rows:
        assert _scopes(db_session, row) == ["h-comic"]


def test_the_storefronts_are_main_sources_and_the_publishers_official_sources(
    db_session, revision
):
    _run(db_session, revision)

    for value in WATCH_PLATFORMS:
        assert _usages(db_session, _platform(db_session, value)) == ["watch"], value
    for value in ORIGIN_PLATFORMS:
        assert _usages(db_session, _platform(db_session, value)) == ["origin"], value


def test_an_existing_platform_keeps_its_scopes_and_gains_h_comic(db_session, revision):
    dlsite = _option(db_session, "DLsite JP", ["h-game"])
    db_session.commit()

    _run(db_session, revision)

    assert _scopes(db_session, dlsite) == ["h-comic", "h-game"]
    # The refusal: offered elsewhere already, so a first usage row would
    # narrow it there too. The mirror - a value the revision owns does get
    # its usage - is the test above.
    assert _usages(db_session, dlsite) == []
    assert (
        db_session.query(models.SystemOption)
        .filter_by(category="Platform", value="DLsite JP")
        .count()
        == 1
    )


def test_unscoped_prime_video_is_narrowed_to_the_watched_types(db_session, revision):
    prime = _option(db_session, "Prime Video", [])
    db_session.commit()

    _run(db_session, revision)

    assert _scopes(db_session, prime) == WATCHED


def test_a_scoped_prime_video_is_left_where_an_admin_put_it(db_session, revision):
    """The refusal. Scoped already, so adding the five would widen it."""
    prime = _option(db_session, "Prime Video", ["movie"])
    db_session.commit()

    _run(db_session, revision)

    assert _scopes(db_session, prime) == ["movie"]


def test_official_site_and_twitter_gain_h_comic(db_session, revision):
    official = _option(db_session, "Official site", ["anime"], "Reference Source")
    twitter = _option(db_session, "Twitter", ["manga"], "Reference Source")
    db_session.commit()

    _run(db_session, revision)

    assert _scopes(db_session, official) == ["anime", "h-comic"]
    assert _scopes(db_session, twitter) == ["h-comic", "manga"]


def test_an_unscoped_reference_is_not_narrowed_to_h_comic(db_session, revision):
    """The refusal: unscoped already means every type. Twitter is scoped in
    the same run and does gain h-comic, so the run did scope something and
    the empty result is the guard's doing."""
    official = _option(db_session, "Official site", [], "Reference Source")
    twitter = _option(db_session, "Twitter", ["manga"], "Reference Source")
    db_session.commit()

    _run(db_session, revision)

    assert _scopes(db_session, official) == []
    assert _scopes(db_session, twitter) == ["h-comic", "manga"]


def test_running_it_twice_is_harmless(db_session, revision):
    prime = _option(db_session, "Prime Video", [])
    db_session.commit()

    _run(db_session, revision)
    _run(db_session, revision)

    assert _scopes(db_session, prime) == WATCHED
    assert (
        db_session.query(models.SystemOption)
        .filter(
            models.SystemOption.category == "Platform",
            models.SystemOption.value.in_(H_COMIC_PLATFORMS),
        )
        .count()
        == len(H_COMIC_PLATFORMS)
    )
