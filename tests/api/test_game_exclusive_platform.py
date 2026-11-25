"""
A game's Exclusive Source: the one platform family it is exclusive to,
from its own five-value vocabulary - Nintendo, PlayStation, Xbox, PC, Mobile -
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
    assert [o.value for o in options] == ["Nintendo", "PlayStation", "Xbox", "PC", "Mobile"]
    assert EXCLUSIVE_PLATFORMS == ("Nintendo", "PlayStation", "Xbox", "PC", "Mobile")
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
