"""
A queued game's platform group on /api/plan-next: set on create, changed by
PATCH, refused on anything but a game's or an h-game's "next" row and on a
value outside PLATFORM_GROUPS.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py. The
client is `super_client` for the reason test_plan_next_kind_api.py gives: an
administrative account keeps no plan queue.
"""

import uuid

import pytest

from app import models


@pytest.fixture
def seeded_game(db_session):
    game = models.Game(system_id=uuid.uuid4(), game_name_en="Test Game")
    db_session.add(game)
    db_session.flush()
    return game.system_id


@pytest.fixture
def seeded_movie(db_session):
    movie = models.Movies(system_id=uuid.uuid4(), movie_name_en="Test Movie")
    db_session.add(movie)
    db_session.flush()
    return movie.system_id


@pytest.fixture
def seeded_h_game(super_client):
    # Through the API, so the gated type's content label is stamped as it is
    # on every real h-game; super_client sits in a mode that sees the type.
    res = super_client.post("/api/h-game/", json={"h_game_name_cn": "Test H-Game"})
    assert res.status_code == 201, res.text
    return res.json()["system_id"]


def _plan(client, target_id, media_type="game", **extra):
    return client.post(
        "/api/plan-next/",
        json={
            "media_type": media_type,
            "scope": "entry",
            "target_id": str(target_id),
            **extra,
        },
    )


def test_a_game_plan_starts_ungrouped(super_client, seeded_game):
    res = _plan(super_client, seeded_game)
    assert res.status_code == 201, res.text
    assert res.json()["platform_group"] is None


def test_a_game_plan_may_be_created_in_a_group(super_client, seeded_game):
    res = _plan(super_client, seeded_game, platform_group="Switch")
    assert res.status_code == 201, res.text
    assert res.json()["platform_group"] == "Switch"
    listed = super_client.get("/api/plan-next/", params={"media_type": "game"}).json()
    assert [row["platform_group"] for row in listed] == ["Switch"]


def test_patch_moves_a_plan_between_groups_and_back_to_none(super_client, seeded_game):
    row_id = _plan(super_client, seeded_game).json()["system_id"]
    for group in ("PC", "Handheld Console", None):
        res = super_client.patch(
            f"/api/plan-next/{row_id}", json={"platform_group": group}
        )
        assert res.status_code == 200, res.text
        assert res.json()["platform_group"] == group


def test_an_unknown_group_is_422(super_client, seeded_game):
    # The mirror: the same game takes a known group, so the 422 is the value's.
    assert _plan(super_client, seeded_game, platform_group="Steam Deck").status_code == 422
    row_id = _plan(super_client, seeded_game).json()["system_id"]
    res = super_client.patch(
        f"/api/plan-next/{row_id}", json={"platform_group": "Steam Deck"}
    )
    assert res.status_code == 422
    assert super_client.patch(
        f"/api/plan-next/{row_id}", json={"platform_group": "Console"}
    ).status_code == 200


def test_only_a_game_takes_a_group(super_client, seeded_movie):
    assert _plan(super_client, seeded_movie, media_type="movie", platform_group="PC").status_code == 422
    row_id = _plan(super_client, seeded_movie, media_type="movie").json()["system_id"]
    res = super_client.patch(f"/api/plan-next/{row_id}", json={"platform_group": "PC"})
    assert res.status_code == 422
    # Clearing is always allowed: a null group is no group.
    assert super_client.patch(
        f"/api/plan-next/{row_id}", json={"platform_group": None}
    ).status_code == 200


def test_an_h_game_plan_takes_a_group_as_a_game_does(super_client, seeded_h_game):
    res = _plan(super_client, seeded_h_game, media_type="h-game", platform_group="PC")
    assert res.status_code == 201, res.text
    assert res.json()["platform_group"] == "PC"
    res = super_client.patch(
        f"/api/plan-next/{res.json()['system_id']}", json={"platform_group": "Switch"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["platform_group"] == "Switch"


def test_an_h_game_replay_mark_takes_no_group(super_client, seeded_h_game):
    # The mirror: the same h-game takes a group on its "next" row above.
    res = _plan(
        super_client, seeded_h_game, media_type="h-game", kind="rewatch", platform_group="PC"
    )
    assert res.status_code == 422


def test_a_replay_mark_takes_no_group(super_client, seeded_game):
    res = _plan(super_client, seeded_game, kind="rewatch", platform_group="PC")
    assert res.status_code == 422


def test_another_users_plan_is_404(super_client, db_session, plain_user, seeded_game):
    row = models.PlanNext(
        user_id=plain_user.id, kind="next", media_type="game", media_id=seeded_game
    )
    db_session.add(row)
    db_session.flush()
    res = super_client.patch(
        f"/api/plan-next/{row.system_id}", json={"platform_group": "PC"}
    )
    assert res.status_code == 404
    db_session.refresh(row)
    assert row.platform_group is None


def test_kinds_serves_the_platform_groups(super_client):
    body = super_client.get("/api/plan-next/kinds").json()
    groups = ["PC", "Console", "Handheld Console", "Switch"]
    assert body["platform_groups"] == {"game": groups, "h-game": groups}
