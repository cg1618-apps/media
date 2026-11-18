"""
API integration tests for 支線任務 Side Quests: a quest chain nests its steps,
the done status is each viewer's own, and the NG reset clears it.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models

SECTION = "side_quests"


@pytest.fixture(autouse=True)
def _features(features_follow_personal_notes):
    """See conftest.features_follow_personal_notes."""


@pytest.fixture
def game(db_session):
    g = models.Game(system_id=uuid.uuid4(), game_name_en="Elden Ring")
    db_session.add(g)
    db_session.flush()
    return g


def _quest(client, game, **payload):
    return client.post(
        "/api/notes",
        json={
            "owner_type": "game",
            "owner_id": str(game.system_id),
            "section": SECTION,
            **payload,
        },
    )


def _rows(client, game):
    r = client.get(
        "/api/notes",
        params={"owner_type": "game", "owner_id": str(game.system_id)},
    )
    assert r.status_code == 200, r.text
    return {n["system_id"]: n for n in r.json() if n["section"] == SECTION}


def test_a_chain_nests_its_steps_and_round_trips_every_field(owner_client, game):
    chain = _quest(
        owner_client,
        game,
        kind="委託",
        title="Ranni's Questline",
        content="the long one",
        links=[{"text": "Wiki", "url": "https://a.example"}],
        fields={
            "region": "Liurnia",
            "cautions": "Do not kill Seluvis early",
            "prerequisite": "Reach the Three Sisters",
            "core_npc": "Ranni",
            "other_npcs": ["Blaidd", "Iji", "Seluvis"],
            "rewards": [{"text": "Dark Moon Greatsword"}],
        },
    )
    assert chain.status_code == 201, chain.text
    step = _quest(
        owner_client, game, title="Find Blaidd", parent_id=chain.json()["system_id"]
    )
    assert step.status_code == 201, step.text

    rows = _rows(owner_client, game)
    root = rows[chain.json()["system_id"]]
    assert root["parent_id"] is None
    assert root["kind"] == "委託"
    assert root["fields"]["other_npcs"] == ["Blaidd", "Iji", "Seluvis"]
    assert root["fields"]["rewards"] == [{"text": "Dark Moon Greatsword"}]
    # Nobody has marked it, so the viewer reads the default.
    assert root["status"] == "to do"
    assert rows[step.json()["system_id"]]["parent_id"] == chain.json()["system_id"]


def test_a_quest_needs_a_name(owner_client, game):
    r = _quest(owner_client, game, fields={"region": "Limgrave"})
    assert r.status_code == 422
    assert "at least one of" in r.json()["detail"]
    # The mirror, so the refusal above is the missing name.
    assert _quest(owner_client, game, title="x", fields={"region": "Limgrave"}).status_code == 201


def test_a_step_carrying_a_type_of_its_own_is_refused(owner_client, game):
    chain = _quest(owner_client, game, title="Chain", kind="委託").json()
    r = _quest(owner_client, game, title="Step", kind="懸賞", parent_id=chain["system_id"])
    assert r.status_code == 422
    assert _quest(
        owner_client, game, title="Step", parent_id=chain["system_id"]
    ).status_code == 201


def test_done_is_the_viewers_own_and_the_ng_reset_clears_it(
    owner_client, game, db_session
):
    quest = _quest(owner_client, game, title="Lost Cargo").json()
    r = owner_client.put(
        f"/api/notes/{quest['system_id']}/mark", json={"values": {"done": "done"}}
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "done"
    # Personal: the row itself never stores it.
    db_session.expire_all()
    assert db_session.get(models.Note, uuid.UUID(quest["system_id"])).status is None

    r = owner_client.post(
        "/api/notes/ng-reset",
        json={"owner_type": "game", "owner_id": str(game.system_id)},
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"cleared": 1}
    assert _rows(owner_client, game)[quest["system_id"]]["status"] == "to do"


def test_a_status_outside_the_vocabulary_is_refused(owner_client, game):
    quest = _quest(owner_client, game, title="Lost Cargo").json()
    r = owner_client.put(
        f"/api/notes/{quest['system_id']}/mark", json={"values": {"done": "finished"}}
    )
    assert r.status_code == 422
