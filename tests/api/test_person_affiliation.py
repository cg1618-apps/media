"""
Person affiliations: the studios a person belongs to, written with the person
and read from either end.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain import credits as credits_service
from app.services.domain.content_labels import label_keys_for_entry
from app.services.pipelines import pull


def _studio(db, name):
    studio = models.Studio(system_id=uuid.uuid4(), name_en=name)
    db.add(studio)
    db.flush()
    return studio


@pytest.fixture
def studios(db_session):
    return _studio(db_session, "Zvornik Aff A"), _studio(db_session, "Zvornik Aff B")


@pytest.fixture
def hidden_studio(owner_client, db_session):
    """A studio credited only on a hentai: hidden outside `unrestricted`."""
    body = owner_client.post(
        "/api/hentai/", json={"hentai_name_cn": "Zvornik Aff Hentai"}
    ).json()
    hentai_id = uuid.UUID(body["system_id"])
    assert "hentai" in label_keys_for_entry(db_session, hentai_id)
    credits_service.replace_credits(
        db_session, "hentai", hentai_id, "studio", ["Zvornik Aff Hidden"]
    )
    return credits_service.find_studio(db_session, "Zvornik Aff Hidden")


def _names(refs):
    return [r["display_name"] for r in refs]


def _create(client, name, studio_ids, roles=None):
    return client.post(
        "/api/person/",
        json={
            "name": name,
            "roles": roles or [{"role": "seiyuu", "scope": "anime"}],
            "studio_ids": [str(i) for i in studio_ids],
        },
    )


def test_a_seiyuu_belongs_to_several_studios(owner_client, studios):
    a, b = studios
    r = _create(owner_client, "Zvornik Seiyuu", [b.system_id, a.system_id])
    assert r.status_code == 200, r.text
    assert _names(r.json()["affiliations"]) == ["Zvornik Aff A", "Zvornik Aff B"]


def test_the_studio_lists_its_people(owner_client, guest_reader, studios):
    a, _ = studios
    _create(owner_client, "Zvornik Member", [a.system_id])
    people = guest_reader.get(f"/api/studio/{a.system_id}/people").json()
    assert _names(people) == ["Zvornik Member"]


def test_update_replaces_the_set_and_null_leaves_it(owner_client, studios):
    a, b = studios
    person = _create(owner_client, "Zvornik Mover", [a.system_id]).json()
    url = f"/api/person/{person['system_id']}"
    base = {"name_en": "Zvornik Mover", "roles": person["roles"]}
    moved = owner_client.put(url, json={**base, "studio_ids": [str(b.system_id)]}).json()
    assert _names(moved["affiliations"]) == ["Zvornik Aff B"]
    untouched = owner_client.put(url, json=base).json()
    assert _names(untouched["affiliations"]) == ["Zvornik Aff B"]
    cleared = owner_client.put(url, json={**base, "studio_ids": []}).json()
    assert cleared["affiliations"] == []


def test_an_unknown_studio_is_refused(owner_client):
    r = _create(owner_client, "Zvornik Nowhere", [uuid.uuid4()])
    assert r.status_code == 422


def test_a_hidden_studio_is_not_shown_and_survives_a_narrow_save(
    owner_client, mode_client, studios, hidden_studio, db_session
):
    """
    The hidden studio is present and affiliated, so the narrow session's view
    without it proves the rule hid it; owner_client (`unrestricted`) reading
    it back is the mirror. The narrow session then saves the list it saw, and
    the row it was never shown survives.
    """
    a, _ = studios
    person = _create(
        owner_client, "Zvornik Hidden Member", [a.system_id, hidden_studio.system_id]
    ).json()
    url = f"/api/person/{person['system_id']}"
    assert _names(owner_client.get(url).json()["affiliations"]) == [
        "Zvornik Aff A", "Zvornik Aff Hidden",
    ]
    narrow = mode_client("normal")
    seen = narrow.get(url).json()
    assert _names(seen["affiliations"]) == ["Zvornik Aff A"]
    r = narrow.put(
        url,
        json={"name_en": "Zvornik Hidden Member", "roles": seen["roles"], "studio_ids": []},
    )
    assert r.status_code == 200, r.text
    db_session.expire_all()
    left = db_session.query(models.PersonAffiliation).filter_by(
        person_id=uuid.UUID(person["system_id"])
    )
    assert [row.studio_id for row in left] == [hidden_studio.system_id]


def test_deleting_the_studio_drops_the_affiliation(owner_client, db_session, studios):
    a, _ = studios
    person = _create(owner_client, "Zvornik Orphan", [a.system_id]).json()
    assert owner_client.delete(f"/api/studio/{a.system_id}").status_code == 200
    db_session.expire_all()
    assert owner_client.get(f"/api/person/{person['system_id']}").json()["affiliations"] == []


def test_merging_people_moves_their_affiliations(owner_client, studios):
    a, b = studios
    keep = _create(owner_client, "Zvornik Keep", [a.system_id]).json()
    drop = _create(owner_client, "Zvornik Drop", [a.system_id, b.system_id]).json()
    r = owner_client.post(
        f"/api/person/{keep['system_id']}/merge", json={"source_id": drop["system_id"]}
    )
    assert r.status_code == 200, r.text
    got = owner_client.get(f"/api/person/{keep['system_id']}").json()
    assert _names(got["affiliations"]) == ["Zvornik Aff A", "Zvornik Aff B"]


def test_the_tab_round_trips(monkeypatch, db_session, studios):
    a, _ = studios
    person = models.Person(system_id=uuid.uuid4(), name_en="Zvornik Sheet Person")
    db_session.add(person)
    db_session.flush()
    monkeypatch.setattr(
        pull,
        "get_all_raw_rows",
        lambda name: [
            ["system_id", "person_id", "studio_id"],
            [str(uuid.uuid4()), str(person.system_id), str(a.system_id)],
        ],
    )
    result = pull.execute_pull_specific(db_session, "Person Affiliation", log_action=False)
    assert result["status"] == "success", result
    assert [
        (r.person_id, r.studio_id) for r in db_session.query(models.PersonAffiliation).all()
    ] == [(person.system_id, a.system_id)]
