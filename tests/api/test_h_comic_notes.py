"""
The KR h-comic highlights section, the `names` field type, and the group order.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.rbac.seed_modes import MODE_UNRESTRICTED

SECTION = "h_comic_highlights"


def _entry(owner_client, region):
    body = owner_client.post(
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
def kr(owner_client):
    return _entry(owner_client, "KR")


@pytest.fixture
def jp(owner_client):
    return _entry(owner_client, "JP")


def test_a_kr_highlight_round_trips(owner_client, kr):
    response = owner_client.post(
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


def test_female_characters_are_required(owner_client, kr):
    response = owner_client.post(
        "/api/notes", json=_row(kr, fields={"male_characters": ["Cy"]})
    )
    assert response.status_code == 422


@pytest.mark.parametrize("names", [[""], ["  "], "Ana", [1]])
def test_a_names_field_must_be_a_list_of_non_empty_names(owner_client, kr, names):
    response = owner_client.post(
        "/api/notes", json=_row(kr, fields={"female_characters": names})
    )
    assert response.status_code == 422


def test_usefulness_is_a_closed_vocabulary(owner_client, kr):
    response = owner_client.post("/api/notes", json=_row(kr, status="very"))
    assert response.status_code == 422


def test_a_jp_entry_refuses_the_section(owner_client, jp):
    response = owner_client.post("/api/notes", json=_row(jp))
    assert response.status_code == 422
    assert "region" in response.json()["detail"]


def test_a_highlight_cannot_be_moved_onto_a_jp_entry(owner_client, kr, jp):
    created = owner_client.post("/api/notes", json=_row(kr)).json()
    response = owner_client.patch(
        f"/api/notes/{created['system_id']}", json={"owner_id": jp["system_id"]}
    )
    assert response.status_code == 422


def test_the_section_is_offered_to_h_comic_with_its_grouping(owner_client):
    sections = owner_client.get("/api/notes/sections", params={"owner_type": "h-comic"}).json()
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


@pytest.mark.parametrize(
    "owner_type, expected",
    [
        (
            "h-comic",
            [
                "remark",
                "remark_list",
                "public_reviews",
                "personal_reviews",
                SECTION,
                "resources",
            ],
        ),
        (
            "hentai",
            ["remark", "remark_list", "public_reviews", "personal_reviews", "resources"],
        ),
    ],
)
def test_h_comic_and_hentai_keep_a_reviews_card_of_two(owner_client, owner_type, expected):
    """No 解析, Questions or 名言/梗 - a 評論 card of public and personal reviews."""
    sections = owner_client.get("/api/notes/sections", params={"owner_type": owner_type}).json()
    assert [s["key"] for s in sections] == expected
    by_key = {s["key"]: s for s in sections}
    assert by_key["public_reviews"]["shape"] == "text_links"
    assert by_key["public_reviews"]["scope"] == "catalog"
    assert by_key["personal_reviews"]["shape"] == "text"
    assert by_key["personal_reviews"]["scope"] == "personal"
    assert {by_key[k]["group"] for k in ("public_reviews", "personal_reviews")} == {
        "reviews"
    }


def test_personal_reviews_takes_a_row_where_advantages_does_not(
    owner_client, mode_client, plain_user
):
    """
    Personal sections, so a member in the unrestricted mode writes them - an
    admin holds no personal notes, and no other mode sees a hentai. The
    refused advantages is the mirror: the 201 is the section's, not the
    member's.
    """
    hentai = owner_client.post("/api/hentai/", json={"hentai_name_cn": "Zvornik Hentai"}).json()
    member = mode_client(MODE_UNRESTRICTED, user=plain_user)

    def post(section):
        return member.post(
            "/api/notes",
            json={
                "owner_type": "hentai",
                "owner_id": hentai["system_id"],
                "section": section,
                "content": "worth it",
            },
        )

    assert post("advantages").status_code == 422
    # Retired: an unknown section, which the router answers 400.
    assert post("reviews_and_comments").status_code == 400
    assert post("personal_reviews").status_code == 201
    public = owner_client.post(
        "/api/notes",
        json={
            "owner_type": "hentai",
            "owner_id": hentai["system_id"],
            "section": "public_reviews",
            "content": "well liked",
        },
    )
    assert public.status_code == 201, public.text


def test_the_section_is_not_offered_to_manga(client):
    keys = {
        s["key"]
        for s in client.get("/api/notes/sections", params={"owner_type": "manga"}).json()
    }
    assert SECTION not in keys


def test_a_guest_cannot_read_the_highlights(client, owner_client, kr):
    owner_client.post("/api/notes", json=_row(kr))
    params = {"owner_type": "h-comic", "owner_id": kr["system_id"]}
    assert client.get("/api/notes", params=params).status_code == 404
    assert len(owner_client.get("/api/notes", params=params).json()) == 1


# ---------------------------------------------------------------------------
# The group order: a KR column written through the entry update
# ---------------------------------------------------------------------------


def test_the_group_order_is_written_through_the_entry_update(owner_client, kr, db_session):
    response = owner_client.patch(
        f"/api/h-comic/{kr['system_id']}",
        json={"highlight_group_order": ["Bea", "Ana", "Bea"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["highlight_group_order"] == ["Bea", "Ana"]
    entry = db_session.get(models.HComic, uuid.UUID(kr["system_id"]))
    db_session.refresh(entry)
    assert entry.highlight_group_order == ["Bea", "Ana"]


def test_a_malformed_group_order_is_refused(owner_client, kr):
    response = owner_client.patch(
        f"/api/h-comic/{kr['system_id']}", json={"highlight_group_order": "Ana"}
    )
    assert response.status_code == 422
    response = owner_client.put(
        f"/api/h-comic/{kr['system_id']}", json={"highlight_group_order": [1, 2]}
    )
    assert response.status_code == 422


def test_a_jp_entry_keeps_no_group_order(owner_client, jp):
    response = owner_client.patch(
        f"/api/h-comic/{jp['system_id']}", json={"highlight_group_order": ["Ana"]}
    )
    assert response.status_code == 200
    assert response.json()["highlight_group_order"] is None
