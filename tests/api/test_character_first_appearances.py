"""
first_mention, first_appearance and first_encounter on a character and on an
identity: free text, written by create, PUT and PATCH, read back on every
response, carried through Backup and Pull, and filled by merge.

An identity's three are its own - never the character's, in either direction.
"""

import uuid

import pytest
from sqlalchemy import text

from app import models
from app.services.pipelines import backup, pull

FIRSTS = {
    "first_mention": "第1卷 第3章",
    "first_appearance": "1-13",
    "first_encounter": "S1 ep 8",
}
NONE = dict.fromkeys(FIRSTS)
IDENTITY_BASE = "/api/character-identity/"


def _firsts(body: dict) -> dict:
    return {k: body[k] for k in FIRSTS}


@pytest.fixture
def sheets(monkeypatch):
    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


def _backed_up(db, monkeypatch):
    written = {}

    def record(tab, matrix):
        written[tab] = matrix
        return True

    monkeypatch.setattr(backup, "bulk_overwrite_sheet", record)
    backup.execute_backup(db)
    return written


# ---- character ------------------------------------------------------------


def test_a_character_is_created_and_read_with_its_firsts(admin_client):
    created = admin_client.post("/api/character/", json={"name_en": "Orsted", **FIRSTS})
    assert created.status_code == 200, created.text
    assert _firsts(created.json()) == FIRSTS
    read = admin_client.get(f"/api/character/{created.json()['public_id']}")
    assert _firsts(read.json()) == FIRSTS


def test_a_character_without_firsts_reads_them_as_null(admin_client):
    created = admin_client.post("/api/character/", json={"name_en": "Orsted"}).json()
    assert _firsts(created) == NONE


def test_put_replaces_a_characters_firsts(admin_client, character):
    r = admin_client.put(
        f"/api/character/{character.system_id}", json={"name_en": "Ichika", **FIRSTS}
    )
    assert r.status_code == 200, r.text
    assert _firsts(r.json()) == FIRSTS


def test_patch_changes_only_the_first_sent(admin_client, db_session, character):
    character.first_mention = "1-2"
    db_session.flush()
    r = admin_client.patch(
        f"/api/character/{character.system_id}", json={"first_encounter": "S2 ep 1"}
    )
    assert r.status_code == 200, r.text
    assert _firsts(r.json()) == {
        "first_mention": "1-2", "first_appearance": None, "first_encounter": "S2 ep 1",
    }


def test_merge_fills_a_blank_first_from_the_loser(
    admin_client, db_session, character, second_character
):
    character.first_mention = "kept"
    second_character.first_mention = "lost"
    second_character.first_encounter = "S1 ep 8"
    db_session.flush()
    r = admin_client.post(
        f"/api/character/{character.system_id}/merge",
        json={"source_id": str(second_character.system_id)},
    )
    assert r.status_code == 200, r.text
    db_session.refresh(character)
    assert (character.first_mention, character.first_encounter) == ("kept", "S1 ep 8")


# ---- identity -------------------------------------------------------------


def test_an_identity_is_created_updated_and_read_with_its_firsts(admin_client, character):
    created = admin_client.post(
        IDENTITY_BASE,
        json={"character_id": str(character.system_id), "name_en": "Conan", **FIRSTS},
    )
    assert created.status_code == 200, created.text
    assert _firsts(created.json()) == FIRSTS

    updated = admin_client.put(
        f"{IDENTITY_BASE}{created.json()['system_id']}",
        json={"name_en": "Conan", "first_mention": "2-1"},
    )
    assert updated.status_code == 200, updated.text
    # PUT replaces: the two left out are cleared.
    assert _firsts(updated.json()) == {**NONE, "first_mention": "2-1"}

    page = admin_client.get(f"{IDENTITY_BASE}{created.json()['public_id']}")
    assert _firsts(page.json()) == {**NONE, "first_mention": "2-1"}


def test_an_identity_never_takes_its_characters_firsts(
    admin_client, db_session, character
):
    # The character's values are set so an inheriting read would have
    # something to inherit; the identity's stay null.
    for key, value in FIRSTS.items():
        setattr(character, key, value)
    db_session.flush()
    created = admin_client.post(
        IDENTITY_BASE, json={"character_id": str(character.system_id), "name_en": "Conan"}
    ).json()
    assert _firsts(created) == NONE
    page = admin_client.get(f"{IDENTITY_BASE}{created['public_id']}").json()
    assert _firsts(page) == NONE
    nested = admin_client.get(f"/api/character/{character.public_id}").json()
    assert _firsts(nested["identities"][0]) == NONE
    assert _firsts(nested) == FIRSTS


def test_a_characters_firsts_are_not_its_identitys(admin_client, character):
    admin_client.post(
        IDENTITY_BASE,
        json={"character_id": str(character.system_id), "name_en": "Conan", **FIRSTS},
    )
    body = admin_client.get(f"/api/character/{character.public_id}").json()
    assert _firsts(body) == NONE
    assert _firsts(body["identities"][0]) == FIRSTS


# ---- Backup and Pull ------------------------------------------------------


def test_firsts_survive_backup_and_pull(db_session, sheets, monkeypatch, character):
    db = db_session
    for key, value in FIRSTS.items():
        setattr(character, key, value)
    identity = models.CharacterIdentity(
        system_id=uuid.uuid4(), character_id=character.system_id, name_en="Conan",
        first_mention="i-mention", first_appearance="i-appearance",
        first_encounter="i-encounter", position=0,
    )
    db.add(identity)
    db.flush()
    written = _backed_up(db, monkeypatch)
    for tab in ("Character", "Character Identity"):
        assert set(FIRSTS) <= set(written[tab][0]), tab

    for row in (character, identity):
        for key in FIRSTS:
            setattr(row, key, None)
    db.flush()

    sheets(written)
    pull.execute_pull_specific(db, "Character", log_action=False)
    pull.execute_pull_specific(db, "Character Identity", log_action=False)
    db.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    db.expire_all()

    assert _firsts(vars(db.get(models.Character, character.system_id))) == FIRSTS
    restored = db.get(models.CharacterIdentity, identity.system_id)
    assert (
        restored.first_mention, restored.first_appearance, restored.first_encounter
    ) == ("i-mention", "i-appearance", "i-encounter")


def test_a_sheet_from_before_the_firsts_leaves_them_alone(
    db_session, sheets, monkeypatch, character
):
    db = db_session
    written = _backed_up(db, monkeypatch)
    # The same tab with the three headers - and their cells - taken out, as a
    # backup from before the columns existed would be.
    header, *rows = written["Character"]
    keep = [i for i, h in enumerate(header) if h not in FIRSTS]
    old_tab = [[row[i] if i < len(row) else "" for i in keep] for row in [header, *rows]]
    for key, value in FIRSTS.items():
        setattr(character, key, value)
    db.flush()

    sheets({"Character": old_tab})
    pull.execute_pull_specific(db, "Character", log_action=False)
    db.expire_all()

    assert _firsts(vars(db.get(models.Character, character.system_id))) == FIRSTS
