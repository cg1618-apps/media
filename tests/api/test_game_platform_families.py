"""
A Game Platform console brings its family: tagging Switch stores Nintendo
beside it, whichever path wrote the tags. replace_tags is that one path, so
these drive it through the credits API and directly.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain.credits import replace_tags, tag_values
from app.utils.game_vocabulary import GAME_PLATFORM_FAMILIES, seed_game_vocabulary


@pytest.fixture(autouse=True)
def vocabulary(db_session):
    seed_game_vocabulary(db_session)
    db_session.commit()


@pytest.fixture
def game(db_session):
    row = models.Game(system_id=uuid.uuid4(), game_name_en="Zelda")
    db_session.add(row)
    db_session.commit()
    return row


def _put_platforms(owner_client, game, values):
    response = owner_client.put(
        f"/api/credits/game/{game.system_id}",
        json={"tags": {"game_platform": values}},
    )
    assert response.status_code == 200, response.text


def test_tagging_a_console_through_the_api_tags_its_family(
    owner_client, db_session, game
):
    _put_platforms(owner_client, game, ["Switch", "PS5"])
    db_session.expire_all()
    assert tag_values(db_session, game.system_id, "game_platform") == [
        "Nintendo",
        "Switch",
        "PlayStation",
        "PS5",
    ]


def test_removing_a_family_while_its_console_stays_keeps_the_family(
    owner_client, db_session, game
):
    _put_platforms(owner_client, game, ["Nintendo", "Switch"])
    _put_platforms(owner_client, game, ["Switch"])
    db_session.expire_all()
    assert tag_values(db_session, game.system_id, "game_platform") == [
        "Nintendo",
        "Switch",
    ]


def test_removing_the_console_as_well_removes_the_family(
    owner_client, db_session, game
):
    """The mirror: the family only stays because a console held it."""
    _put_platforms(owner_client, game, ["Nintendo", "Switch", "PC"])
    _put_platforms(owner_client, game, ["PC"])
    db_session.expire_all()
    assert tag_values(db_session, game.system_id, "game_platform") == ["PC"]


def test_a_family_alone_brings_no_console(db_session, game):
    replace_tags(db_session, game.system_id, "game_platform", ["Nintendo"])
    assert tag_values(db_session, game.system_id, "game_platform") == ["Nintendo"]


def test_only_the_platform_field_is_expanded(db_session, game):
    """
    The same string in another tag field is not a console. A Game Genre value
    named Switch exists here, so the write succeeds and could carry Nintendo
    along if the rule leaked past its field.
    """
    db_session.add(models.SystemOption(category="Game Genre", value="Switch"))
    db_session.flush()
    replace_tags(db_session, game.system_id, "game_genre", ["Switch"])
    assert tag_values(db_session, game.system_id, "game_genre") == ["Switch"]

    replace_tags(db_session, game.system_id, "game_platform", ["Switch"])
    assert tag_values(db_session, game.system_id, "game_platform") == [
        "Nintendo",
        "Switch",
    ]


def test_every_game_platform_option_says_its_family(client):
    """The picker reads `family` off the options it already loads."""
    response = client.get("/api/options/Game Platform", params={"scope": "game"})
    assert response.status_code == 200
    family = {o["value"]: o["family"] for o in response.json()}
    assert family["Switch"] == "Nintendo"
    assert family["Original Xbox"] == "Xbox"
    assert family["Nintendo"] is None
    assert family["Browser"] is None
    assert {v: f for v, f in family.items() if f} == GAME_PLATFORM_FAMILIES


def test_no_other_vocabulary_carries_a_family(client, db_session):
    """
    Game Genre holds a value spelled like a console here, so a family would
    show up on it if the lookup ignored the category.
    """
    db_session.add(models.SystemOption(category="Game Genre", value="Switch"))
    db_session.commit()
    rows = client.get("/api/options/Game Genre").json()
    assert {o["value"] for o in rows} >= {"Switch"}
    assert all(o["family"] is None for o in rows)
