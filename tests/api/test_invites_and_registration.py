"""
Invite links, registration, and the admin's approval or decline.

The admin issues an invite on /users. Whoever holds the link registers on
/register, which spends the invite and creates the account `pending` with no
mode. The admin then approves it (role, ceiling and default in one form) or
declines it (the account is deleted, the invite stays spent).

Every refusal test asserts the refused case and a mirror that the same setup
with the defect removed is accepted, so a green proves the check did the
refusing (CLAUDE.md, "Rule").
"""

import pytest
from fastapi.testclient import TestClient

from app import models
from app.config import settings
from app.main import app
from app.models.system import (
    USER_STATUS_ACTIVE,
    USER_STATUS_DISABLED,
    USER_STATUS_PENDING,
)
from app.services.domain.account_codes import (
    INVALID_CODE_MESSAGE,
    PURPOSE_INVITE,
    hash_code,
)
from app.services.pipelines.tabs import TAB_BY_NAME
from tests.api.conftest import role_id_for
from tests.api.test_account_lifecycle import login, make_account

INVITES = "/api/users/invites"
REGISTER = "/api/auth/register"


def invite(admin_client):
    r = admin_client.post(INVITES)
    assert r.status_code == 200, r.text
    return r.json()


def code_of(link):
    return link.split("code=", 1)[1]


def fresh_code(admin_client):
    return code_of(invite(admin_client)["link"])


def peek(code, ip="testclient"):
    return TestClient(app, client=(ip, 50000)).get(REGISTER, params={"code": code})


def register(code, username="newcomer", password="pw", ip="testclient"):
    return TestClient(app, client=(ip, 50000)).post(
        REGISTER, json={"code": code, "username": username, "password": password}
    )


def account(db, username):
    db.expire_all()
    return db.query(models.User).filter(models.User.username == username).one_or_none()


def registered(db, admin_client, username="newcomer"):
    assert register(fresh_code(admin_client), username).status_code == 201
    return account(db, username)


def approve(admin_client, user, **body):
    return admin_client.post(f"/api/users/{user.id}/approve", json=body)


# ---------------------------------------------------------------------------
# Issuing an invite
# ---------------------------------------------------------------------------


def test_an_invite_link_is_built_on_the_public_base_url(admin_client, db_session):
    body = invite(admin_client)
    assert body["link"].startswith(f"{settings.public_base_url}/register?code=")
    assert body["expires_at"]

    row = db_session.query(models.AccountCode).one()
    assert row.purpose == PURPOSE_INVITE
    assert row.code_hash == hash_code(code_of(body["link"]))
    assert row.user_id is None
    assert row.created_user_id is None
    assert row.created_by_id is not None


def test_a_member_cannot_issue_an_invite(user_client, admin_client):
    assert user_client.post(INVITES).status_code == 401
    # Mirror: the admin can.
    assert admin_client.post(INVITES).status_code == 200


def test_several_invites_can_be_open_at_once(admin_client):
    first, second = fresh_code(admin_client), fresh_code(admin_client)
    assert peek(first).status_code == 200
    assert peek(second).status_code == 200


# ---------------------------------------------------------------------------
# Checking and spending it
# ---------------------------------------------------------------------------


def test_a_valid_invite_is_reported_without_spending(admin_client):
    code = fresh_code(admin_client)
    assert peek(code).json() == {"valid": True}
    assert peek(code).json() == {"valid": True}
    assert register(code).status_code == 201


def test_registering_creates_a_pending_user_with_no_mode(admin_client, db_session):
    code = fresh_code(admin_client)
    r = register(code, "newcomer", "secret")
    assert r.status_code == 201, r.text
    assert r.json() == {"username": "newcomer"}

    user = account(db_session, "newcomer")
    assert user.status == USER_STATUS_PENDING
    assert user.role_id == role_id_for(db_session, "user")
    assert user.mode_ceiling is None and user.mode_default is None

    row = db_session.query(models.AccountCode).one()
    assert row.spent_at is not None
    assert row.created_user_id == user.id


def test_a_registered_account_cannot_sign_in_until_approved(admin_client, db_session):
    user = registered(db_session, admin_client)
    r = login("newcomer", "pw")
    assert r.status_code == 403
    assert "approval" in r.json()["detail"]
    assert "access_token" not in r.cookies

    assert approve(admin_client, user).status_code == 200
    assert login("newcomer", "pw").status_code == 200


def test_a_spent_invite_is_refused(admin_client):
    code = fresh_code(admin_client)
    assert register(code, "first").status_code == 201
    r = register(code, "second")
    assert r.status_code == 404
    assert r.json()["detail"] == INVALID_CODE_MESSAGE
    assert peek(code).status_code == 404


def test_a_reset_code_is_not_an_invite(admin_client, db_session):
    kana = make_account(db_session, "kana")
    reset = admin_client.post(f"/api/users/{kana.id}/reset-link").json()["link"]
    code = code_of(reset)
    assert peek(code).status_code == 404
    assert register(code).status_code == 404
    # Mirror: an invite issued the same way registers.
    assert register(fresh_code(admin_client)).status_code == 201


def test_an_unknown_invite_is_refused(client):
    r = register("not-a-code")
    assert r.status_code == 404
    assert r.json()["detail"] == INVALID_CODE_MESSAGE


@pytest.mark.parametrize(
    "username, password",
    [("ab", "pw"), ("qadminqe", "pw"), ("newcomer", ""), ("newcomer", "あ" * 25)],
)
def test_a_refused_username_or_password_leaves_the_invite_unspent(
    admin_client, db_session, username, password
):
    code = fresh_code(admin_client)
    r = register(code, username, password)
    assert r.status_code == 422
    assert db_session.query(models.User).filter_by(status=USER_STATUS_PENDING).count() == 0
    # Mirror: the same code still registers a valid name.
    assert register(code, "newcomer", "pw").status_code == 201


def test_a_taken_username_leaves_the_invite_unspent(admin_client, db_session):
    make_account(db_session, "kana")
    code = fresh_code(admin_client)
    assert register(code, "kana").status_code == 409
    assert register(code, "kana2").status_code == 201


def test_the_eleventh_register_request_from_one_address_is_429(client):
    for n in range(5):
        assert peek(f"x{n}", ip="10.2.2.2").status_code == 404
        assert register(f"y{n}", ip="10.2.2.2").status_code == 404
    eleventh = peek("z", ip="10.2.2.2")
    assert eleventh.status_code == 429
    assert int(eleventh.headers["Retry-After"]) > 0
    assert peek("z", ip="10.2.2.3").status_code == 404


# ---------------------------------------------------------------------------
# The pending list
# ---------------------------------------------------------------------------


def test_the_users_list_filters_by_status(admin_client, db_session):
    registered(db_session, admin_client, "newcomer")
    make_account(db_session, "kana")

    pending = admin_client.get("/api/users/", params={"status": "pending"}).json()
    assert [u["username"] for u in pending] == ["newcomer"]

    everyone = {u["username"] for u in admin_client.get("/api/users/").json()}
    assert {"newcomer", "kana"} <= everyone


# ---------------------------------------------------------------------------
# Approval
# ---------------------------------------------------------------------------


def test_approval_defaults_to_user_at_normal(admin_client, db_session):
    user = registered(db_session, admin_client)
    r = approve(admin_client, user)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == USER_STATUS_ACTIVE
    assert body["role_name"] == "user"
    assert (body["mode_ceiling"], body["mode_default"]) == ("normal", "normal")
    assert body["open_request_limit"] == 15


def test_approval_sets_the_chosen_role_and_modes(admin_client, db_session):
    user = registered(db_session, admin_client)
    r = approve(
        admin_client,
        user,
        role_id=str(role_id_for(db_session, "super")),
        ceiling_mode="borderline",
        default_mode="safe",
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["role_name"] == "super"
    assert (body["mode_ceiling"], body["mode_default"]) == ("borderline", "safe")
    assert body["open_request_limit"] is None


@pytest.mark.parametrize(
    "body",
    [
        {"ceiling_mode": "unrestricted", "default_mode": "normal"},
        {"ceiling_mode": "normal", "default_mode": "unrestricted"},
        {"ceiling_mode": "safe", "default_mode": "normal"},
        {"ceiling_mode": "nonsense", "default_mode": "normal"},
    ],
)
def test_approval_refuses_unrestricted_and_bad_pairs(admin_client, db_session, body):
    user = registered(db_session, admin_client)
    assert approve(admin_client, user, **body).status_code == 422
    assert account(db_session, "newcomer").status == USER_STATUS_PENDING
    # Mirror: the same account approves with a valid pair.
    assert approve(admin_client, user).status_code == 200


@pytest.mark.parametrize("role", ["admin", "guest", "shared"])
def test_approval_refuses_a_role_other_than_user_or_super(
    admin_client, db_session, role
):
    user = registered(db_session, admin_client)
    r = approve(admin_client, user, role_id=str(role_id_for(db_session, role)))
    assert r.status_code == 422
    assert account(db_session, "newcomer").status == USER_STATUS_PENDING
    r = approve(admin_client, user, role_id=str(role_id_for(db_session, "user")))
    assert r.status_code == 200


def test_only_a_pending_account_is_approved(admin_client, db_session):
    active = make_account(db_session, "kana")
    disabled = make_account(db_session, "mio", status=USER_STATUS_DISABLED)
    assert approve(admin_client, active).status_code == 409
    assert approve(admin_client, disabled).status_code == 409
    assert approve(admin_client, registered(db_session, admin_client)).status_code == 200


def test_a_member_cannot_approve(user_client, admin_client, db_session):
    user = registered(db_session, admin_client)
    assert user_client.post(f"/api/users/{user.id}/approve", json={}).status_code == 401
    assert account(db_session, "newcomer").status == USER_STATUS_PENDING


# ---------------------------------------------------------------------------
# Decline
# ---------------------------------------------------------------------------


def test_declining_deletes_the_account_and_the_invite_stays_spent(
    admin_client, db_session
):
    code = fresh_code(admin_client)
    assert register(code).status_code == 201
    user = account(db_session, "newcomer")

    assert admin_client.post(f"/api/users/{user.id}/reject").status_code == 204
    assert account(db_session, "newcomer") is None

    row = db_session.query(models.AccountCode).one()
    assert row.spent_at is not None
    assert row.created_user_id is None
    assert register(code).status_code == 404


def test_only_a_pending_account_is_declined(admin_client, db_session):
    active = make_account(db_session, "kana")
    assert admin_client.post(f"/api/users/{active.id}/reject").status_code == 409
    assert account(db_session, "kana") is not None
    pending = registered(db_session, admin_client)
    assert admin_client.post(f"/api/users/{pending.id}/reject").status_code == 204


# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------


def test_backup_skips_pending_accounts(admin_client, db_session):
    registered(db_session, admin_client, "newcomer")
    make_account(db_session, "kana")
    tab = TAB_BY_NAME["Users"]
    names = {u.username for u in tab.rows(db_session)}
    assert "newcomer" not in names
    assert "kana" in names


# ---------------------------------------------------------------------------
# Whose rows a restore writes
# ---------------------------------------------------------------------------


def test_a_pending_registrant_never_becomes_the_installation_owner(
    admin_client, db_session
):
    """With nobody holding the flag, the fallback names the first eligible
    account by username. A registrant sorting first ("aaa...") must not be it:
    a Pull would file the owner's collection under a stranger awaiting
    approval. The mirror approves the same account and it then qualifies, so
    the refusal is the status check and not something incidental."""
    from app.services.domain.user_list import installation_owner_id

    db_session.query(models.User).update({models.User.is_installation_owner: False})
    make_account(db_session, "zzz-member")
    newcomer = registered(db_session, admin_client, "aaa-newcomer")

    assert installation_owner_id(db_session) != newcomer.id

    assert approve(admin_client, newcomer).status_code == 200
    db_session.expire_all()
    assert installation_owner_id(db_session) == newcomer.id
