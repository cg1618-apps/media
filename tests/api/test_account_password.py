"""
PUT /api/account/password - changing your own password.

Gated on `self.password`, which `user` and `super` hold and which a root admin
and a guest cannot: the self family is ownership, not privilege, and the root
short-circuit deliberately does not reach it (resolver.Viewer.has). The admin
sets its own password on /users instead.
"""

import pytest

from app.services.rbac.permissions import (
    PERM_SELF_PASSWORD,
    SHARED_ROLE_NAME,
    SUPER_ROLE_NAME,
    locked_permissions,
)
from app.services.rbac.seed import (
    USER_ROLE,
    default_guest_permissions,
    default_super_permissions,
    default_user_permissions,
)
from tests.api.test_account_lifecycle import login

PASSWORD = "/api/account/password"


def change(client, current, new):
    return client.put(
        PASSWORD, json={"current_password": current, "new_password": new}
    )


def test_a_member_changes_their_own_password(user_client):
    r = change(user_client, "testpass", "newpass")
    assert r.status_code == 200, r.text
    assert login("plainuser", "newpass").status_code == 200
    assert login("plainuser", "testpass").status_code == 401


def test_a_wrong_current_password_is_400_not_401(user_client):
    """401 is what the SPA reads as a lost session."""
    r = change(user_client, "not-it", "newpass")
    assert r.status_code == 400
    assert r.json()["detail"] == "Your current password is not right."
    assert login("plainuser", "testpass").status_code == 200


@pytest.mark.parametrize("new", ["", "é" * 36 + "a"])
def test_the_new_password_passes_the_two_technical_checks(user_client, new):
    assert change(user_client, "testpass", new).status_code == 422
    assert login("plainuser", "testpass").status_code == 200


def test_a_one_character_password_is_fine(user_client):
    assert change(user_client, "testpass", "x").status_code == 200


def test_super_holds_it(super_client):
    assert change(super_client, "testpass", "newpass").status_code == 200


def test_the_root_admin_does_not(admin_client):
    """The mirror of the two above: the same request from a root account."""
    assert change(admin_client, "testpass", "newpass").status_code == 401


def test_a_guest_does_not(client):
    assert change(client, "x", "y").status_code == 401


# ---------------------------------------------------------------------------
# The grant
# ---------------------------------------------------------------------------


def test_user_and_super_are_seeded_with_it_and_guest_is_not():
    assert PERM_SELF_PASSWORD == "self.password"
    assert PERM_SELF_PASSWORD in default_user_permissions()
    assert PERM_SELF_PASSWORD in default_super_permissions()
    assert PERM_SELF_PASSWORD not in default_guest_permissions()


def test_it_is_locked_on_for_user_and_super():
    assert PERM_SELF_PASSWORD in locked_permissions(USER_ROLE, False)[0]
    assert PERM_SELF_PASSWORD in locked_permissions(SUPER_ROLE_NAME, False)[0]


def test_it_is_locked_off_for_a_shared_account():
    """One person changing a shared login's password would lock out everyone
    else using it; the admin sets it on /users."""
    on, off = locked_permissions(SHARED_ROLE_NAME, False)
    assert PERM_SELF_PASSWORD in off and PERM_SELF_PASSWORD not in on
