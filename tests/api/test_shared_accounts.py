"""
The two shared accounts, `shared-normal` and `shared-borderline`.

The seed creates them with role `shared`, a ceiling and default at the
account's own seeded mode, a request limit of 10 and an unusable password, and
on every run re-asserts the role. The mode is a ceiling plus a default like
any other account's: the admin's to change, and the account's to switch within
- narrowing freely, widening only with the password. The password, status,
limit and mode are the admin's.

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
from app.services.rbac.seed_modes import (
    MODE_BORDERLINE,
    MODE_NORMAL,
    MODE_SAFE,
    MODE_UNRESTRICTED,
)
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
def test_each_account_is_seeded_at_its_own_mode(db_session, username, mode):
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


def test_a_hand_edited_role_is_restored(db_session, shared_normal):
    shared_normal.role_id = role_id_for(db_session, "user")
    db_session.flush()

    ensure_shared_accounts(db_session)
    db_session.refresh(shared_normal)

    assert shared_normal.role == SHARED_ROLE_NAME


def test_the_admins_mode_is_left_alone(db_session, shared_normal):
    """The mode is the admin's, like the password: the seed does not put the
    account back at its seeded mode."""
    shared_normal.mode_ceiling = MODE_BORDERLINE
    shared_normal.mode_default = MODE_SAFE
    db_session.flush()

    ensure_shared_accounts(db_session)
    db_session.refresh(shared_normal)

    assert (shared_normal.mode_ceiling, shared_normal.mode_default) == (
        MODE_BORDERLINE,
        MODE_SAFE,
    )


def test_an_account_with_no_mode_gets_its_seeded_mode(db_session, shared_normal):
    """The mirror: an account left with no mode at all (a Pull of a row with
    none) would see nothing, so the seed gives it its own mode back."""
    shared_normal.mode_ceiling = None
    shared_normal.mode_default = None
    db_session.flush()

    ensure_shared_accounts(db_session)
    db_session.refresh(shared_normal)

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
    admin_client, user_client, db_session, shared_normal, plain_user, path
):
    assert _client_for(db_session, shared_normal).get(path).status_code == 401
    # Mirror: a member with the quotes-and-memes switch on can.
    plain_user.feature_quotes_memes = True
    db_session.flush()
    assert user_client.get(path).status_code == 200


# ---------------------------------------------------------------------------
# Switching: a ceiling and a default, like any account
# ---------------------------------------------------------------------------

SWITCH = "/api/auth/access-mode"


def _mode_id(db, key):
    return str(
        db.query(models.AccessMode).filter(models.AccessMode.key == key).one().system_id
    )


def test_a_shared_account_narrows_without_the_password(
    admin_client, db_session, shared_normal
):
    """`safe` is below shared-normal's default: free, as for anyone."""
    c = _client_for(db_session, shared_normal)
    r = c.post(SWITCH, json={"mode_id": _mode_id(db_session, MODE_SAFE)})
    assert r.status_code == 200, r.text
    assert r.json()["mode"]["key"] == MODE_SAFE
    assert c.get("/api/auth/me").json()["mode"]["key"] == MODE_SAFE


@pytest.fixture
def shared_wide(db_session, shared_normal):
    """shared-normal with room above its default: ceiling borderline, default
    normal, and a password to widen with."""
    from app.services.security import get_password_hash

    shared_normal.mode_ceiling = MODE_BORDERLINE
    shared_normal.mode_default = MODE_NORMAL
    shared_normal.hashed_password = get_password_hash("family")
    db_session.flush()
    return shared_normal


def test_a_shared_account_widens_only_with_the_password(
    admin_client, db_session, shared_wide
):
    c = _client_for(db_session, shared_wide)
    target = {"mode_id": _mode_id(db_session, MODE_BORDERLINE)}

    r = c.post(SWITCH, json=target)
    assert r.status_code == 401
    assert r.json()["requires_password"] is True
    assert c.get("/api/auth/me").json()["mode"]["key"] == MODE_NORMAL

    # Mirror: the same move with the shared password goes through.
    r = c.post(SWITCH, json={**target, "password": "family"})
    assert r.status_code == 200, r.text
    assert r.json()["mode"]["key"] == MODE_BORDERLINE


def test_a_wider_mode_is_on_the_usual_clock(admin_client, db_session, shared_wide):
    """Widening past the default sets the timed override cookie, as it does
    for any account; narrowing below it sets the untimed one."""
    import jwt

    from app.services.rbac.resolver import MODE_OVERRIDE_COOKIE

    def claims():
        token = c.cookies.get(MODE_OVERRIDE_COOKIE)
        return jwt.decode(token, options={"verify_signature": False})

    c = _client_for(db_session, shared_wide)
    c.post(
        SWITCH,
        json={"mode_id": _mode_id(db_session, MODE_BORDERLINE), "password": "family"},
    )
    assert "timed" not in claims()

    c.post(SWITCH, json={"mode_id": _mode_id(db_session, MODE_SAFE)})
    assert claims()["timed"] is False


def test_no_shared_account_reaches_past_its_ceiling(
    admin_client, db_session, shared_wide
):
    c = _client_for(db_session, shared_wide)
    r = c.post(
        SWITCH,
        json={"mode_id": _mode_id(db_session, MODE_UNRESTRICTED), "password": "family"},
    )
    assert r.status_code == 404


def test_me_offers_a_shared_account_every_mode_up_to_its_ceiling(
    admin_client, db_session, shared_wide
):
    modes = _client_for(db_session, shared_wide).get("/api/auth/me").json()["modes"]
    by_key = {m["key"]: m for m in modes}
    assert list(by_key) == [MODE_SAFE, MODE_NORMAL, MODE_BORDERLINE]
    assert by_key[MODE_SAFE]["requires_password"] is False
    assert by_key[MODE_BORDERLINE]["requires_password"] is True


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


# ---------------------------------------------------------------------------
# Never the installation owner
# ---------------------------------------------------------------------------


def test_a_flagless_restore_never_files_the_owners_data_under_a_shared_account(
    db_session,
):
    """On a database where nobody holds is_installation_owner - a fresh
    install - the seeded admin and the two shared accounts are the only
    accounts. Neither kind ever owns the installation, so the answer is None
    and a restore skips the owner's rows rather than filing them under a
    login several people use."""
    from app.services.domain.user_list import installation_owner_id

    assert (
        db_session.query(models.User).filter(models.User.is_installation_owner).count()
        == 0
    )
    assert installation_owner_id(db_session) is None

    # The mirror: an active member is the owner the moment one exists, so the
    # None above is the role rule and not an empty table.
    member = _member(db_session, "zzz_member", USER_STATUS_ACTIVE)
    assert installation_owner_id(db_session) == member.id


def test_a_flagless_restore_picks_a_member_over_the_admin(db_session, plain_user):
    """Mirror: the shared accounts are skipped, not every non-root account."""
    from app.services.domain.user_list import installation_owner_id

    assert installation_owner_id(db_session) == plain_user.id


def _member(db, username, status):
    import uuid

    from app.services.security import get_password_hash

    user = models.User(
        id=uuid.uuid4(),
        username=username,
        hashed_password=get_password_hash("pw"),
        role_id=role_id_for(db, "user"),
        status=status,
    )
    db.add(user)
    db.flush()
    return user


def test_an_inactive_account_never_owns_the_installation(db_session):
    """A pending registrant and a disabled account, both sorting before every
    other account, are what makes this bite: without the status rule the
    first fallback's answer is `aaa`."""
    from app.models.system import USER_STATUS_PENDING
    from app.services.domain.user_list import installation_owner_id

    pending = _member(db_session, "aaa", USER_STATUS_PENDING)
    disabled = _member(db_session, "aab", USER_STATUS_DISABLED)
    assert installation_owner_id(db_session) is None

    # The mirror: an active member sorting after both wins.
    active = _member(db_session, "zzz_member", USER_STATUS_ACTIVE)
    assert installation_owner_id(db_session) == active.id
    assert active.id not in (pending.id, disabled.id)


def test_an_active_member_owns_it_past_inactive_ones(db_session):
    """Mirror, on the same inactive accounts: an active member still wins."""
    from app.models.system import USER_STATUS_PENDING
    from app.services.domain.user_list import installation_owner_id

    _member(db_session, "aaa", USER_STATUS_PENDING)
    _member(db_session, "aab", USER_STATUS_DISABLED)
    active = _member(db_session, "aac", USER_STATUS_ACTIVE)

    assert installation_owner_id(db_session) == active.id


def test_a_disabled_flag_holder_still_owns_it(db_session):
    """The status rule is the fallbacks' only: a disabled owner's data is
    still theirs. An active member sorting first is the competing answer."""
    from app.services.domain.user_list import installation_owner_id

    _member(db_session, "aaa", USER_STATUS_ACTIVE)
    owner = _member(db_session, "zzz", USER_STATUS_DISABLED)
    owner.is_installation_owner = True
    db_session.flush()

    assert installation_owner_id(db_session) == owner.id
