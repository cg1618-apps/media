"""
The System page's Remove Uncast Characters: check/uncast-characters lists every
character with no casting, and calculate/remove-uncast-characters deletes the
ticked ones with their identities and images.

Fixtures `character`, `second_character` and `character_with_castings` live
in tests/api/conftest.py. Requires PostgreSQL (media_test DB).
"""

import uuid

import pytest

from app import models
from app.services.integrations import image_library, image_manager

SCAN = "/api/data-control/check/uncast-characters"
REMOVE = "/api/data-control/calculate/remove-uncast-characters"


@pytest.fixture
def deleted_files(monkeypatch):
    """Record file deletions instead of touching the real static/ tree."""
    calls = {"covers": [], "library": []}
    monkeypatch.setattr(
        image_manager,
        "delete_cover_image",
        lambda owner_type, system_id: calls["covers"].append((owner_type, system_id)),
    )
    monkeypatch.setattr(
        image_library,
        "delete_file",
        lambda storage_key, thumb_key: calls["library"].append(storage_key),
    )
    return calls


def _identity(db, character, name="Disguise"):
    identity = models.CharacterIdentity(character_id=character.system_id, name_en=name)
    db.add(identity)
    db.flush()
    return identity


def _image(db, storage_key, uploaded_by=None):
    image = models.Image(
        storage_key=storage_key,
        checksum=uuid.uuid4().hex + uuid.uuid4().hex,
        uploaded_by=uploaded_by,
    )
    db.add(image)
    db.flush()
    return image


def _attach(db, image, owner_type, owner_id):
    db.add(
        models.ImageAttachment(
            image_id=image.system_id, owner_type=owner_type, owner_id=owner_id
        )
    )
    db.flush()


def test_scan_lists_only_characters_with_no_casting(
    admin_client, db_session, character_with_castings, second_character
):
    _identity(db_session, second_character)
    db_session.commit()

    body = admin_client.get(SCAN).json()

    assert body["count"] == 1
    assert body["characters"] == [
        {
            "system_id": str(second_character.system_id),
            "public_id": second_character.public_id,
            "name": "Yuki",
            "identity_count": 1,
            "has_photo": False,
        }
    ]


def test_remove_deletes_the_ticked_character_and_its_identities(
    admin_client, db_session, second_character, deleted_files
):
    identity = _identity(db_session, second_character)
    db_session.commit()
    character_id, identity_id = second_character.system_id, identity.system_id

    r = admin_client.post(REMOVE, json={"system_ids": [str(character_id)]})

    assert r.status_code == 200
    assert r.json()["removed_count"] == 1
    db_session.expire_all()
    assert db_session.get(models.Character, character_id) is None
    assert db_session.get(models.CharacterIdentity, identity_id) is None
    assert set(deleted_files["covers"]) == {
        ("character", str(character_id)),
        ("character-identity", str(identity_id)),
    }


def test_remove_skips_a_ticked_character_that_has_a_casting(
    admin_client, db_session, character_with_castings, second_character, deleted_files
):
    """
    The refusal needs a CAST character in the ticked list to bite - an id list
    of uncast characters only would pass with the re-check deleted. The uncast
    one beside it is the mirror case: same request, removed.
    """
    cast_id, uncast_id = character_with_castings.system_id, second_character.system_id

    r = admin_client.post(
        REMOVE, json={"system_ids": [str(cast_id), str(uncast_id)]}
    )

    assert r.json()["removed_count"] == 1
    assert r.json()["skipped_count"] == 1
    db_session.expire_all()
    assert db_session.get(models.Character, cast_id) is not None
    assert db_session.get(models.Character, uncast_id) is None
    assert ("character", str(cast_id)) not in deleted_files["covers"]


def test_an_unticked_uncast_character_is_kept(
    admin_client, db_session, character, second_character, deleted_files
):
    db_session.commit()
    kept_id = character.system_id

    admin_client.post(REMOVE, json={"system_ids": [str(second_character.system_id)]})

    db_session.expire_all()
    assert db_session.get(models.Character, kept_id) is not None
    assert ("character", str(kept_id)) not in deleted_files["covers"]


def test_remove_releases_attached_images(
    admin_client, db_session, admin_user, second_character, deleted_files
):
    """An upload stays in the library; a download goes with its owner."""
    identity = _identity(db_session, second_character)
    uploaded = _image(db_session, "library/abc.jpg", uploaded_by=admin_user.id)
    downloaded = _image(
        db_session, f"covers/character-identity/{identity.system_id}.jpg"
    )
    _attach(db_session, uploaded, "character", second_character.system_id)
    _attach(db_session, downloaded, "character-identity", identity.system_id)
    db_session.commit()
    uploaded_id, downloaded_id = uploaded.system_id, downloaded.system_id

    admin_client.post(REMOVE, json={"system_ids": [str(second_character.system_id)]})

    db_session.expire_all()
    assert db_session.query(models.ImageAttachment).count() == 0
    assert db_session.get(models.Image, uploaded_id) is not None
    assert db_session.get(models.Image, downloaded_id) is None
    assert deleted_files["library"] == [
        f"covers/character-identity/{identity.system_id}.jpg"
    ]


def test_a_download_still_attached_elsewhere_keeps_its_file(
    admin_client, db_session, second_character, character, deleted_files
):
    """
    The own-download check has to see a surviving image row to refuse, so
    this attaches the removed character's downloaded file to a second owner.
    """
    shared = _image(db_session, f"covers/character/{second_character.system_id}.jpg")
    _attach(db_session, shared, "character", second_character.system_id)
    _attach(db_session, shared, "character", character.system_id)
    db_session.commit()
    shared_id = shared.system_id

    admin_client.post(REMOVE, json={"system_ids": [str(second_character.system_id)]})

    db_session.expire_all()
    assert db_session.get(models.Image, shared_id) is not None
    assert ("character", str(second_character.system_id)) not in deleted_files["covers"]
    assert deleted_files["library"] == []


def test_both_routes_need_manage_pipelines(user_client, second_character):
    # 401, as clean/scan and backup answer a signed-in member without the role.
    assert user_client.get(SCAN).status_code == 401
    r = user_client.post(REMOVE, json={"system_ids": [str(second_character.system_id)]})
    assert r.status_code == 401
