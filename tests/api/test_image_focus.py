"""
Image focal points: `cover_image_focus`, `photo_focus`, `logo_focus` and the
derived `display_photo_focus`.

Every reset test sets a NON-NULL focus first. A reset asserted against a
focus that was never set passes whether or not the reset ran; the mirror
case beside each one (a PUT, or re-attaching the same picture, keeps the
focus) proves it is the image write doing the resetting.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import io
import uuid

import pytest
from PIL import Image as PILImage

from app import models
from app.services.integrations import image_library
from tests.api.conftest import character  # noqa: F401


@pytest.fixture(autouse=True)
def _library_in_tmp(tmp_path, monkeypatch):
    """Never write into the developer's real static/library during a test."""
    monkeypatch.setattr(image_library, "STATIC_DIR", str(tmp_path))


def _png(color=(200, 30, 30)):
    buf = io.BytesIO()
    PILImage.new("RGB", (50, 40), color).save(buf, format="PNG")
    return buf.getvalue()


def _upload(client, color=(200, 30, 30)):
    response = client.post(
        "/api/images", files={"file": ("cover.png", _png(color), "image/png")}
    )
    assert response.status_code == 201, response.text
    return response.json()


def _attach(client, image, owner_type, owner_id):
    response = client.post(
        f"/api/images/{image['system_id']}/attach",
        json={"owner_type": owner_type, "owner_id": str(owner_id), "role": "cover"},
    )
    assert response.status_code == 201, response.text


def _media_row(db_session, entry):
    db_session.expire_all()
    return db_session.get(models.Media, entry.system_id)


@pytest.fixture
def focused_anime(admin_client, db_session, sample_anime):
    """sample_anime with an attached cover AND a non-null focus on it."""
    image = _upload(admin_client)
    _attach(admin_client, image, "anime", sample_anime.system_id)
    media = _media_row(db_session, sample_anime)
    media.cover_image_focus = "30% 70%"
    db_session.commit()
    return {"entry": sample_anime, "image": image}


@pytest.fixture
def studio(db_session):
    s = models.Studio(system_id=uuid.uuid4(), name_en="Focus Studio")
    db_session.add(s)
    db_session.flush()
    return s


# ---------------------------------------------------------------------------
# Entry writes
# ---------------------------------------------------------------------------


def test_an_entry_round_trips_cover_image_focus(admin_client, sample_franchise):
    created = admin_client.post(
        "/api/anime/",
        json={
            "anime_name_en": "Focus Test",
            "franchise_id": str(sample_franchise.system_id),
            "airing_type": "TV",
            "cover_image_focus": "50% 20%",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["cover_image_focus"] == "50% 20%"
    entry_id = created.json()["system_id"]

    updated = admin_client.put(
        f"/api/anime/{entry_id}", json={"cover_image_focus": "0% 100%"}
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["cover_image_focus"] == "0% 100%"

    assert admin_client.get(f"/api/anime/{entry_id}").json()["cover_image_focus"] == (
        "0% 100%"
    )


def test_an_empty_focus_from_a_form_is_stored_as_null(admin_client, db_session, sample_anime):
    _media_row(db_session, sample_anime).cover_image_focus = "10% 10%"
    db_session.commit()

    response = admin_client.put(
        f"/api/anime/{sample_anime.system_id}", json={"cover_image_focus": ""}
    )

    assert response.status_code == 200, response.text
    assert response.json()["cover_image_focus"] is None
    assert _media_row(db_session, sample_anime).cover_image_focus is None


def test_a_malformed_focus_is_a_422(admin_client, sample_anime):
    response = admin_client.put(
        f"/api/anime/{sample_anime.system_id}", json={"cover_image_focus": "left top"}
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# The reset rule (images.mirror_to_owner_column)
# ---------------------------------------------------------------------------


def test_attaching_a_new_cover_resets_the_focus(admin_client, db_session, focused_anime):
    entry = focused_anime["entry"]
    other = _upload(admin_client, color=(30, 30, 200))

    _attach(admin_client, other, "anime", entry.system_id)

    media = _media_row(db_session, entry)
    assert media.cover_image_file == other["storage_key"]
    assert media.cover_image_focus is None


def test_a_put_keeps_the_focus(admin_client, db_session, focused_anime):
    """The mirror case: an ordinary write is not an image change."""
    entry = focused_anime["entry"]

    response = admin_client.put(
        f"/api/anime/{entry.system_id}", json={"anime_name_en": "Renamed"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["cover_image_focus"] == "30% 70%"
    assert _media_row(db_session, entry).cover_image_focus == "30% 70%"


def test_reattaching_the_same_picture_keeps_the_focus(
    admin_client, db_session, focused_anime
):
    entry = focused_anime["entry"]

    _attach(admin_client, focused_anime["image"], "anime", entry.system_id)

    assert _media_row(db_session, entry).cover_image_focus == "30% 70%"


def test_clearing_the_cover_resets_the_focus(admin_client, db_session, focused_anime):
    entry = focused_anime["entry"]

    response = admin_client.delete(f"/api/images/owners/anime/{entry.system_id}/cover")

    assert response.status_code == 204
    media = _media_row(db_session, entry)
    assert media.cover_image_file is None
    assert media.cover_image_focus is None


def test_a_forced_delete_resets_the_focus(admin_client, db_session, focused_anime):
    entry = focused_anime["entry"]

    response = admin_client.delete(
        f"/api/images/{focused_anime['image']['system_id']}?force=true"
    )

    assert response.status_code == 204
    assert _media_row(db_session, entry).cover_image_focus is None


def test_attaching_a_new_logo_resets_logo_focus(admin_client, db_session, studio):
    _attach(admin_client, _upload(admin_client), "studio", studio.system_id)
    studio.logo_focus = "80% 20%"
    db_session.commit()

    _attach(admin_client, _upload(admin_client, color=(0, 90, 0)), "studio", studio.system_id)

    db_session.refresh(studio)
    assert studio.logo_focus is None


def test_a_studio_put_keeps_and_returns_logo_focus(admin_client, db_session, studio):
    response = admin_client.put(
        f"/api/studio/{studio.system_id}",
        json={"name_en": "Focus Studio", "logo_focus": "80% 20%"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["logo_focus"] == "80% 20%"
    db_session.refresh(studio)
    assert studio.logo_focus == "80% 20%"


def test_an_entity_patch_refuses_a_malformed_focus(admin_client, character):
    refused = admin_client.patch(
        f"/api/character/{character.system_id}", json={"photo_focus": "50%"}
    )
    allowed = admin_client.patch(
        f"/api/character/{character.system_id}", json={"photo_focus": "50% 0%"}
    )

    assert refused.status_code == 422
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["photo_focus"] == "50% 0%"


def test_a_forced_delete_resets_a_cast_photos_focus(
    admin_client, db_session, sample_anime, character
):
    image = _upload(admin_client)
    casting = models.CharacterCasting(
        character_id=character.system_id,
        media_type="anime",
        entry_id=sample_anime.system_id,
        photo_file=image["storage_key"],
        photo_focus="25% 75%",
    )
    db_session.add(casting)
    db_session.commit()

    response = admin_client.delete(f"/api/images/{image['system_id']}?force=true")

    assert response.status_code == 204
    db_session.refresh(casting)
    assert casting.photo_file is None
    assert casting.photo_focus is None


# ---------------------------------------------------------------------------
# display_photo_focus follows the winning source
# ---------------------------------------------------------------------------


def _cast(db_session, character, entry, photo=None, focus=None):
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id,
            media_type="anime",
            entry_id=entry.system_id,
            photo_file=photo,
            photo_focus=focus,
        )
    )
    db_session.flush()


def _display(client, character):
    body = client.get(f"/api/character/{character.system_id}").json()
    return body["display_photo_file"], body["display_photo_focus"]


def test_display_photo_focus_follows_the_fallback_source(
    admin_client, db_session, sample_anime
):
    """
    Each step's focus is distinct, so the pair can only match when the focus
    came from the same source as the picture.
    """
    media = _media_row(db_session, sample_anime)
    media.cover_image_file = "covers/anime/cover.jpg"
    media.cover_image_focus = "10% 10%"
    character = models.Character(
        system_id=uuid.uuid4(),
        name_en="Focal",
        photo_file="own.jpg",
        photo_focus="90% 90%",
    )
    db_session.add(character)
    db_session.flush()
    _cast(db_session, character, sample_anime, photo="cast.jpg", focus="50% 50%")
    db_session.commit()

    assert _display(admin_client, character) == ("own.jpg", "90% 90%")

    character.photo_file = None
    db_session.commit()
    assert _display(admin_client, character) == ("cast.jpg", "50% 50%")

    db_session.query(models.CharacterCasting).filter_by(
        character_id=character.system_id
    ).update({"photo_file": None})
    db_session.commit()
    # The character's own photo_focus (90% 90%) and the casting's (50% 50%)
    # are both still stored; only the cover's may come back with the cover.
    assert _display(admin_client, character) == ("covers/anime/cover.jpg", "10% 10%")


def test_a_person_card_carries_photo_focus(admin_client, db_session):
    person = models.Person(
        system_id=uuid.uuid4(), name_en="Focus Person",
        photo_file="p.jpg", photo_focus="40% 60%",
    )
    db_session.add(person)
    db_session.commit()

    body = admin_client.get(f"/api/person/{person.system_id}").json()

    assert body["photo_focus"] == "40% 60%"
    assert body["display_photo_focus"] == "40% 60%"


# ---------------------------------------------------------------------------
# Cast save and read
# ---------------------------------------------------------------------------


def test_cast_save_and_read_carry_photo_focus(admin_client, sample_anime, character):
    body = {"cast": [{
        "character_id": str(character.system_id),
        "photo_file": "castings/ichika-here.jpg",
        "photo_focus": "50% 10%",
    }]}

    assert admin_client.put(
        f"/api/casting/anime/{sample_anime.system_id}", json=body
    ).status_code == 200
    row = admin_client.get(f"/api/casting/anime/{sample_anime.system_id}").json()["cast"][0]

    assert row["photo_file"] == "castings/ichika-here.jpg"
    assert row["photo_focus"] == "50% 10%"


def test_cast_read_displays_the_characters_focus_with_its_photo(
    admin_client, db_session, sample_anime, character
):
    character.photo_focus = "70% 30%"
    db_session.commit()
    body = {"cast": [{"character_id": str(character.system_id)}]}

    admin_client.put(f"/api/casting/anime/{sample_anime.system_id}", json=body)
    row = admin_client.get(f"/api/casting/anime/{sample_anime.system_id}").json()["cast"][0]

    assert row["display_photo_file"] == character.photo_file
    assert row["display_photo_focus"] == "70% 30%"
    assert row["photo_file"] is None
    assert row["photo_focus"] is None


def test_cast_save_refuses_a_malformed_focus(admin_client, sample_anime, character):
    body = {"cast": [{
        "character_id": str(character.system_id),
        "photo_focus": "101% 0%",
    }]}

    response = admin_client.put(f"/api/casting/anime/{sample_anime.system_id}", json=body)

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Derived payloads
# ---------------------------------------------------------------------------


def test_the_person_entries_list_carries_cover_image_focus(
    admin_client, db_session, sample_anime
):
    person = models.Person(system_id=uuid.uuid4(), name_en="Voice")
    character = models.Character(system_id=uuid.uuid4(), name_en="Voiced")
    db_session.add_all([person, character])
    db_session.flush()
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id,
            media_type="anime",
            entry_id=sample_anime.system_id,
            voices=[
                models.CharacterCastingVoice(
                    media_type="anime",
                    entry_id=sample_anime.system_id,
                    person_id=person.system_id,
                )
            ],
        )
    )
    media = _media_row(db_session, sample_anime)
    media.cover_image_file = "covers/anime/x.jpg"
    media.cover_image_focus = "15% 85%"
    db_session.commit()

    body = admin_client.get(f"/api/person/{person.system_id}/entries").json()

    entries = [e for group in body["groups"] for e in group["entries"]]
    assert entries, body
    assert entries[0]["cover_image_focus"] == "15% 85%"


# ---------------------------------------------------------------------------
# Entry PATCH - the Modify page saves entries this way
# ---------------------------------------------------------------------------


def test_an_entry_patch_writes_cover_image_focus(admin_client, db_session, sample_anime):
    response = admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"cover_image_focus": "25% 75%"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["cover_image_focus"] == "25% 75%"
    assert _media_row(db_session, sample_anime).cover_image_focus == "25% 75%"


def test_an_entry_patch_clears_cover_image_focus_with_an_empty_value(
    admin_client, db_session, sample_anime
):
    _media_row(db_session, sample_anime).cover_image_focus = "10% 10%"
    db_session.commit()

    response = admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"cover_image_focus": ""}
    )

    assert response.status_code == 200, response.text
    assert _media_row(db_session, sample_anime).cover_image_focus is None


def test_an_entry_patch_without_the_key_leaves_the_focus_alone(
    admin_client, db_session, sample_anime
):
    _media_row(db_session, sample_anime).cover_image_focus = "10% 10%"
    db_session.commit()

    response = admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"remark": "unrelated"}
    )

    assert response.status_code == 200, response.text
    assert _media_row(db_session, sample_anime).cover_image_focus == "10% 10%"


def test_an_entry_patch_refuses_a_malformed_focus(admin_client, sample_anime):
    response = admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"cover_image_focus": "left top"}
    )

    assert response.status_code == 422, response.text
