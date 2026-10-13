"""
A cast row's credited_name: the name the character goes by in that one entry.

It is written by the cast editor's PUT and read back by every payload that
carries a cast row - the entry's cast, a character's appearances and an
identity's appearances. It survives Backup and Pull, a character merge and an
identity fold, and nothing that fills cast rows from elsewhere (Calculate's
fill from originals) ever writes or clears it.
"""

import uuid

import pytest
from sqlalchemy import text

from app import models
from app.services.domain import casting_sync
from app.services.pipelines import backup, pull


@pytest.fixture
def identity(db_session, character):
    i = models.CharacterIdentity(
        system_id=uuid.uuid4(), character_id=character.system_id, name_en="Conan"
    )
    db_session.add(i)
    db_session.flush()
    return i


def _put(admin_client, anime, rows):
    return admin_client.put(f"/api/casting/anime/{anime.system_id}", json={"cast": rows})


def _cast(client, anime):
    return client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"]


def _entries(payload):
    return [entry for group in payload["groups"] for entry in group["entries"]]


def test_a_credited_name_round_trips_through_the_cast_editor(admin_client, anime, character):
    r = _put(admin_client, anime, [
        {"character_id": str(character.system_id), "credited_name": "AAA"},
    ])
    assert r.status_code == 200, r.text
    assert [row["credited_name"] for row in _cast(admin_client, anime)] == ["AAA"]


def test_a_blank_credited_name_saves_as_none(admin_client, db_session, anime, character):
    assert _put(admin_client, anime, [
        {"character_id": str(character.system_id), "credited_name": "   "},
    ]).status_code == 200
    assert [row["credited_name"] for row in _cast(admin_client, anime)] == [None]
    db_session.expire_all()
    casting = db_session.query(models.CharacterCasting).filter_by(entry_id=anime.system_id).one()
    assert casting.credited_name is None


def test_a_credited_name_is_trimmed(admin_client, anime, character):
    assert _put(admin_client, anime, [
        {"character_id": str(character.system_id), "credited_name": "  AAA "},
    ]).status_code == 200
    assert [row["credited_name"] for row in _cast(admin_client, anime)] == ["AAA"]


def test_a_second_save_without_it_clears_it(admin_client, anime, character):
    """The PUT replaces the whole cast: a row sent with no credited_name has none."""
    _put(admin_client, anime, [{"character_id": str(character.system_id), "credited_name": "AAA"}])
    _put(admin_client, anime, [{"character_id": str(character.system_id)}])
    assert [row["credited_name"] for row in _cast(admin_client, anime)] == [None]


def test_the_character_page_carries_each_appearance_s_credited_name(
    client, admin_client, anime, character
):
    _put(admin_client, anime, [{"character_id": str(character.system_id), "credited_name": "AAA"}])
    entries = _entries(client.get(f"/api/character/{character.system_id}/entries").json())
    assert [e["credited_name"] for e in entries] == ["AAA"]


def test_the_identity_page_carries_each_appearance_s_credited_name(
    client, admin_client, anime, character, identity
):
    _put(admin_client, anime, [
        {"character_id": str(character.system_id)},
        {
            "character_id": str(character.system_id),
            "identity_id": str(identity.system_id),
            "credited_name": "Edogawa",
        },
    ])
    entries = _entries(client.get(f"/api/character-identity/{identity.system_id}/entries").json())
    assert [e["credited_name"] for e in entries] == ["Edogawa"]


def test_backup_and_pull_carry_the_credited_name(db_session, monkeypatch, character, anime):
    casting = models.CharacterCasting(
        character_id=character.system_id, media_type="anime",
        entry_id=anime.system_id, credited_name="AAA",
    )
    db_session.add(casting)
    db_session.flush()

    written = {}

    def record(tab, matrix):
        written[tab] = matrix
        return True

    monkeypatch.setattr(backup, "bulk_overwrite_sheet", record)
    backup.execute_backup(db_session)
    assert "credited_name" in written["Character Casting"][0]

    db_session.delete(casting)
    db_session.flush()
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: written[tab])
    pull.execute_pull_specific(db_session, "Character Casting", log_action=False)
    db_session.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))

    restored = db_session.query(models.CharacterCasting).filter_by(entry_id=anime.system_id).one()
    assert restored.credited_name == "AAA"


def test_a_casting_tab_without_the_column_restores_no_credited_name(
    db_session, monkeypatch, character, anime
):
    header = ["system_id", "character_id", "media_type", "entry_id", "position"]
    values = [str(uuid.uuid4()), str(character.system_id), "anime", str(anime.system_id), "0"]
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [header, values])
    pull.execute_pull_specific(db_session, "Character Casting", log_action=False)
    restored = db_session.query(models.CharacterCasting).filter_by(entry_id=anime.system_id).one()
    assert restored.credited_name is None


def test_calculate_never_clears_a_credited_name(db_session, character, anime):
    # A role-less casting gives Calculate something to fill, so the run does
    # touch the row; the credited name has to come through it untouched.
    casting = models.CharacterCasting(
        character_id=character.system_id, media_type="anime",
        entry_id=anime.system_id, credited_name="AAA", role="Main",
    )
    db_session.add(casting)
    db_session.flush()
    casting_sync.fill_cast_and_characters(db_session)
    db_session.flush()
    db_session.expire_all()
    assert db_session.get(models.CharacterCasting, casting.system_id).credited_name == "AAA"


def _merge(admin_client, keep, drop):
    r = admin_client.post(
        f"/api/character/{keep.system_id}/merge", json={"source_id": str(drop.system_id)}
    )
    assert r.status_code == 200, r.text


def _character(db_session, name):
    c = models.Character(system_id=uuid.uuid4(), name_en=name)
    db_session.add(c)
    db_session.commit()
    return c


def test_a_merge_carries_the_loser_s_credited_name_onto_its_own_casting(
    admin_client, db_session, anime
):
    keep = _character(db_session, "A")
    drop = _character(db_session, "B")
    db_session.add(models.CharacterCasting(
        character_id=drop.system_id, media_type="anime",
        entry_id=anime.system_id, credited_name="AAA",
    ))
    db_session.commit()
    _merge(admin_client, keep, drop)

    db_session.expire_all()
    casting = db_session.query(models.CharacterCasting).filter_by(character_id=keep.system_id).one()
    assert casting.credited_name == "AAA"


def test_a_merge_fills_a_blank_credited_name_and_keeps_a_held_one(
    admin_client, db_session, anime, manga_entry
):
    keep = _character(db_session, "A")
    drop = _character(db_session, "B")
    # Both are cast in both entries: in the anime the survivor has none of
    # its own, in the manga it has one that must win.
    for character, media_type, entry, name in (
        (keep, "anime", anime, None),
        (drop, "anime", anime, "AAA"),
        (keep, "manga", manga_entry, "Mine"),
        (drop, "manga", manga_entry, "Theirs"),
    ):
        db_session.add(models.CharacterCasting(
            character_id=character.system_id, media_type=media_type,
            entry_id=entry.system_id, credited_name=name,
        ))
    db_session.commit()
    _merge(admin_client, keep, drop)

    db_session.expire_all()
    names = {
        c.media_type: c.credited_name
        for c in db_session.query(models.CharacterCasting).filter_by(character_id=keep.system_id)
    }
    assert names == {"anime": "AAA", "manga": "Mine"}


@pytest.fixture
def manga_entry(db_session, sample_franchise):
    m = models.Manga(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        manga_name_en="Test Manga",
    )
    db_session.add(m)
    db_session.commit()
    return m


def test_an_identity_fold_keeps_the_credited_name(admin_client, db_session, character, anime, identity):
    row = models.CharacterCasting(
        character_id=character.system_id, identity_id=identity.system_id,
        media_type="anime", entry_id=anime.system_id, credited_name="Edogawa",
    )
    db_session.add(row)
    db_session.flush()
    row_id = row.system_id
    r = admin_client.delete(f"/api/character-identity/{identity.system_id}?castings=1")
    assert r.status_code == 200, r.text
    db_session.expire_all()
    folded = db_session.get(models.CharacterCasting, row_id)
    assert (folded.identity_id, folded.credited_name) == (None, "Edogawa")
