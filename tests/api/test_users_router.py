"""
/users and the fixed roles.

An account is given `user` or `super` and nothing else. The admin account's
role and a shared account's role never change, a shared account is never
deleted, and its mode is never edited. Each refusal is explicit and none
relies on the last-admin guard: every 409 below is checked against an
account that guard would have let through.

Every refusal is paired with the mirror case that must still succeed.
"""

import pytest

from app import models
from app.models.system import USER_STATUS_DISABLED
from tests.api.conftest import role_id_for

USERS = "/api/users/"


def _create(admin_client, db_session, role_name, username="newmember"):
    return admin_client.post(
        USERS,
        json={
            "username": username,
            "password": "pw",
            "role_id": str(role_id_for(db_session, role_name)),
        },
    )


def _shared(db_session):
    return (
        db_session.query(models.User)
        .filter(models.User.username == "shared-normal")
        .one()
    )


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("role_name", ["admin", "guest", "shared"])
def test_create_refuses_a_role_outside_user_and_super(
    admin_client, db_session, role_name
):
    assert _create(admin_client, db_session, role_name).status_code == 422


@pytest.mark.parametrize("role_name", ["user", "super"])
def test_create_accepts_user_and_super(admin_client, db_session, role_name):
    r = _create(admin_client, db_session, role_name)
    assert r.status_code == 201, r.text
    assert r.json()["role_name"] == role_name


# ---------------------------------------------------------------------------
# Role changes
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("role_name", ["admin", "guest", "shared"])
def test_a_member_cannot_be_moved_outside_user_and_super(
    admin_client, db_session, plain_user, role_name
):
    r = admin_client.patch(
        f"{USERS}{plain_user.id}",
        json={"role_id": str(role_id_for(db_session, role_name))},
    )
    assert r.status_code == 422


def test_a_member_can_be_made_super(admin_client, db_session, plain_user):
    """Mirror: the 422s above came from the target role, not from refusing
    every role change."""
    r = admin_client.patch(
        f"{USERS}{plain_user.id}",
        json={"role_id": str(role_id_for(db_session, "super"))},
    )
    assert r.status_code == 200, r.text
    assert r.json()["role_name"] == "super"


def test_the_admins_own_role_is_fixed(admin_client, db_session, admin_user):
    """The lifespan seeds a second admin, so the last-admin guard would allow
    this demotion. The 409 is the fixed-role rule, by its message."""
    assert (
        db_session.query(models.User)
        .filter(models.User.role_id == role_id_for(db_session, "admin"))
        .count()
        >= 2
    )
    r = admin_client.patch(
        f"{USERS}{admin_user.id}",
        json={"role_id": str(role_id_for(db_session, "super"))},
    )
    assert r.status_code == 409
    assert r.json()["detail"] == "The admin account's role is fixed."


def test_a_shared_accounts_role_is_fixed(admin_client, db_session):
    r = admin_client.patch(
        f"{USERS}{_shared(db_session).id}",
        json={"role_id": str(role_id_for(db_session, "user"))},
    )
    assert r.status_code == 409
    assert r.json()["detail"] == "A shared account's role is fixed."


def test_a_shared_account_takes_a_password(admin_client, db_session):
    """Only the admin sets it, and the admin may."""
    r = admin_client.patch(f"{USERS}{_shared(db_session).id}", json={"password": "pw"})
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Delete and disable
# ---------------------------------------------------------------------------


def test_a_shared_account_cannot_be_deleted(admin_client, db_session):
    r = admin_client.delete(f"{USERS}{_shared(db_session).id}")
    assert r.status_code == 409
    assert "shared account" in r.json()["detail"]


def test_a_shared_account_can_be_disabled(admin_client, db_session):
    r = admin_client.patch(
        f"{USERS}{_shared(db_session).id}", json={"status": USER_STATUS_DISABLED}
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == USER_STATUS_DISABLED


def test_a_member_can_be_deleted(admin_client, plain_user):
    """Mirror: delete itself works on an ordinary account."""
    assert admin_client.delete(f"{USERS}{plain_user.id}").status_code == 204


# ---------------------------------------------------------------------------
# Access modes
# ---------------------------------------------------------------------------

_PAIR = {"ceiling": "borderline", "default": "normal"}


def test_a_shared_accounts_mode_is_fixed(admin_client, db_session):
    r = admin_client.put(f"{USERS}{_shared(db_session).id}/access-modes", json=_PAIR)
    assert r.status_code == 409
    assert r.json()["detail"] == "A shared account's mode is fixed."


def test_a_members_mode_can_be_set(admin_client, plain_user):
    r = admin_client.put(f"{USERS}{plain_user.id}/access-modes", json=_PAIR)
    assert r.status_code == 200, r.text
    assert (r.json()["mode_ceiling"], r.json()["mode_default"]) == (
        "borderline",
        "normal",
    )
