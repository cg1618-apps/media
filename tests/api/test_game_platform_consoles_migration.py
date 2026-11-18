"""
API integration tests for revision g1c2onsoles3: Game Platform gains one value
per console beside its six families.

Runs the shipped revision's own data steps against the test session - the
suite has no Alembic harness. The from-zero proof is
test_migrations_build_the_schema.py.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest

from app import models
from app.services.domain.credits import tag_values
from app.utils.game_vocabulary import GAME_PLATFORMS, seed_game_vocabulary

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "g1c2onsoles3_game_platform_consoles.py"

FAMILIES = ("PlayStation", "Nintendo", "Xbox", "PC", "Mobile", "Browser")


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_game_consoles", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def before(db_session, revision):
    """
    The vocabulary as the previous revision left it - six families, scoped to
    game, each folding its consoles' IGDB names in - and one game tagged
    PlayStation.
    """
    for sort_order, (family, extra, consoles) in enumerate(revision.PLATFORMS):
        option = models.SystemOption(
            category="Game Platform", value=family, sort_order=sort_order
        )
        db_session.add(option)
        db_session.flush()
        db_session.add(
            models.SystemOptionScope(option_id=option.system_id, scope="game")
        )
        for alias in tuple(igdb for _, igdb in consoles) + extra:
            db_session.add(
                models.SystemOptionAlias(
                    option_id=option.system_id, source="igdb", value=alias
                )
            )
    game = models.Game(system_id=uuid.uuid4(), game_name_en="Bloodborne")
    db_session.add(game)
    db_session.flush()
    db_session.add(
        models.MediaTag(
            media_id=game.system_id,
            field="game_platform",
            option_id=_option(db_session, "PlayStation").system_id,
            position=0,
        )
    )
    db_session.flush()
    return game


def _snapshot(db_session):
    """Every Game Platform row as (value, sort_order, scopes, igdb aliases)."""
    db_session.expire_all()
    return sorted(
        (
            o.value,
            o.sort_order,
            tuple(sorted(s.scope for s in o.scopes)),
            tuple(sorted(a.value for a in o.aliases if a.source == "igdb")),
        )
        for o in db_session.query(models.SystemOption).filter_by(
            category="Game Platform"
        )
    )


def _option(db_session, value):
    return (
        db_session.query(models.SystemOption)
        .filter_by(category="Game Platform", value=value)
        .one()
    )


def _order(db_session):
    return [
        o.value
        for o in db_session.query(models.SystemOption)
        .filter_by(category="Game Platform")
        .order_by(models.SystemOption.sort_order)
    ]


def test_the_frozen_copy_matches_the_app_vocabulary(revision):
    """Frozen on purpose; this says they agreed when the revision was written."""
    assert revision.PLATFORMS == GAME_PLATFORMS


def test_upgrade_adds_every_console_scoped_with_its_igdb_alias(
    db_session, revision, before
):
    revision.apply_upgrade(db_session.connection())
    db_session.expire_all()

    switch = _option(db_session, "Switch")
    assert {s.scope for s in switch.scopes} == {"game"}
    assert {(a.source, a.value) for a in switch.aliases} == {
        ("igdb", "Nintendo Switch")
    }
    assert {a.value for a in _option(db_session, "Original Xbox").aliases} == {"Xbox"}
    # The family keeps what it had.
    assert "Nintendo Switch" in {
        a.value for a in _option(db_session, "Nintendo").aliases
    }

    values = _order(db_session)
    assert values[:2] == ["PlayStation", "PS1"]
    assert values[values.index("Nintendo") + 1] == "Switch"


def test_upgrade_guesses_no_console_for_an_existing_game(
    db_session, revision, before
):
    revision.apply_upgrade(db_session.connection())
    db_session.expire_all()
    assert tag_values(db_session, before.system_id, "game_platform") == [
        "PlayStation"
    ]


def test_upgrade_is_idempotent(db_session, revision, before):
    revision.apply_upgrade(db_session.connection())
    once = _snapshot(db_session)
    revision.apply_upgrade(db_session.connection())
    assert _snapshot(db_session) == once
    assert len(once) == len(revision._rows())


def test_upgrade_gives_the_rows_a_fresh_seed_gives(db_session, revision, before):
    """create_all databases are seeded, upgraded ones migrated: same rows."""
    revision.apply_upgrade(db_session.connection())
    migrated = _snapshot(db_session)

    db_session.query(models.MediaTag).delete()
    db_session.query(models.SystemOption).filter_by(category="Game Platform").delete()
    db_session.flush()
    seed_game_vocabulary(db_session)
    db_session.flush()
    assert _snapshot(db_session) == migrated


def test_an_unscoped_console_value_that_already_exists_stays_unscoped(
    db_session, revision, before
):
    """
    A value with no scope rows is offered everywhere; giving it `game` would
    narrow it. Switch 2, created by the upgrade, is the mirror: it is scoped.
    """
    db_session.add(models.SystemOption(category="Game Platform", value="Switch"))
    db_session.flush()
    revision.apply_upgrade(db_session.connection())
    db_session.expire_all()
    assert _option(db_session, "Switch").scopes == []
    assert {s.scope for s in _option(db_session, "Switch 2").scopes} == {"game"}


def test_downgrade_drops_the_console_aliases_and_keeps_their_tags(
    db_session, revision, before
):
    revision.apply_upgrade(db_session.connection())
    db_session.add(
        models.MediaTag(
            media_id=before.system_id,
            field="game_platform",
            option_id=_option(db_session, "Switch").system_id,
            position=1,
        )
    )
    db_session.flush()

    revision.apply_downgrade(db_session.connection())
    db_session.expire_all()

    for _, _, consoles in revision.PLATFORMS:
        for console, _ in consoles:
            assert _option(db_session, console).aliases == [], console
    assert "Nintendo Switch" in {
        a.value for a in _option(db_session, "Nintendo").aliases
    }
    assert tag_values(db_session, before.system_id, "game_platform") == [
        "PlayStation",
        "Switch",
    ]
    assert tuple(_order(db_session)[:6]) == FAMILIES


def test_upgrade_after_downgrade_restores_the_upgraded_rows(
    db_session, revision, before
):
    revision.apply_upgrade(db_session.connection())
    upgraded = _snapshot(db_session)
    revision.apply_downgrade(db_session.connection())
    revision.apply_upgrade(db_session.connection())
    assert _snapshot(db_session) == upgraded
