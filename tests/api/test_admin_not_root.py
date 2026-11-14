"""
The admin account is not root.

It holds exactly its fixed set (permissions.ADMIN_FIXED_PERMISSIONS): it runs
the installation - accounts, roles, access modes, the label reference,
pipelines, the request inbox, announcements, options, images and resources -
and reads and writes no catalogue, keeps no personal data, and sits in no
mode.

Every refusal below runs against a row that is THERE - an entry, a member's
note - and is paired with the account that may do the same thing, so a
refusal is the admin's and not an empty table's.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.rbac.seed_modes import MODE_NORMAL


def _payload(owner_id, section, content):
    return {
        "owner_type": "anime",
        "owner_id": str(owner_id),
        "section": section,
        "content": content,
    }


# ---------------------------------------------------------------------------
# The catalogue
# ---------------------------------------------------------------------------


def test_the_admin_reads_no_catalogue_entry(admin_client, owner_client, sample_anime):
    url = f"/api/anime/{sample_anime.system_id}"
    refused = admin_client.get(url)
    assert refused.status_code in (401, 404), refused.text
    assert "Test Anime" not in admin_client.get("/api/anime/").text

    # The mirror: the entry is there, and the owner (super) reads it.
    assert owner_client.get(url).status_code == 200
    assert "Test Anime" in owner_client.get("/api/anime/").text


def test_the_admin_writes_no_catalogue_entry(admin_client, owner_client, sample_anime):
    url = f"/api/anime/{sample_anime.system_id}"
    assert admin_client.put(url, json={"anime_name_en": "Renamed"}).status_code == 401

    # The mirror: the same write by the owner succeeds.
    assert owner_client.put(url, json={"anime_name_en": "Renamed"}).status_code == 200


# ---------------------------------------------------------------------------
# Its own pages
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "/api/users/",
        "/api/roles/",
        "/api/access-modes/",
        "/api/content-labels/",
        "/api/requests",
        "/api/images",
        "/api/resources",
        "/api/constants/external-apis",
        "/api/data-control/check/duplicates",
    ],
)
def test_the_admin_reaches_each_of_its_pages(admin_client, url):
    r = admin_client.get(url)
    assert r.status_code == 200, (url, r.text)


def test_the_admin_writes_announcements_and_options(admin_client):
    assert (
        admin_client.post(
            "/api/announcements/", json={"title": "Notice", "body": "Hello"}
        ).status_code
        in (200, 201)
    )
    assert (
        admin_client.post(
            "/api/options/", json={"category": "Genre Main", "value": "Zvornik Admin"}
        ).status_code
        in (200, 201)
    )


# ---------------------------------------------------------------------------
# Notes: no exemption from authorship, no catalogue rows
# ---------------------------------------------------------------------------


@pytest.fixture
def members_personal_note(db_session, sample_anime, plain_user):
    note = models.Note(
        system_id=uuid.uuid4(),
        media_id=sample_anime.system_id,
        section="advantages",
        content="member 的優點",
        author_id=plain_user.id,
    )
    db_session.add(note)
    db_session.flush()
    return note


def test_the_admin_cannot_edit_or_delete_a_members_personal_note(
    db_session, admin_client, user_client, members_personal_note
):
    url = f"/api/notes/{members_personal_note.system_id}"
    assert admin_client.patch(url, json={"content": "改了"}).status_code in (401, 404)
    assert admin_client.delete(url).status_code in (401, 404)
    db_session.expire_all()
    assert db_session.get(models.Note, members_personal_note.system_id) is not None

    # The mirror: the note's author deletes it.
    assert user_client.delete(url).status_code == 204


def test_the_admin_writes_no_catalogue_note(admin_client, owner_client, sample_anime):
    body = _payload(sample_anime.system_id, "public_reviews", "大眾評價")
    assert admin_client.post("/api/notes", json=body).status_code == 401

    # The mirror: super writes it.
    assert owner_client.post("/api/notes", json=body).status_code == 201


# ---------------------------------------------------------------------------
# The admin account itself
# ---------------------------------------------------------------------------


def test_the_seeded_admin_account_has_no_mode(db_session, admin_client, plain_user):
    """The lifespan seeds `admin` (admin_client starts it). The INSERT takes
    the columns' `normal` default, so the account is parked afterwards."""
    seeded = db_session.query(models.User).filter(models.User.username == "admin").one()
    assert (seeded.mode_ceiling, seeded.mode_default) == (None, None)

    # The mirror: an account created the ordinary way does get the default,
    # so the None above is the parking and not a column with no default.
    assert (plain_user.mode_ceiling, plain_user.mode_default) == (MODE_NORMAL, MODE_NORMAL)


def test_the_admin_account_cannot_be_deleted(db_session, admin_client, admin_user, plain_user):
    other_admin = models.User(
        id=uuid.uuid4(),
        username="second_admin",
        hashed_password="x",
        role_id=admin_user.role_id,
        mode_ceiling=None,
        mode_default=None,
    )
    db_session.add(other_admin)
    db_session.flush()
    # Not the caller itself (that is the self-delete guard's 409): another
    # admin-role account, which the last-admin guard would have allowed.
    assert admin_client.delete(f"/api/users/{other_admin.id}").status_code == 409

    # The mirror: a member is deleted.
    assert admin_client.delete(f"/api/users/{plain_user.id}").status_code == 204


def test_the_admin_account_takes_no_mode(admin_client, admin_user, plain_user, access_modes):
    body = {"ceiling": MODE_NORMAL, "default": MODE_NORMAL}
    assert (
        admin_client.put(f"/api/users/{admin_user.id}/access-modes", json=body).status_code
        == 409
    )

    # The mirror: a member takes the same pair.
    assert (
        admin_client.put(f"/api/users/{plain_user.id}/access-modes", json=body).status_code
        == 200
    )
