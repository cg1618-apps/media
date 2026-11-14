"""
The image upload router: upload, list, attach, detach, delete.

`hidden_anime`, `nsfw_label` and `catalog_writer` are imported from conftest,
matching the pattern the rest of tests/api/ uses. nsfw_label is NOT decoration
here - without a content label in the graph the refusal test below has nothing
to refuse and passes vacuously on a fresh database.
"""

import io
import uuid

import pytest
from PIL import Image as PILImage

from app import models
from app.services.integrations import image_library
from tests.api.conftest import (  # noqa: F401
    catalog_writer,
    hidden_anime,
    nsfw_label,
)


@pytest.fixture(autouse=True)
def _library_in_tmp(tmp_path, monkeypatch):
    """Never write into the developer's real static/library during a test."""
    monkeypatch.setattr(image_library, "STATIC_DIR", str(tmp_path))


def _png(width=50, height=40, color=(200, 30, 30)):
    buf = io.BytesIO()
    PILImage.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


def _upload(client, data=None, filename="cover.png", content_type="image/png"):
    return client.post(
        "/api/images",
        files={"file": (filename, data if data is not None else _png(), content_type)},
    )


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

def test_upload_stores_the_image_and_returns_the_row(owner_client, db_session):
    response = _upload(owner_client)

    assert response.status_code == 201
    body = response.json()
    assert body["storage_key"].startswith("library/")
    assert body["width"] == 50
    assert len(body["checksum"]) == 64
    assert db_session.query(models.Image).count() == 1


def test_upload_attaches_nothing_on_its_own(owner_client, db_session):
    _upload(owner_client)

    assert db_session.query(models.ImageAttachment).count() == 0


def test_uploading_the_same_picture_twice_makes_one_row(owner_client, db_session):
    first = _upload(owner_client).json()
    second = _upload(owner_client).json()

    assert first["system_id"] == second["system_id"]
    assert db_session.query(models.Image).count() == 1


def test_upload_records_who_uploaded_it(owner_client, db_session, owner_user):
    _upload(owner_client)

    image = db_session.query(models.Image).one()
    assert image.uploaded_by == owner_user.id


def test_upload_rejects_a_file_that_is_not_an_image(owner_client):
    response = _upload(owner_client, data=b"PK\x03\x04 nope", filename="cover.jpg")

    assert response.status_code == 422
    assert "image" in response.json()["detail"].lower()


def test_upload_rejects_a_file_over_the_cap(owner_client, monkeypatch):
    from app.routers import images as images_router

    monkeypatch.setattr(images_router, "MAX_UPLOAD_BYTES", 100)

    response = _upload(owner_client, data=_png(width=400, height=400))

    assert response.status_code == 413


def test_upload_requires_manage_catalog(client):
    assert _upload(client).status_code == 401


def test_upload_is_refused_to_a_signed_in_member(user_client):
    assert _upload(user_client).status_code == 401


# ---------------------------------------------------------------------------
# Attach
# ---------------------------------------------------------------------------

def test_attach_links_the_image_to_an_entry(owner_client, db_session, sample_anime):
    image = _upload(owner_client).json()

    response = owner_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    assert response.status_code == 201
    attachment = db_session.query(models.ImageAttachment).one()
    assert attachment.owner_type == "anime"
    assert attachment.owner_id == sample_anime.system_id


def test_attaching_again_replaces_rather_than_duplicating(
    owner_client, db_session, sample_anime
):
    first = _upload(owner_client).json()
    second = _upload(owner_client, data=_png(color=(30, 30, 200))).json()
    body = {
        "owner_type": "anime",
        "owner_id": str(sample_anime.system_id),
        "role": "cover",
    }

    owner_client.post(f"/api/images/{first['system_id']}/attach", json=body)
    owner_client.post(f"/api/images/{second['system_id']}/attach", json=body)

    attachment = db_session.query(models.ImageAttachment).one()
    assert str(attachment.image_id) == second["system_id"]


def test_attach_rejects_an_unknown_owner_type(owner_client, sample_anime):
    image = _upload(owner_client).json()

    response = owner_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "not-a-table",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    assert response.status_code == 400


def test_attach_404s_on_a_missing_image(owner_client, sample_anime):
    response = owner_client.post(
        f"/api/images/{uuid.uuid4()}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# The content-label gate
#
# manage.catalog says NOTHING about which entries you may reach. A writer who
# cannot SEE a labelled entry must not be able to write to it - attaching a
# cover is a write. Both cases are asserted with the same fixtures, so a green
# proves the gate did the refusing rather than something incidental.
# ---------------------------------------------------------------------------

def test_attach_404s_for_a_writer_who_cannot_see_the_entry(
    db_session, client, catalog_writer, hidden_anime  # noqa: F811
):
    writer = catalog_writer(username="blindwriter", label_keys=())
    upload = writer.post(
        "/api/images", files={"file": ("c.png", _png(), "image/png")}
    )
    assert upload.status_code == 201

    response = writer.post(
        f"/api/images/{upload.json()['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(hidden_anime.system_id),
            "role": "cover",
        },
    )

    assert response.status_code == 404
    assert db_session.query(models.ImageAttachment).count() == 0


def test_attach_succeeds_for_a_writer_who_holds_the_label(
    db_session, client, catalog_writer, hidden_anime  # noqa: F811
):
    writer = catalog_writer(username="seeingwriter", label_keys=("nsfw",))
    upload = writer.post(
        "/api/images", files={"file": ("c.png", _png(), "image/png")}
    )

    response = writer.post(
        f"/api/images/{upload.json()['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(hidden_anime.system_id),
            "role": "cover",
        },
    )

    assert response.status_code == 201
    assert db_session.query(models.ImageAttachment).count() == 1


# ---------------------------------------------------------------------------
# List, detach, delete
# ---------------------------------------------------------------------------

def test_list_returns_the_library(owner_client):
    _upload(owner_client)

    response = owner_client.get("/api/images")

    assert response.status_code == 200
    assert len(response.json()["images"]) == 1


def test_list_unused_filters_to_unattached_images(owner_client, sample_anime):
    attached = _upload(owner_client).json()
    _upload(owner_client, data=_png(color=(30, 30, 200)))
    owner_client.post(
        f"/api/images/{attached['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    response = owner_client.get("/api/images?unused=true")

    assert len(response.json()["images"]) == 1
    assert response.json()["images"][0]["system_id"] != attached["system_id"]


def test_list_missing_reports_a_reference_with_no_file(
    owner_client, db_session, tmp_path
):
    # The normal state after a machine switch: uploaded images never travel
    # through Backup or Pull, so the row is live and the bytes are elsewhere.
    image = _upload(owner_client).json()
    (tmp_path / "library" / f"{image['checksum']}.jpg").unlink()

    response = owner_client.get("/api/images?missing=true")

    assert len(response.json()["images"]) == 1
    assert response.json()["images"][0]["missing"] is True


def test_list_owner_type_filters_to_images_attached_to_that_owner(
    owner_client, sample_anime
):
    attached = _upload(owner_client).json()
    _upload(owner_client, data=_png(color=(30, 30, 200)))
    owner_client.post(
        f"/api/images/{attached['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    response = owner_client.get("/api/images?owner_type=anime")

    assert response.status_code == 200
    images = response.json()["images"]
    assert len(images) == 1
    assert images[0]["system_id"] == attached["system_id"]


def test_list_owner_type_rejects_an_unknown_value(owner_client):
    response = owner_client.get("/api/images?owner_type=not-a-table")

    assert response.status_code == 400


def test_list_unused_wins_over_owner_type(owner_client, sample_anime):
    # unused (no attachments at all) and owner_type (has an attachment of a
    # given type) can never both be true of the same image. Rather than 400
    # on a picker request that wires both chips together, unused wins and
    # the result is the unused set - not an owner_type-filtered empty page
    # that would look like a bug rather than a deliberate no-op.
    attached = _upload(owner_client).json()
    unused_image = _upload(owner_client, data=_png(color=(30, 30, 200))).json()
    owner_client.post(
        f"/api/images/{attached['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    response = owner_client.get("/api/images?unused=true&owner_type=anime")

    assert response.status_code == 200
    images = response.json()["images"]
    assert len(images) == 1
    assert images[0]["system_id"] == unused_image["system_id"]


def test_list_pagination_reports_the_full_total_but_a_short_page(owner_client):
    for i in range(5):
        _upload(owner_client, data=_png(color=(i, i, i)))

    response = owner_client.get("/api/images?limit=2&offset=0")

    body = response.json()
    assert body["total"] == 5
    assert len(body["images"]) == 2


def test_list_pagination_offset_advances_the_page(owner_client):
    for i in range(5):
        _upload(owner_client, data=_png(color=(i, i, i)))

    first = owner_client.get("/api/images?limit=2&offset=0").json()
    second = owner_client.get("/api/images?limit=2&offset=2").json()

    first_ids = {row["system_id"] for row in first["images"]}
    second_ids = {row["system_id"] for row in second["images"]}
    assert first_ids.isdisjoint(second_ids)


def test_list_missing_pagination_reports_the_full_filtered_total(
    owner_client, tmp_path
):
    images = [_upload(owner_client, data=_png(color=(i, i, i))).json() for i in range(3)]
    for image in images:
        (tmp_path / "library" / f"{image['checksum']}.jpg").unlink()
    # One present image that should not count toward the missing total.
    _upload(owner_client, data=_png(color=(9, 9, 9)))

    response = owner_client.get("/api/images?missing=true&limit=2&offset=0")

    body = response.json()
    assert body["total"] == 3
    assert len(body["images"]) == 2


def test_detach_leaves_the_image_in_the_library(
    owner_client, db_session, sample_anime
):
    image = _upload(owner_client).json()
    attach = owner_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    ).json()

    response = owner_client.delete(
        f"/api/images/{image['system_id']}/attach/{attach['system_id']}"
    )

    assert response.status_code == 204
    assert db_session.query(models.ImageAttachment).count() == 0
    assert db_session.query(models.Image).count() == 1


def test_delete_refuses_while_attached(owner_client, sample_anime):
    image = _upload(owner_client).json()
    owner_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    response = owner_client.delete(f"/api/images/{image['system_id']}")

    assert response.status_code == 409


def test_delete_force_removes_the_image_and_its_attachments(
    owner_client, db_session, sample_anime
):
    image = _upload(owner_client).json()
    owner_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    response = owner_client.delete(f"/api/images/{image['system_id']}?force=true")

    assert response.status_code == 204
    assert db_session.query(models.Image).count() == 0
    assert db_session.query(models.ImageAttachment).count() == 0


def test_delete_force_clears_the_owner_mirror_column(
    owner_client, db_session, sample_anime
):
    # A forced delete removes the attachment row, but that row's mirror
    # column (cover_image_file here) is a plain string, not a foreign key -
    # it does not cascade on its own. Left alone it would still name a file
    # that no longer exists.
    image = _upload(owner_client).json()
    owner_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )
    db_session.refresh(sample_anime)
    assert sample_anime.cover_image_file == image["storage_key"]

    response = owner_client.delete(f"/api/images/{image['system_id']}?force=true")

    assert response.status_code == 204
    db_session.refresh(sample_anime)
    assert sample_anime.cover_image_file is None


# ---------------------------------------------------------------------------
# Cast photos
#
# A casting's photo_file names a library image by storage key, with no
# attachment row: castings are deleted and re-inserted on every cast save, so
# their ids cannot own an attachment. The library therefore has to read
# character_casting.photo_file itself, or a cast photo looks unused and can be
# deleted out from under the cast.
# ---------------------------------------------------------------------------

def _cast_with_photo(db_session, sample_anime, storage_key):
    character = models.Character(system_id=uuid.uuid4(), name_en="Hikari")
    db_session.add(character)
    db_session.flush()
    casting = models.CharacterCasting(
        character_id=character.system_id,
        media_type="anime",
        entry_id=sample_anime.system_id,
        photo_file=storage_key,
    )
    db_session.add(casting)
    db_session.commit()
    return casting


def test_list_unused_excludes_an_image_used_as_a_cast_photo(
    owner_client, db_session, sample_anime
):
    cast_photo = _upload(owner_client).json()
    loose = _upload(owner_client, data=_png(color=(30, 30, 200))).json()
    _cast_with_photo(db_session, sample_anime, cast_photo["storage_key"])

    response = owner_client.get("/api/images?unused=true")

    # The loose image proves the filter still lists unused images, so the
    # cast photo's absence is the filter's doing.
    ids = [image["system_id"] for image in response.json()["images"]]
    assert ids == [loose["system_id"]]


def test_list_reports_how_many_cast_rows_use_an_image(
    owner_client, db_session, sample_anime
):
    cast_photo = _upload(owner_client).json()
    loose = _upload(owner_client, data=_png(color=(30, 30, 200))).json()
    _cast_with_photo(db_session, sample_anime, cast_photo["storage_key"])

    response = owner_client.get("/api/images")

    counts = {i["system_id"]: i["cast_photo_count"] for i in response.json()["images"]}
    assert counts == {cast_photo["system_id"]: 1, loose["system_id"]: 0}


def test_delete_refuses_while_used_as_a_cast_photo(
    owner_client, db_session, sample_anime
):
    cast_photo = _upload(owner_client).json()
    loose = _upload(owner_client, data=_png(color=(30, 30, 200))).json()
    _cast_with_photo(db_session, sample_anime, cast_photo["storage_key"])

    refused = owner_client.delete(f"/api/images/{cast_photo['system_id']}")
    allowed = owner_client.delete(f"/api/images/{loose['system_id']}")

    assert refused.status_code == 409
    assert allowed.status_code == 204


def test_delete_force_clears_the_cast_photo(owner_client, db_session, sample_anime):
    cast_photo = _upload(owner_client).json()
    casting = _cast_with_photo(db_session, sample_anime, cast_photo["storage_key"])

    response = owner_client.delete(f"/api/images/{cast_photo['system_id']}?force=true")

    assert response.status_code == 204
    db_session.refresh(casting)
    assert casting.photo_file is None


# ---------------------------------------------------------------------------
# The guard on bulk_download_missing_covers
#
# That action nulls cover_image_file and re-fetches from MAL. Against a
# DOWNLOADED cover that is correct and idempotent. Against an UPLOADED one on a
# machine that does not have the file - which is guaranteed to happen, because
# uploaded images never travel through Backup or Pull - it destroys the only
# reference to a file no API can supply, and reports success.
# ---------------------------------------------------------------------------

def test_download_missing_covers_skips_an_uploaded_image(
    owner_client, db_session, sample_anime, tmp_path
):
    from app.services import calculation

    image = _upload(owner_client).json()
    owner_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )
    sample_anime.cover_image_file = image["storage_key"]
    db_session.flush()
    # The bytes are gone - the other machine has them, this one does not.
    (tmp_path / "library" / f"{image['checksum']}.jpg").unlink()

    result = calculation.bulk_download_missing_covers(db_session)

    db_session.refresh(sample_anime)
    assert sample_anime.cover_image_file == image["storage_key"]
    assert result["skipped_uploads"] >= 1


# ---------------------------------------------------------------------------
# Clearing an owner's image - DELETE /api/images/owners/{type}/{id}/{role}
#
# An owner's cover can live in three places: an attachment (to an uploaded or
# a backfilled downloaded image), the mirror column, and the file downloaded
# for it at covers/<owner_type>/<id>.jpg. A cover downloaded after the library
# existed has no image row at all. Clearing has to empty all three, or the
# leftover file comes back - as the old title's picture - on the next download
# or the next Set Cover Image Fields.
# ---------------------------------------------------------------------------

@pytest.fixture
def covers_dir(tmp_path, monkeypatch):
    """
    Downloaded covers under the same tmp root the library already uses, so a
    backfilled row's `covers/...` storage key and image_manager agree on where
    the file is.
    """
    from app.services.integrations import image_manager

    root = tmp_path / "covers"
    monkeypatch.setattr(image_manager, "COVER_DIR", str(root))
    return root


def _downloaded_file(covers_dir, owner_type, owner_id, payload=b"old title"):
    folder = covers_dir / owner_type
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{owner_id}.jpg"
    path.write_bytes(payload)
    return path


def _backfilled_image(db_session, owner_type, owner_id, attach_to=None):
    """An image row the way c1image0002 made one: downloaded, entry-keyed."""
    key = f"{owner_type}/{owner_id}.jpg"
    image = models.Image(
        storage_key=f"covers/{key}",
        checksum=f"legacy:{key}",
        uploaded_by=None,
    )
    db_session.add(image)
    db_session.flush()
    for other_type, other_id in [(owner_type, owner_id)] + (attach_to or []):
        db_session.add(
            models.ImageAttachment(
                image_id=image.system_id,
                owner_type=other_type,
                owner_id=other_id,
                role="cover",
                position=0,
            )
        )
    db_session.flush()
    return image


def _clear(client, owner_type, owner_id, role="cover"):
    return client.delete(f"/api/images/owners/{owner_type}/{owner_id}/{role}")


def test_clear_removes_a_download_that_has_no_image_row(
    owner_client, db_session, sample_anime, covers_dir
):
    path = _downloaded_file(covers_dir, "anime", sample_anime.system_id)
    sample_anime.cover_image_file = f"anime/{sample_anime.system_id}.jpg"
    db_session.flush()

    response = _clear(owner_client, "anime", sample_anime.system_id)

    assert response.status_code == 204
    db_session.refresh(sample_anime)
    assert sample_anime.cover_image_file is None
    assert not path.exists()


def test_clear_deletes_a_backfilled_download_with_its_row_and_file(
    owner_client, db_session, sample_anime, covers_dir
):
    path = _downloaded_file(covers_dir, "anime", sample_anime.system_id)
    _backfilled_image(db_session, "anime", sample_anime.system_id)
    sample_anime.cover_image_file = f"anime/{sample_anime.system_id}.jpg"
    db_session.flush()

    response = _clear(owner_client, "anime", sample_anime.system_id)

    assert response.status_code == 204
    db_session.refresh(sample_anime)
    assert sample_anime.cover_image_file is None
    assert db_session.query(models.ImageAttachment).count() == 0
    # Not left behind as an "unused" library image aliasing the next download.
    assert db_session.query(models.Image).count() == 0
    assert not path.exists()


def test_clear_keeps_an_uploaded_image_in_the_library(
    owner_client, db_session, sample_anime, covers_dir, tmp_path
):
    image = _upload(owner_client).json()
    owner_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    response = _clear(owner_client, "anime", sample_anime.system_id)

    assert response.status_code == 204
    db_session.refresh(sample_anime)
    assert sample_anime.cover_image_file is None
    assert db_session.query(models.ImageAttachment).count() == 0
    assert db_session.query(models.Image).count() == 1
    assert (tmp_path / image["storage_key"]).exists()


def test_clear_keeps_a_download_still_attached_to_another_owner(
    owner_client, db_session, sample_anime, covers_dir
):
    # A backfilled image chosen from the library for a second entry: its file
    # is this entry's download, but the other entry still shows it.
    other = uuid.uuid4()
    path = _downloaded_file(covers_dir, "anime", sample_anime.system_id)
    _backfilled_image(
        db_session, "anime", sample_anime.system_id, attach_to=[("anime", other)]
    )

    response = _clear(owner_client, "anime", sample_anime.system_id)

    assert response.status_code == 204
    assert db_session.query(models.Image).count() == 1
    remaining = db_session.query(models.ImageAttachment).one()
    assert remaining.owner_id == other
    assert path.exists()


def test_clear_is_a_no_op_on_an_owner_with_no_image(
    owner_client, db_session, sample_anime, covers_dir
):
    response = _clear(owner_client, "anime", sample_anime.system_id)

    assert response.status_code == 204
    db_session.refresh(sample_anime)
    assert sample_anime.cover_image_file is None


def test_clear_rejects_an_unknown_owner_type(owner_client, sample_anime):
    assert _clear(owner_client, "animes", sample_anime.system_id).status_code == 400


def test_clear_requires_manage_catalog(client, sample_anime):
    assert _clear(client, "anime", sample_anime.system_id).status_code == 401


# Same pair as attach: one writer blind to the label, one holding it, both
# against the same labelled entry - so the 404 is the gate and not something
# incidental. nsfw_label (through hidden_anime) is what gives it something to
# refuse.

def test_clear_404s_for_a_writer_who_cannot_see_the_entry(
    db_session, client, catalog_writer, hidden_anime, covers_dir  # noqa: F811
):
    hidden_anime.cover_image_file = f"anime/{hidden_anime.system_id}.jpg"
    path = _downloaded_file(covers_dir, "anime", hidden_anime.system_id)
    db_session.flush()
    writer = catalog_writer(username="blindclearer", label_keys=())

    response = _clear(writer, "anime", hidden_anime.system_id)

    assert response.status_code == 404
    db_session.refresh(hidden_anime)
    assert hidden_anime.cover_image_file is not None
    assert path.exists()


def test_clear_succeeds_for_a_writer_who_holds_the_label(
    db_session, client, catalog_writer, hidden_anime, covers_dir  # noqa: F811
):
    hidden_anime.cover_image_file = f"anime/{hidden_anime.system_id}.jpg"
    path = _downloaded_file(covers_dir, "anime", hidden_anime.system_id)
    db_session.flush()
    writer = catalog_writer(username="seeingclearer", label_keys=("nsfw",))

    response = _clear(writer, "anime", hidden_anime.system_id)

    assert response.status_code == 204
    db_session.refresh(hidden_anime)
    assert hidden_anime.cover_image_file is None
    assert not path.exists()


def test_detaching_a_backfilled_download_deletes_it(
    owner_client, db_session, sample_anime, covers_dir
):
    # Detach leaves an UPLOAD in the library (test above). A download goes:
    # kept, it would alias the entry's next download, and deleting it from
    # the library later would delete that live cover.
    path = _downloaded_file(covers_dir, "anime", sample_anime.system_id)
    image = _backfilled_image(db_session, "anime", sample_anime.system_id)
    attachment = db_session.query(models.ImageAttachment).one()

    response = owner_client.delete(
        f"/api/images/{image.system_id}/attach/{attachment.system_id}"
    )

    assert response.status_code == 204
    assert db_session.query(models.Image).count() == 0
    assert not path.exists()
