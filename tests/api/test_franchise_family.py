"""
Franchise families: an entry sits only in a franchise of its own family.

FRANCHISE_FAMILY_FOR_TYPE (app/utils/constants.py) sorts franchise types into
families; an unlisted type is "mainstream". The name resolver already matches
only within the family. These tests cover the other ways in: a franchise named
by id on create, update and the tracker PATCH, in both directions; a franchise
whose own types span two families; and a franchise retyped out from under the
entries it holds.

Every refusal here has a gated franchise in the database, so there is
something to refuse, and a mirror that the same path accepts a franchise of
the entry's own family.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models


def _franchise(db_session, franchise_type, name="Zvornik Family"):
    franchise = models.Franchise(
        system_id=uuid.uuid4(), franchise_type=franchise_type, franchise_name_en=name
    )
    db_session.add(franchise)
    db_session.flush()
    return franchise


@pytest.fixture
def gated_franchise(db_session):
    return _franchise(db_session, "H-Comic")


@pytest.fixture
def mainstream_franchise(db_session):
    return _franchise(db_session, "ACG")


def _manga(admin_client, **fields):
    return admin_client.post(
        "/api/manga/", json={"manga_name_en": "Zvornik Manga", **fields}
    )


def _h_comic(admin_client, **fields):
    return admin_client.post(
        "/api/h-comic/", json={"h_comic_name_cn": "Zvornik H", "region": "JP", **fields}
    )


# ---------------------------------------------------------------------------
# An entry naming a franchise by id
# ---------------------------------------------------------------------------


def test_a_mainstream_entry_cannot_be_created_in_a_gated_franchise(
    admin_client, gated_franchise
):
    response = _manga(admin_client, franchise_id=str(gated_franchise.system_id))
    assert response.status_code == 422, response.text


def test_a_mainstream_entry_can_be_created_in_a_mainstream_franchise(
    admin_client, mainstream_franchise
):
    response = _manga(admin_client, franchise_id=str(mainstream_franchise.system_id))
    assert response.status_code == 201, response.text
    assert response.json()["franchise_id"] == str(mainstream_franchise.system_id)


def test_a_gated_entry_cannot_be_created_in_a_mainstream_franchise(
    admin_client, mainstream_franchise
):
    response = _h_comic(admin_client, franchise_id=str(mainstream_franchise.system_id))
    assert response.status_code == 422, response.text


def test_a_gated_entry_can_be_created_in_its_own_family(admin_client, gated_franchise):
    response = _h_comic(admin_client, franchise_id=str(gated_franchise.system_id))
    assert response.status_code == 201, response.text
    assert response.json()["franchise_id"] == str(gated_franchise.system_id)


@pytest.mark.parametrize("method", ["put", "patch"])
def test_a_mainstream_entry_cannot_be_moved_into_a_gated_franchise(
    admin_client, db_session, gated_franchise, mainstream_franchise, method
):
    created = _manga(admin_client, franchise_id=str(mainstream_franchise.system_id))
    assert created.status_code == 201, created.text
    entry_id = created.json()["system_id"]

    response = getattr(admin_client, method)(
        f"/api/manga/{entry_id}", json={"franchise_id": str(gated_franchise.system_id)}
    )
    assert response.status_code == 422, response.text
    db_session.expire_all()
    stored = db_session.get(models.Manga, uuid.UUID(entry_id))
    assert stored.franchise_id == mainstream_franchise.system_id


def test_a_mainstream_entry_can_be_moved_within_its_family(
    admin_client, mainstream_franchise, db_session
):
    """The mirror, on PUT only: PATCH never moves an entry - franchise_id is
    on `media`, not the entry's own table, so apply_column_patch skips it. Its
    refusal above is a guard for the day it does."""
    other = _franchise(db_session, "Anime", name="Zvornik Other")
    created = _manga(admin_client, franchise_id=str(mainstream_franchise.system_id))
    entry_id = created.json()["system_id"]

    response = admin_client.put(
        f"/api/manga/{entry_id}", json={"franchise_id": str(other.system_id)}
    )
    assert response.status_code == 200, response.text
    assert response.json()["franchise_id"] == str(other.system_id)


# ---------------------------------------------------------------------------
# A franchise's own types
# ---------------------------------------------------------------------------


def test_a_franchise_cannot_be_created_spanning_two_families(admin_client):
    response = admin_client.post(
        "/api/franchise/",
        json={"franchise_name_en": "Zvornik Mixed", "franchise_type": "ACG, H-Comic"},
    )
    assert response.status_code == 422, response.text


def test_a_franchise_can_be_created_with_two_types_of_one_family(admin_client):
    response = admin_client.post(
        "/api/franchise/",
        json={"franchise_name_en": "Zvornik Pair", "franchise_type": "ACG, Anime"},
    )
    assert response.status_code == 200, response.text


@pytest.mark.parametrize("method", ["put", "patch"])
def test_a_franchise_cannot_be_updated_to_span_two_families(
    admin_client, mainstream_franchise, method
):
    response = getattr(admin_client, method)(
        f"/api/franchise/{mainstream_franchise.system_id}",
        json={"franchise_type": "ACG, H-Comic"},
    )
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("method", ["put", "patch"])
def test_a_franchise_holding_mainstream_entries_cannot_become_gated(
    admin_client, mainstream_franchise, method
):
    created = _manga(admin_client, franchise_id=str(mainstream_franchise.system_id))
    assert created.status_code == 201, created.text

    response = getattr(admin_client, method)(
        f"/api/franchise/{mainstream_franchise.system_id}",
        json={"franchise_type": "H-Comic"},
    )
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("method", ["put", "patch"])
def test_an_empty_franchise_can_change_family(admin_client, mainstream_franchise, method):
    """The mirror: the refusal above is about the entries, not the retyping."""
    response = getattr(admin_client, method)(
        f"/api/franchise/{mainstream_franchise.system_id}",
        json={"franchise_type": "H-Comic"},
    )
    assert response.status_code == 200, response.text
