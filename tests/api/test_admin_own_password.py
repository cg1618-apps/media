"""
The admin setting ITS OWN password on /users.

Setting a password there ends every session the account holds
(ADMIN_SET_PASSWORD_REVOKES_SESSIONS). When the account is the caller's own,
the caller's browser is then given a fresh login cookie at the new counter
(KEEP_OWN_SESSION_ON_ADMIN_SET_PASSWORD, provisional pending the owner), so
the one browser that made the change stays signed in and every other device
is signed out. The fresh cookie keeps the ORIGINAL deadline: a reissue that
minted a new month would let any password change extend a session forever.

Each refusal has its mirror: the old token stops working AND the new one
works; setting another account's password issues the caller nothing.
"""

import time
import uuid

import jwt
from fastapi.testclient import TestClient

from app import models
from app.main import app
from app.services.security import (
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
    get_password_hash,
)
from tests.api.conftest import role_id_for

ME = "/api/auth/me"


def _token_from(cookie_value: str) -> str:
    # A cookie holding a space comes back quoted: unquote first, then drop
    # the scheme.
    return cookie_value.strip('"').removeprefix("Bearer ")


def _me(token: str) -> dict:
    with TestClient(app) as c:
        c.cookies.set("access_token", f"Bearer {token}")
        return c.get(ME).json()


def test_own_password_keeps_this_browser_and_ends_the_others(
    admin_client, admin_user
):
    old_token = _token_from(admin_client.cookies.get("access_token"))
    old_exp = jwt.decode(old_token, SECRET_KEY, algorithms=[ALGORITHM])["exp"]

    response = admin_client.patch(
        f"/api/users/{admin_user.id}", json={"password": "new-password"}
    )
    assert response.status_code == 200

    new_cookie = response.cookies.get("access_token")
    assert new_cookie, "the caller's own browser must be given a fresh login"
    new_token = _token_from(new_cookie)
    claims = jwt.decode(new_token, SECRET_KEY, algorithms=[ALGORITHM])

    # This browser stays signed in, at the new counter...
    assert claims["sv"] == 1
    assert _me(new_token)["username"] == admin_user.username
    # ...and every token minted before the change is signed out.
    assert _me(old_token)["username"] is None
    # The reissue does not extend the login.
    assert claims["exp"] == old_exp


def test_another_accounts_password_issues_the_caller_nothing(
    admin_client, admin_user, db_session
):
    other = models.User(
        id=uuid.uuid4(),
        username="someone",
        hashed_password=get_password_hash("pw"),
        role_id=role_id_for(db_session, "user"),
    )
    db_session.add(other)
    db_session.flush()
    other_token = create_access_token({"sub": "someone", "role": "user"})

    response = admin_client.patch(
        f"/api/users/{other.id}", json={"password": "new-password"}
    )
    assert response.status_code == 200
    assert response.cookies.get("access_token") is None

    # The other account is signed out; the caller is untouched.
    assert _me(other_token)["username"] is None
    assert admin_client.get(ME).json()["username"] == admin_user.username


def test_a_reissue_never_outlives_the_original_login(admin_client, admin_user):
    # A token about to expire stays about to expire after the change.
    soon = int(time.time()) + 120
    with TestClient(app) as c:
        c.cookies.set(
            "access_token",
            "Bearer "
            + jwt.encode(
                {"sub": admin_user.username, "role": "admin", "exp": soon},
                SECRET_KEY,
                algorithm=ALGORITHM,
            ),
        )
        response = c.patch(
            f"/api/users/{admin_user.id}", json={"password": "new-password"}
        )
    assert response.status_code == 200
    claims = jwt.decode(
        _token_from(response.cookies.get("access_token")),
        SECRET_KEY,
        algorithms=[ALGORITHM],
    )
    assert claims["exp"] == soon
