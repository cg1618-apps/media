"""
PATCH /api/character/{id} and PATCH /api/person/{id}, and the rules PUT and
PATCH share: the gender / my_rating vocabularies and photo_fallback_entry_id
naming an entry the record is linked to.

Fixtures `anime`, `character`, `character_with_castings`,
`seiyuu_with_one_casting`, `hidden_anime` and `catalog_writer` live in
tests/api/conftest.py.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain import credits as credits_service

KINDS = ["character", "person"]


@pytest.fixture
def record(db_session, character, person):
    """The two records the parametrised tests PATCH, both with two names."""
    character.name_cn = "一花"
    person.name_cn = "測試"
    db_session.flush()
    return {"character": character, "person": person}


def _patch(client, kind, entity, body):
    return client.patch(f"/api/{kind}/{entity.system_id}", json=body)


# ---------------------------------------------------------------------------
# PATCH basics
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("kind", KINDS)
def test_patch_changes_only_the_keys_sent(admin_client, record, kind):
    entity = record[kind]
    r = _patch(admin_client, kind, entity, {"my_rating": "A", "remark": "Kept note"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["my_rating"] == "A"
    assert body["remark"] == "Kept note"
    assert body["name_cn"] in ("一花", "測試")
    assert body["name_en"] == entity.name_en


@pytest.mark.parametrize("kind", KINDS)
def test_patch_returns_the_full_response(admin_client, record, kind):
    body = _patch(admin_client, kind, record[kind], {"remark": "x"}).json()
    for key in ("display_photo_file", "media_types", "restricted", "public_id"):
        assert key in body


@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize(
    "body",
    [
        {"gender": "Male"},
        {"my_rating": "a+"},
        {"display_name_field": "zh"},
        {"photo_fallback_entry_id": "not-a-uuid"},
    ],
)
def test_patch_refuses_a_value_the_schemas_refuse(admin_client, record, kind, body):
    assert _patch(admin_client, kind, record[kind], body).status_code == 422


@pytest.mark.parametrize("kind", KINDS)
def test_patch_takes_an_empty_string_as_null(admin_client, db_session, record, kind):
    entity = record[kind]
    entity.gender, entity.my_rating = "女", "S"
    db_session.flush()
    body = _patch(admin_client, kind, entity, {"gender": "", "my_rating": ""}).json()
    assert body["gender"] is None
    assert body["my_rating"] is None


@pytest.mark.parametrize("kind", KINDS)
def test_patch_may_clear_one_name_but_not_the_last(admin_client, record, kind):
    entity = record[kind]
    r = _patch(admin_client, kind, entity, {"name_en": None})
    assert r.status_code == 200, r.text
    # Now name_cn is the only one left.
    r = _patch(admin_client, kind, entity, {"name_cn": ""})
    assert r.status_code == 422
    assert "at least one name" in r.json()["detail"]


@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize("column", ["system_id", "public_id", "created_at"])
def test_patch_refuses_server_columns(admin_client, record, kind, column):
    r = _patch(admin_client, kind, record[kind], {column: None, "remark": "x"})
    assert r.status_code == 422
    assert column in r.json()["detail"]


@pytest.mark.parametrize("kind", KINDS)
def test_patch_ignores_a_key_that_is_not_a_column(admin_client, record, kind):
    r = _patch(admin_client, kind, record[kind], {"display_name": "x", "remark": "y"})
    assert r.status_code == 200, r.text
    assert r.json()["remark"] == "y"


@pytest.mark.parametrize("kind", KINDS)
def test_a_guest_cannot_patch(client, record, kind):
    assert _patch(client, kind, record[kind], {"remark": "x"}).status_code == 401


@pytest.mark.parametrize("kind", KINDS)
def test_a_signed_in_non_admin_cannot_patch(user_client, db_session, record, kind):
    """401, not 403: require_permission answers an insufficient permission
    with 401 on purpose (see test_fx_rates.py)."""
    assert _patch(user_client, kind, record[kind], {"remark": "x"}).status_code == 401
    db_session.expire_all()
    assert db_session.get(type(record[kind]), record[kind].system_id).remark is None


@pytest.mark.parametrize("kind", KINDS)
def test_patching_a_missing_record_is_a_404(admin_client, kind):
    r = admin_client.patch(f"/api/{kind}/{uuid.uuid4()}", json={"remark": "x"})
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# PUT / POST vocabularies
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("kind", KINDS)
def test_put_refuses_an_old_free_text_gender(admin_client, record, kind):
    r = admin_client.put(
        f"/api/{kind}/{record[kind].system_id}",
        json={"name_en": "A", "gender": "Female"},
    )
    assert r.status_code == 422


@pytest.mark.parametrize("kind", KINDS)
def test_post_accepts_the_vocabularies(admin_client, kind):
    r = admin_client.post(
        f"/api/{kind}/",
        json={"name_en": f"Zvornik Vocab {kind}", "gender": "中性/無性", "my_rating": "A+"},
    )
    assert r.status_code == 200, r.text
    assert (r.json()["gender"], r.json()["my_rating"]) == ("中性/無性", "A+")


# ---------------------------------------------------------------------------
# photo_fallback_entry_id must name a linked entry
# ---------------------------------------------------------------------------


def test_character_fallback_on_a_cast_entry_is_stored(
    admin_client, character_with_castings, anime
):
    r = _patch(
        admin_client, "character", character_with_castings,
        {"photo_fallback_entry_id": str(anime.system_id)},
    )
    assert r.status_code == 200, r.text
    assert r.json()["photo_fallback_entry_id"] == str(anime.system_id)


def test_character_fallback_on_an_uncast_entry_is_refused(
    admin_client, character_with_castings, manga
):
    """The mirror of the test above: a real entry, just not this character's."""
    for method in ("patch", "put"):
        r = getattr(admin_client, method)(
            f"/api/character/{character_with_castings.system_id}",
            json={"name_en": "Ichika", "photo_fallback_entry_id": str(manga.system_id)},
        )
        assert r.status_code == 422, method


def test_person_fallback_via_a_credit_or_a_casting_is_stored(
    admin_client, db_session, seiyuu_with_one_casting, anime, manga
):
    credits_service.replace_credits(
        db_session, "manga", manga.system_id, "author", ["Test Seiyuu"]
    )
    person = seiyuu_with_one_casting
    for entry in (anime, manga):  # cast on the anime, credited on the manga
        r = _patch(
            admin_client, "person", person, {"photo_fallback_entry_id": str(entry.system_id)}
        )
        assert r.status_code == 200, r.text


def test_person_fallback_on_an_unlinked_entry_is_refused(
    admin_client, seiyuu_with_one_casting, manga
):
    for method in ("patch", "put"):
        r = getattr(admin_client, method)(
            f"/api/person/{seiyuu_with_one_casting.system_id}",
            json={"name_en": "Test Seiyuu", "photo_fallback_entry_id": str(manga.system_id)},
        )
        assert r.status_code == 422, method


@pytest.mark.parametrize("kind", KINDS)
def test_post_refuses_a_fallback(admin_client, anime, kind):
    """A record being created is linked to nothing yet."""
    r = admin_client.post(
        f"/api/{kind}/",
        json={"name_en": f"Zvornik New {kind}", "photo_fallback_entry_id": str(anime.system_id)},
    )
    assert r.status_code == 422


def test_put_with_null_clears_a_visible_choice(
    admin_client, db_session, character_with_castings, anime
):
    character_with_castings.photo_fallback_entry_id = anime.system_id
    db_session.flush()
    r = admin_client.put(
        f"/api/character/{character_with_castings.system_id}", json={"name_en": "Ichika"}
    )
    assert r.status_code == 200, r.text
    db_session.expire_all()
    assert db_session.get(
        models.Character, character_with_castings.system_id
    ).photo_fallback_entry_id is None


def test_put_with_null_keeps_a_choice_the_editor_cannot_see(
    catalog_writer, admin_client, db_session, character_with_castings, hidden_anime
):
    """
    `hidden_anime` carries a label the catalog writer's mode lacks, so the
    response hid the stored choice from them and their form sends null back.
    That null is not a removal. The mirror is the test above: the same null
    from an editor who CAN see the entry clears it.
    """
    character = character_with_castings
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id, media_type="anime", entry_id=hidden_anime.system_id
        )
    )
    character.photo_fallback_entry_id = hidden_anime.system_id
    db_session.flush()

    writer = catalog_writer()
    seen = writer.get(f"/api/character/{character.system_id}").json()
    assert seen["photo_fallback_entry_id"] is None
    r = writer.put(f"/api/character/{character.system_id}", json={"name_en": "Ichika"})
    assert r.status_code == 200, r.text
    db_session.expire_all()
    assert (
        db_session.get(models.Character, character.system_id).photo_fallback_entry_id
        == hidden_anime.system_id
    )

    # And the writer cannot SET a choice it cannot see either.
    r = writer.patch(
        f"/api/character/{character.system_id}",
        json={"photo_fallback_entry_id": str(hidden_anime.system_id)},
    )
    assert r.status_code == 422
    r = admin_client.patch(
        f"/api/character/{character.system_id}",
        json={"photo_fallback_entry_id": str(hidden_anime.system_id)},
    )
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# character.role
# ---------------------------------------------------------------------------


def test_character_role_round_trips_through_post_put_and_patch(admin_client):
    body = admin_client.post(
        "/api/character/", json={"name_en": "Zvornik Role", "role": "Core"}
    ).json()
    assert body["role"] == "Core"
    key = body["system_id"]
    r = admin_client.put(f"/api/character/{key}", json={"name_en": "Zvornik Role", "role": "Other"})
    assert r.json()["role"] == "Other"
    r = admin_client.patch(f"/api/character/{key}", json={"role": ""})
    assert r.status_code == 200, r.text
    assert r.json()["role"] is None
    assert admin_client.get(f"/api/character/{key}").json()["role"] is None


@pytest.mark.parametrize("method", ["post", "put", "patch"])
def test_an_unknown_character_role_is_a_422(admin_client, character, method):
    url = "/api/character/" if method == "post" else f"/api/character/{character.system_id}"
    r = getattr(admin_client, method)(url, json={"name_en": "Ichika", "role": "Hero"})
    assert r.status_code == 422


def test_the_character_role_is_independent_of_its_castings(
    admin_client, character_with_castings, anime
):
    """No derivation either way: setting one leaves the other as it was."""
    admin_client.put(
        f"/api/casting/anime/{anime.system_id}",
        json={"cast": [{"character_id": str(character_with_castings.system_id), "role": "Main"}]},
    )
    body = _patch(admin_client, "character", character_with_castings, {"role": "Other"}).json()
    assert body["role"] == "Other"
    cast = admin_client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"]
    assert [row["role"] for row in cast] == ["Main"]
