"""
A character's MAL link, the fill it drives, and building a cast from MAL.

Tenrai and the picture download are patched at the names the code under test
imports them by, so these exercise the real router -> autofill and router ->
mal_cast wiring without a network call. The payloads are trimmed real Tenrai
v1 responses (/characters/11/full, /anime/5114/characters).

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain import mal_cast as mal_cast_module
from app.utils.formatter import parse_character_from_sheet
from app.utils.tenrai_utils import map_tenrai_cast, map_tenrai_to_character_data
from app.utils.utils import extract_mal_id_character

EDWARD_LINK = "https://myanimelist.net/character/11/Edward_Elric"

EDWARD = {
    "mal_id": 11,
    "url": EDWARD_LINK,
    "images": {"jpg": {"image_url": "https://cdn.myanimelist.net/images/characters/9/72533.jpg"}},
    "name": "Elric, Edward",
    "name_kanji": "エドワード・エルリック",
    "nicknames": ["Ed", "Fullmetal Alchemist"],
    "about": "Age: 15-16",
}

FMA_LINK = "https://myanimelist.net/anime/5114/Fullmetal_Alchemist__Brotherhood"


def _cast_item(char_id, name, role, voices):
    return {
        "character": {
            "mal_id": char_id,
            "url": f"https://myanimelist.net/character/{char_id}/x",
            "images": {"jpg": {"image_url": f"https://cdn.example/{char_id}.jpg"}},
            "name": name,
        },
        "role": role,
        "voice_actors": [
            {
                "person": {
                    "mal_id": pid,
                    "url": f"https://myanimelist.net/people/{pid}/x",
                    "name": pname,
                },
                "language": language,
            }
            for pid, pname, language in voices
        ],
    }


FMA_CAST = [
    _cast_item(11, "Elric, Edward", "Main", [
        (84, "Park, Romi", "Japanese"),
        (1, "Mignogna, Vic", "English"),
    ]),
    _cast_item(12, "Elric, Alphonse", "Main", [(8, "Kugimiya, Rie", "Japanese")]),
    _cast_item(13, "Mustang, Roy", "Supporting", [(89, "Miki, Shinichiro", "Japanese")]),
]


@pytest.fixture
def downloaded(monkeypatch):
    """Records every (url, system_id) downloaded, writing no file."""
    calls = []

    def fake_download(url, owner_type, system_id):
        calls.append((url, system_id))
        return f"{owner_type}/{system_id}.jpg"

    monkeypatch.setattr(autofill_module, "download_cover_image", fake_download)
    monkeypatch.setattr(mal_cast_module, "download_cover_image", fake_download)
    return calls


@pytest.fixture
def no_downloads(downloaded):
    return downloaded


@pytest.fixture
def character_calls(monkeypatch, no_downloads):
    calls = []

    def fake_fetch(mal_id):
        calls.append(mal_id)
        return EDWARD

    monkeypatch.setattr(autofill_module, "fetch_tenrai_character_data", fake_fetch)
    return calls


@pytest.fixture
def cast_calls(monkeypatch, no_downloads):
    calls = []

    def fake_fetch(resource, mal_id):
        calls.append((resource, mal_id))
        return FMA_CAST

    monkeypatch.setattr(mal_cast_module, "fetch_tenrai_cast", fake_fetch)
    return calls


# --- the link and the mapping -------------------------------------------------


def test_the_character_id_is_extracted_from_a_link():
    assert extract_mal_id_character(EDWARD_LINK) == 11
    assert extract_mal_id_character("https://myanimelist.net/people/11/x") is None
    assert extract_mal_id_character(None) is None


def test_mapping_the_character_record():
    assert map_tenrai_to_character_data(EDWARD) == {
        "photo_url": "https://cdn.myanimelist.net/images/characters/9/72533.jpg",
        "mal_link": EDWARD_LINK,
        "name_en": "Edward Elric",
        "name_jp": "エドワード・エルリック",
        "name_alt": "Ed, Fullmetal Alchemist",
    }


@pytest.mark.parametrize(
    "kanji",
    ["安曇 美姫", " 安曇　美姫 ", "安曇  美姫"],
    ids=["ascii-space", "ideographic-space", "double-space"],
)
def test_the_kanji_name_is_stored_without_spaces(kanji):
    assert map_tenrai_to_character_data({"name_kanji": kanji})["name_jp"] == "安曇美姫"


def test_a_blank_kanji_name_is_no_name():
    assert map_tenrai_to_character_data({"name_kanji": " 　"})["name_jp"] is None


def test_mapping_a_cast_keeps_only_japanese_voices():
    rows = map_tenrai_cast(FMA_CAST)
    assert [r["name_en"] for r in rows] == ["Edward Elric", "Alphonse Elric", "Roy Mustang"]
    assert rows[0]["name_mal"] == "Elric, Edward"
    assert [r["role"] for r in rows] == ["Main", "Main", "Other"]
    assert [v["name_en"] for v in rows[0]["voices"]] == ["Romi Park"]


def test_the_sheet_carries_the_mal_columns():
    parsed = parse_character_from_sheet({"name_en": "Ed", "mal_id": "11", "mal_link": EDWARD_LINK})
    assert parsed["mal_id"] == 11
    assert parsed["mal_link"] == EDWARD_LINK


# --- the character router -----------------------------------------------------


def test_create_with_a_link_fills_the_blank_columns(admin_client, character_calls):
    r = admin_client.post(
        "/api/character/", json={"name_en": "Ed", "mal_link": EDWARD_LINK}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert character_calls == [11]
    assert body["mal_id"] == 11
    # The typed name wins; only blanks are filled.
    assert body["name_en"] == "Ed"
    assert body["name_jp"] == "エドワード・エルリック"
    assert body["name_alt"] == "Ed, Fullmetal Alchemist"
    assert body["photo_file"] == f"character/{body['system_id']}.jpg"


def test_update_adding_a_link_fills_the_character(admin_client, character_calls):
    created = admin_client.post("/api/character/", json={"name_en": "Ed"}).json()
    assert character_calls == []
    body = admin_client.put(
        f"/api/character/{created['system_id']}",
        json={"name_en": "Ed", "mal_link": EDWARD_LINK},
    ).json()
    assert body["mal_id"] == 11
    assert body["name_jp"] == "エドワード・エルリック"


def test_patch_derives_the_id_without_fetching(admin_client, character_calls):
    created = admin_client.post("/api/character/", json={"name_en": "Ed"}).json()
    r = admin_client.patch(
        f"/api/character/{created['system_id']}", json={"mal_link": EDWARD_LINK}
    )
    assert r.status_code == 200, r.text
    assert r.json()["mal_id"] == 11
    assert character_calls == []


# --- building a cast from MAL -------------------------------------------------


def _import(client, media_type="anime", link=FMA_LINK):
    return client.post("/api/casting/mal", json={"media_type": media_type, "mal_link": link})


def test_a_mal_cast_creates_what_is_missing_and_reuses_what_is_not(
    admin_client, db_session, cast_calls, downloaded
):
    # Edward already exists, linked to MAL; Rie Kugimiya exists by name only.
    edward = models.Character(system_id=uuid.uuid4(), name_en="Ed", mal_id=11)
    rie = models.Person(system_id=uuid.uuid4(), name_en="Rie Kugimiya")
    db_session.add_all([edward, rie])
    db_session.commit()

    r = _import(admin_client)
    assert r.status_code == 200, r.text
    body = r.json()
    assert cast_calls == [("anime", 5114)]

    cast = body["cast"]
    assert [row["character_name"] for row in cast] == ["Ed", "Alphonse Elric", "Roy Mustang"]
    assert cast[0]["character_id"] == str(edward.system_id)
    assert [row["role"] for row in cast] == ["Main", "Main", "Other"]
    assert [[v["person_name"] for v in row["voices"]] for row in cast] == [
        ["Romi Park"], ["Rie Kugimiya"], ["Shinichiro Miki"],
    ]
    assert cast[1]["voices"][0]["person_id"] == str(rie.system_id)
    assert body["created_characters"] == 2
    assert body["created_people"] == 2

    # A minted character points at its own portrait key at once; the file
    # itself is fetched after the response.
    db_session.expire_all()
    alphonse = db_session.get(models.Character, uuid.UUID(cast[1]["character_id"]))
    assert alphonse.mal_id == 12
    assert alphonse.photo_file == f"character/{alphonse.system_id}.jpg"
    assert (
        "https://cdn.example/12.jpg", str(alphonse.system_id)
    ) in downloaded

    # Rie was matched by name and now carries her MAL id and the seiyuu role.
    rie = db_session.get(models.Person, rie.system_id)
    assert rie.mal_id == 8
    assert ("seiyuu", "anime") in {(r.role, r.scope) for r in rie.roles}
    # Nothing was cast: the editor saves the rows itself.
    assert db_session.query(models.CharacterCasting).count() == 0


def test_a_second_import_creates_nothing(admin_client, cast_calls):
    _import(admin_client)
    body = _import(admin_client).json()
    assert body["created_characters"] == 0
    assert body["created_people"] == 0


def test_a_main_only_import_creates_nothing_for_the_side_cast(
    admin_client, db_session, cast_calls
):
    # FMA_CAST holds a Supporting character with a seiyuu of his own, so the
    # filter has someone to leave out; the unfiltered import above takes him.
    r = admin_client.post(
        "/api/casting/mal",
        json={"media_type": "anime", "mal_link": FMA_LINK, "main_only": True},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert [row["character_name"] for row in body["cast"]] == [
        "Edward Elric", "Alphonse Elric",
    ]
    assert [row["role"] for row in body["cast"]] == ["Main", "Main"]
    assert [row["position"] for row in body["cast"]] == [0, 1]
    assert body["created_characters"] == 2
    assert body["created_people"] == 2
    # Roy and his voice were never minted, not just left out of the rows.
    assert db_session.query(models.Character).filter_by(mal_id=13).count() == 0
    assert db_session.query(models.Person).filter_by(mal_id=89).count() == 0


def test_a_manga_cast_carries_no_voices(admin_client, cast_calls):
    body = _import(
        admin_client, "manga", "https://myanimelist.net/manga/25/Fullmetal_Alchemist"
    ).json()
    assert cast_calls == [("manga", 25)]
    assert all(row["voices"] == [] for row in body["cast"])
    assert body["created_people"] == 0


def test_a_link_of_the_wrong_kind_is_a_422(admin_client, cast_calls):
    assert _import(admin_client, "manga", FMA_LINK).status_code == 422
    assert cast_calls == []


def test_mal_answering_nothing_is_a_502(admin_client, monkeypatch, no_downloads):
    monkeypatch.setattr(mal_cast_module, "fetch_tenrai_cast", lambda resource, mal_id: None)
    assert _import(admin_client).status_code == 502


def test_a_guest_cannot_import(client, cast_calls):
    assert _import(client).status_code in (401, 403)
    assert cast_calls == []


# --- matching a hand-added character in this cast by name ---------------------
#
# Every test here holds a character with no mal_id whose name is one MAL
# lists: that is what gives the name match something to match, so a test that
# expects a NEW character proves the rule refused, not that nothing was there.


def _import_holding(client, *characters):
    return client.post(
        "/api/casting/mal",
        json={
            "media_type": "anime",
            "mal_link": FMA_LINK,
            "character_ids": [str(c.system_id) for c in characters],
        },
    )


def _character(db_session, **columns):
    character = models.Character(system_id=uuid.uuid4(), **columns)
    db_session.add(character)
    db_session.commit()
    return character


def _with_mal_id(db_session, mal_id):
    return db_session.query(models.Character).filter_by(mal_id=mal_id).all()


def test_a_held_character_without_a_mal_id_is_reused_by_name(
    admin_client, db_session, cast_calls
):
    edward = _character(db_session, name_en="Edward Elric")

    r = _import_holding(admin_client, edward)
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["cast"][0]["character_id"] == str(edward.system_id)
    assert body["created_characters"] == 2  # Alphonse and Roy, not Edward
    db_session.expire_all()
    edward = db_session.get(models.Character, edward.system_id)
    assert edward.mal_id == 11
    assert edward.mal_link == "https://myanimelist.net/character/11/x"
    assert [c.system_id for c in _with_mal_id(db_session, 11)] == [edward.system_id]


@pytest.mark.parametrize(
    "columns",
    [
        {"name_en": "  edward   ELRIC "},
        {"name_en": "Ｅｄｗａｒｄ Ｅｌｒｉｃ"},
        {"name_en": "Elric, Edward"},
        {"name_en": "Elric Edward"},
        {"name_jp": "edward elric"},
        {"name_cn": "Edward Elric"},
        {"name_alt": "Fullmetal, Edward Elric"},
    ],
    ids=["case-and-spacing", "full-width", "mal-order", "family-first", "jp", "cn", "alt"],
)
def test_the_name_match_is_normalised_across_every_name_column(
    admin_client, db_session, cast_calls, columns
):
    edward = _character(db_session, **columns)
    body = _import_holding(admin_client, edward).json()
    assert body["cast"][0]["character_id"] == str(edward.system_id)


def test_a_name_match_outside_the_cast_still_creates_a_new_character(
    admin_client, db_session, cast_calls
):
    edward = _character(db_session, name_en="Edward Elric")

    body = _import_holding(admin_client).json()  # holds nothing

    assert body["cast"][0]["character_id"] != str(edward.system_id)
    assert body["created_characters"] == 3
    db_session.expire_all()
    assert db_session.get(models.Character, edward.system_id).mal_id is None


def test_a_request_without_character_ids_matches_no_name(
    admin_client, db_session, cast_calls
):
    edward = _character(db_session, name_en="Edward Elric")

    body = _import(admin_client).json()

    assert body["cast"][0]["character_id"] != str(edward.system_id)
    assert body["created_characters"] == 3


def test_a_held_character_with_another_mal_id_is_not_matched_by_name(
    admin_client, db_session, cast_calls
):
    other = _character(db_session, name_en="Edward Elric", mal_id=999)

    body = _import_holding(admin_client, other).json()

    assert body["cast"][0]["character_id"] != str(other.system_id)
    assert body["created_characters"] == 3
    db_session.expire_all()
    assert db_session.get(models.Character, other.system_id).mal_id == 999


def test_two_held_characters_with_the_name_are_not_guessed_between(
    admin_client, db_session, cast_calls
):
    first = _character(db_session, name_en="Edward Elric")
    second = _character(db_session, name_jp="Edward Elric")

    body = _import_holding(admin_client, first, second).json()

    assert [row["character_name"] for row in body["cast"]] == [
        "Alphonse Elric", "Roy Mustang",
    ]
    assert body["created_characters"] == 2
    assert any("Edward Elric" in w for w in body["warnings"])
    db_session.expire_all()
    assert _with_mal_id(db_session, 11) == []


def test_a_reused_characters_set_mal_link_is_kept(
    admin_client, db_session, cast_calls
):
    kept = "https://myanimelist.net/character/11/Edward_Elric"
    edward = _character(db_session, name_en="Edward Elric", mal_link=kept)

    body = _import_holding(admin_client, edward).json()

    assert body["cast"][0]["character_id"] == str(edward.system_id)
    db_session.expire_all()
    edward = db_session.get(models.Character, edward.system_id)
    assert edward.mal_id == 11
    assert edward.mal_link == kept
