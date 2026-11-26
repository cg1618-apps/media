"""
API integration tests for revision g1m2ainplat3: the Game Platform
vocabulary offers its six main platforms first, and every game's stored
platform tags put the main platforms ahead of the specific ones, a missing
family added for a tagged console.

Runs the shipped revision's own functions against the test session. A
revision's own test, deleted once the revision has deployed (docs/testing.md,
"Migration tests").

Requires PostgreSQL. See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest

from app import models
from app.services.domain.credits import tag_values
from app.utils.game_vocabulary import GAME_VOCABULARY, seed_game_vocabulary

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "g1m2ainplat3_main_platforms_first.py"

MAIN = ["PC", "PlayStation", "Xbox", "Nintendo", "Mobile", "Browser"]


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_main_platforms_first", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(autouse=True)
def vocabulary(db_session):
    seed_game_vocabulary(db_session)
    db_session.flush()


def _platform_order(db):
    return [
        o.value
        for o in db.query(models.SystemOption)
        .filter_by(category="Game Platform")
        .order_by(models.SystemOption.sort_order)
        .all()
    ]


def _option_id(db, category, value):
    return (
        db.query(models.SystemOption)
        .filter_by(category=category, value=value)
        .one()
        .system_id
    )


def _game(db, field_values):
    """A game with its tags stored exactly as given - no family added."""
    game = models.Game(system_id=uuid.uuid4(), game_name_en="A game")
    db.add(game)
    db.flush()
    for field, (category, values) in field_values.items():
        for position, value in enumerate(values):
            db.add(
                models.MediaTag(
                    media_id=game.system_id,
                    field=field,
                    option_id=_option_id(db, category, value),
                    position=position,
                )
            )
    db.flush()
    return game.system_id


def _positions(db, media_id, field="game_platform"):
    return sorted(
        t.position
        for t in db.query(models.MediaTag).filter_by(media_id=media_id, field=field)
    )


def test_the_vocabulary_goes_back_and_forth_and_matches_the_seed(revision, db_session):
    db = db_session
    seeded = [value for value, _ in GAME_VOCABULARY["Game Platform"]]

    revision.apply_downgrade(db.connection())
    db.expire_all()
    old = _platform_order(db)
    assert old[:3] == ["PlayStation", "PS1", "PS2"]
    assert old[old.index("Nintendo") + 1] == "Switch"

    revision.apply_upgrade(db.connection())
    db.expire_all()
    assert _platform_order(db)[:6] == MAIN
    assert _platform_order(db) == seeded
    by_value = {
        o.value: o.sort_order
        for o in db.query(models.SystemOption).filter_by(category="Game Platform")
    }
    assert [by_value[v] for v in seeded] == list(range(len(seeded)))


def test_every_games_platforms_put_the_main_ones_first(revision, db_session):
    db = db_session
    interleaved = _game(
        db, {"game_platform": ("Game Platform", ["Nintendo", "Switch", "PlayStation", "PS5"])}
    )
    # Consoles with no family stored: the family is added, ahead of them.
    no_family = _game(db, {"game_platform": ("Game Platform", ["PS5", "Windows"])})
    # Already in order - the mirror case that a rewrite-everything would move.
    in_order = _game(db, {"game_platform": ("Game Platform", ["PC", "Xbox", "Windows"])})
    # Another tag field is not a platform list and must not move.
    db.add(models.SystemOption(category="Game Genre", value="Switch"))
    db.flush()
    genres = _game(db, {"game_genre": ("Game Genre", ["角色扮演", "Switch", "動作"])})

    revision.apply_upgrade(db.connection())
    db.expire_all()

    assert tag_values(db, interleaved, "game_platform") == [
        "Nintendo",
        "PlayStation",
        "Switch",
        "PS5",
    ]
    assert tag_values(db, no_family, "game_platform") == [
        "PlayStation",
        "PC",
        "PS5",
        "Windows",
    ]
    assert tag_values(db, in_order, "game_platform") == ["PC", "Xbox", "Windows"]
    assert tag_values(db, genres, "game_genre") == ["角色扮演", "Switch", "動作"]
    for media_id in (interleaved, no_family, in_order):
        assert _positions(db, media_id) == list(range(len(_positions(db, media_id))))

    # Idempotent: a second run finds everything in place.
    before = {
        (t.media_id, t.option_id, t.position)
        for t in db.query(models.MediaTag).filter_by(field="game_platform")
    }
    revision.apply_upgrade(db.connection())
    db.expire_all()
    after = {
        (t.media_id, t.option_id, t.position)
        for t in db.query(models.MediaTag).filter_by(field="game_platform")
    }
    assert after == before


def test_the_downgrade_keeps_every_tag(revision, db_session):
    """Positions are not put back, but no tag is lost on the way down."""
    db = db_session
    game = _game(db, {"game_platform": ("Game Platform", ["Switch", "Nintendo", "PC"])})
    revision.apply_upgrade(db.connection())
    revision.apply_downgrade(db.connection())
    db.expire_all()
    assert tag_values(db, game, "game_platform") == ["Nintendo", "PC", "Switch"]
