"""
A casting's seiyuu: several per character, and one seiyuu across several
characters.

`anime`, `character` and `manga_entry` live in tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


@pytest.fixture
def people(db_session):
    rows = [
        models.Person(system_id=uuid.uuid4(), name_en="Voice A"),
        models.Person(system_id=uuid.uuid4(), name_en="Voice B"),
    ]
    db_session.add_all(rows)
    db_session.commit()
    return rows


@pytest.fixture
def second_character(db_session):
    c = models.Character(system_id=uuid.uuid4(), name_en="Yuki")
    db_session.add(c)
    db_session.commit()
    return c


def _put(client, media_type, entry_id, cast):
    return client.put(f"/api/casting/{media_type}/{entry_id}", json={"cast": cast})


def _get(client, media_type, entry_id):
    return client.get(f"/api/casting/{media_type}/{entry_id}").json()["cast"]


def test_one_character_keeps_two_seiyuu_in_order(admin_client, anime, character, people):
    a, b = people
    r = _put(admin_client, "anime", anime.system_id, [{
        "character_id": str(character.system_id),
        "voices": [
            {"person_id": str(b.system_id), "remark": "child"},
            {"person_id": str(a.system_id)},
        ],
    }])
    assert r.status_code == 200, r.text

    voices = _get(admin_client, "anime", anime.system_id)[0]["voices"]
    assert [v["person_name"] for v in voices] == ["Voice B", "Voice A"]
    assert [v["remark"] for v in voices] == ["child", None]


def test_one_seiyuu_voices_two_characters(
    admin_client, anime, character, second_character, people
):
    a, _ = people
    voice = [{"person_id": str(a.system_id)}]
    r = _put(admin_client, "anime", anime.system_id, [
        {"character_id": str(character.system_id), "voices": voice},
        {"character_id": str(second_character.system_id), "voices": voice},
    ])
    assert r.status_code == 200, r.text

    cast = _get(admin_client, "anime", anime.system_id)
    assert [row["voices"][0]["person_name"] for row in cast] == ["Voice A", "Voice A"]

    groups = admin_client.get(f"/api/person/{a.system_id}/entries").json()["groups"]
    seiyuu = [g for g in groups if g["role"] == "seiyuu"]
    names = {e["character_name"] for g in seiyuu for e in g["entries"]}
    assert names == {character.display_name, second_character.display_name}


def test_the_same_seiyuu_twice_on_one_character_is_a_422(
    admin_client, anime, character, people
):
    a, _ = people
    r = _put(admin_client, "anime", anime.system_id, [{
        "character_id": str(character.system_id),
        "voices": [{"person_id": str(a.system_id)}, {"person_id": str(a.system_id)}],
    }])
    assert r.status_code == 422


def test_a_repeated_put_replaces_the_voices(admin_client, anime, character, people):
    a, b = people
    row = {"character_id": str(character.system_id)}
    _put(admin_client, "anime", anime.system_id, [
        {**row, "voices": [{"person_id": str(a.system_id)}]},
    ])
    _put(admin_client, "anime", anime.system_id, [
        {**row, "voices": [{"person_id": str(b.system_id)}]},
    ])
    voices = _get(admin_client, "anime", anime.system_id)[0]["voices"]
    assert [v["person_name"] for v in voices] == ["Voice B"]


def test_character_entries_list_every_seiyuu(admin_client, anime, character, people):
    a, b = people
    _put(admin_client, "anime", anime.system_id, [{
        "character_id": str(character.system_id),
        "voices": [{"person_id": str(a.system_id)}, {"person_id": str(b.system_id)}],
    }])
    groups = admin_client.get(f"/api/character/{character.system_id}/entries").json()
    entry = groups["groups"][0]["entries"][0]
    assert [s["display_name"] for s in entry["seiyuu"]] == ["Voice A", "Voice B"]


# --- the database's own guarantees -------------------------------------------


def test_a_voice_cannot_disagree_with_its_casting(db_session, anime, character, people):
    """The composite FK: a voice's (media_type, entry_id) must be its casting's."""
    casting = models.CharacterCasting(
        character_id=character.system_id, media_type="anime", entry_id=anime.system_id
    )
    db_session.add(casting)
    db_session.flush()
    db_session.add(
        models.CharacterCastingVoice(
            casting_id=casting.system_id,
            media_type="anime",
            entry_id=uuid.uuid4(),
            person_id=people[0].system_id,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_a_manga_casting_cannot_carry_a_voice(db_session, manga_entry, character, people):
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id,
            media_type="manga",
            entry_id=manga_entry.system_id,
            voices=[
                models.CharacterCastingVoice(
                    media_type="manga",
                    entry_id=manga_entry.system_id,
                    person_id=people[0].system_id,
                )
            ],
        )
    )
    with pytest.raises(IntegrityError, match="ck_casting_voice_scope"):
        db_session.flush()
    db_session.rollback()


# --- merges ------------------------------------------------------------------


def _cast(db_session, character, entry, *people):
    casting = models.CharacterCasting(
        character_id=character.system_id,
        media_type="anime",
        entry_id=entry.system_id,
        voices=[
            models.CharacterCastingVoice(
                media_type="anime", entry_id=entry.system_id, person_id=p.system_id
            )
            for p in people
        ],
    )
    db_session.add(casting)
    db_session.commit()
    return casting


def test_merging_a_person_moves_their_voices(
    admin_client, db_session, anime, character, second_character, people
):
    keep, drop = people
    _cast(db_session, character, anime, drop)
    # Both voice the second character: the survivor's row stands for both.
    _cast(db_session, second_character, anime, keep, drop)

    r = admin_client.post(
        f"/api/person/{keep.system_id}/merge", json={"source_id": str(drop.system_id)}
    )
    assert r.status_code == 200, r.text

    cast = _get(admin_client, "anime", anime.system_id)
    assert [[v["person_name"] for v in row["voices"]] for row in cast] == [
        ["Voice A"],
        ["Voice A"],
    ]


def test_merging_characters_folds_the_voices_on_a_shared_entry(
    admin_client, db_session, anime, character, second_character, people
):
    a, b = people
    _cast(db_session, character, anime, a)
    _cast(db_session, second_character, anime, b)

    r = admin_client.post(
        f"/api/character/{character.system_id}/merge",
        json={"source_id": str(second_character.system_id)},
    )
    assert r.status_code == 200, r.text

    cast = _get(admin_client, "anime", anime.system_id)
    assert len(cast) == 1
    assert [v["person_name"] for v in cast[0]["voices"]] == ["Voice A", "Voice B"]
