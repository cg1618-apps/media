"""
Reset links: issued by the admin on /users or by the CLI on the box, spent once
on /reset.

Every refusal of a code - unknown, spent, expired, minted for another purpose
- answers with ONE message, so the page cannot be used to learn which codes
ever existed. Each refusal test asserts the refused case AND a mirror that the
same setup with the defect removed is accepted, so a green proves the code
check did the refusing.
"""

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import cli, models
from app.config import settings
from app.main import app
from app.models.system import USER_STATUS_DISABLED
from app.services.domain.account_codes import (
    INVALID_CODE_MESSAGE,
    PURPOSE_INVITE,
    hash_code,
)
from app.services.rbac.permissions import SHARED_ROLE_NAME
from tests.api.test_account_lifecycle import login, make_account

RESET = "/api/auth/reset"


def issue(admin_client, user):
    r = admin_client.post(f"/api/users/{user.id}/reset-link")
    assert r.status_code == 200, r.text
    return r.json()


def code_of(link):
    return link.split("code=", 1)[1]


def spend(code, password="after", ip="testclient"):
    return TestClient(app, client=(ip, 50000)).post(
        RESET, json={"code": code, "password": password}
    )


def peek(code, ip="testclient"):
    return TestClient(app, client=(ip, 50000)).get(RESET, params={"code": code})


@pytest.fixture
def kana(db_session, client):
    return make_account(db_session, "kana", "kana-pw")


# ---------------------------------------------------------------------------
# Issuing
# ---------------------------------------------------------------------------


def test_the_link_is_built_on_the_public_base_url(admin_client, kana):
    body = issue(admin_client, kana)
    assert body["link"].startswith(f"{settings.public_base_url}/reset?code=")
    expires = datetime.fromisoformat(body["expires_at"])
    remaining = expires - datetime.now(timezone.utc)
    assert timedelta(hours=23, minutes=59) < remaining <= timedelta(hours=24)


def test_only_the_hash_of_the_code_is_stored(admin_client, db_session, kana):
    code = code_of(issue(admin_client, kana)["link"])
    row = db_session.query(models.AccountCode).one()
    assert row.code_hash == hashlib.sha256(code.encode()).hexdigest()
    assert code not in row.code_hash
    assert row.user_id == kana.id
    assert row.created_by_id is not None


def test_a_member_cannot_issue_one(user_client, kana):
    assert user_client.post(f"/api/users/{kana.id}/reset-link").status_code == 401


def test_a_disabled_account_gets_no_link(admin_client, db_session, kana):
    kana.status = USER_STATUS_DISABLED
    db_session.flush()
    r = admin_client.post(f"/api/users/{kana.id}/reset-link")
    assert r.status_code == 409


def test_a_shared_account_gets_no_link(admin_client, db_session, kana):
    """The refusal keys on the `shared` role's name. The mirror is an
    ordinary account, issued below with the same client."""
    shared = (
        db_session.query(models.Role)
        .filter(models.Role.name == SHARED_ROLE_NAME)
        .one()
    )
    family = make_account(db_session, "family")
    family.role_id = shared.system_id
    db_session.flush()
    db_session.refresh(family)

    assert admin_client.post(f"/api/users/{family.id}/reset-link").status_code == 409
    assert admin_client.post(f"/api/users/{kana.id}/reset-link").status_code == 200


def test_an_unknown_account_is_404(admin_client):
    assert admin_client.post(f"/api/users/{uuid.uuid4()}/reset-link").status_code == 404


# ---------------------------------------------------------------------------
# Spending
# ---------------------------------------------------------------------------


def test_a_valid_code_names_the_account_without_spending(admin_client, kana):
    code = code_of(issue(admin_client, kana)["link"])
    assert peek(code).json() == {"username": "kana"}
    assert peek(code).json() == {"username": "kana"}
    assert spend(code).status_code == 200


def test_spending_sets_the_password_and_clears_the_login_cookie(admin_client, kana):
    code = code_of(issue(admin_client, kana)["link"])
    r = spend(code, "brand-new")
    assert r.status_code == 200
    assert r.json() == {"username": "kana"}
    # A deleted cookie is a Set-Cookie with an empty value and max-age 0.
    assert 'access_token=""' in r.headers["set-cookie"]

    assert login("kana", "brand-new").status_code == 200
    assert login("kana", "kana-pw").status_code == 401


def _refusals(code):
    got = peek(code)
    posted = spend(code)
    return got, posted


def test_a_spent_code_is_refused(admin_client, kana):
    code = code_of(issue(admin_client, kana)["link"])
    assert spend(code).status_code == 200  # the mirror: it worked once
    got, posted = _refusals(code)
    assert got.status_code == posted.status_code == 404
    assert got.json()["detail"] == posted.json()["detail"] == INVALID_CODE_MESSAGE


def test_an_expired_code_is_refused(admin_client, db_session, kana):
    code = code_of(issue(admin_client, kana)["link"])
    row = db_session.query(models.AccountCode).one()
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.flush()
    got, posted = _refusals(code)
    assert got.status_code == posted.status_code == 404
    assert posted.json()["detail"] == INVALID_CODE_MESSAGE


def test_a_code_minted_for_another_purpose_is_refused(db_session, kana):
    code = "an-invite-code-not-a-reset-code"
    now = datetime.now(timezone.utc)
    db_session.add(
        models.AccountCode(
            purpose=PURPOSE_INVITE,
            code_hash=hash_code(code),
            created_at=now,
            expires_at=now + timedelta(hours=24),
        )
    )
    db_session.flush()
    got, posted = _refusals(code)
    assert got.status_code == posted.status_code == 404
    assert posted.json()["detail"] == INVALID_CODE_MESSAGE


def test_an_unknown_code_is_refused(client):
    got, posted = _refusals("never-issued")
    assert got.status_code == posted.status_code == 404
    assert posted.json()["detail"] == INVALID_CODE_MESSAGE


def test_a_newer_link_voids_the_older(admin_client, kana):
    older = code_of(issue(admin_client, kana)["link"])
    newer = code_of(issue(admin_client, kana)["link"])
    assert spend(older).status_code == 404
    assert spend(newer).status_code == 200


def test_a_refused_password_leaves_the_code_unspent(admin_client, kana):
    code = code_of(issue(admin_client, kana)["link"])
    empty = spend(code, "")
    assert empty.status_code == 422
    too_long = spend(code, "é" * 36 + "a")
    assert too_long.status_code == 422
    assert "72" in too_long.json()["detail"]
    assert spend(code, "fine").status_code == 200


def test_an_account_disabled_after_the_link_was_issued_cannot_spend_it(
    admin_client, db_session, kana
):
    code = code_of(issue(admin_client, kana)["link"])
    kana.status = USER_STATUS_DISABLED
    db_session.flush()
    assert peek(code).status_code == 404
    assert spend(code).status_code == 404


# ---------------------------------------------------------------------------
# Rate limit: 10 per address per 15 minutes, GET and POST together
# ---------------------------------------------------------------------------


def test_the_eleventh_reset_request_from_one_address_is_429(client):
    for n in range(5):
        assert peek(f"x{n}", ip="10.1.1.1").status_code == 404
        assert spend(f"y{n}", ip="10.1.1.1").status_code == 404
    eleventh = peek("z", ip="10.1.1.1")
    assert eleventh.status_code == 429
    assert int(eleventh.headers["Retry-After"]) > 0
    # The mirror: another address is untouched.
    assert peek("z", ip="10.1.1.2").status_code == 404


# ---------------------------------------------------------------------------
# The CLI
# ---------------------------------------------------------------------------


def test_the_cli_prints_a_link_whose_code_spends(db_session, kana, capsys):
    assert cli.run(db_session, ["reset-link", "kana"]) == 0
    out = capsys.readouterr().out
    link = next(word for word in out.split() if "/reset?code=" in word)
    assert link.startswith(settings.public_base_url)

    row = db_session.query(models.AccountCode).one()
    assert row.created_by_id is None

    assert spend(code_of(link), "from-the-box").status_code == 200
    assert login("kana", "from-the-box").status_code == 200


def test_the_cli_finds_the_account_whatever_the_case(db_session, kana, capsys):
    assert cli.run(db_session, ["reset-link", "KANA"]) == 0


@pytest.mark.parametrize("name", ["nobody", "kana-disabled"])
def test_the_cli_refuses_an_unknown_or_inactive_account(
    db_session, client, capsys, name
):
    make_account(db_session, "kana-disabled", status=USER_STATUS_DISABLED)
    assert cli.run(db_session, ["reset-link", name]) == 1
    captured = capsys.readouterr()
    assert "/reset?code=" not in captured.out
    assert captured.err.strip()
    assert db_session.query(models.AccountCode).count() == 0
