"""
Everything connected only to h-game is hidden from a session that cannot see
the type, and a session that cannot see it is not told it exists.

Each refusal has the label present - the entries are created through the API,
which stamps it - and is paired with `admin_client`, sitting in
`unrestricted`, reading the same record back.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain import credits as credits_service
from app.services.domain.content_labels import label_keys_for_entry


@pytest.fixture
def h_game_id(admin_client, db_session):
    body = admin_client.post("/api/h-game/", json={"h_game_name_cn": "Zvornik Shared H-Game"}).json()
    entry_id = uuid.UUID(body["system_id"])
    # The hidden set is not empty: the entry carries the label.
    assert label_keys_for_entry(db_session, entry_id) == ["h-game"]
    return entry_id


def _ids(response) -> set[str]:
    assert response.status_code == 200, response.text
    return {row["system_id"] for row in response.json()}


def test_a_studio_credited_only_on_h_game_is_hidden(client, admin_client, db_session, h_game_id):
    credits_service.replace_credits(db_session, "h-game", h_game_id, "studio", ["Zvornik Studio"])
    db_session.flush()
    studio = credits_service.find_studio(db_session, "Zvornik Studio")

    assert client.get(f"/api/studio/{studio.system_id}").status_code == 404
    assert admin_client.get(f"/api/studio/{studio.system_id}").status_code == 200


def test_a_game_genre_used_only_by_h_game_is_hidden(client, admin_client, db_session, h_game_id):
    credits_service.replace_tags(db_session, h_game_id, "game_genre", ["Zvornik Genre"])
    db_session.flush()

    def values(c):
        return {row["value"] for row in c.get("/api/options/Game Genre").json()}

    assert "Zvornik Genre" not in values(client)
    assert "Zvornik Genre" in values(admin_client)


def test_an_unused_game_genre_stays_visible(client, db_session):
    """game_genre serves an ungated type too, so its category is not a
    connection: an unused value keeps the ordinary rule and stays visible."""
    db_session.add(models.SystemOption(category="Game Genre", value="Zvornik Open Genre"))
    db_session.flush()
    values = {row["value"] for row in client.get("/api/options/Game Genre").json()}
    assert "Zvornik Open Genre" in values


def test_an_h_genre_value_used_by_h_game_is_hidden(client, admin_client, db_session, h_game_id):
    credits_service.replace_tags(db_session, h_game_id, "h_genre_plot", ["Zvornik H Plot"])
    db_session.flush()

    def values(c):
        return {row["value"] for row in c.get("/api/options/H Genre Plot").json()}

    assert "Zvornik H Plot" not in values(client)
    assert "Zvornik H Plot" in values(admin_client)


def test_the_note_registry_answers_h_game_as_unknown_to_a_narrow_session(client, admin_client):
    assert client.get("/api/notes/sections", params={"owner_type": "h-game"}).status_code == 400
    wide = admin_client.get("/api/notes/sections", params={"owner_type": "h-game"})
    assert wide.status_code == 200
    assert "h_game_highlights" in {s["key"] for s in wide.json()}


def test_the_constants_omit_h_game_for_a_narrow_session(client, db_session):
    assert db_session.query(models.ContentLabel).filter_by(key="h-game").count() == 1
    body = client.get("/api/constants").json()
    assert "h-game" not in body["media_type"]
    assert "H-Game" not in body["franchise_type"]
    for key in (
        "h_game_playstyle",
        "h_game_language_availability",
        "h_game_audio_availability",
        "h_game_h_presentation",
        "h_game_art_style",
        "h_game_platform",
    ):
        assert key not in body


def test_the_constants_name_h_game_for_unrestricted(admin_client):
    """The mirror."""
    body = admin_client.get("/api/constants").json()
    assert "h-game" in body["media_type"]
    assert "H-Game" in body["franchise_type"]
    assert body["h_game_playstyle"] == ["ADV", "RPG", "SLG", "Other"]
    assert body["h_game_platform"] == ["Steam", "DLsite", "Nintendo", "Other"]
    assert body["h_game_art_style"][0] == "2D"


def test_the_external_api_catalogue_omits_h_game_for_a_narrow_editor(
    catalog_writer, admin_client, db_session
):
    assert db_session.query(models.ContentLabel).filter_by(key="h-game").count() == 1
    narrow = catalog_writer().get("/api/constants/external-apis")
    assert narrow.status_code == 200, narrow.text
    assert "h-game" not in {row["key"] for row in narrow.json()["media"]}
    wide = admin_client.get("/api/constants/external-apis").json()
    assert "h-game" in {row["key"] for row in wide["media"]}
