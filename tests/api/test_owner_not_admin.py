"""
No admin-role account is ever the installation owner.

The owner is whose collection a restore or a pipeline files rows under
(user_list.installation_owner_id), and the admin keeps no personal data. So
the combination - users.is_installation_owner on an account whose role is
`admin` - is refused or undone on every path that writes either half:

- /api/users never writes the flag, and never gives an account the admin
  role (create, approve and PATCH all take `user` or `super` only, 422), and
  the admin account's own role is fixed (409);
- Pull's Users tab restores an admin-role row WITHOUT the flag and reports
  it, leaving whoever holds the flag locally holding it;
- boot clears the flag from any admin-role account a hand edit left;
- installation_owner_id() skips an admin flag holder as well, so the rows of
  a database in that state still go to an eligible account.

Each refusal runs with a flagged account present, so there is something to
refuse, and has a mirror on a non-admin role that succeeds.
"""

import uuid

import pytest

from app import models
from app.services.domain.user_list import installation_owner_id
from app.services.pipelines import pull
from app.services.rbac.seed import ensure_no_admin_installation_owner
from app.services.security import get_password_hash


@pytest.fixture
def db(db_session):
    return db_session


def _role(db, name):
    return db.query(models.Role).filter_by(name=name).one()


def _account(db, username, role_name, owner=False):
    user = models.User(
        id=uuid.uuid4(),
        username=username,
        hashed_password=get_password_hash("pw-for-tests-only"),
        role_id=_role(db, role_name).system_id,
        is_installation_owner=owner,
    )
    db.add(user)
    db.flush()
    return user


def _clear_flags(db):
    db.query(models.User).update({"is_installation_owner": False})
    db.flush()


# ---------------------------------------------------------------------------
# installation_owner_id
# ---------------------------------------------------------------------------


def test_an_admin_flag_holder_is_not_the_owner(db, admin_user):
    _clear_flags(db)
    member = _account(db, "aab-member", "super")
    admin_user.is_installation_owner = True
    db.flush()
    assert installation_owner_id(db) == member.id


def test_a_super_flag_holder_is_the_owner(db):
    """The mirror: the flag still wins over the fallback for any other role."""
    _clear_flags(db)
    _account(db, "aab-member", "super")
    flagged = _account(db, "zzz-flagged", "user", owner=True)
    assert installation_owner_id(db) == flagged.id


# ---------------------------------------------------------------------------
# Boot
# ---------------------------------------------------------------------------


def test_boot_clears_the_flag_from_an_admin_account(db, admin_user):
    _clear_flags(db)
    admin_user.is_installation_owner = True
    db.flush()
    ensure_no_admin_installation_owner(db)
    db.refresh(admin_user)
    assert admin_user.is_installation_owner is False


def test_boot_leaves_a_member_owners_flag_alone(db, admin_user):
    _clear_flags(db)
    owner = _account(db, "zzz-flagged", "super", owner=True)
    ensure_no_admin_installation_owner(db)
    db.refresh(owner)
    assert owner.is_installation_owner is True


# ---------------------------------------------------------------------------
# Pull's Users tab
# ---------------------------------------------------------------------------

USER_HEADERS = ["id", "username", "role", "is_installation_owner"]


@pytest.fixture
def sheets(monkeypatch):
    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


def _pull_users(db):
    return pull.execute_pull_specific(
        db, "Users", log_action=False, may_restore_authz=True
    )


def test_a_pull_restores_an_admin_row_without_the_flag(db, sheets):
    """The row lands - role and all - and only the flag is dropped and
    reported. The account holding the flag locally keeps it: the clearing
    that makes room for the sheet's owner does not run for a refused flag."""
    _clear_flags(db)
    local_owner = _account(db, "zzz-owner", "super", owner=True)
    sheets({"Users": [USER_HEADERS, [str(uuid.uuid4()), "boss", "admin", "TRUE"]]})

    result = _pull_users(db)

    assert result["status"] == "success"
    boss = db.query(models.User).filter_by(username="boss").one()
    assert boss.role_ref.name == "admin"
    assert boss.is_installation_owner is False
    db.refresh(local_owner)
    assert local_owner.is_installation_owner is True
    assert any(
        "boss" in ref and "installation owner" in ref
        for ref in result["unresolved_refs"]
    )


def test_a_pull_turning_a_flagged_account_admin_drops_the_flag(db, sheets):
    _clear_flags(db)
    flagged = _account(db, "kana", "super", owner=True)
    sheets({"Users": [USER_HEADERS, [str(flagged.id), "kana", "admin", "TRUE"]]})

    result = _pull_users(db)

    assert result["status"] == "success"
    db.refresh(flagged)
    assert flagged.role_ref.name == "admin"
    assert flagged.is_installation_owner is False


def test_a_pull_restores_a_super_owner_with_the_flag(db, sheets):
    """The mirror: the same row on a super role keeps its flag, and takes it
    from the local holder."""
    _clear_flags(db)
    local_owner = _account(db, "zzz-owner", "super", owner=True)
    sheets({"Users": [USER_HEADERS, [str(uuid.uuid4()), "boss", "super", "TRUE"]]})

    result = _pull_users(db)

    assert result["status"] == "success"
    boss = db.query(models.User).filter_by(username="boss").one()
    assert boss.is_installation_owner is True
    db.refresh(local_owner)
    assert local_owner.is_installation_owner is False
    assert not any("installation owner" in ref for ref in result["unresolved_refs"])


# ---------------------------------------------------------------------------
# /api/users
# ---------------------------------------------------------------------------


def test_a_flagged_account_cannot_be_made_admin(db, admin_client):
    _clear_flags(db)
    flagged = _account(db, "kana", "user", owner=True)
    r = admin_client.patch(
        f"/api/users/{flagged.id}", json={"role_id": str(_role(db, "admin").system_id)}
    )
    assert r.status_code == 422, r.text
    db.refresh(flagged)
    assert flagged.role_ref.name == "user" and flagged.is_installation_owner is True


def test_a_flagged_account_may_become_super(db, admin_client):
    """The mirror: the same change to another assignable role succeeds and
    the account stays the owner."""
    _clear_flags(db)
    flagged = _account(db, "kana", "user", owner=True)
    r = admin_client.patch(
        f"/api/users/{flagged.id}", json={"role_id": str(_role(db, "super").system_id)}
    )
    assert r.status_code == 200, r.text
    db.refresh(flagged)
    assert flagged.role_ref.name == "super" and flagged.is_installation_owner is True


def test_no_users_route_sets_the_flag(db, admin_client, admin_user):
    """PATCH carries no flag field: a stray key is ignored on the admin
    account, with another account holding the flag."""
    _clear_flags(db)
    flagged = _account(db, "kana", "user", owner=True)
    r = admin_client.patch(
        f"/api/users/{admin_user.id}", json={"is_installation_owner": True}
    )
    assert r.status_code == 200, r.text
    db.refresh(admin_user)
    db.refresh(flagged)
    assert admin_user.is_installation_owner is False
    assert flagged.is_installation_owner is True


def test_an_account_is_never_created_as_admin(db, admin_client):
    _clear_flags(db)
    _account(db, "kana", "user", owner=True)
    r = admin_client.post(
        "/api/users/",
        json={
            "username": "newadmin",
            "password": "a-long-enough-password-1",
            "role_id": str(_role(db, "admin").system_id),
        },
    )
    assert r.status_code == 422, r.text
    assert db.query(models.User).filter_by(username="newadmin").count() == 0

