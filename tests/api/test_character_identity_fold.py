"""
Deleting an identity never deletes cast history: each of its cast rows either
becomes the main identity's row in that entry, or - when the main identity is
already cast there - is folded into that row, seiyuu unioned.

Every fold test gives the two rows DIFFERENT seiyuu, so the union has
something to prove, and a main row with a blank remark, so filling has
something to fill.
"""

import uuid

import pytest
from sqlalchemy import text

from app import models


@pytest.fixture
def identity(db_session, character):
    i = models.CharacterIdentity(system_id=uuid.uuid4(), character_id=character.system_id, name_en="Conan")
    db_session.add(i)
    db_session.flush()
    return i


def _person(db, name):
    p = models.Person(system_id=uuid.uuid4(), name_jp=name)
    db.add(p)
    db.flush()
    return p


def _row(db, character, anime, identity=None, person=None, remark=None):
    row = models.CharacterCasting(
        character_id=character.system_id,
        identity_id=identity.system_id if identity else None,
        media_type="anime",
        entry_id=anime.system_id,
        remark=remark,
    )
    if person is not None:
        row.voices = [models.CharacterCastingVoice(media_type="anime", entry_id=anime.system_id, person_id=person.system_id)]
    db.add(row)
    db.flush()
    return row


def _delete(admin_client, identity, count):
    return admin_client.delete(f"/api/character-identity/{identity.system_id}?castings={count}")


def test_a_stale_count_is_409(admin_client, db_session, character, anime, identity):
    _row(db_session, character, anime, identity)
    assert _delete(admin_client, identity, 0).status_code == 409


def test_a_lone_identity_row_becomes_the_main_row(admin_client, db_session, character, anime, identity):
    takayama = _person(db_session, "高山みなみ")
    row_id = _row(db_session, character, anime, identity, takayama, remark="glasses").system_id
    assert _delete(admin_client, identity, 1).status_code == 200
    db_session.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))  # check the deferred composite FK
    db_session.expire_all()
    row = db_session.get(models.CharacterCasting, row_id)
    assert row.identity_id is None
    assert row.remark == "glasses"
    assert [v.person_id for v in row.voices] == [takayama.system_id]
    assert db_session.get(models.CharacterIdentity, identity.system_id) is None


def test_fold_keeps_the_main_row_main(admin_client, db_session, character, anime, identity):
    yamaguchi = _person(db_session, "山口勝平")
    takayama = _person(db_session, "高山みなみ")
    main_id = _row(db_session, character, anime, None, yamaguchi).system_id
    _row(db_session, character, anime, identity, takayama, remark="as Conan")
    assert _delete(admin_client, identity, 1).status_code == 200
    db_session.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))  # check the deferred composite FK
    db_session.expire_all()
    rows = db_session.query(models.CharacterCasting).filter_by(character_id=character.system_id).all()
    assert [r.system_id for r in rows] == [main_id]
    assert rows[0].identity_id is None  # filling must not copy identity_id
    assert rows[0].remark == "as Conan"
    assert {v.person_id for v in rows[0].voices} == {yamaguchi.system_id, takayama.system_id}


def test_merge_moves_identities_to_the_survivor(admin_client, db_session, character, second_character, anime):
    stray = models.CharacterIdentity(system_id=uuid.uuid4(), character_id=second_character.system_id, name_en="Kid")
    db_session.add(stray)
    db_session.flush()
    _row(db_session, second_character, anime, stray)
    r = admin_client.post(f"/api/character/{character.system_id}/merge", json={"source_id": str(second_character.system_id)})
    assert r.status_code == 200
    db_session.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))  # check the deferred composite FK
    db_session.expire_all()
    moved = db_session.get(models.CharacterIdentity, stray.system_id)
    assert moved.character_id == character.system_id
    row = db_session.query(models.CharacterCasting).filter_by(identity_id=stray.system_id).one()
    assert row.character_id == character.system_id


def test_merge_places_moved_identities_after_the_survivors_highest_position(
    admin_client, db_session, character, second_character
):
    # Survivor positions have a gap (0 and 2), so counting identities (2) would
    # put the moved one on position 2, beside the survivor's own.
    for position in (0, 2):
        db_session.add(models.CharacterIdentity(
            system_id=uuid.uuid4(), character_id=character.system_id, name_en=f"Own{position}", position=position,
        ))
    stray = models.CharacterIdentity(system_id=uuid.uuid4(), character_id=second_character.system_id, name_en="Kid")
    db_session.add(stray)
    db_session.flush()
    r = admin_client.post(f"/api/character/{character.system_id}/merge", json={"source_id": str(second_character.system_id)})
    assert r.status_code == 200
    db_session.expire_all()
    assert db_session.get(models.CharacterIdentity, stray.system_id).position > 2


def test_merge_matches_castings_per_identity(admin_client, db_session, character, second_character, anime, identity):
    # The survivor's identity row and the loser's MAIN row share the entry but
    # not the identity, so they are different appearances and both survive.
    # The survivor's main row is created first so that matching on
    # (media_type, entry_id) alone would pick the identity row instead.
    a, b, c = (_person(db_session, n) for n in ("A", "B", "C"))
    main_id = _row(db_session, character, anime, None, a).system_id
    identity_row_id = _row(db_session, character, anime, identity, b).system_id
    _row(db_session, second_character, anime, None, c)
    r = admin_client.post(f"/api/character/{character.system_id}/merge", json={"source_id": str(second_character.system_id)})
    assert r.status_code == 200
    db_session.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    db_session.expire_all()
    rows = db_session.query(models.CharacterCasting).filter_by(character_id=character.system_id).all()
    assert sorted(str(r.identity_id) for r in rows) == sorted([str(identity.system_id), "None"])
    main = db_session.get(models.CharacterCasting, main_id)
    assert {v.person_id for v in main.voices} == {a.system_id, c.system_id}
    identity_row = db_session.get(models.CharacterCasting, identity_row_id)
    assert {v.person_id for v in identity_row.voices} == {b.system_id}
