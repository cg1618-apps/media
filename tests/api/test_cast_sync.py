"""
Cast rows and their originals: the cast editor's "Sync from original"
(/api/casting/originals), the character page's "Sync from cast"
(/api/character/{id}/sync-from-cast) and the fill-only pass Calculate All
runs (casting_sync.fill_cast_and_characters).
"""

import uuid
from datetime import datetime, timedelta

import pytest

from app import models
from app.services.domain.casting_sync import fill_cast_and_characters
from tests.api.conftest import hidden_anime, nsfw_label  # noqa: F401


def _anime(db, franchise, name):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        anime_name_en=name,
        airing_type="TV",
        airing_status="Finished Airing",
    )
    db.add(entry)
    db.flush()
    return entry


def _person(db, name):
    p = models.Person(system_id=uuid.uuid4(), name_jp=name)
    db.add(p)
    db.flush()
    return p


def _cast(db, entry, character, *, media_type="anime", people=(), age_days=0, **fields):
    casting = models.CharacterCasting(
        character_id=character.system_id,
        media_type=media_type,
        entry_id=entry.system_id,
        created_at=datetime(2026, 1, 1) + timedelta(days=age_days),
        **fields,
    )
    casting.voices = [
        models.CharacterCastingVoice(
            media_type=media_type, entry_id=entry.system_id, person_id=p.system_id, position=i
        )
        for i, p in enumerate(people)
    ]
    db.add(casting)
    db.flush()
    return casting


@pytest.fixture
def seasons(db_session, sample_franchise):
    return [_anime(db_session, sample_franchise, f"Season {n}") for n in (1, 2, 3, 4)]


@pytest.fixture
def kana(db_session):
    return _person(db_session, "花澤香菜")


@pytest.fixture
def ayane(db_session):
    return _person(db_session, "佐倉綾音")


# -- /api/casting/originals --------------------------------------------------


def test_originals_carry_the_characters_role_but_never_its_remark(
    admin_client, db_session, seasons, character
):
    character.role = "Main"
    character.remark = "The lead."
    db_session.flush()

    r = admin_client.post("/api/casting/originals", json={
        "media_type": "anime",
        "entry_id": str(seasons[0].system_id),
        "rows": [{"character_id": str(character.system_id)}],
    })

    assert r.status_code == 200
    [original] = r.json()["originals"]
    assert original["role"] == "Main"
    # A remark travels from cast row to character only, never back.
    assert "remark" not in original


def test_an_identity_rows_original_is_the_identity_with_the_characters_role(
    admin_client, db_session, seasons, character
):
    character.role = "Main"
    character.remark = "The character's remark."
    identity = models.CharacterIdentity(
        character_id=character.system_id, name_en="Masked", remark="The disguise."
    )
    db_session.add(identity)
    db_session.flush()

    r = admin_client.post("/api/casting/originals", json={
        "media_type": "anime",
        "rows": [{
            "character_id": str(character.system_id),
            "identity_id": str(identity.system_id),
        }],
    })

    [original] = r.json()["originals"]
    assert original["role"] == "Main"
    assert "remark" not in original


def test_original_seiyuu_are_the_most_used_voice_list_on_other_entries(
    admin_client, db_session, seasons, character, kana, ayane
):
    _cast(db_session, seasons[0], character, people=[ayane], age_days=0)
    _cast(db_session, seasons[1], character, people=[kana], age_days=1)
    _cast(db_session, seasons[2], character, people=[kana], age_days=2)
    # The entry being edited: its own row must not vote, or a list it holds
    # three times over would win.
    _cast(db_session, seasons[3], character, people=[ayane], age_days=3)

    r = admin_client.post("/api/casting/originals", json={
        "media_type": "anime",
        "entry_id": str(seasons[3].system_id),
        "rows": [{"character_id": str(character.system_id)}],
    })

    [original] = r.json()["originals"]
    assert [v["person_id"] for v in original["voices"]] == [str(kana.system_id)]
    assert original["voices"][0]["person_name"] == kana.display_name


def test_a_tie_between_voice_lists_goes_to_the_oldest_cast_row(
    admin_client, db_session, seasons, character, kana, ayane
):
    _cast(db_session, seasons[0], character, people=[kana], age_days=5)
    _cast(db_session, seasons[1], character, people=[ayane], age_days=1)

    r = admin_client.post("/api/casting/originals", json={
        "media_type": "anime",
        "rows": [{"character_id": str(character.system_id)}],
    })

    [original] = r.json()["originals"]
    assert [v["person_id"] for v in original["voices"]] == [str(ayane.system_id)]


def test_an_unvoiced_type_gets_no_original_seiyuu(
    admin_client, db_session, seasons, character, kana
):
    _cast(db_session, seasons[0], character, people=[kana])

    r = admin_client.post("/api/casting/originals", json={
        "media_type": "manga",
        "rows": [{"character_id": str(character.system_id)}],
    })

    assert r.json()["originals"][0]["voices"] == []


def test_a_seiyuu_on_a_hidden_entry_does_not_surface_as_an_original(
    catalog_writer, db_session, seasons, hidden_anime, character, kana, ayane  # noqa: F811
):
    # The hidden row is the only one with kana. A viewer who can see it gets
    # kana (the mirror case below), so the refusal is the label's doing.
    _cast(db_session, hidden_anime, character, people=[kana], age_days=0)
    _cast(db_session, seasons[0], character, people=[ayane], age_days=1)
    _cast(db_session, seasons[1], character, people=[kana], age_days=2)
    body = {
        "media_type": "anime",
        "entry_id": str(seasons[1].system_id),
        "rows": [{"character_id": str(character.system_id)}],
    }

    blind = catalog_writer()
    [original] = blind.post("/api/casting/originals", json=body).json()["originals"]
    assert [v["person_id"] for v in original["voices"]] == [str(ayane.system_id)]

    sighted = catalog_writer("sighted", label_keys=("nsfw",))
    [original] = sighted.post("/api/casting/originals", json=body).json()["originals"]
    assert [v["person_id"] for v in original["voices"]] == [str(kana.system_id)]


def test_originals_refuse_a_type_nobody_casts(admin_client, character):
    r = admin_client.post("/api/casting/originals", json={
        "media_type": "movie",
        "rows": [{"character_id": str(character.system_id)}],
    })
    assert r.status_code == 422


def test_originals_need_manage_catalog(client, character):
    r = client.post("/api/casting/originals", json={
        "media_type": "anime",
        "rows": [{"character_id": str(character.system_id)}],
    })
    assert r.status_code in (401, 403)


# -- /api/character/{id}/sync-from-cast --------------------------------------


def test_sync_from_cast_replaces_role_remark_and_photo(
    admin_client, db_session, seasons, character
):
    character.role = "Supporting"
    character.remark = "Old remark."
    casting = _cast(
        db_session, seasons[0], character,
        role="Main", remark="New remark.", photo_file="anime/s1-ichika.jpg",
        photo_focus="20% 30%",
    )

    r = admin_client.post(
        f"/api/character/{character.system_id}/sync-from-cast",
        json={"casting_id": str(casting.system_id)},
    )

    assert r.status_code == 200
    db_session.refresh(character)
    assert character.role == "Main"
    assert character.remark == "New remark."
    assert character.photo_file == "anime/s1-ichika.jpg"
    assert character.photo_focus == "20% 30%"


def test_sync_from_cast_keeps_what_the_cast_row_does_not_hold(
    admin_client, db_session, seasons, character
):
    character.role = "Supporting"
    character.remark = "Kept."
    casting = _cast(db_session, seasons[0], character)

    r = admin_client.post(
        f"/api/character/{character.system_id}/sync-from-cast",
        json={"casting_id": str(casting.system_id)},
    )

    assert r.status_code == 200
    db_session.refresh(character)
    assert character.role == "Supporting"
    assert character.remark == "Kept."
    assert character.photo_file == "characters/ichika.jpg"


def test_sync_from_an_identity_row_writes_the_identity(
    admin_client, db_session, seasons, character
):
    character.remark = "The character's."
    identity = models.CharacterIdentity(character_id=character.system_id, name_en="Masked")
    db_session.add(identity)
    db_session.flush()
    casting = _cast(
        db_session, seasons[0], character, identity_id=identity.system_id,
        remark="Behind the mask.",
    )

    admin_client.post(
        f"/api/character/{character.system_id}/sync-from-cast",
        json={"casting_id": str(casting.system_id)},
    )

    db_session.refresh(character)
    db_session.refresh(identity)
    assert identity.remark == "Behind the mask."
    assert character.remark == "The character's."


def test_sync_from_another_characters_cast_row_is_404(
    admin_client, db_session, seasons, character, second_character
):
    casting = _cast(db_session, seasons[0], second_character, remark="Not yours.")

    r = admin_client.post(
        f"/api/character/{character.system_id}/sync-from-cast",
        json={"casting_id": str(casting.system_id)},
    )

    assert r.status_code == 404
    db_session.refresh(character)
    assert character.remark is None


def test_sync_from_a_cast_row_on_a_hidden_entry_is_404(
    catalog_writer, db_session, seasons, hidden_anime, character  # noqa: F811
):
    # The visible row passes on the same client: the 404 is the label's.
    hidden = _cast(db_session, hidden_anime, character, remark="Hidden.")
    visible = _cast(db_session, seasons[0], character, remark="Visible.")
    writer = catalog_writer()

    refused = writer.post(
        f"/api/character/{character.system_id}/sync-from-cast",
        json={"casting_id": str(hidden.system_id)},
    )
    allowed = writer.post(
        f"/api/character/{character.system_id}/sync-from-cast",
        json={"casting_id": str(visible.system_id)},
    )

    assert refused.status_code == 404
    assert allowed.status_code == 200


# -- fill_cast_and_characters -------------------------------------------------


def test_fill_gives_empty_cast_rows_the_originals_values(
    db_session, seasons, character, kana
):
    character.role = "Main"
    character.remark = "The lead."
    _cast(db_session, seasons[0], character, people=[kana], role="Main", remark="S1.")
    empty = _cast(db_session, seasons[1], character)

    fill_cast_and_characters(db_session)

    db_session.refresh(empty)
    assert empty.role == "Main"
    # The character holds a remark, and it still does not come down.
    assert empty.remark is None
    assert [v.person_id for v in empty.voices] == [kana.system_id]
    assert empty.photo_file is None


def test_fill_never_overwrites(db_session, seasons, character, kana, ayane):
    character.role = "Main"
    character.remark = "The character's."
    held = _cast(
        db_session, seasons[0], character, people=[ayane],
        role="Supporting", remark="The row's.",
    )
    _cast(db_session, seasons[1], character, people=[kana], age_days=-1)
    _cast(db_session, seasons[2], character, people=[kana], age_days=-2)

    fill_cast_and_characters(db_session)

    db_session.refresh(held)
    db_session.refresh(character)
    assert held.role == "Supporting"
    assert held.remark == "The row's."
    assert [v.person_id for v in held.voices] == [ayane.system_id]
    assert character.role == "Main"
    assert character.remark == "The character's."
    assert character.photo_file == "characters/ichika.jpg"


def test_fill_gives_an_empty_character_its_highest_ranked_rows_values(
    db_session, seasons, second_character
):
    _cast(
        db_session, seasons[0], second_character, role="Supporting",
        remark="Supporting remark.", photo_file="anime/supporting.jpg", age_days=0,
    )
    _cast(
        db_session, seasons[1], second_character, role="Main",
        remark="Main remark.", photo_file="anime/main.jpg", age_days=1,
    )

    fill_cast_and_characters(db_session)

    db_session.refresh(second_character)
    assert second_character.role == "Main"
    assert second_character.remark == "Main remark."
    assert second_character.photo_file == "anime/main.jpg"


def test_fill_converges_in_one_run(db_session, seasons, second_character):
    # The character is empty and fills from the S1 row; the S2 row is empty
    # and then fills from the character - in the same run. The remark goes
    # up to the character and stops there.
    _cast(db_session, seasons[0], second_character, role="Main", remark="From S1.")
    empty = _cast(db_session, seasons[1], second_character)

    first = fill_cast_and_characters(db_session)
    second = fill_cast_and_characters(db_session)

    db_session.refresh(empty)
    db_session.refresh(second_character)
    assert second_character.remark == "From S1."
    assert empty.role == "Main"
    assert empty.remark is None
    assert first["cast_role"] == 1
    assert "cast_remark" not in first
    assert all(count == 0 for count in second.values())


def test_fill_leaves_unvoiced_rows_without_seiyuu(
    db_session, seasons, manga, character, kana
):
    _cast(db_session, seasons[0], character, people=[kana])
    on_manga = _cast(db_session, manga, character, media_type="manga")

    fill_cast_and_characters(db_session)

    db_session.refresh(on_manga)
    assert on_manga.voices == []


def test_calculate_sync_cast_endpoint_runs_the_fill(
    admin_client, db_session, seasons, character
):
    character.role = "Main"
    character.remark = "The lead."
    empty = _cast(db_session, seasons[0], character)

    r = admin_client.post("/api/data-control/calculate/sync-cast")

    assert r.status_code == 200
    assert r.json()["counts"]["cast_role"] == 1
    assert "cast_remark" not in r.json()["counts"]
    db_session.refresh(empty)
    assert empty.role == "Main"
    assert empty.remark is None
