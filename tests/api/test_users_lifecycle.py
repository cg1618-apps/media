"""
/users and the account lifecycle: the username and password checks on create
and edit, and status (`active` / `disabled`) on PATCH.

The username policy applies to every NEW name - create and rename - and not to
the rows that already exist, which is why the `admin` account keeps its name.
Uniqueness is case-insensitive, held by the `uq_users_username_lower` index.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models
from app.services.security import get_password_hash
from tests.api.conftest import role_id_for

USERS = "/api/users/"


@pytest.fixture
def user_role(db_session):
    return str(role_id_for(db_session, "user"))


def create(admin_client, user_role, username, password="pw"):
    return admin_client.post(
        USERS, json={"username": username, "password": password, "role_id": user_role}
    )


def raw_account(db, username):
    user = models.User(
        id=uuid.uuid4(),
        username=username,
        hashed_password=get_password_hash("pw"),
        role_id=role_id_for(db, "user"),
    )
    db.add(user)
    db.flush()
    return user


# ---------------------------------------------------------------------------
# Usernames
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name", ["admin1", "qadminqe", "gUesT", "Kai", "ab"])
def test_create_refuses_a_name_outside_the_policy(admin_client, user_role, name):
    r = create(admin_client, user_role, name)
    assert r.status_code == 422
    assert isinstance(r.json()["detail"], str)


@pytest.mark.parametrize("name", ["adamin", "adm1in", "kai"])
def test_create_accepts_the_policy_mirrors(admin_client, user_role, name):
    assert create(admin_client, user_role, name).status_code == 201


def test_a_name_differing_only_in_case_is_taken(admin_client, db_session, user_role):
    """`Kai` predates the policy; a new `kai` would be the same login."""
    raw_account(db_session, "Kai")
    r = create(admin_client, user_role, "kai")
    assert r.status_code == 409
    assert r.json()["detail"] == "That username is taken."


def test_the_database_refuses_a_case_clash_too(db_session):
    raw_account(db_session, "Kai")
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            raw_account(db_session, "kai")


def test_rename_applies_the_policy(admin_client, db_session):
    target = raw_account(db_session, "target")
    assert (
        admin_client.patch(f"/api/users/{target.id}", json={"username": "Target2"})
    ).status_code == 422
    raw_account(db_session, "Other")
    assert (
        admin_client.patch(f"/api/users/{target.id}", json={"username": "other"})
    ).status_code == 409
    ok = admin_client.patch(f"/api/users/{target.id}", json={"username": "renamed"})
    assert ok.status_code == 200
    assert ok.json()["username"] == "renamed"


def test_an_existing_name_outside_the_policy_survives_an_unrelated_edit(
    admin_client, db_session
):
    """Not applied to existing rows: the legacy name stays when the payload
    repeats it or leaves it out."""
    legacy = raw_account(db_session, "Old Name")
    r = admin_client.patch(
        f"/api/users/{legacy.id}", json={"username": "Old Name", "password": "x"}
    )
    assert r.status_code == 200
    assert r.json()["username"] == "Old Name"


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------


def test_create_refuses_an_empty_password(admin_client, user_role):
    assert create(admin_client, user_role, "kana", "").status_code == 422


def test_create_refuses_73_bytes(admin_client, user_role):
    r = create(admin_client, user_role, "kana", "é" * 36 + "a")
    assert r.status_code == 422
    assert "72" in r.json()["detail"]


def test_create_accepts_one_character(admin_client, user_role):
    assert create(admin_client, user_role, "kana", "x").status_code == 201


def test_set_password_applies_the_same_checks(admin_client, db_session):
    target = raw_account(db_session, "target")
    for bad in ("", "é" * 36 + "a"):
        r = admin_client.patch(f"/api/users/{target.id}", json={"password": bad})
        assert r.status_code == 422
    assert (
        admin_client.patch(f"/api/users/{target.id}", json={"password": "x"})
    ).status_code == 200


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------


def test_the_response_carries_status(admin_client, user_role):
    assert create(admin_client, user_role, "kana").json()["status"] == "active"


def test_disable_and_enable(admin_client, db_session):
    target = raw_account(db_session, "target")
    r = admin_client.patch(f"/api/users/{target.id}", json={"status": "disabled"})
    assert r.status_code == 200
    assert r.json()["status"] == "disabled"
    db_session.refresh(target)
    assert target.session_version == 1

    r = admin_client.patch(f"/api/users/{target.id}", json={"status": "active"})
    assert r.json()["status"] == "active"
    db_session.refresh(target)
    # Enabling does not bump: the counter moved when the sessions ended.
    assert target.session_version == 1


def test_pending_is_not_set_here(admin_client, db_session):
    target = raw_account(db_session, "target")
    r = admin_client.patch(f"/api/users/{target.id}", json={"status": "pending"})
    assert r.status_code == 422


def test_a_pending_account_is_not_edited_here(admin_client, db_session):
    target = raw_account(db_session, "target")
    target.status = "pending"
    db_session.flush()
    r = admin_client.patch(f"/api/users/{target.id}", json={"status": "active"})
    assert r.status_code == 409


def test_the_admin_cannot_disable_itself(admin_client, admin_user, db_session):
    r = admin_client.patch(f"/api/users/{admin_user.id}", json={"status": "disabled"})
    assert r.status_code == 409
    assert r.json()["detail"] == "You cannot disable yourself."
    # The mirror: the same request for another account goes through.
    other = raw_account(db_session, "other")
    assert (
        admin_client.patch(f"/api/users/{other.id}", json={"status": "disabled"})
    ).status_code == 200


