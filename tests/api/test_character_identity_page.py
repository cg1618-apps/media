"""
The identity page's backend: public_id, the public GET and /entries, and the
identity_public_id a cast row carries so the entry page can link to it.

The hidden-character tests make the refusal bite the same way
test_shared_record_visibility.py does: `nsfw_label` on the entry the character
is cast on (without it, the anonymous `client` has no label to lack and the
gate refuses nothing), and the mirror - `admin_client`, whose mode carries
every label - asking the same thing and getting it.
"""

import uuid

import pytest

from app import models
from app.utils.formatter import parse_character_identity_from_sheet
from tests.api.conftest import nsfw_label  # noqa: F401

BASE = "/api/character-identity/"


@pytest.fixture
def identity(db_session, character):
    i = models.CharacterIdentity(
        system_id=uuid.uuid4(), character_id=character.system_id, name_en="Conan"
    )
    db_session.add(i)
    db_session.flush()
    return i


@pytest.fixture
def labelled_anime(db_session, sample_franchise, nsfw_label):  # noqa: F811
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Zvornik Identity Hidden Anime",
        airing_type="TV",
    )
    db_session.add(entry)
    db_session.flush()
    db_session.add(
        models.MediaContentLabel(
            system_id=uuid.uuid4(), media_id=entry.system_id, label_id=nsfw_label.system_id
        )
    )
    db_session.flush()
    return entry


def _cast(db_session, character, entry, identity=None, media_type="anime"):
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id,
            identity_id=identity.system_id if identity is not None else None,
            media_type=media_type,
            entry_id=entry.system_id,
        )
    )
    db_session.flush()


# ---------------------------------------------------------------------------
# public_id
# ---------------------------------------------------------------------------


def test_each_identity_gets_its_own_public_id(db_session, character):
    a = models.CharacterIdentity(character_id=character.system_id, name_en="A")
    b = models.CharacterIdentity(character_id=character.system_id, name_en="B")
    db_session.add_all([a, b])
    db_session.flush()
    assert isinstance(a.public_id, int) and isinstance(b.public_id, int)
    assert a.public_id != b.public_id


def test_public_id_is_in_the_admin_and_the_nested_responses(admin_client, client, character):
    created = admin_client.post(
        BASE, json={"character_id": str(character.system_id), "name_en": "Conan"}
    ).json()
    assert isinstance(created["public_id"], int)
    listed = admin_client.get(BASE).json()
    assert [i["public_id"] for i in listed] == [created["public_id"]]
    nested = client.get(f"/api/character/{character.system_id}").json()["identities"]
    assert [i["public_id"] for i in nested] == [created["public_id"]]


def test_the_sheet_parser_keeps_public_id():
    raw = {
        "system_id": str(uuid.uuid4()),
        "character_id": str(uuid.uuid4()),
        "name_en": "Conan",
        "public_id": "17",
    }
    assert parse_character_identity_from_sheet(raw)["public_id"] == 17
    # A sheet from before the column existed lets the sequence number the row.
    del raw["public_id"]
    assert "public_id" not in parse_character_identity_from_sheet(raw)


# ---------------------------------------------------------------------------
# GET /api/character-identity/{ref}
# ---------------------------------------------------------------------------


def test_a_guest_reads_an_identity_by_public_id_and_by_uuid(client, character, identity):
    by_public = client.get(f"{BASE}{identity.public_id}")
    by_uuid = client.get(f"{BASE}{identity.system_id}")
    assert by_public.status_code == 200, by_public.text
    assert by_public.json() == by_uuid.json()
    body = by_public.json()
    assert body["public_id"] == identity.public_id
    assert body["name_en"] == "Conan"
    assert body["character_public_id"] == character.public_id
    assert body["character_display_name"] == "Ichika"
    # The character's picture stands in; the admin-only count does not leak.
    assert body["display_photo_file"] == "characters/ichika.jpg"
    assert "casting_count" not in body


def test_an_unknown_identity_is_404(client):
    assert client.get(f"{BASE}{uuid.uuid4()}").status_code == 404
    assert client.get(f"{BASE}999999").status_code == 404


def test_an_identity_of_a_hidden_character_is_404(
    client, admin_client, db_session, labelled_anime, character, identity
):
    _cast(db_session, character, labelled_anime, identity)
    for path in (f"{BASE}{identity.public_id}", f"{BASE}{identity.public_id}/entries"):
        assert client.get(path).status_code == 404
        # The mirror: the same row, asked by a viewer whose mode carries the
        # label, is there - so the 404 above is the gate refusing.
        assert admin_client.get(path).status_code == 200


# ---------------------------------------------------------------------------
# GET /api/character-identity/{ref}/entries
# ---------------------------------------------------------------------------


def test_entries_lists_only_this_identitys_cast_rows(
    client, db_session, anime, sample_manga, character, identity
):
    # Main identity on both entries, the identity on the anime only: an
    # unfiltered list would hold three cards.
    _cast(db_session, character, anime)
    _cast(db_session, character, anime, identity)
    _cast(db_session, character, sample_manga, media_type="manga")

    r = client.get(f"{BASE}{identity.public_id}/entries")
    assert r.status_code == 200, r.text
    groups = r.json()["groups"]
    assert [g["media_type"] for g in groups] == ["anime"]
    assert groups[0]["nav_path"]
    [entry] = groups[0]["entries"]
    assert entry["system_id"] == str(anime.system_id)
    assert entry["identity_id"] == str(identity.system_id)
    assert entry["identity_name"] == "Conan"
    assert entry["identity_public_id"] == identity.public_id
    assert set(entry) >= {
        "casting_id", "display_name", "public_id", "cover_image_file",
        "cover_image_focus", "release_date", "seiyuu",
    }

    # The character's own list still holds all three, main rows unlinked.
    character_entries = [
        e
        for g in client.get(f"/api/character/{character.system_id}/entries").json()["groups"]
        for e in g["entries"]
    ]
    assert len(character_entries) == 3
    assert sorted(str(e["identity_public_id"]) for e in character_entries) == sorted(
        ["None", "None", str(identity.public_id)]
    )


def test_entries_of_an_unknown_identity_is_404(client):
    assert client.get(f"{BASE}{uuid.uuid4()}/entries").status_code == 404


# ---------------------------------------------------------------------------
# Cast rows on an entry's page
# ---------------------------------------------------------------------------


def test_cast_rows_carry_the_identity_public_id(client, db_session, anime, character, identity):
    _cast(db_session, character, anime)
    _cast(db_session, character, anime, identity)
    cast = client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"]
    assert sorted(str(r["identity_public_id"]) for r in cast) == sorted(
        ["None", str(identity.public_id)]
    )
