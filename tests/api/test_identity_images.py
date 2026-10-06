"""An identity owns a cover image like a character does - and is hidden with it."""

import uuid

import pytest

from app import models
from app.services.calculation import bulk_check_unused_cover_images
from app.services.integrations import image_manager
from tests.api.conftest import hidden_anime, nsfw_label  # noqa: F401


@pytest.fixture
def identity(db_session, character):
    i = models.CharacterIdentity(
        system_id=uuid.uuid4(), character_id=character.system_id, name_en="Conan"
    )
    db_session.add(i)
    db_session.flush()
    return i


def _key(identity):
    return image_manager.cover_key("character-identity", str(identity.system_id))


def test_cover_key_accepts_the_owner_type(identity):
    assert _key(identity) == f"character-identity/{identity.system_id}.jpg"


def test_identity_cover_is_not_an_orphan(db_session, identity, monkeypatch):
    key = _key(identity)
    identity.photo_file = key
    db_session.flush()
    monkeypatch.setattr("app.services.calculation.list_all_cover_images", lambda: [key])
    result = bulk_check_unused_cover_images(db_session)
    assert key not in result["orphaned"]
    assert result["should_use"] == []


def test_unrecorded_identity_cover_is_should_use_not_orphan(db_session, identity, monkeypatch):
    key = _key(identity)
    assert identity.photo_file is None
    monkeypatch.setattr("app.services.calculation.list_all_cover_images", lambda: [key])
    result = bulk_check_unused_cover_images(db_session)
    assert result["orphaned"] == []
    assert [r["system_id"] for r in result["should_use"]] == [str(identity.system_id)]


def test_identity_cover_is_hidden_with_its_character(
    client, admin_client, db_session, character, identity, hidden_anime, tmp_path, monkeypatch
):
    # The character's only casting is on a label-hidden entry: the guest
    # cannot see the character, so must not get its identity's picture.
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id, media_type="anime", entry_id=hidden_anime.system_id
        )
    )
    db_session.flush()
    folder = tmp_path / "character-identity"
    folder.mkdir()
    (folder / f"{identity.system_id}.jpg").write_bytes(b"\xff\xd8\xff")
    monkeypatch.setattr("app.routers.covers.COVER_DIR", str(tmp_path))
    url = f"/api/covers/character-identity/{identity.system_id}.jpg"
    assert client.get(url).status_code == 404
    assert admin_client.get(url).status_code == 200


def test_identity_cover_of_a_visible_character_is_served_to_a_guest(
    client, db_session, identity, tmp_path, monkeypatch
):
    # Mirror of the refusal above: with no hidden casting the same request
    # succeeds, so the 404 there came from the visibility check.
    folder = tmp_path / "character-identity"
    folder.mkdir()
    (folder / f"{identity.system_id}.jpg").write_bytes(b"\xff\xd8\xff")
    monkeypatch.setattr("app.routers.covers.COVER_DIR", str(tmp_path))
    assert client.get(f"/api/covers/character-identity/{identity.system_id}.jpg").status_code == 200
