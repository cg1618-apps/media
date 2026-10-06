"""Cast rows that name an identity: PUT validation, GET shape, photo fallback, /entries."""

import uuid

import pytest

from app import models


@pytest.fixture
def identity(db_session, character):
    i = models.CharacterIdentity(system_id=uuid.uuid4(), character_id=character.system_id, name_en="Conan")
    db_session.add(i)
    db_session.flush()
    return i


def _put(admin_client, anime, rows):
    return admin_client.put(f"/api/casting/anime/{anime.system_id}", json={"cast": rows})


def _row(character, identity=None, **extra):
    row = {"character_id": str(character.system_id), **extra}
    if identity is not None:
        row["identity_id"] = str(identity.system_id)
    return row


def test_main_and_identity_rows_round_trip(admin_client, anime, character, identity):
    assert _put(admin_client, anime, [_row(character), _row(character, identity)]).status_code == 200
    cast = admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"]
    assert [(r["identity_id"], r["identity_name"]) for r in cast] == [
        (None, None),
        (str(identity.system_id), "Conan"),
    ]


def test_put_rejects_an_identity_of_another_character(admin_client, db_session, anime, character, second_character):
    stranger = models.CharacterIdentity(system_id=uuid.uuid4(), character_id=second_character.system_id, name_en="Kid")
    db_session.add(stranger)
    db_session.flush()
    r = _put(admin_client, anime, [_row(character, stranger)])
    assert r.status_code == 422
    assert "does not belong" in r.json()["detail"]


def test_put_rejects_an_unknown_identity(admin_client, anime, character):
    r = _put(admin_client, anime, [{"character_id": str(character.system_id), "identity_id": str(uuid.uuid4())}])
    assert r.status_code == 422


def test_put_rejects_one_identity_twice(admin_client, anime, character, identity):
    r = _put(admin_client, anime, [_row(character, identity), _row(character, identity)])
    assert r.status_code == 422


def test_put_still_rejects_the_main_identity_twice(admin_client, anime, character):
    assert _put(admin_client, anime, [_row(character), _row(character)]).status_code == 422


def test_photo_falls_back_row_then_identity_then_character(admin_client, db_session, anime, character, identity):
    identity.photo_file = "character-identity/conan.jpg"
    db_session.flush()
    rows = [
        _row(character),
        _row(character, identity),
    ]
    assert _put(admin_client, anime, rows).status_code == 200
    cast = admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"]
    assert cast[0]["photo_file"] == "characters/ichika.jpg"
    assert cast[1]["photo_file"] == "character-identity/conan.jpg"
    rows[1]["photo_file"] = "character/own.jpg"
    assert _put(admin_client, anime, rows).status_code == 200
    cast = admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"]
    assert cast[1]["photo_file"] == "character/own.jpg"


def test_entries_lists_each_identity_appearance(admin_client, client, anime, character, identity):
    assert _put(admin_client, anime, [_row(character), _row(character, identity)]).status_code == 200
    groups = client.get(f"/api/character/{character.system_id}/entries").json()["groups"]
    entries = [e for g in groups for e in g["entries"]]
    assert len(entries) == 2
    assert len({e["casting_id"] for e in entries}) == 2
    assert sorted(str(e["identity_name"]) for e in entries) == ["Conan", "None"]
