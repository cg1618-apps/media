"""
The KR h-comic highlights section, the `names` field type, and the group order.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models

SECTION = "h_comic_highlights"


def _entry(admin_client, region):
    body = admin_client.post(
        "/api/h-comic/", json={"h_comic_name_cn": f"Zvornik {region}", "region": region}
    ).json()
    return body


def _row(entry, **overrides):
    payload = {
        "owner_type": "h-comic",
        "owner_id": entry["system_id"],
        "section": SECTION,
        "fields": {"female_characters": ["Ana"], "location": "classroom"},
        "locator": "1-5",
        "kind": "free text label",
        "status": "實用",
        "content": "what happens",
    }
    payload.update(overrides)
    return payload


@pytest.fixture
def kr(admin_client):
    return _entry(admin_client, "KR")


@pytest.fixture
def jp(admin_client):
    return _entry(admin_client, "JP")


def test_a_kr_highlight_round_trips(admin_client, kr):
    response = admin_client.post(
        "/api/notes",
        json=_row(kr, fields={"female_characters": ["Ana", "Bea"], "male_characters": ["Cy"]}),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["fields"]["female_characters"] == ["Ana", "Bea"]
    assert body["fields"]["male_characters"] == ["Cy"]
    assert body["locator"] == "1-5"
    assert body["kind"] == "free text label"
    assert body["status"] == "實用"


def test_female_characters_are_required(admin_client, kr):
    response = admin_client.post(
        "/api/notes", json=_row(kr, fields={"male_characters": ["Cy"]})
    )
    assert response.status_code == 422


@pytest.mark.parametrize("names", [[""], ["  "], "Ana", [1]])
def test_a_names_field_must_be_a_list_of_non_empty_names(admin_client, kr, names):
    response = admin_client.post(
        "/api/notes", json=_row(kr, fields={"female_characters": names})
    )
    assert response.status_code == 422


def test_usefulness_is_a_closed_vocabulary(admin_client, kr):
    response = admin_client.post("/api/notes", json=_row(kr, status="very"))
    assert response.status_code == 422


def test_a_jp_entry_refuses_the_section(admin_client, jp):
    response = admin_client.post("/api/notes", json=_row(jp))
    assert response.status_code == 422
    assert "region" in response.json()["detail"]


def test_a_highlight_cannot_be_moved_onto_a_jp_entry(admin_client, kr, jp):
    created = admin_client.post("/api/notes", json=_row(kr)).json()
    response = admin_client.patch(
        f"/api/notes/{created['system_id']}", json={"owner_id": jp["system_id"]}
    )
    assert response.status_code == 422


def test_the_section_is_offered_to_h_comic_with_its_grouping(client):
    sections = client.get("/api/notes/sections", params={"owner_type": "h-comic"}).json()
    by_key = {s["key"]: s for s in sections}
    section = by_key[SECTION]
    assert section["group_by"] == "female_characters"
    assert section["owner_where"] == {"region": ["KR"]}
    fields = {f["key"]: f for f in section["fields"]}
    assert fields["female_characters"]["type"] == "names"
    assert fields["female_characters"]["required"] is True
    assert fields["female_characters"]["column"] is None
    assert fields["chapter"]["column"] == "locator"
    assert fields["label"]["column"] == "kind"
    assert fields["usefulness"]["column"] == "status"
    assert fields["description"]["column"] == "content"


def test_the_every_owner_sections_reach_h_comic(client):
    keys = {
        s["key"]
        for s in client.get("/api/notes/sections", params={"owner_type": "h-comic"}).json()
    }
    assert {"remark_list", "personal_reviews", "public_reviews"} <= keys


def test_the_section_is_not_offered_to_manga(client):
    keys = {
        s["key"]
        for s in client.get("/api/notes/sections", params={"owner_type": "manga"}).json()
    }
    assert SECTION not in keys


def test_a_guest_cannot_read_the_highlights(client, admin_client, kr):
    admin_client.post("/api/notes", json=_row(kr))
    params = {"owner_type": "h-comic", "owner_id": kr["system_id"]}
    assert client.get("/api/notes", params=params).status_code == 404
    assert len(admin_client.get("/api/notes", params=params).json()) == 1


# ---------------------------------------------------------------------------
# The group order: a KR column written through the entry update
# ---------------------------------------------------------------------------


def test_the_group_order_is_written_through_the_entry_update(admin_client, kr, db_session):
    response = admin_client.patch(
        f"/api/h-comic/{kr['system_id']}",
        json={"highlight_group_order": ["Bea", "Ana", "Bea"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["highlight_group_order"] == ["Bea", "Ana"]
    entry = db_session.get(models.HComic, uuid.UUID(kr["system_id"]))
    db_session.refresh(entry)
    assert entry.highlight_group_order == ["Bea", "Ana"]


def test_a_malformed_group_order_is_refused(admin_client, kr):
    response = admin_client.patch(
        f"/api/h-comic/{kr['system_id']}", json={"highlight_group_order": "Ana"}
    )
    assert response.status_code == 422
    response = admin_client.put(
        f"/api/h-comic/{kr['system_id']}", json={"highlight_group_order": [1, 2]}
    )
    assert response.status_code == 422


def test_a_jp_entry_keeps_no_group_order(admin_client, jp):
    response = admin_client.patch(
        f"/api/h-comic/{jp['system_id']}", json={"highlight_group_order": ["Ana"]}
    )
    assert response.status_code == 200
    assert response.json()["highlight_group_order"] is None
