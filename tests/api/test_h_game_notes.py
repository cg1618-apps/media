"""
The h-game notes: every game section reaches it, plus the highlights section
and its group order.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models

SECTION = "h_game_highlights"


def _row(entry, **overrides):
    payload = {
        "owner_type": "h-game",
        "owner_id": entry["system_id"],
        "section": SECTION,
        "fields": {"female_characters": ["Ana"], "location": "classroom"},
        "locator": "Route A / Scene 3",
        "kind": "free text label",
        "status": "實用",
        "content": "what happens",
    }
    payload.update(overrides)
    return payload


@pytest.fixture
def entry(admin_client):
    return admin_client.post("/api/h-game/", json={"h_game_name_cn": "Zvornik Notes"}).json()


def _sections(c, owner_type):
    response = c.get("/api/notes/sections", params={"owner_type": owner_type})
    assert response.status_code == 200, response.text
    return {s["key"]: s for s in response.json()}


def test_every_game_section_reaches_h_game(admin_client):
    game = _sections(admin_client, "game")
    h_game = _sections(admin_client, "h-game")
    assert set(game) <= set(h_game)
    assert set(h_game) - set(game) == {SECTION}


def test_the_game_labels_and_placeholders_carry_over(admin_client):
    h_game = _sections(admin_client, "h-game")
    game = _sections(admin_client, "game")
    for key in ("episode_comments", "analysis", "story_list_main"):
        assert h_game[key]["label"] == game[key]["label"], key
        assert h_game[key].get("group") == game[key].get("group"), key
        assert h_game[key].get("locator_placeholder") == game[key].get("locator_placeholder"), key


def test_the_highlights_section_shape(admin_client):
    section = _sections(admin_client, "h-game")[SECTION]
    assert section["group_by"] == "female_characters"
    assert section["owner_where"] == {}
    fields = {f["key"]: f for f in section["fields"]}
    assert fields["female_characters"]["type"] == "names"
    assert fields["female_characters"]["required"] is True
    assert fields["route_scene"]["column"] == "locator"
    assert fields["route_scene"]["label"] == "Route / Scene"
    assert fields["usefulness"]["column"] == "status"


def test_a_highlight_round_trips(admin_client, entry):
    response = admin_client.post(
        "/api/notes",
        json=_row(entry, fields={"female_characters": ["Ana", "Bea"], "male_characters": ["Cy"]}),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["fields"]["female_characters"] == ["Ana", "Bea"]
    assert body["locator"] == "Route A / Scene 3"
    assert body["status"] == "實用"


def test_female_characters_are_required(admin_client, entry):
    response = admin_client.post("/api/notes", json=_row(entry, fields={"male_characters": ["Cy"]}))
    assert response.status_code == 422


def test_usefulness_is_a_closed_vocabulary(admin_client, entry):
    assert admin_client.post("/api/notes", json=_row(entry, status="very")).status_code == 422


def test_the_section_is_not_offered_to_game_or_h_comic(admin_client):
    for owner in ("game", "h-comic"):
        assert SECTION not in _sections(admin_client, owner), owner


def test_a_guest_cannot_read_the_highlights(client, admin_client, entry):
    assert admin_client.post("/api/notes", json=_row(entry)).status_code == 201
    params = {"owner_type": "h-game", "owner_id": entry["system_id"]}
    assert client.get("/api/notes", params=params).status_code == 404
    assert len(admin_client.get("/api/notes", params=params).json()) == 1


def test_a_game_section_takes_a_row_on_h_game(admin_client, entry):
    response = admin_client.post(
        "/api/notes",
        json={
            "owner_type": "h-game",
            "owner_id": entry["system_id"],
            "section": "highlight_moments",
            "locator": "Ch 3",
            "content": "the moment",
        },
    )
    assert response.status_code == 201, response.text


# ---------------------------------------------------------------------------
# The group order, a column written through the entry update
# ---------------------------------------------------------------------------


def test_the_group_order_is_written_through_the_entry_update(admin_client, entry, db_session):
    response = admin_client.patch(
        f"/api/h-game/{entry['system_id']}",
        json={"highlight_group_order": ["Bea", " Ana", "Bea", ""]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["highlight_group_order"] == ["Bea", "Ana"]
    row = db_session.get(models.HGame, uuid.UUID(entry["system_id"]))
    db_session.refresh(row)
    assert row.highlight_group_order == ["Bea", "Ana"]


def test_a_malformed_group_order_is_refused(admin_client, entry):
    response = admin_client.patch(
        f"/api/h-game/{entry['system_id']}", json={"highlight_group_order": "Ana"}
    )
    assert response.status_code == 422
    response = admin_client.put(
        f"/api/h-game/{entry['system_id']}", json={"highlight_group_order": [1, 2]}
    )
    assert response.status_code == 422
