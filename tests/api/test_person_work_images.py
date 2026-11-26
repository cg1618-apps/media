"""
A person's gallery of works: /api/person/{id}/work-images.

The refusal tests create a person who EXISTS and holds roles - a director -
so the 422 is the gallery-role gate refusing, not a 404 for a missing person
or a vacuous pass on an empty role set; each is mirrored by an author or
illustrator who passes the same call.
"""

import io
import os
import uuid

import pytest
from PIL import Image as PILImage

from app import models
from app.services.integrations import image_library


@pytest.fixture(autouse=True)
def _library_in_tmp(tmp_path, monkeypatch):
    """Never write into the developer's real static/library during a test."""
    monkeypatch.setattr(image_library, "STATIC_DIR", str(tmp_path))


def _png(color=(200, 30, 30), width=50, height=40):
    buf = io.BytesIO()
    PILImage.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


def _person(owner_client, name, roles):
    response = owner_client.post("/api/person/", json={"name": name, "roles": roles})
    assert response.status_code in (200, 201), response.text
    return response.json()


def _author(owner_client, name="尾田栄一郎"):
    return _person(owner_client, name, [{"role": "author", "scope": "manga"}])


def _upload(client, person_id, *colors):
    files = [
        ("files", (f"work{i}.png", _png(color), "image/png"))
        for i, color in enumerate(colors or [(200, 30, 30)])
    ]
    return client.post(f"/api/person/{person_id}/work-images", files=files)


def _path(tmp_path, key):
    return os.path.join(str(tmp_path), *key.split("/"))


# ---------------------------------------------------------------------------
# Upload, and who may hold a gallery
# ---------------------------------------------------------------------------


def test_upload_appends_several_pictures_in_order(owner_client, db_session):
    person = _author(owner_client)

    response = _upload(owner_client, person["system_id"], (1, 2, 3), (4, 5, 6))

    assert response.status_code == 201
    body = response.json()
    assert [p["position"] for p in body] == [0, 1]
    assert all(p["storage_key"].startswith("library/") for p in body)
    rows = db_session.query(models.ImageAttachment).all()
    assert {(r.owner_type, r.role) for r in rows} == {("staff", "work")}


def test_a_second_upload_goes_after_the_first(owner_client):
    person = _author(owner_client)
    _upload(owner_client, person["system_id"], (1, 2, 3))

    body = _upload(owner_client, person["system_id"], (9, 9, 9)).json()

    assert [p["position"] for p in body] == [0, 1]


def test_the_same_picture_is_not_added_twice(owner_client):
    person = _author(owner_client)
    _upload(owner_client, person["system_id"], (1, 2, 3))

    body = _upload(owner_client, person["system_id"], (1, 2, 3)).json()

    assert len(body) == 1


def test_upload_is_refused_for_a_person_who_is_neither_author_nor_illustrator(
    owner_client, db_session
):
    # A real person holding a real role - only not one with works to show.
    director = _person(owner_client, "新海誠", [{"role": "director", "scope": "anime"}])

    response = _upload(owner_client, director["system_id"])

    assert response.status_code == 422
    assert "author or illustrator" in response.json()["detail"]
    assert db_session.query(models.ImageAttachment).count() == 0
    assert db_session.query(models.Image).count() == 0


def test_upload_is_accepted_for_an_illustrator(owner_client):
    illustrator = _person(
        owner_client, "村田雄介", [{"role": "illustrator", "scope": "manga"}]
    )

    assert _upload(owner_client, illustrator["system_id"]).status_code == 201


def test_one_bad_file_stores_none(owner_client, db_session):
    person = _author(owner_client)

    response = owner_client.post(
        f"/api/person/{person['system_id']}/work-images",
        files=[
            ("files", ("good.png", _png(), "image/png")),
            ("files", ("bad.png", b"not an image", "image/png")),
        ],
    )

    assert response.status_code == 422
    assert db_session.query(models.Image).count() == 0


def test_upload_404s_on_a_missing_person(owner_client):
    assert _upload(owner_client, uuid.uuid4()).status_code == 404


def test_a_guest_may_not_upload(owner_client, client):
    person = _author(owner_client)
    client.cookies.clear()

    assert _upload(client, person["system_id"]).status_code == 401


def test_a_reader_without_manage_images_may_not_upload(owner_client, guest_reader, db_session):
    person = _author(owner_client)

    response = _upload(guest_reader, person["system_id"])

    assert response.status_code in (401, 403)
    assert db_session.query(models.ImageAttachment).count() == 0


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------


def test_a_reader_sees_the_gallery_in_order(owner_client, guest_reader):
    person = _author(owner_client)
    _upload(owner_client, person["system_id"], (1, 2, 3), (4, 5, 6))

    response = guest_reader.get(f"/api/person/{person['system_id']}/work-images")

    assert response.status_code == 200
    assert [p["position"] for p in response.json()] == [0, 1]


def test_reading_404s_on_a_missing_person(guest_reader):
    response = guest_reader.get(f"/api/person/{uuid.uuid4()}/work-images")
    assert response.status_code == 404


def test_an_author_role_the_viewer_cannot_see_shows_no_gallery(
    owner_client, guest_reader, db_session
):
    """
    The author role is scoped to h-comic only, which a guest's session cannot
    see. The person stays visible (credited on an ordinary anime), but the
    gallery is empty for them - and full for the owner, who sees h-comic.
    """
    person = _person(
        owner_client,
        "某作家",
        [
            {"role": "director", "scope": "anime"},
            {"role": "author", "scope": "h-comic"},
        ],
    )
    anime = models.Anime(anime_name_cn="測試")
    db_session.add(anime)
    db_session.flush()
    db_session.add(
        models.MediaCredit(
            media_id=anime.system_id, role="director", person_id=person["system_id"]
        )
    )
    db_session.commit()
    assert _upload(owner_client, person["system_id"]).status_code == 201

    url = f"/api/person/{person['system_id']}/work-images"
    assert guest_reader.get(f"/api/person/{person['system_id']}").status_code == 200
    assert guest_reader.get(url).json() == []
    assert len(owner_client.get(url).json()) == 1


# ---------------------------------------------------------------------------
# Caption, reorder
# ---------------------------------------------------------------------------


def test_caption_is_set_and_cleared(owner_client):
    person = _author(owner_client)
    picture = _upload(owner_client, person["system_id"]).json()[0]
    url = f"/api/person/{person['system_id']}/work-images/{picture['system_id']}"

    set_ = owner_client.patch(url, json={"caption": "  One Piece vol. 1  "})
    assert set_.status_code == 200
    assert set_.json()["caption"] == "One Piece vol. 1"

    cleared = owner_client.patch(url, json={"caption": "   "})
    assert cleared.json()["caption"] is None


def test_caption_404s_on_another_persons_picture(owner_client):
    first = _author(owner_client, "A")
    second = _author(owner_client, "B")
    picture = _upload(owner_client, first["system_id"]).json()[0]

    response = owner_client.patch(
        f"/api/person/{second['system_id']}/work-images/{picture['system_id']}",
        json={"caption": "x"},
    )

    assert response.status_code == 404


def test_reorder_puts_the_pictures_in_the_order_sent(owner_client):
    person = _author(owner_client)
    body = _upload(owner_client, person["system_id"], (1, 1, 1), (2, 2, 2), (3, 3, 3)).json()
    ids = [p["system_id"] for p in body]

    response = owner_client.put(
        f"/api/person/{person['system_id']}/work-images",
        json={"attachment_ids": [ids[2], ids[0], ids[1]]},
    )

    assert response.status_code == 200
    assert [p["system_id"] for p in response.json()] == [ids[2], ids[0], ids[1]]
    assert [p["position"] for p in response.json()] == [0, 1, 2]


def test_reorder_must_name_every_picture_once(owner_client):
    person = _author(owner_client)
    ids = [
        p["system_id"]
        for p in _upload(owner_client, person["system_id"], (1, 1, 1), (2, 2, 2)).json()
    ]
    url = f"/api/person/{person['system_id']}/work-images"

    assert owner_client.put(url, json={"attachment_ids": ids[:1]}).status_code == 422
    assert owner_client.put(url, json={"attachment_ids": [ids[0], ids[0]]}).status_code == 422
    assert owner_client.put(url, json={"attachment_ids": ids[::-1]}).status_code == 200


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


def test_delete_removes_the_picture_and_its_file(owner_client, db_session, tmp_path):
    person = _author(owner_client)
    body = _upload(owner_client, person["system_id"], (1, 1, 1), (2, 2, 2)).json()
    gone = body[0]
    assert os.path.exists(_path(tmp_path, gone["storage_key"]))

    response = owner_client.delete(
        f"/api/person/{person['system_id']}/work-images/{gone['system_id']}"
    )

    assert response.status_code == 204
    assert not os.path.exists(_path(tmp_path, gone["storage_key"]))
    assert not os.path.exists(_path(tmp_path, gone["thumb_key"]))
    assert db_session.get(models.Image, uuid.UUID(gone["image_id"])) is None
    left = owner_client.get(f"/api/person/{person['system_id']}/work-images").json()
    # The gap closes.
    assert [(p["system_id"], p["position"]) for p in left] == [(body[1]["system_id"], 0)]


def test_delete_keeps_a_file_another_owner_still_uses(
    owner_client, db_session, tmp_path, sample_anime
):
    person = _author(owner_client)
    picture = _upload(owner_client, person["system_id"]).json()[0]
    # The same picture is also an anime's cover.
    attach = owner_client.post(
        f"/api/images/{picture['image_id']}/attach",
        json={"owner_type": "anime", "owner_id": str(sample_anime.system_id), "role": "cover"},
    )
    assert attach.status_code == 201

    owner_client.delete(
        f"/api/person/{person['system_id']}/work-images/{picture['system_id']}"
    )

    assert os.path.exists(_path(tmp_path, picture["storage_key"]))
    assert db_session.get(models.Image, uuid.UUID(picture["image_id"])) is not None


def test_a_guest_may_not_delete(owner_client, client):
    person = _author(owner_client)
    picture = _upload(owner_client, person["system_id"]).json()[0]
    client.cookies.clear()

    response = client.delete(
        f"/api/person/{person['system_id']}/work-images/{picture['system_id']}"
    )

    assert response.status_code == 401


def test_deleting_the_person_removes_the_gallery_and_its_files(
    owner_client, db_session, tmp_path
):
    person = _author(owner_client)
    picture = _upload(owner_client, person["system_id"]).json()[0]

    response = owner_client.delete(f"/api/person/{person['system_id']}?credits=0")

    assert response.status_code == 200
    assert db_session.query(models.ImageAttachment).count() == 0
    assert db_session.query(models.Image).count() == 0
    assert not os.path.exists(_path(tmp_path, picture["storage_key"]))


# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------


def test_merge_appends_the_losers_pictures_after_the_survivors(owner_client):
    keep = _author(owner_client, "Keep")
    drop = _author(owner_client, "Drop")
    kept = _upload(owner_client, keep["system_id"], (1, 1, 1), (2, 2, 2)).json()
    moved = _upload(owner_client, drop["system_id"], (3, 3, 3), (1, 1, 1)).json()

    response = owner_client.post(
        f"/api/person/{keep['system_id']}/merge", json={"source_id": drop["system_id"]}
    )

    assert response.status_code == 200
    gallery = owner_client.get(f"/api/person/{keep['system_id']}/work-images").json()
    # The loser's copy of (1, 1, 1) is the survivor's first picture already.
    assert [p["image_id"] for p in gallery] == [
        kept[0]["image_id"],
        kept[1]["image_id"],
        moved[0]["image_id"],
    ]
    assert [p["position"] for p in gallery] == [0, 1, 2]


# ---------------------------------------------------------------------------
# Content rating
#
# Each refusal is read from the owner's own account in a narrower mode
# (mode_client): the owner holds manage.images and view.person, so a missing
# picture or a 404 can only be the rating. Each is mirrored by the same
# gallery read in a mode that shows the rating.
# ---------------------------------------------------------------------------


def _rated_gallery(owner_client, *ratings):
    """An author with one picture per rating, in order; returns (person, ids)."""
    person = _author(owner_client)
    colors = [(10 * i, 20, 30) for i in range(len(ratings))]
    body = _upload(owner_client, person["system_id"], *colors).json()
    ids = [p["system_id"] for p in body]
    for picture_id, rating in zip(ids, ratings):
        if rating != "normal":
            response = owner_client.patch(
                f"/api/person/{person['system_id']}/work-images/{picture_id}",
                json={"content_rating": rating},
            )
            assert response.status_code == 200, response.text
            assert response.json()["content_rating"] == rating
    return person, ids


def test_a_picture_rated_above_the_mode_is_not_listed(owner_client, mode_client):
    person, ids = _rated_gallery(owner_client, "normal", "borderline", "unrestricted")
    url = f"/api/person/{person['system_id']}/work-images"

    def listed(mode):
        response = mode_client(mode).get(url)
        assert response.status_code == 200
        return [p["system_id"] for p in response.json()]

    assert listed("safe") == [ids[0]]
    assert listed("normal") == [ids[0]]
    assert listed("borderline") == ids[:2]
    assert listed("unrestricted") == ids


def test_a_new_picture_is_normal(owner_client):
    person = _author(owner_client)
    picture = _upload(owner_client, person["system_id"]).json()[0]
    assert picture["content_rating"] == "normal"


def test_a_caption_patch_leaves_the_rating_and_a_rating_patch_the_caption(owner_client):
    person, [picture_id] = _rated_gallery(owner_client, "borderline")
    url = f"/api/person/{person['system_id']}/work-images/{picture_id}"

    captioned = owner_client.patch(url, json={"caption": "vol. 1"}).json()
    assert captioned["content_rating"] == "borderline"

    rated = owner_client.patch(url, json={"content_rating": "normal"}).json()
    assert rated["caption"] == "vol. 1"
    assert rated["content_rating"] == "normal"


@pytest.mark.parametrize("bad", ["adult", "", None])
def test_an_unknown_picture_rating_is_refused(owner_client, db_session, bad):
    person, [picture_id] = _rated_gallery(owner_client, "borderline")

    response = owner_client.patch(
        f"/api/person/{person['system_id']}/work-images/{picture_id}",
        json={"content_rating": bad},
    )

    assert response.status_code == 422
    row = db_session.get(models.ImageAttachment, uuid.UUID(picture_id))
    db_session.refresh(row)
    assert row.content_rating == "borderline"


def test_a_hidden_picture_cannot_be_captioned_or_removed(owner_client, mode_client):
    person, [shown, hidden] = _rated_gallery(owner_client, "normal", "borderline")
    narrow = mode_client("normal")
    base = f"/api/person/{person['system_id']}/work-images"

    assert narrow.patch(f"{base}/{hidden}", json={"caption": "x"}).status_code == 404
    assert narrow.delete(f"{base}/{hidden}").status_code == 404
    # The mirror, same session: the picture it can see answers.
    assert narrow.patch(f"{base}/{shown}", json={"caption": "x"}).status_code == 200


def test_a_reorder_keeps_a_hidden_picture_in_its_slot(owner_client, mode_client):
    person, [first, hidden, last] = _rated_gallery(
        owner_client, "normal", "borderline", "normal"
    )
    url = f"/api/person/{person['system_id']}/work-images"

    narrow = mode_client("normal")
    # Naming the hidden picture is a 422, like naming a stranger's: this
    # editor's gallery does not hold it.
    assert narrow.put(url, json={"attachment_ids": [last, hidden, first]}).status_code == 422
    response = narrow.put(url, json={"attachment_ids": [last, first]})
    assert response.status_code == 200, response.text
    assert [p["system_id"] for p in response.json()] == [last, first]

    everything = owner_client.get(url).json()
    assert [p["system_id"] for p in everything] == [last, hidden, first]
    assert [p["position"] for p in everything] == [0, 1, 2]
