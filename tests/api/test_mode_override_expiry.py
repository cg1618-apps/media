"""A switched-to access mode is temporary; the account's default is not.

The login cookie says WHO is asking and lasts a month. It no longer says which
mode they are in: every request lands in the account's default mode unless a
second cookie, `access_mode`, carries a live override. That cookie is a
browser-session cookie (no Max-Age, so closing the browser drops it) holding a
signed token that expires an hour after the switch. Either way the session
falls back to the default.

The case that drove this: switch a laptop to `unrestricted`, close the
browser, come back the next day - and still be in `unrestricted`, because the
mode lived inside the month-long login token.
"""

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.dependencies import get_db
from app.main import app
from app.services.rbac.seed_modes import (
    MODE_BORDERLINE,
    MODE_SAFE,
    MODE_UNRESTRICTED,
)
from app.services.security import ALGORITHM, SECRET_KEY, create_access_token

SWITCH = "/api/auth/access-mode"
OVERRIDE = "access_mode"
DOMAIN = "testserver.local"


@pytest.fixture
def signed_in(db_session, admin_user, grant_mode, nsfw_label):
    """admin_user holding `borderline` (default), `unrestricted` and `safe`.

    `nsfw_label` is load-bearing: it is what makes `borderline` and
    `unrestricted` different from `safe`, so "landed back in the default" is
    distinguishable from "landed in whatever was lying around".
    """
    grant_mode(admin_user, MODE_BORDERLINE, is_default=True)
    grant_mode(admin_user, MODE_UNRESTRICTED)
    grant_mode(admin_user, MODE_SAFE)

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    def _client(login_mode_id=None, login_expires_at=None):
        claims = {"sub": admin_user.username, "role": admin_user.role}
        if login_mode_id is not None:
            claims["mode"] = str(login_mode_id)
        token = create_access_token(claims, expires_at=login_expires_at)
        c = TestClient(app)
        c.cookies.set("access_token", f"Bearer {token}", domain=DOMAIN)
        return c

    yield _client
    app.dependency_overrides.clear()


def _switch(c, mode_obj):
    return c.post(
        SWITCH, json={"mode_id": str(mode_obj.system_id), "password": "testpass"}
    )


def _set_cookie_headers(response, name):
    return [
        v
        for k, v in response.headers.multi_items()
        if k.lower() == "set-cookie" and v.startswith(f"{name}=")
    ]


def _override_claims(c):
    return jwt.decode(c.cookies[OVERRIDE], SECRET_KEY, algorithms=[ALGORITHM])


def _active(c):
    return c.get("/api/auth/me").json()["mode"]


# ---------------------------------------------------------------------------
# The default is where a session lands
# ---------------------------------------------------------------------------


def test_with_no_override_the_session_is_in_the_default(signed_in):
    assert _active(signed_in())["key"] == MODE_BORDERLINE


def test_the_login_tokens_mode_claim_is_not_read(signed_in, mode):
    """A login cookie minted before this change carries `unrestricted` for up
    to a month. It must land in the default, not in the claim."""
    c = signed_in(login_mode_id=mode(MODE_UNRESTRICTED).system_id)
    assert _active(c)["key"] == MODE_BORDERLINE


def test_a_changed_default_applies_on_the_next_request(
    signed_in, db_session, admin_user, mode
):
    """The default is read from the database, not frozen into the login."""
    from app import models
    from app.services.rbac import cache

    c = signed_in()
    rows = (
        db_session.query(models.UserAccessMode)
        .filter(models.UserAccessMode.user_id == admin_user.id)
        .all()
    )
    for row in rows:
        row.is_default = False
    db_session.flush()
    for row in rows:
        row.is_default = row.mode_id == mode(MODE_SAFE).system_id
    db_session.flush()
    cache.bump()

    assert _active(c)["key"] == MODE_SAFE


# ---------------------------------------------------------------------------
# Switching away from the default sets a temporary override
# ---------------------------------------------------------------------------


def test_switching_sets_a_browser_session_cookie(signed_in, mode):
    """No Max-Age and no Expires: the browser drops it when it closes."""
    c = signed_in()
    response = _switch(c, mode(MODE_UNRESTRICTED))

    assert response.status_code == 200
    [header] = _set_cookie_headers(response, OVERRIDE)
    lowered = header.lower()
    assert "max-age" not in lowered
    assert "expires" not in lowered
    assert "httponly" in lowered
    assert _active(c)["key"] == MODE_UNRESTRICTED


def test_switching_does_not_reissue_the_login_cookie(signed_in, mode):
    """The login is untouched, so switching cannot extend it."""
    c = signed_in()
    response = _switch(c, mode(MODE_UNRESTRICTED))

    assert response.status_code == 200
    assert _set_cookie_headers(response, "access_token") == []


def test_the_override_expires_an_hour_after_the_switch(signed_in, mode):
    c = signed_in()
    _switch(c, mode(MODE_UNRESTRICTED))

    remaining = _override_claims(c)["exp"] - datetime.now(timezone.utc).timestamp()
    assert settings.access_mode_override_minutes == 60
    assert 3600 - 60 < remaining <= 3600


def test_the_override_never_outlives_the_login(signed_in, mode):
    soon = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(minutes=10)
    c = signed_in(login_expires_at=soon)
    _switch(c, mode(MODE_UNRESTRICTED))

    assert _override_claims(c)["exp"] == int(soon.timestamp())


def test_closing_the_browser_returns_to_the_default(signed_in, mode):
    """What the browser does to a session cookie: forget it."""
    c = signed_in()
    _switch(c, mode(MODE_UNRESTRICTED))
    assert _active(c)["key"] == MODE_UNRESTRICTED

    c.cookies.delete(OVERRIDE, domain=DOMAIN)

    assert _active(c)["key"] == MODE_BORDERLINE


def test_an_expired_override_returns_to_the_default(signed_in, mode, admin_user):
    """What a browser that restores its session keeps: an expired token."""
    c = signed_in()
    expired = create_access_token(
        {"sub": admin_user.username, "mode": str(mode(MODE_UNRESTRICTED).system_id)},
        expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
    )
    c.cookies.set(OVERRIDE, expired, domain=DOMAIN)

    assert _active(c)["key"] == MODE_BORDERLINE


def test_a_live_override_applies(signed_in, mode, admin_user):
    """The mirror of the expiry test, so its green is the expiry and not the
    cookie being ignored altogether."""
    c = signed_in()
    live = create_access_token(
        {"sub": admin_user.username, "mode": str(mode(MODE_UNRESTRICTED).system_id)},
        expires_delta=timedelta(minutes=5),
    )
    c.cookies.set(OVERRIDE, live, domain=DOMAIN)

    assert _active(c)["key"] == MODE_UNRESTRICTED


def test_another_accounts_override_is_ignored(signed_in, mode):
    c = signed_in()
    foreign = create_access_token(
        {"sub": "someone-else", "mode": str(mode(MODE_UNRESTRICTED).system_id)},
        expires_delta=timedelta(minutes=5),
    )
    c.cookies.set(OVERRIDE, foreign, domain=DOMAIN)

    assert _active(c)["key"] == MODE_BORDERLINE


def test_an_override_naming_a_revoked_mode_resolves_to_nothing(
    signed_in, mode, db_session, admin_user
):
    """Revocation stays fail-closed: the EMPTY set, not the default. The
    default can be wider than what was revoked."""
    from app import models
    from app.services.rbac import cache

    c = signed_in()
    _switch(c, mode(MODE_SAFE))
    db_session.query(models.UserAccessMode).filter(
        models.UserAccessMode.user_id == admin_user.id,
        models.UserAccessMode.mode_id == mode(MODE_SAFE).system_id,
    ).delete(synchronize_session=False)
    db_session.flush()
    cache.bump()

    active = _active(c)
    assert (active["id"], active["key"]) == (None, None)


# ---------------------------------------------------------------------------
# Ways the override is cleared
# ---------------------------------------------------------------------------


def test_switching_back_to_the_default_clears_the_override(signed_in, mode):
    c = signed_in()
    _switch(c, mode(MODE_UNRESTRICTED))

    response = _switch(c, mode(MODE_BORDERLINE))

    assert response.status_code == 200
    assert OVERRIDE not in c.cookies
    assert _active(c)["key"] == MODE_BORDERLINE


def test_logout_clears_the_override(signed_in, mode):
    c = signed_in()
    _switch(c, mode(MODE_UNRESTRICTED))

    response = c.post("/api/auth/logout")

    assert _set_cookie_headers(response, OVERRIDE)
    assert OVERRIDE not in c.cookies


def test_login_clears_the_override(signed_in, mode, admin_user):
    c = signed_in()
    _switch(c, mode(MODE_UNRESTRICTED))

    response = c.post(
        "/api/auth/login",
        data={"username": admin_user.username, "password": "testpass"},
    )

    assert response.status_code == 200
    assert OVERRIDE not in c.cookies
    assert _active(c)["key"] == MODE_BORDERLINE


# ---------------------------------------------------------------------------
# /me says when the override ends, so the SPA can reload at that moment
# ---------------------------------------------------------------------------


def test_me_reports_when_the_override_ends(signed_in, mode):
    c = signed_in()
    _switch(c, mode(MODE_UNRESTRICTED))

    reported = datetime.fromisoformat(_active(c)["expires_at"])

    assert int(reported.timestamp()) == _override_claims(c)["exp"]


def test_me_reports_no_end_in_the_default(signed_in):
    assert _active(signed_in())["expires_at"] is None
