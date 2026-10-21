"""
A character or identity on the default display name shows its CN name once it
has one: on every create and update, and over every row in Calculate All
(app/services/domain/character_display_names.py).
"""

import uuid

from app import models
from app.services.calculation import run_sync_character_display_names

CHARACTER = "/api/character/"
IDENTITY = "/api/character-identity/"


# -- the form saves -----------------------------------------------------------


def test_creating_a_character_with_a_cn_name_defaults_to_cn(admin_client):
    r = admin_client.post(CHARACTER, json={"name_en": "Ichika", "name_cn": "一花"})
    assert r.status_code == 200, r.text
    assert r.json()["display_name_field"] == "cn"
    assert r.json()["display_name"] == "一花"


def test_an_explicit_display_name_is_kept_beside_a_cn_name(admin_client):
    # The mirror case: CN is filled here too, so the rule had something to
    # act on and chose not to.
    r = admin_client.post(
        CHARACTER,
        json={"name_en": "Ichika", "name_cn": "一花", "display_name_field": "en"},
    )
    assert r.json()["display_name_field"] == "en"


def test_a_character_without_a_cn_name_stays_on_the_default(admin_client):
    r = admin_client.post(CHARACTER, json={"name_en": "Ichika", "name_cn": "  "})
    assert r.json()["display_name_field"] is None


def test_updating_a_character_to_add_a_cn_name_switches_to_cn(admin_client, character):
    assert character.display_name_field is None
    r = admin_client.put(
        f"{CHARACTER}{character.system_id}",
        json={"name_en": "Ichika", "name_cn": "一花", "display_name_field": None},
    )
    assert r.status_code == 200, r.text
    assert r.json()["display_name_field"] == "cn"


def test_creating_an_identity_with_a_cn_name_defaults_to_cn(admin_client, character):
    r = admin_client.post(
        IDENTITY,
        json={"character_id": str(character.system_id), "name_en": "Conan", "name_cn": "柯南"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["display_name_field"] == "cn"


def test_updating_an_identity_keeps_an_explicit_choice_and_fills_a_default(
    admin_client, character
):
    created = admin_client.post(
        IDENTITY,
        json={"character_id": str(character.system_id), "name_en": "Conan"},
    ).json()
    assert created["display_name_field"] is None

    url = f"{IDENTITY}{created['system_id']}"
    kept = admin_client.put(
        url, json={"name_en": "Conan", "name_cn": "柯南", "display_name_field": "jp", "name_jp": "コナン"}
    )
    assert kept.json()["display_name_field"] == "jp"

    filled = admin_client.put(url, json={"name_en": "Conan", "name_cn": "柯南"})
    assert filled.json()["display_name_field"] == "cn"


# -- Calculate All ------------------------------------------------------------


def test_calculate_points_default_rows_with_a_cn_name_at_it(db_session, character):
    with_cn = models.Character(system_id=uuid.uuid4(), name_en="Yuki", name_cn="雪")
    explicit = models.Character(
        system_id=uuid.uuid4(), name_en="Souta", name_cn="颯太", display_name_field="en"
    )
    identity = models.CharacterIdentity(
        character_id=character.system_id, name_en="Kid", name_cn="怪盜基德"
    )
    db_session.add_all([with_cn, explicit, identity])
    db_session.flush()

    result = run_sync_character_display_names(db_session)

    assert result["counts"] == {"character": 1, "identity": 1}
    for row in (with_cn, explicit, identity, character):
        db_session.refresh(row)
    assert with_cn.display_name_field == "cn"
    assert identity.display_name_field == "cn"
    assert explicit.display_name_field == "en"
    # No CN name: left on the default.
    assert character.display_name_field is None


def test_the_control_center_endpoint_runs_the_step(admin_client, db_session):
    row = models.Character(system_id=uuid.uuid4(), name_cn="雪")
    db_session.add(row)
    db_session.flush()

    r = admin_client.post("/api/data-control/calculate/sync-display-names")

    assert r.status_code == 200, r.text
    assert r.json()["counts"] == {"character": 1, "identity": 0}
    db_session.refresh(row)
    assert row.display_name_field == "cn"


def test_the_control_center_endpoint_needs_pipelines(client):
    assert client.post("/api/data-control/calculate/sync-display-names").status_code == 401
