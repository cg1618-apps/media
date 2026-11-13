"""
The two shared accounts, `shared-normal` and `shared-borderline`.

The seed creates them with role `shared`, their own fixed mode, a request
limit of 10 and an unusable password, and on every run re-asserts the role
and the mode. The password, status and limit are the admin's.

Every refusal below is paired with the mirror case that must still succeed.
"""

import pytest
from fastapi.testclient import TestClient

from app import models
from app.main import app
from app.models.system import USER_STATUS_ACTIVE, USER_STATUS_DISABLED
from app.services.rbac.modes import default_mode_id
from app.services.rbac.permissions import SHARED_ROLE_NAME
from app.services.rbac.seed import SHARED_ACCOUNTS, ensure_shared_accounts
from app.services.rbac.seed_modes import MODE_BORDERLINE, MODE_NORMAL
from app.services.security import UNUSABLE_PASSWORD_HASH, create_access_token
from tests.api.conftest import role_id_for
from tests.api.test_account_lifecycle import login


def _account(db, username):
    return db.query(models.User).filter(models.User.username == username).one()


def _client_for(db, user):
    """A signed-in client for this account, at its own default mode. The
    get_db override is installed by the fixture client the test requested."""
    token = create_access_token(
        {
            "sub": user.username,
            "role": user.role,
            "mode": str(default_mode_id(db, user) or ""),
        }
    )
    c = TestClient(app)
    c.cookies.set("access_token", f"Bearer {token}")
    return c


@pytest.fixture
def shared_normal(db_session):
    return _account(db_session, "shared-normal")


# ---------------------------------------------------------------------------
# What the seed creates
# ---------------------------------------------------------------------------


def test_the_seed_names_both_accounts():
    assert SHARED_ACCOUNTS == (
        ("shared-normal", MODE_NORMAL),
        ("shared-borderline", MODE_BORDERLINE),
    )


@pytest.mark.parametrize("username, mode", SHARED_ACCOUNTS)
def test_each_account_is_shared_at_its_own_fixed_mode(db_session, username, mode):
    user = _account(db_session, username)
    assert user.role == SHARED_ROLE_NAME
    assert (user.mode_ceiling, user.mode_default) == (mode, mode)
    assert user.open_request_limit == 10
    assert user.status == USER_STATUS_ACTIVE
    assert user.hashed_password == UNUSABLE_PASSWORD_HASH


def test_login_is_refused_until_the_admin_sets_a_password(admin_client, shared_normal):
    assert login("shared-normal", "family").status_code == 401
    assert login("shared-normal", UNUSABLE_PASSWORD_HASH).status_code == 401

    r = admin_client.patch(
        f"/api/users/{shared_normal.id}", json={"password": "family"}
    )
    assert r.status_code == 200, r.text
    # Mirror: the same login works once a password is set.
    assert login("shared-normal", "family").status_code == 200


# ---------------------------------------------------------------------------
# Re-asserted on every run
# ---------------------------------------------------------------------------


def test_a_hand_edited_role_and_mode_are_restored(db_session, shared_normal):
    shared_normal.role_id = role_id_for(db_session, "user")
    shared_normal.mode_ceiling = "unrestricted"
    shared_normal.mode_default = "safe"
    db_session.flush()

    ensure_shared_accounts(db_session)
    db_session.refresh(shared_normal)

    assert shared_normal.role == SHARED_ROLE_NAME
    assert (shared_normal.mode_ceiling, shared_normal.mode_default) == (
        MODE_NORMAL,
        MODE_NORMAL,
    )


def test_the_password_status_and_limit_are_left_alone(db_session, shared_normal):
    shared_normal.hashed_password = "set-by-the-admin"
    shared_normal.status = USER_STATUS_DISABLED
    shared_normal.open_request_limit = 3
    db_session.flush()

    ensure_shared_accounts(db_session)
    db_session.refresh(shared_normal)

    assert shared_normal.hashed_password == "set-by-the-admin"
    assert shared_normal.status == USER_STATUS_DISABLED
    assert shared_normal.open_request_limit == 3


def test_a_missing_account_is_created_again(db_session, shared_normal):
    db_session.delete(shared_normal)
    db_session.flush()

    ensure_shared_accounts(db_session)

    again = _account(db_session, "shared-normal")
    assert again.hashed_password == UNUSABLE_PASSWORD_HASH
    assert again.role == SHARED_ROLE_NAME


# ---------------------------------------------------------------------------
# What a shared account can do
# ---------------------------------------------------------------------------


def test_a_shared_account_files_a_request(admin_client, db_session, shared_normal):
    c = _client_for(db_session, shared_normal)
    r = c.post("/api/requests", json={"kind": "bug", "description": "Broken."})
    assert r.status_code == 201, r.text


@pytest.mark.parametrize("path", ["/api/quote/", "/api/meme/"])
def test_a_shared_account_cannot_read_quotes_or_memes(
    admin_client, user_client, db_session, shared_normal, path
):
    assert _client_for(db_session, shared_normal).get(path).status_code == 401
    # Mirror: a member, who holds view.extras, can.
    assert user_client.get(path).status_code == 200


def test_a_shared_account_cannot_change_its_own_password(
    admin_client, user_client, db_session, shared_normal
):
    shared_normal.hashed_password = "x"
    body = {"current_password": "x", "new_password": "y"}
    r = _client_for(db_session, shared_normal).put("/api/account/password", json=body)
    assert r.status_code == 401
    # Mirror: a member changes theirs through the same route.
    r = user_client.put(
        "/api/account/password",
        json={"current_password": "testpass", "new_password": "y"},
    )
    assert r.status_code == 200, r.text
