"""/api/character-identity, and identities nested in the character response."""

import uuid

BASE = "/api/character-identity/"


def _create(admin_client, character, **fields):
    body = {"character_id": str(character.system_id), "name_en": "Conan", **fields}
    r = admin_client.post(BASE, json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_create_requires_an_existing_character(admin_client):
    r = admin_client.post(BASE, json={"character_id": str(uuid.uuid4()), "name_en": "Conan"})
    assert r.status_code == 404


def test_create_requires_a_name(admin_client, character):
    r = admin_client.post(BASE, json={"character_id": str(character.system_id)})
    assert r.status_code == 422


def test_guest_cannot_create_or_read(client, character):
    assert client.post(BASE, json={"character_id": str(character.system_id), "name_en": "X"}).status_code == 401
    assert client.get(BASE).status_code == 401


def test_gender_null_inherits_the_characters(admin_client, db_session, character):
    character.gender = "男"
    db_session.flush()
    inherited = _create(admin_client, character)
    own = _create(admin_client, character, name_en="Edogawa", gender="女")
    assert inherited["gender"] is None and inherited["display_gender"] == "男"
    assert own["display_gender"] == "女"


def test_photo_falls_back_to_the_characters(admin_client, character):
    # `character` carries photo_file="characters/ichika.jpg" (conftest).
    bare = _create(admin_client, character)
    own = _create(admin_client, character, name_en="B", photo_file="character-identity/x.jpg")
    assert bare["display_photo_file"] == "characters/ichika.jpg"
    assert own["display_photo_file"] == "character-identity/x.jpg"


def test_new_identities_go_last(admin_client, character):
    first = _create(admin_client, character, name_en="A")
    second = _create(admin_client, character, name_en="B")
    assert (first["position"], second["position"]) == (0, 1)


def test_put_updates_fields_but_not_the_character(admin_client, character, second_character):
    created = _create(admin_client, character)
    r = admin_client.put(
        f"{BASE}{created['system_id']}",
        json={"name_en": "Conan", "remark": "glasses", "character_id": str(second_character.system_id)},
    )
    assert r.status_code == 200
    assert r.json()["remark"] == "glasses"
    assert r.json()["character_id"] == str(character.system_id)


def test_list_filters_by_character_and_name(admin_client, character, second_character):
    _create(admin_client, character, name_en="Conan")
    _create(admin_client, second_character, name_en="Kaito")
    by_character = admin_client.get(BASE, params={"character_id": str(character.system_id)}).json()
    assert [i["name_en"] for i in by_character] == ["Conan"]
    by_name = admin_client.get(BASE, params={"name": "kai"}).json()
    assert [i["name_en"] for i in by_name] == ["Kaito"]
    assert by_name[0]["character_display_name"] == "Yuki"


def test_character_response_nests_its_identities(admin_client, client, character):
    _create(admin_client, character, name_en="B")
    _create(admin_client, character, name_en="A")
    detail = client.get(f"/api/character/{character.system_id}").json()
    assert [i["name_en"] for i in detail["identities"]] == ["B", "A"]
    listed = next(c for c in client.get("/api/character/").json() if c["system_id"] == str(character.system_id))
    assert len(listed["identities"]) == 2
    assert "casting_count" not in listed["identities"][0]
