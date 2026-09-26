"""
The h-game notes: game's sections less the ones an h-game has no use for,
plus the highlights section and its group order, and the one list of reviews
and comments it shares with h-comic and hentai.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.rbac.seed_modes import MODE_UNRESTRICTED

SECTION = "h_game_highlights"


def _row(entry, **overrides):
    payload = {
        "owner_type": "h-game",
        "owner_id": entry["system_id"],
        "section": SECTION,
        "fields": {"female_characters": ["Ana"], "audio": "H場景"},
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


# Game's sections an h-game does not take. The unit tests hold the reason for
# each; this checks the API serves the same answer.
GAME_ONLY = {
    "public_reviews",
    "personal_reviews",
    "episode_comments",
    "highlight_moments",
    "beginner",
    "trivia",
    "player_terms",
    "main_plot",
    "side_plot",
    "character_arcs",
    "lore",
    "story_terms",
    "timeline",
    "mysteries",
    "story_other",
    "quotes",
    "memes",
}


def test_h_game_takes_game_sections_less_the_game_only_ones(admin_client):
    game = _sections(admin_client, "game")
    h_game = _sections(admin_client, "h-game")
    assert set(game) - set(h_game) == GAME_ONLY
    assert set(h_game) - set(game) == {SECTION, "reviews_and_comments"}


def test_the_game_labels_and_placeholders_carry_over(admin_client):
    h_game = _sections(admin_client, "h-game")
    game = _sections(admin_client, "game")
    for key in ("analysis", "guide_notes", "endings"):
        assert h_game[key]["label"] == game[key]["label"], key
        assert h_game[key].get("group") == game[key].get("group"), key
        assert h_game[key].get("locator_placeholder") == game[key].get("locator_placeholder"), key


def test_the_story_list_is_the_h_game_story(admin_client):
    """No prose 劇情, so the four lists render in the 劇情 card with 結局."""
    h_game = _sections(admin_client, "h-game")
    game = _sections(admin_client, "game")
    story = [k for k, s in h_game.items() if s.get("group") == "story"]
    assert story == [
        "story_list_main",
        "story_list_side",
        "story_list_character",
        "story_list_event",
        "endings",
    ]
    assert game["story_list_main"]["group"] == "story_list"


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
    assert "location" not in fields
    for key in ("audio", "h_presentation", "art_style"):
        assert fields[key]["type"] == "select", key
        assert fields[key]["options"], key


def test_a_highlight_round_trips(admin_client, entry):
    response = admin_client.post(
        "/api/notes",
        json=_row(
            entry,
            fields={
                "female_characters": ["Ana", "Bea"],
                "male_characters": ["Cy"],
                "audio": "H場景",
            },
        ),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["fields"]["female_characters"] == ["Ana", "Bea"]
    assert body["locator"] == "Route A / Scene 3"
    assert body["status"] == "實用"
    assert body["fields"]["audio"] == "H場景"


def test_the_scene_selects_are_closed_vocabularies(admin_client, entry):
    fields = {"female_characters": ["Ana"], "art_style": "Watercolour"}
    response = admin_client.post("/api/notes", json=_row(entry, fields=fields))
    assert response.status_code == 422
    # The mirror, so the refusal above is the vocabulary and not the row.
    fields["art_style"] = "2D"
    response = admin_client.post("/api/notes", json=_row(entry, fields=fields))
    assert response.status_code == 201, response.text


def test_a_highlight_takes_no_location(admin_client, entry):
    fields = {"female_characters": ["Ana"], "location": "classroom"}
    response = admin_client.post("/api/notes", json=_row(entry, fields=fields))
    assert response.status_code == 422


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


def _plain(entry, section, **columns):
    return {
        "owner_type": "h-game",
        "owner_id": entry["system_id"],
        "section": section,
        **columns,
    }


def test_a_game_section_takes_a_row_on_h_game(admin_client, entry):
    response = admin_client.post(
        "/api/notes", json=_plain(entry, "guide_notes", content="save before the boss")
    )
    assert response.status_code == 201, response.text


def test_a_game_only_catalogue_section_refuses_a_row_on_h_game(admin_client, entry):
    for section, columns in (
        ("highlight_moments", {"locator": "Ch 3", "content": "the moment"}),
        ("lore", {"content": "the world"}),
    ):
        response = admin_client.post("/api/notes", json=_plain(entry, section, **columns))
        assert response.status_code == 422, section


def test_reviews_and_comments_replaces_personal_reviews_on_h_game(
    mode_client, plain_user, entry
):
    """
    Personal sections, so a member writes them - an admin holds no personal
    notes. The unrestricted mode is what lets that member see an h-game at
    all; the mirror pair shows the 422 is the section, not the viewer.
    """
    c = mode_client(MODE_UNRESTRICTED, user=plain_user)
    refused = c.post("/api/notes", json=_plain(entry, "personal_reviews", content="good"))
    assert refused.status_code == 422, refused.text
    taken = c.post(
        "/api/notes", json=_plain(entry, "reviews_and_comments", content="worth it")
    )
    assert taken.status_code == 201, taken.text


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
