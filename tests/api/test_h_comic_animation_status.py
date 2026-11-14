"""
An h-comic's `animation_status`, derived at read time from its hentai
adaptations (D8 of the hentai design).

The relation reads `from` is the Adaptation of `to`, so a hentai adapting an
h-comic is the row hentai -adaptation-> h-comic. With one or more of those,
the status is `Animated` if any hentai has aired and `Announced` otherwise;
with none, the stored hand-set value stands. The column keeps the hand-set
value throughout, so removing the relation restores it.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models

H_COMIC = "/api/h-comic"


def _h_comic(owner_client, **fields):
    body = owner_client.post(
        f"{H_COMIC}/",
        json={"h_comic_name_cn": "Zvornik Source", "region": "JP", **fields},
    )
    assert body.status_code == 201, body.text
    return body.json()


def _hentai(owner_client, airing_status):
    body = owner_client.post(
        "/api/hentai/",
        json={"hentai_name_cn": "Zvornik Adaptation", "airing_status": airing_status},
    )
    assert body.status_code == 201, body.text
    return body.json()


def _adapt(owner_client, hentai, h_comic, kind="adaptation"):
    response = owner_client.post(
        "/api/media-relation/",
        json={
            "from_type": "hentai",
            "from_id": hentai["system_id"],
            "kind": kind,
            "to_type": "h-comic",
            "to_id": h_comic["system_id"],
        },
    )
    assert response.status_code in (200, 201), response.text
    return response.json()


def _read(owner_client, h_comic):
    return owner_client.get(f"{H_COMIC}/{h_comic['public_id']}").json()


def test_with_no_relation_the_hand_set_value_is_served_as_manual(owner_client):
    h_comic = _h_comic(owner_client, animation_status="Not Animated")
    fetched = _read(owner_client, h_comic)
    assert fetched["animation_status"] == "Not Animated"
    assert fetched["animation_status_source"] == "manual"


@pytest.mark.parametrize(
    "airing_status,expected",
    [
        ("Not Yet Aired", "Announced"),
        ("Rumored", "Announced"),
        ("Airing", "Animated"),
        ("Finished Airing", "Animated"),
    ],
)
def test_one_adaptation_derives_the_status(owner_client, airing_status, expected):
    h_comic = _h_comic(owner_client, animation_status="Not Animated")
    _adapt(owner_client, _hentai(owner_client, airing_status), h_comic)
    fetched = _read(owner_client, h_comic)
    assert fetched["animation_status"] == expected
    assert fetched["animation_status_source"] == "derived"


def test_any_aired_adaptation_makes_it_animated(owner_client):
    h_comic = _h_comic(owner_client)
    _adapt(owner_client, _hentai(owner_client, "Not Yet Aired"), h_comic)
    _adapt(owner_client, _hentai(owner_client, "Finished Airing"), h_comic)
    assert _read(owner_client, h_comic)["animation_status"] == "Animated"


def test_the_column_keeps_the_hand_set_value(owner_client, db_session):
    h_comic = _h_comic(owner_client, animation_status="Not Animated")
    _adapt(owner_client, _hentai(owner_client, "Airing"), h_comic)
    assert _read(owner_client, h_comic)["animation_status"] == "Animated"
    row = db_session.get(models.HComic, uuid.UUID(h_comic["system_id"]))
    db_session.refresh(row)
    assert row.animation_status == "Not Animated"


def test_removing_the_relation_restores_the_hand_set_value(owner_client):
    h_comic = _h_comic(owner_client, animation_status="Not Animated")
    relation = _adapt(owner_client, _hentai(owner_client, "Airing"), h_comic)
    assert _read(owner_client, h_comic)["animation_status_source"] == "derived"

    response = owner_client.delete(f"/api/media-relation/{relation['system_id']}")
    assert response.status_code == 200, response.text
    fetched = _read(owner_client, h_comic)
    assert fetched["animation_status"] == "Not Animated"
    assert fetched["animation_status_source"] == "manual"


def test_the_list_endpoint_derives_too(owner_client):
    derived = _h_comic(owner_client, animation_status="Not Animated")
    manual = _h_comic(owner_client, animation_status="Announced")
    _adapt(owner_client, _hentai(owner_client, "Finished Airing"), derived)
    listed = {e["system_id"]: e for e in owner_client.get(f"{H_COMIC}/").json()}
    assert listed[derived["system_id"]]["animation_status"] == "Animated"
    assert listed[derived["system_id"]]["animation_status_source"] == "derived"
    assert listed[manual["system_id"]]["animation_status"] == "Announced"
    assert listed[manual["system_id"]]["animation_status_source"] == "manual"


def test_only_the_adaptation_direction_from_a_hentai_counts(owner_client):
    """A row the other way round says the h-comic adapts the hentai - not an
    animation of it. Another kind of relation does not count either."""
    h_comic = _h_comic(owner_client, animation_status="Not Animated")
    hentai = _hentai(owner_client, "Airing")
    reverse = owner_client.post(
        "/api/media-relation/",
        json={
            "from_type": "h-comic",
            "from_id": h_comic["system_id"],
            "kind": "adaptation",
            "to_type": "hentai",
            "to_id": hentai["system_id"],
        },
    )
    assert reverse.status_code in (200, 201), reverse.text
    _adapt(owner_client, hentai, h_comic, kind="side_story")
    fetched = _read(owner_client, h_comic)
    assert fetched["animation_status"] == "Not Animated"
    assert fetched["animation_status_source"] == "manual"


def test_a_kr_entry_has_no_animation_status_at_all(owner_client):
    h_comic = _h_comic(owner_client, region="KR")
    _adapt(owner_client, _hentai(owner_client, "Airing"), h_comic)
    fetched = _read(owner_client, h_comic)
    assert fetched["animation_status"] is None
    assert fetched["animation_status_source"] is None


# ---------------------------------------------------------------------------
# Writing it while it is derived
# ---------------------------------------------------------------------------


@pytest.fixture
def derived_h_comic(owner_client):
    h_comic = _h_comic(owner_client, animation_status="Not Animated")
    _adapt(owner_client, _hentai(owner_client, "Airing"), h_comic)
    assert _read(owner_client, h_comic)["animation_status_source"] == "derived"
    return h_comic


@pytest.mark.parametrize("method", ["put", "patch"])
def test_a_write_of_another_value_is_refused_while_derived(
    owner_client, db_session, derived_h_comic, method
):
    response = getattr(owner_client, method)(
        f"{H_COMIC}/{derived_h_comic['system_id']}", json={"animation_status": "Announced"}
    )
    assert response.status_code == 422
    row = db_session.get(models.HComic, uuid.UUID(derived_h_comic["system_id"]))
    db_session.refresh(row)
    assert row.animation_status == "Not Animated"


def test_echoing_the_derived_value_keeps_the_hand_set_one(
    owner_client, db_session, derived_h_comic
):
    """The form sends back what it was served; that must not overwrite the
    hand-set value the column keeps."""
    response = owner_client.put(
        f"{H_COMIC}/{derived_h_comic['system_id']}",
        json={"animation_status": "Animated", "h_comic_name_en": "Echo"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["animation_status"] == "Animated"
    row = db_session.get(models.HComic, uuid.UUID(derived_h_comic["system_id"]))
    db_session.refresh(row)
    assert row.animation_status == "Not Animated"
    assert row.h_comic_name_en == "Echo"


def test_the_hand_set_value_is_writable_again_without_the_relation(owner_client):
    """The mirror of the refusal: with no relation the same write succeeds."""
    h_comic = _h_comic(owner_client, animation_status="Not Animated")
    response = owner_client.put(
        f"{H_COMIC}/{h_comic['system_id']}", json={"animation_status": "Announced"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["animation_status"] == "Announced"
    assert response.json()["animation_status_source"] == "manual"


def test_a_kr_entry_is_not_guarded(owner_client):
    """KR has no animation status, so a relation does not make a write 422 -
    the value is cleared by the region rule instead."""
    h_comic = _h_comic(owner_client, region="KR")
    _adapt(owner_client, _hentai(owner_client, "Airing"), h_comic)
    response = owner_client.put(
        f"{H_COMIC}/{h_comic['system_id']}", json={"animation_status": "Announced"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["animation_status"] is None
