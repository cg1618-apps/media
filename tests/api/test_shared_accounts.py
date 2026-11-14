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
from app.services.rbac.seed_modes import MODE_BORDERLINE, MODE_NORMAL, MODE_SAFE
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
    admin_client, user_client, db_session, shared_normal, plain_user, path
):
    assert _client_for(db_session, shared_normal).get(path).status_code == 401
    # Mirror: a member with the quotes-and-memes switch on can.
    plain_user.feature_quotes_memes = True
    db_session.flush()
    assert user_client.get(path).status_code == 200


# ---------------------------------------------------------------------------
# A shared account's mode is fixed for switching too
# ---------------------------------------------------------------------------

SWITCH = "/api/auth/access-mode"


def _mode_id(db, key):
    return str(
        db.query(models.AccessMode).filter(models.AccessMode.key == key).one().system_id
    )


def test_a_shared_account_cannot_switch_mode(admin_client, db_session, shared_normal):
    """`safe` ranks below shared-normal's ceiling, so only the fixed-mode
    rule refuses it - the ceiling would allow it."""
    c = _client_for(db_session, shared_normal)
    r = c.post(SWITCH, json={"mode_id": _mode_id(db_session, MODE_SAFE)})
    assert r.status_code == 409
    assert r.json()["detail"] == "A shared account's mode is fixed."
    assert c.get("/api/auth/me").json()["mode"]["key"] == MODE_NORMAL


def test_a_member_switches_within_its_ceiling(admin_client, user_client, db_session):
    """The mirror: the same move, from an account that is not shared."""
    r = user_client.post(SWITCH, json={"mode_id": _mode_id(db_session, MODE_SAFE)})
    assert r.status_code == 200, r.text
    assert r.json()["mode"]["key"] == MODE_SAFE


def test_me_offers_a_shared_account_its_own_mode_alone(
    admin_client, user_client, db_session, shared_normal
):
    modes = _client_for(db_session, shared_normal).get("/api/auth/me").json()["modes"]
    assert [m["key"] for m in modes] == [MODE_NORMAL]
    # Mirror: a member is offered every mode up to its ceiling, more than
    # one, which is what makes the switcher render.
    assert len(user_client.get("/api/auth/me").json()["modes"]) > 1


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
    accounts. A shared account is non-root and sorts before most names, which
    is exactly the account the owner fallback must skip."""
    from app.services.domain.user_list import installation_owner_id

    assert (
        db_session.query(models.User).filter(models.User.is_installation_owner).count()
        == 0
    )
    owner = db_session.get(models.User, installation_owner_id(db_session))
    assert owner.role != SHARED_ROLE_NAME
    assert owner.role == "admin"


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

    owner_id = installation_owner_id(db_session)
    assert owner_id not in (pending.id, disabled.id)
    assert db_session.get(models.User, owner_id).status == USER_STATUS_ACTIVE


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
