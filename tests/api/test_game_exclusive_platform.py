"""
A game's Exclusive Source: the one platform family it is exclusive to,
from its own five-value vocabulary - PC, PlayStation, Xbox, Nintendo, Mobile -
seeded scoped to game alone, so no other type's picker offers it.

tests/api/conftest.py builds the schema with create_all and never runs Alembic,
so the seed is applied here through the same helper the migration calls.
"""

import uuid

from app import models
from app.utils.game_vocabulary import (
    EXCLUSIVE_PLATFORM_CATEGORY,
    EXCLUSIVE_PLATFORMS,
    seed_exclusive_platforms,
)


def test_the_five_platforms_are_seeded_in_order_and_scoped_to_game(db_session):
    seed_exclusive_platforms(db_session)
    seed_exclusive_platforms(db_session)  # idempotent: a second run adds nothing
    db_session.commit()
    options = (
        db_session.query(models.SystemOption)
        .filter_by(category=EXCLUSIVE_PLATFORM_CATEGORY)
        .order_by(models.SystemOption.sort_order)
        .all()
    )
    assert [o.value for o in options] == ["PC", "PlayStation", "Xbox", "Nintendo", "Mobile"]
    assert EXCLUSIVE_PLATFORMS == ("PC", "PlayStation", "Xbox", "Nintendo", "Mobile")
    for option in options:
        assert {s.scope for s in option.scopes} == {"game"}


def test_a_game_saves_and_serves_its_exclusive_source(owner_client, client, db_session):
    seed_exclusive_platforms(db_session)
    game = models.Game(system_id=uuid.uuid4(), game_name_en="Zelda")
    db_session.add(game)
    db_session.commit()

    r = owner_client.put(
        f"/api/credits/game/{game.system_id}",
        json={"credits": {}, "tags": {"exclusive_platform": ["Nintendo"]}},
    )
    assert r.status_code == 200
    assert client.get(f"/api/credits/game/{game.system_id}").json()["tags"]["exclusive_platform"] == ["Nintendo"]
    assert owner_client.get(f"/api/game/{game.system_id}").json()["exclusive_platform"] == "Nintendo"


def test_no_other_type_carries_it(owner_client, db_session):
    anime = models.Anime(system_id=uuid.uuid4(), anime_name_en="A")
    db_session.add(anime)
    db_session.commit()
    r = owner_client.put(
        f"/api/credits/anime/{anime.system_id}",
        json={"credits": {}, "tags": {"exclusive_platform": ["PC"]}},
    )
    assert r.status_code == 400


# The revision freezes its own copy of the values (a revision may not import
# the application); it must seed the same values the helper does. Their order
# is g1m2ainplat3's, which re-orders them after it.
def test_the_revision_seeds_the_same_values_scoped_to_game(db_session):
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parents[2] / "alembic" / "versions" / "g1x2clusive3_game_exclusive_platform.py"
    spec = importlib.util.spec_from_file_location("_game_exclusive_platform", path)
    revision = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(revision)

    assert set(revision.VALUES) == set(EXCLUSIVE_PLATFORMS)
    assert revision.CATEGORY == EXCLUSIVE_PLATFORM_CATEGORY
    revision.seed(db_session.connection())
    revision.seed(db_session.connection())
    db_session.expire_all()
    options = (
        db_session.query(models.SystemOption)
        .filter_by(category=EXCLUSIVE_PLATFORM_CATEGORY)
        .order_by(models.SystemOption.sort_order)
        .all()
    )
    assert {o.value for o in options} == set(EXCLUSIVE_PLATFORMS)
    for option in options:
        assert [s.scope for s in option.scopes] == ["game"]
