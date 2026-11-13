"""
Account status, the session counter, and the login route's refusals.

A login token carries `sv`, the account's session_version when it was minted.
resolve_viewer resolves to the guest unless the account is `active` AND the
token's `sv` equals the column. Every revocation test here asserts both
halves: the token that should stop working resolves as the guest, and a
token that should NOT be touched - an unrelated account's, or the same
account's after a change that does not revoke - still resolves to its owner.
A refusal test with no mirror passes just as well when every token is broken.
"""

import time
import uuid

import jwt
import pytest
from fastapi.testclient import TestClient

from app import models
from app.config import Settings
from app.main import app
from app.models.system import USER_STATUS_DISABLED, USER_STATUS_PENDING
from app.services import rate_limit
from app.services.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
    get_password_hash,
)
from tests.api.conftest import role_id_for

LOGIN = "/api/auth/login"
ME = "/api/auth/me"


def make_account(db, username, password="pw", role="user", **fields):
    user = models.User(
        id=uuid.uuid4(),
        username=username,
        hashed_password=get_password_hash(password),
        role_id=role_id_for(db, role),
        **fields,
    )
    db.add(user)
    db.flush()
    return user


def login(username, password, ip="testclient"):
    """A fresh browser, so cookies from one login never leak into another."""
    c = TestClient(app, client=(ip, 50000))
    return c.post(LOGIN, data={"username": username, "password": password})


def token_for(username, password):
    response = login(username, password)
    assert response.status_code == 200, response.text
    return response.cookies["access_token"].strip('"')


def whoami(cookie):
    """The username a login cookie resolves to, or None for the guest."""
    c = TestClient(app)
    c.cookies.set("access_token", cookie)
    return c.get(ME).json()["username"]


@pytest.fixture
def kana(db_session, client):
    # `client` installs the get_db override every TestClient here relies on.
    return make_account(db_session, "kana", "kana-pw")


@pytest.fixture
def mio(db_session, client):
    return make_account(db_session, "mio", "mio-pw")


# ---------------------------------------------------------------------------
# The token carries sv
# ---------------------------------------------------------------------------


def test_a_login_token_carries_the_session_version(kana):
    cookie = token_for("kana", "kana-pw")
    payload = jwt.decode(cookie.split(" ")[1], SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["sv"] == 0


def test_a_token_without_sv_works_at_version_zero_and_stops_at_one(
    db_session, kana
):
    """Every token minted before the claim existed reads as 0, which is every
    account's starting value - so the deploy signs nobody out."""
    cookie = f"Bearer {create_access_token({'sub': 'kana'})}"
    assert whoami(cookie) == "kana"

    kana.session_version = 1
    db_session.flush()
    assert whoami(cookie) is None


# ---------------------------------------------------------------------------
# What revokes, and what does not
# ---------------------------------------------------------------------------


def test_disabling_signs_the_account_out(admin_client, kana, mio):
    kana_cookie = token_for("kana", "kana-pw")
    mio_cookie = token_for("mio", "mio-pw")

    r = admin_client.patch(f"/api/users/{kana.id}", json={"status": "disabled"})
    assert r.status_code == 200, r.text

    assert whoami(kana_cookie) is None
    assert whoami(mio_cookie) == "mio"


def test_enabling_again_does_not_revive_the_old_token(admin_client, kana):
    cookie = token_for("kana", "kana-pw")
    admin_client.patch(f"/api/users/{kana.id}", json={"status": "disabled"})
    r = admin_client.patch(f"/api/users/{kana.id}", json={"status": "active"})
    assert r.status_code == 200
    assert r.json()["status"] == "active"

    assert whoami(cookie) is None
    # ...while a fresh login works.
    assert whoami(token_for("kana", "kana-pw")) == "kana"


def test_an_admin_setting_a_password_signs_the_account_out(admin_client, kana, mio):
    kana_cookie = token_for("kana", "kana-pw")
    mio_cookie = token_for("mio", "mio-pw")

    r = admin_client.patch(f"/api/users/{kana.id}", json={"password": "fresh"})
    assert r.status_code == 200, r.text

    assert whoami(kana_cookie) is None
    assert whoami(mio_cookie) == "mio"


def test_an_admin_rename_without_a_password_does_not_bump_the_counter(
    admin_client, db_session, kana
):
    """The mirror of the case above: it is the password, not any edit."""
    admin_client.patch(f"/api/users/{kana.id}", json={"username": "kana2"})
    db_session.refresh(kana)
    assert kana.session_version == 0


def test_spending_a_reset_signs_the_account_out(admin_client, kana, mio):
    kana_cookie = token_for("kana", "kana-pw")
    mio_cookie = token_for("mio", "mio-pw")

    link = admin_client.post(f"/api/users/{kana.id}/reset-link").json()["link"]
    code = link.split("code=", 1)[1]
    r = TestClient(app).post("/api/auth/reset", json={"code": code, "password": "after"})
    assert r.status_code == 200, r.text

    assert whoami(kana_cookie) is None
    assert whoami(mio_cookie) == "mio"


def test_changing_your_own_password_does_not_sign_you_out(kana):
    cookie = token_for("kana", "kana-pw")
    c = TestClient(app)
    c.cookies.set("access_token", cookie)
    r = c.put(
        "/api/account/password",
        json={"current_password": "kana-pw", "new_password": "newer"},
    )
    assert r.status_code == 200, r.text
    assert whoami(cookie) == "kana"


def test_a_disabled_account_resolves_as_guest_even_at_the_right_version(
    db_session, kana
):
    cookie = token_for("kana", "kana-pw")
    kana.status = USER_STATUS_DISABLED
    db_session.flush()
    assert whoami(cookie) is None


# ---------------------------------------------------------------------------
# Login and status
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "status, message",
    [
        (USER_STATUS_PENDING, "Your account is waiting for the admin's approval."),
        (USER_STATUS_DISABLED, "This account is disabled."),
    ],
)
def test_status_is_told_only_after_the_right_password(
    db_session, client, status, message
):
    make_account(db_session, "held", "held-pw", status=status)

    right = login("held", "held-pw")
    assert right.status_code == 403
    assert right.json()["detail"] == message
    assert "access_token" not in right.cookies

    wrong = login("held", "nope")
    assert wrong.status_code == 401
    assert wrong.json()["detail"] == "Incorrect username or password"


def test_the_active_mirror_signs_in(kana):
    assert login("kana", "kana-pw").status_code == 200


def test_login_lowercases_the_submitted_username(kana):
    assert login("KaNa", "kana-pw").status_code == 200


def test_an_80_byte_password_set_before_the_policy_still_signs_in(
    db_session, client
):
    import bcrypt

    password = "p" * 80
    user = make_account(db_session, "legacy")
    user.hashed_password = bcrypt.hashpw(
        password.encode("utf-8")[:72], bcrypt.gensalt()
    ).decode("utf-8")
    db_session.flush()
    assert login("legacy", password).status_code == 200


# ---------------------------------------------------------------------------
# Thirty days, flat
# ---------------------------------------------------------------------------


def test_the_shipped_lifetime_is_thirty_days():
    """The default, not this machine's value: a .env may shorten it."""
    assert Settings.model_fields["access_token_expire_minutes"].default == 30 * 24 * 60


def test_a_login_lasts_the_configured_lifetime_and_is_never_refreshed(kana):
    lifetime = ACCESS_TOKEN_EXPIRE_MINUTES * 60
    response = login("kana", "kana-pw")
    cookie = response.cookies["access_token"].strip('"')
    payload = jwt.decode(cookie.split(" ")[1], SECRET_KEY, algorithms=[ALGORITHM])
    assert abs(payload["exp"] - time.time() - lifetime) < 60
    assert f"Max-Age={lifetime}" in response.headers["set-cookie"]

    c = TestClient(app)
    c.cookies.set("access_token", cookie)
    me = c.get(ME)
    assert me.json()["username"] == "kana"
    assert "access_token" not in me.headers.get("set-cookie", "")


# ---------------------------------------------------------------------------
# Rate limits
# ---------------------------------------------------------------------------


def test_the_sixth_failed_login_for_one_username_is_429(kana, mio):
    for attempt in range(5):
        r = login("kana", "wrong", ip=f"10.0.0.{attempt}")
        assert r.status_code == 401
    sixth = login("kana", "wrong", ip="10.0.0.9")
    assert sixth.status_code == 429
    assert int(sixth.headers["Retry-After"]) > 0
    # The right password does not get through a locked username either.
    assert login("kana", "kana-pw", ip="10.0.0.9").status_code == 429

    # The mirror: another username from another address is untouched.
    assert login("mio", "wrong", ip="10.0.1.1").status_code == 401
    assert login("mio", "mio-pw", ip="10.0.1.1").status_code == 200


def test_the_username_key_ignores_case(kana):
    for _ in range(5):
        login("KANA", "wrong", ip="10.0.2.1")
    assert login("kana", "kana-pw", ip="10.0.2.2").status_code == 429


def test_a_success_clears_the_usernames_count(kana):
    for _ in range(4):
        assert login("kana", "wrong").status_code == 401
    assert login("kana", "kana-pw").status_code == 200
    for _ in range(4):
        assert login("kana", "wrong").status_code == 401
    assert login("kana", "kana-pw").status_code == 200


def test_twenty_failures_from_one_address_lock_that_address(db_session, client):
    for n in range(20):
        r = login(f"nobody{n}", "wrong", ip="10.9.9.9")
        assert r.status_code == 401
    assert login("nobody99", "wrong", ip="10.9.9.9").status_code == 429
    assert login("nobody99", "wrong", ip="10.9.9.8").status_code == 401


def test_the_autouse_fixture_starts_every_test_with_an_empty_limiter():
    assert rate_limit.check("login:user:kana", 5) is None
