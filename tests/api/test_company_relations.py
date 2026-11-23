"""
Company relations across kinds: a studio and a publisher relate to each other
in any mix, through one table (company_relation), each side with its own
remark. The studio-only rules - mutual, kept whole, visibility - are proved in
test_studio_relations.py; this file proves the publisher end.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.pipelines import pull
from app.services.pipelines.legacy_names import LEGACY_TAB_NAMES


def _studio(db, name):
    studio = models.Studio(system_id=uuid.uuid4(), name_en=name)
    db.add(studio)
    db.flush()
    return studio


def _publisher(db, name):
    publisher = models.Publisher(system_id=uuid.uuid4(), name_en=name)
    db.add(publisher)
    db.flush()
    return publisher


@pytest.fixture
def studio(db_session):
    return _studio(db_session, "Zvornik Company Studio")


@pytest.fixture
def publisher(db_session):
    return _publisher(db_session, "Zvornik Company Publisher")


def _put(client, kind, record, relations):
    return client.put(
        f"/api/{kind}/{record.system_id}/related",
        json={
            "relations": [
                {"kind": other_kind, "id": str(other.system_id), "remark": remark}
                for other_kind, other, remark in relations
            ]
        },
    )


def _related(client, kind, record):
    body = client.get(f"/api/{kind}/{record.system_id}/related").json()
    return [(r["kind"], r["display_name"], r["remark"]) for r in body]


def test_a_studio_relates_to_a_publisher_and_both_pages_show_it(
    owner_client, studio, publisher
):
    r = _put(owner_client, "studio", studio, [("publisher", publisher, "distributor")])
    assert r.status_code == 200, r.text
    assert _related(owner_client, "studio", studio) == [
        ("publisher", publisher.display_name, "distributor")
    ]
    assert _related(owner_client, "publisher", publisher) == [
        ("studio", studio.display_name, None)
    ]


def test_a_publisher_relates_to_a_publisher(owner_client, db_session, publisher):
    other = _publisher(db_session, "Zvornik Company Other Publisher")
    assert _put(owner_client, "publisher", publisher, [("publisher", other, "parent")]).status_code == 200
    assert _related(owner_client, "publisher", other) == [
        ("publisher", publisher.display_name, None)
    ]


def test_a_studio_item_without_a_kind_is_a_studio(owner_client, db_session, studio):
    """The pre-publisher payload shape still means what it meant."""
    other = _studio(db_session, "Zvornik Company Other Studio")
    r = owner_client.put(
        f"/api/studio/{studio.system_id}/related",
        json={"relations": [{"id": str(other.system_id), "remark": None}]},
    )
    assert r.status_code == 200
    assert _related(owner_client, "studio", studio) == [("studio", other.display_name, None)]


def test_an_id_under_the_wrong_kind_is_refused(owner_client, studio, publisher):
    """A publisher's id sent as a studio names no studio: 422, nothing written."""
    r = _put(owner_client, "studio", studio, [("studio", publisher, None)])
    assert r.status_code == 422
    assert _related(owner_client, "studio", studio) == []


def test_a_kind_the_table_does_not_hold_is_refused(owner_client, studio, publisher):
    r = _put(owner_client, "studio", studio, [("franchise", publisher, None)])
    assert r.status_code == 422


def test_a_publisher_cannot_relate_to_itself(owner_client, publisher):
    assert _put(owner_client, "publisher", publisher, [("publisher", publisher, None)]).status_code == 422


def test_removing_from_the_publisher_side_removes_both(owner_client, studio, publisher):
    _put(owner_client, "studio", studio, [("publisher", publisher, "x")])
    assert _put(owner_client, "publisher", publisher, []).status_code == 200
    assert _related(owner_client, "studio", studio) == []


def test_the_publisher_list_reports_has_relations(owner_client, guest_reader, db_session, studio, publisher):
    lonely = _publisher(db_session, "Zvornik Company Lonely")
    _put(owner_client, "studio", studio, [("publisher", publisher, None)])
    flags = {
        p["display_name"]: p["has_relations"]
        for p in guest_reader.get("/api/publisher/").json()
    }
    assert flags[publisher.display_name] is True
    assert flags[lonely.display_name] is False


def test_merging_publishers_moves_their_relations(owner_client, db_session, studio, publisher):
    drop = _publisher(db_session, "Zvornik Company Drop")
    _put(owner_client, "studio", studio, [("publisher", drop, "via drop")])
    r = owner_client.post(
        f"/api/publisher/{publisher.system_id}/merge",
        json={"source_id": str(drop.system_id)},
    )
    assert r.status_code == 200, r.text
    db_session.expire_all()
    assert _related(owner_client, "studio", studio) == [
        ("publisher", publisher.display_name, "via drop")
    ]


def test_the_pre_publisher_tab_title_still_restores():
    assert "Studio Relation" in LEGACY_TAB_NAMES["Company Relation"]


def test_a_cross_kind_row_round_trips_through_the_tab(monkeypatch, db_session, studio, publisher):
    monkeypatch.setattr(
        pull,
        "get_all_raw_rows",
        lambda name: [
            [
                "system_id", "studio_id", "publisher_id",
                "related_studio_id", "related_publisher_id", "remark",
            ],
            [str(uuid.uuid4()), str(studio.system_id), "", "", str(publisher.system_id), "label"],
            [str(uuid.uuid4()), "", str(publisher.system_id), str(studio.system_id), "", ""],
        ],
    )
    result = pull.execute_pull_specific(db_session, "Company Relation", log_action=False)
    assert result["status"] == "success", result
    rows = {
        (r.studio_id, r.publisher_id, r.related_studio_id, r.related_publisher_id): r.remark
        for r in db_session.query(models.CompanyRelation).all()
    }
    assert rows == {
        (studio.system_id, None, None, publisher.system_id): "label",
        (None, publisher.system_id, studio.system_id, None): None,
    }
