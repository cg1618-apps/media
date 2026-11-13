"""
API integration tests for 地理 Geography: a nestable, groupable list where
only a top-level row carries a group.

Modelled on test_story_list.py, whose sections nest the same way. What is new
here is the group rule: a hierarchical section that is also groupable groups
its ROOTS, so a child carrying a group of its own would be a value nothing
reads. Every refusal below has its mirror - the same child without a group -
so a 422 is the group rule's and not some other rule's.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import pytest

from app import models

SECTION = "geography"
REFUSAL = "Only a top-level row carries a group."


@pytest.fixture
def game(db_session):
    g = models.Game(game_name_en="Elden Ring")
    db_session.add(g)
    db_session.flush()
    return g


def _entry(client, game, **payload):
    return client.post(
        "/api/notes",
        json={
            "owner_type": "game",
            "owner_id": str(game.system_id),
            "section": SECTION,
            **payload,
        },
    )


def test_a_grouped_region_holding_areas_round_trips(admin_client, game):
    region = _entry(admin_client, game, title="Limgrave", kind="地區")
    assert region.status_code == 201, region.text
    area = _entry(
        admin_client, game, title="Stormveil", parent_id=region.json()["system_id"]
    )
    assert area.status_code == 201, area.text
    room = _entry(
        admin_client,
        game,
        title="Gatefront",
        content="the first grace",
        links=["https://example.com/gatefront"],
        parent_id=area.json()["system_id"],
    )
    assert room.status_code == 201, room.text

    rows = {
        r["system_id"]: r
        for r in admin_client.get(
            "/api/notes",
            params={"owner_type": "game", "owner_id": str(game.system_id)},
        ).json()
        if r["section"] == SECTION
    }
    assert rows[region.json()["system_id"]]["kind"] == "地區"
    assert rows[area.json()["system_id"]]["kind"] is None
    assert rows[room.json()["system_id"]]["parent_id"] == area.json()["system_id"]


def test_a_child_with_a_group_is_refused_on_post(admin_client, game):
    region = _entry(admin_client, game, title="Limgrave", kind="地區").json()
    refused = _entry(
        admin_client, game, title="Stormveil", kind="城", parent_id=region["system_id"]
    )
    assert refused.status_code == 422
    assert refused.json()["detail"] == REFUSAL
    # The mirror: the same child with no group is taken.
    taken = _entry(admin_client, game, title="Stormveil", parent_id=region["system_id"])
    assert taken.status_code == 201, taken.text


def test_reparenting_a_grouped_root_is_refused_unless_the_group_is_cleared(
    admin_client, game
):
    region = _entry(admin_client, game, title="Limgrave", kind="地區").json()
    other = _entry(admin_client, game, title="Liurnia", kind="地區").json()

    refused = admin_client.patch(
        f"/api/notes/{other['system_id']}", json={"parent_id": region["system_id"]}
    )
    assert refused.status_code == 422
    assert refused.json()["detail"] == REFUSAL

    moved = admin_client.patch(
        f"/api/notes/{other['system_id']}",
        json={"parent_id": region["system_id"], "kind": None},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["parent_id"] == region["system_id"]
    assert moved.json()["kind"] is None


def test_giving_an_existing_child_a_group_is_refused(admin_client, game):
    region = _entry(admin_client, game, title="Limgrave").json()
    area = _entry(
        admin_client, game, title="Stormveil", parent_id=region["system_id"]
    ).json()
    refused = admin_client.patch(f"/api/notes/{area['system_id']}", json={"kind": "城"})
    assert refused.status_code == 422
    assert refused.json()["detail"] == REFUSAL
    # The mirror: a root takes the same group.
    taken = admin_client.patch(f"/api/notes/{region['system_id']}", json={"kind": "城"})
    assert taken.status_code == 200, taken.text


def test_a_row_needs_a_name(admin_client, game):
    r = _entry(admin_client, game, kind="地區", content="somewhere")
    assert r.status_code == 422
    assert "at least one of" in r.json()["detail"]


def test_the_section_is_served_to_game(client):
    sections = {
        s["key"]: s
        for s in client.get("/api/notes/sections", params={"owner_type": "game"}).json()
    }
    geo = sections[SECTION]
    assert geo["label"] == "地理 Geography"
    assert geo["scope"] == "catalog"
    assert geo["hierarchical"] is True
    assert geo["groupable_by"] == "group"
    assert geo["group"] == "compendium"
    assert geo["require_any"] == [["name"]]
    group = next(f for f in geo["fields"] if f["key"] == "group")
    assert group["option_category"] == "Geography Group"
    assert group["column"] == "kind"


def test_h_game_is_served_the_section_after_enemies(admin_client):
    keys = [
        s["key"]
        for s in admin_client.get(
            "/api/notes/sections", params={"owner_type": "h-game"}
        ).json()
    ]
    assert keys.index(SECTION) == keys.index("enemies") + 1


def test_the_section_is_not_offered_to_anime(client):
    keys = {
        s["key"]
        for s in client.get("/api/notes/sections", params={"owner_type": "anime"}).json()
    }
    assert SECTION not in keys
