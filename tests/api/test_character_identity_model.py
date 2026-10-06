"""
character_identity and character_casting.identity_id at the database level.

fk_casting_identity is DEFERRABLE INITIALLY DEFERRED, and the test session
never really commits (its commit releases a SAVEPOINT), so every test that
needs the FK to bite sets the constraints IMMEDIATE first.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models


def _immediate(db):
    db.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))


def _identity(db, character, **names):
    identity = models.CharacterIdentity(
        system_id=uuid.uuid4(), character_id=character.system_id, **(names or {"name_en": "Conan"})
    )
    db.add(identity)
    db.flush()
    return identity


def _casting(db, character, anime, identity=None):
    row = models.CharacterCasting(
        character_id=character.system_id,
        identity_id=identity.system_id if identity else None,
        media_type="anime",
        entry_id=anime.system_id,
    )
    db.add(row)
    db.flush()
    return row


def test_an_identity_needs_a_name(db_session, character):
    db_session.add(models.CharacterIdentity(system_id=uuid.uuid4(), character_id=character.system_id))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_display_name_follows_display_name_field(db_session, character):
    identity = _identity(db_session, character, name_en="Conan", name_jp="コナン")
    identity.display_name_field = "jp"
    assert identity.display_name == "コナン"


def test_identities_are_ordered_by_position(db_session, character):
    second = _identity(db_session, character, name_en="B")
    first = _identity(db_session, character, name_en="A")
    second.position, first.position = 1, 0
    db_session.flush()
    db_session.expire(character)
    assert [i.name_en for i in character.identities] == ["A", "B"]


def test_main_and_identity_rows_may_share_an_entry(db_session, character, anime):
    identity = _identity(db_session, character)
    _casting(db_session, character, anime)
    _casting(db_session, character, anime, identity)
    _immediate(db_session)


def test_the_main_identity_is_cast_once_per_entry(db_session, character, anime):
    # NULLS NOT DISTINCT: two NULL identity_ids collide. Without it Postgres
    # treats them as different and both rows would be stored.
    _casting(db_session, character, anime)
    with pytest.raises(IntegrityError):
        _casting(db_session, character, anime)


def test_an_identity_of_another_character_is_refused(db_session, character, second_character, anime):
    stranger = _identity(db_session, second_character)
    _casting(db_session, character, anime, stranger)
    with pytest.raises(IntegrityError):
        _immediate(db_session)


def test_deleting_a_character_deletes_its_identities(db_session, character):
    identity_id = _identity(db_session, character).system_id
    db_session.delete(character)
    db_session.flush()
    assert db_session.get(models.CharacterIdentity, identity_id) is None
