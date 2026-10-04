"""
API integration tests for the revision that rewrites every "Anime" token in
franchise.franchise_type to "ACG".

Runs the shipped revision's own `rewrite()` against the test session - the
suite has no Alembic harness.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "a1n2imeacg3_anime_franchises_are_acg.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_anime_franchises_are_acg", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _franchise(db, franchise_type, name):
    row = models.Franchise(
        system_id=uuid.uuid4(), franchise_type=franchise_type, franchise_name_en=name
    )
    db.add(row)
    db.flush()
    return row


def _type_of(db, row):
    db.expire_all()
    return db.get(models.Franchise, row.system_id).franchise_type


def test_every_anime_token_becomes_acg(db_session, revision):
    rows = {
        "Anime": _franchise(db_session, "Anime", "Zvornik A"),
        "Game, Anime": _franchise(db_session, "Game, Anime", "Zvornik B"),
        "Game,Anime": _franchise(db_session, "Game,Anime", "Zvornik C"),
        # Already ACG: the rewritten token is dropped, not doubled.
        "ACG, Anime, Novel": _franchise(db_session, "ACG, Anime, Novel", "Zvornik D"),
        "Anime, ACG": _franchise(db_session, "Anime, ACG", "Zvornik E"),
    }

    revision.rewrite(db_session.connection())

    assert {k: _type_of(db_session, r) for k, r in rows.items()} == {
        "Anime": "ACG",
        "Game, Anime": "Game, ACG",
        "Game,Anime": "Game,ACG",
        "ACG, Anime, Novel": "ACG, Novel",
        "Anime, ACG": "ACG",
    }


def test_other_types_are_left_alone(db_session, revision):
    # "Anime Movie" contains "Anime" as a substring and must not be touched;
    # the ACG row is the mirror case proving the rewrite ran at all.
    movie = _franchise(db_session, "Anime Movie", "Zvornik F")
    plain = _franchise(db_session, "Movie, TV", "Zvornik G")
    untyped = _franchise(db_session, None, "Zvornik H")
    anime = _franchise(db_session, "Anime", "Zvornik I")

    revision.rewrite(db_session.connection())

    assert _type_of(db_session, movie) == "Anime Movie"
    assert _type_of(db_session, plain) == "Movie, TV"
    assert _type_of(db_session, untyped) is None
    assert _type_of(db_session, anime) == "ACG"


def test_the_revision_is_irreversible(revision):
    # The downgrade cannot know which ACG tokens used to be Anime.
    assert revision.irreversible is True
