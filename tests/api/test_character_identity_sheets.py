"""Character Identity travels through Backup and Pull, and so does a cast row's identity_id."""

import uuid

import pytest
from sqlalchemy import text

from app import models
from app.services.pipelines import backup, pull
from app.services.pipelines.tabs import TAB_BY_NAME


@pytest.fixture
def db(db_session):
    return db_session


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


def test_the_tab_is_registered():
    assert TAB_BY_NAME["Character Identity"].model is models.CharacterIdentity


def test_identities_and_cast_identity_round_trip(db, sheets, monkeypatch, character, anime):
    identity = models.CharacterIdentity(
        system_id=uuid.uuid4(), character_id=character.system_id,
        name_en="Conan", gender="男", remark="glasses", position=0,
    )
    db.add(identity)
    db.flush()
    casting = models.CharacterCasting(
        character_id=character.system_id, identity_id=identity.system_id,
        media_type="anime", entry_id=anime.system_id,
    )
    db.add(casting)
    db.flush()
    written = _backed_up(db, monkeypatch)
    assert "identity_id" in written["Character Casting"][0]

    db.delete(casting)
    db.delete(identity)
    db.flush()

    # get_all_raw_rows returns the tab as a matrix (header row first), which
    # is exactly what Backup wrote.
    sheets(written)
    pull.execute_pull_specific(db, "Character Identity", log_action=False)
    pull.execute_pull_specific(db, "Character Casting", log_action=False)
    db.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))

    restored = db.get(models.CharacterIdentity, identity.system_id)
    assert (restored.name_en, restored.remark, restored.character_id) == (
        "Conan", "glasses", character.system_id,
    )
    row = db.query(models.CharacterCasting).filter_by(entry_id=anime.system_id).one()
    assert row.identity_id == identity.system_id


def test_a_casting_tab_without_identity_id_restores_main_rows(db, sheets, character, anime):
    header = ["system_id", "character_id", "media_type", "entry_id", "position"]
    values = [
        str(uuid.uuid4()), str(character.system_id), "anime", str(anime.system_id), "0",
    ]
    sheets({"Character Casting": [header, values]})
    pull.execute_pull_specific(db, "Character Casting", log_action=False)
    db.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    restored = db.query(models.CharacterCasting).filter_by(entry_id=anime.system_id).one()
    assert restored.identity_id is None
