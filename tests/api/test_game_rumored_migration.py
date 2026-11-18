"""
The revision that drops "Rumored" from the game release statuses moves every
row holding it to "Unreleased" - on games and h-games, which share the
vocabulary - and rewrites a stored Add-form default the same way.

Runs the shipped revision's own `retire_rumored()` against the test session -
the suite has no Alembic harness for data.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import importlib.util
import json
import uuid
from pathlib import Path

import pytest

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "g1s2ellrumor3_game_copy_sale_and_hours.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_game_rumored", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _reread(db, model, row):
    db.expire_all()
    return db.get(model, row.system_id)


def test_rumored_becomes_unreleased_on_games_and_h_games(db_session, revision):
    rumored = models.Game(system_id=uuid.uuid4(), game_name_en="R", release_status="Rumored")
    h_rumored = models.HGame(system_id=uuid.uuid4(), h_game_name_en="HR", release_status="Rumored")
    # Mirror cases: every other status, and none, stays as it was.
    released = models.Game(system_id=uuid.uuid4(), game_name_en="S", release_status="Released")
    blank = models.Game(system_id=uuid.uuid4(), game_name_en="T", release_status=None)
    db_session.add_all([rumored, h_rumored, released, blank])
    db_session.flush()

    revision.retire_rumored(db_session.connection())

    assert _reread(db_session, models.Game, rumored).release_status == "Unreleased"
    assert _reread(db_session, models.HGame, h_rumored).release_status == "Unreleased"
    assert _reread(db_session, models.Game, released).release_status == "Released"
    assert _reread(db_session, models.Game, blank).release_status is None


def test_a_stored_form_default_is_rewritten(db_session, revision):
    db_session.add_all(
        [
            models.SystemConfigs(
                config_key="form_defaults:game",
                config_value=json.dumps({"defaults": {"release_status": "Rumored"}}),
            ),
            # Mirror: an anime default is not a game status and stays.
            models.SystemConfigs(
                config_key="form_defaults:anime",
                config_value=json.dumps({"defaults": {"airing_status": "Rumored"}}),
            ),
        ]
    )
    db_session.flush()

    revision.retire_rumored(db_session.connection())
    db_session.expire_all()

    def stored(key):
        row = db_session.query(models.SystemConfigs).filter_by(config_key=key).one()
        return json.loads(row.config_value)["defaults"]

    assert stored("form_defaults:game") == {"release_status": "Unreleased"}
    assert stored("form_defaults:anime") == {"airing_status": "Rumored"}


def test_the_revision_is_reversible(revision):
    """The downgrade drops the three copy columns; it cannot tell which
    Unreleased rows were Rumored, and does not pretend to."""
    assert getattr(revision, "irreversible", False) is False
