"""
A cast row's remark: free text about the character in that one entry.

It is written by the cast editor's PUT and read back by every payload that
carries a cast row - the entry's cast, a character's and an identity's
appearances, and a seiyuu's voiced parts. On the seiyuu's payload it is
`casting_remark`, beside the `voice_remark` that belongs to their own voice on
the row.
"""

import uuid

from app import models


def _put(admin_client, anime, rows):
    return admin_client.put(f"/api/casting/anime/{anime.system_id}", json={"cast": rows})


def _entries(payload):
    return [entry for group in payload["groups"] for entry in group["entries"]]


def test_the_entry_cast_carries_each_row_s_remark(client, admin_client, anime, character):
    _put(admin_client, anime, [{"character_id": str(character.system_id), "remark": "flashback only"}])
    cast = client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"]
    assert [row["remark"] for row in cast] == ["flashback only"]


def test_the_character_page_carries_each_appearance_s_remark(
    client, admin_client, anime, character
):
    _put(admin_client, anime, [{"character_id": str(character.system_id), "remark": "flashback only"}])
    entries = _entries(client.get(f"/api/character/{character.system_id}/entries").json())
    assert [e["remark"] for e in entries] == ["flashback only"]


def test_the_identity_page_carries_each_appearance_s_remark(
    client, admin_client, db_session, anime, character
):
    identity = models.CharacterIdentity(
        system_id=uuid.uuid4(), character_id=character.system_id, name_en="Conan"
    )
    db_session.add(identity)
    db_session.flush()
    _put(admin_client, anime, [
        {
            "character_id": str(character.system_id),
            "identity_id": str(identity.system_id),
            "remark": "disguised",
        },
    ])
    entries = _entries(client.get(f"/api/character-identity/{identity.system_id}/entries").json())
    assert [e["remark"] for e in entries] == ["disguised"]


def test_the_seiyuu_page_carries_the_casting_remark_apart_from_the_voice_s(
    client, db_session, anime, seiyuu_with_one_casting
):
    casting = db_session.query(models.CharacterCasting).filter_by(entry_id=anime.system_id).one()
    casting.remark = "flashback only"
    casting.voices[0].remark = "child"
    db_session.commit()

    groups = client.get(f"/api/person/{seiyuu_with_one_casting.system_id}/entries").json()["groups"]
    (part,) = [e for g in groups if g["role"] == "seiyuu" for e in g["entries"]]
    assert part["casting_remark"] == "flashback only"
    assert part["voice_remark"] == "child"
