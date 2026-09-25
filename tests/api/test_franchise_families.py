"""
Franchise families as hentai uses them: H-Comic and Hentai are one family
(FRANCHISE_FAMILY_FOR_TYPE), so an h-comic and its hentai adaptation may share
a franchise, and a franchise carries the label of each gated type in its type
list.

The family mechanism itself - every write path, both directions, retyping a
franchise with entries - is tests/api/test_franchise_family.py. This file
keeps only what the second gated type adds.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain.content_labels import label_keys_for_franchise

ROUTE = "/api/franchise"


def _create(admin_client, franchise_type, name="Zvornik Family"):
    return admin_client.post(
        f"{ROUTE}/", json={"franchise_name_en": name, "franchise_type": franchise_type}
    )


# ---------------------------------------------------------------------------
# Mixed families are refused on every write path
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("franchise_type", ["ACG, Hentai", "Anime, H-Comic"])
def test_create_refuses_a_franchise_spanning_two_families(
    admin_client, db_session, franchise_type
):
    response = _create(admin_client, franchise_type)
    assert response.status_code == 422
    assert (
        db_session.query(models.Franchise)
        .filter_by(franchise_name_en="Zvornik Family")
        .count()
        == 0
    )


@pytest.mark.parametrize("method", ["put", "patch"])
def test_update_and_patch_refuse_a_type_spanning_two_families(
    admin_client, db_session, method
):
    created = _create(admin_client, "ACG").json()
    response = getattr(admin_client, method)(
        f"{ROUTE}/{created['system_id']}", json={"franchise_type": "ACG, Hentai"}
    )
    assert response.status_code == 422
    row = db_session.get(models.Franchise, uuid.UUID(created["system_id"]))
    db_session.refresh(row)
    assert row.franchise_type == "ACG"


def test_the_two_h_comic_family_types_are_one_family(admin_client):
    """The mirror of the refusals above."""
    assert _create(admin_client, "H-Comic, Hentai", name="Zvornik Gated").status_code == 200


@pytest.mark.parametrize("method", ["put", "patch"])
def test_a_franchise_holding_a_hentai_cannot_become_mainstream(
    admin_client, db_session, method
):
    created = _create(admin_client, "Hentai").json()
    entry = admin_client.post(
        "/api/hentai/",
        json={"hentai_name_cn": "Zvornik Held", "franchise_id": created["system_id"]},
    )
    assert entry.status_code == 201, entry.text

    response = getattr(admin_client, method)(
        f"{ROUTE}/{created['system_id']}", json={"franchise_type": "ACG"}
    )
    assert response.status_code == 422, response.text
    # Within the family it may be retyped: the refusal is about the family.
    response = getattr(admin_client, method)(
        f"{ROUTE}/{created['system_id']}", json={"franchise_type": "H-Comic, Hentai"}
    )
    assert response.status_code == 200, response.text


# ---------------------------------------------------------------------------
# Labels: one per gated type in the list
# ---------------------------------------------------------------------------


def test_a_franchise_holding_both_gated_types_carries_both_labels(
    admin_client, db_session
):
    created = _create(admin_client, "H-Comic, Hentai").json()
    assert label_keys_for_franchise(db_session, uuid.UUID(created["system_id"])) == [
        "h-comic",
        "hentai",
    ]


def test_a_franchise_gaining_hentai_gains_its_label(admin_client, db_session):
    created = _create(admin_client, "H-Comic").json()
    franchise_id = uuid.UUID(created["system_id"])
    assert label_keys_for_franchise(db_session, franchise_id) == ["h-comic"]

    response = admin_client.patch(
        f"{ROUTE}/{franchise_id}", json={"franchise_type": "H-Comic, Hentai"}
    )
    assert response.status_code == 200, response.text
    assert set(label_keys_for_franchise(db_session, franchise_id)) == {"h-comic", "hentai"}


@pytest.mark.parametrize("keep", [["h-comic"], ["hentai"], []])
def test_neither_label_can_be_removed_from_a_franchise_holding_both(
    admin_client, db_session, keep
):
    created = _create(admin_client, "H-Comic, Hentai").json()
    franchise_id = created["system_id"]
    response = admin_client.put(
        f"/api/content-labels/franchise/{franchise_id}", json={"label_keys": keep}
    )
    assert response.status_code == 422
    assert set(label_keys_for_franchise(db_session, uuid.UUID(franchise_id))) == {
        "h-comic",
        "hentai",
    }


def test_a_mainstream_franchise_can_clear_its_labels(admin_client, db_session, nsfw_label):
    """The mirror: the refusal is for gated types' labels only."""
    created = _create(admin_client, "ACG").json()
    franchise_id = created["system_id"]
    assert admin_client.put(
        f"/api/content-labels/franchise/{franchise_id}", json={"label_keys": ["nsfw"]}
    ).status_code == 200
    response = admin_client.put(
        f"/api/content-labels/franchise/{franchise_id}", json={"label_keys": []}
    )
    assert response.status_code == 200
    assert label_keys_for_franchise(db_session, uuid.UUID(franchise_id)) == []


# ---------------------------------------------------------------------------
# Entries resolve within their family
# ---------------------------------------------------------------------------


def test_an_h_comic_sits_in_a_hentai_franchise(admin_client, db_session):
    """The same family, named by id and by name."""
    hentai_franchise = models.Franchise(
        system_id=uuid.uuid4(), franchise_type="Hentai", franchise_name_en="Zvornik HF"
    )
    db_session.add(hentai_franchise)
    db_session.flush()

    by_id = admin_client.post(
        "/api/h-comic/",
        json={"h_comic_name_cn": "A", "region": "JP", "franchise_id": str(hentai_franchise.system_id)},
    )
    assert by_id.status_code == 201, by_id.text
    assert by_id.json()["franchise_id"] == str(hentai_franchise.system_id)

    by_name = admin_client.post(
        "/api/h-comic/", json={"h_comic_name_en": "Zvornik HF", "region": "JP"}
    )
    assert by_name.json()["franchise_id"] == str(hentai_franchise.system_id)


def test_an_h_comic_and_its_hentai_resolve_to_one_franchise(admin_client):
    h_comic = admin_client.post(
        "/api/h-comic/", json={"h_comic_name_en": "Zvornik Shared", "region": "JP"}
    ).json()
    hentai = admin_client.post("/api/hentai/", json={"hentai_name_en": "Zvornik Shared"}).json()
    assert hentai["franchise_id"] == h_comic["franchise_id"]


def test_a_mainstream_entry_does_not_match_a_franchise_of_either_gated_type(
    admin_client, db_session
):
    for franchise_type in ("H-Comic", "Hentai", "H-Comic, Hentai"):
        db_session.add(
            models.Franchise(
                system_id=uuid.uuid4(),
                franchise_type=franchise_type,
                franchise_name_en="Zvornik Gated Only",
            )
        )
    db_session.flush()
    body = admin_client.post("/api/manga/", json={"manga_name_en": "Zvornik Gated Only"}).json()
    created = db_session.get(models.Franchise, uuid.UUID(body["franchise_id"]))
    assert created.franchise_type == "ACG"
