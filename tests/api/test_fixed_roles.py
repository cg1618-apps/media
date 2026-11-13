"""
Exactly five roles, all fixed.

There is no route that creates or deletes a role; the seed makes the five and
an admin edits only their free grants. The lock table answers every one of
the five explicitly, and anything else gets nothing.

Every refusal below is paired with the mirror case that must still succeed.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import (
    PERM_MANAGE_CATALOG,
    PERM_SELF_PASSWORD,
    PERM_SELF_REQUESTS,
    PERM_VIEW_ENTITIES,
    PERM_VIEW_EXTRAS,
    ROLE_NAMES,
    SHARED_ROLE_NAME,
    SUPER_ROLE_NAME,
    USER_ROLE_NAME,
    locked_permissions,
    static_catalog,
)
from app.services.rbac.seed import (
    default_shared_permissions,
    default_user_permissions,
    ensure_rbac_seed,
)
from tests.api.conftest import role_id_for

ROLES = "/api/roles/"


def _role(admin_client, name):
    return next(r for r in admin_client.get(ROLES).json() if r["name"] == name)


def _save(admin_client, role, permissions):
    return admin_client.put(
        f"/api/roles/{role['system_id']}/permissions",
        json={"permissions": sorted(permissions)},
    )


# ---------------------------------------------------------------------------
# The set of roles
# ---------------------------------------------------------------------------


def test_roles_cannot_be_created(admin_client):
    r = admin_client.post(ROLES, json={"name": "friend", "label": "Friend"})
    assert r.status_code == 405
    # Mirror: the collection itself still answers.
    assert admin_client.get(ROLES).status_code == 200


def test_roles_cannot_be_deleted(admin_client):
    user = _role(admin_client, USER_ROLE_NAME)
    assert admin_client.delete(f"/api/roles/{user['system_id']}").status_code == 405
    assert admin_client.get(f"/api/roles/{user['system_id']}").status_code == 200


def test_the_seed_makes_exactly_the_five(admin_client):
    names = {r["name"] for r in admin_client.get(ROLES).json()}
    assert names == set(ROLE_NAMES)
    assert len(ROLE_NAMES) == 5


def test_the_role_response_has_no_is_system(admin_client):
    assert "is_system" not in _role(admin_client, USER_ROLE_NAME)


def test_an_unknown_role_name_is_locked_out_of_everything():
    """Such a row cannot exist after the migration; if one appears anyway,
    the lock table must not hand it the free choices."""
    on, off = locked_permissions("friend", False)
    assert on == frozenset()
    assert off == static_catalog()


def test_every_known_role_has_free_choices():
    """Mirror of the unknown-name case: the fail-closed branch is reached only
    by a stranger, never by one of the five."""
    for name in (USER_ROLE_NAME, SHARED_ROLE_NAME, "guest"):
        on, off = locked_permissions(name, False)
        assert static_catalog() - on - off, name


# ---------------------------------------------------------------------------
# The shared role's locks
# ---------------------------------------------------------------------------


def test_shared_must_hold_requests(admin_client):
    shared = _role(admin_client, SHARED_ROLE_NAME)
    held = set(shared["permissions"])
    assert PERM_SELF_REQUESTS in held

    r = _save(admin_client, shared, held - {PERM_SELF_REQUESTS})
    assert r.status_code == 409
    assert PERM_SELF_REQUESTS in r.json()["detail"]


@pytest.mark.parametrize(
    "permission", [PERM_VIEW_EXTRAS, PERM_MANAGE_CATALOG, PERM_SELF_PASSWORD]
)
def test_shared_can_never_hold(admin_client, permission):
    shared = _role(admin_client, SHARED_ROLE_NAME)
    r = _save(admin_client, shared, set(shared["permissions"]) | {permission})
    assert r.status_code == 409
    assert permission in r.json()["detail"]


def test_shared_saves_a_free_view_permission(admin_client):
    """Mirror: the 409s above came from the locks, not from refusing every
    save of this role."""
    shared = _role(admin_client, SHARED_ROLE_NAME)
    held = set(shared["permissions"])
    assert PERM_VIEW_ENTITIES not in held

    r = _save(admin_client, shared, held | {PERM_VIEW_ENTITIES})
    assert r.status_code == 200, r.text
    assert PERM_VIEW_ENTITIES in r.json()["permissions"]


def test_shared_is_seeded_with_guest_reads_and_requests(admin_client):
    assert set(_role(admin_client, SHARED_ROLE_NAME)["permissions"]) == (
        default_shared_permissions()
    )


# ---------------------------------------------------------------------------
# user never writes the catalogue
# ---------------------------------------------------------------------------


def test_user_cannot_hold_manage_catalog(admin_client):
    user = _role(admin_client, USER_ROLE_NAME)
    r = _save(admin_client, user, set(user["permissions"]) | {PERM_MANAGE_CATALOG})
    assert r.status_code == 409
    assert PERM_MANAGE_CATALOG in user["locked_off"]


def test_super_holds_manage_catalog(admin_client):
    """Mirror: manage.catalog is a real, holdable permission - on super."""
    super_role = _role(admin_client, SUPER_ROLE_NAME)
    assert PERM_MANAGE_CATALOG in super_role["permissions"]
    assert PERM_MANAGE_CATALOG in super_role["locked_on"]


def test_boot_drops_a_stored_manage_catalog_from_user(db_session):
    role_id = role_id_for(db_session, USER_ROLE_NAME)
    db_session.add(
        models.RolePermission(role_id=role_id, permission=PERM_MANAGE_CATALOG)
    )
    db_session.flush()

    ensure_rbac_seed(db_session)

    held = {
        row.permission
        for row in db_session.query(models.RolePermission).filter(
            models.RolePermission.role_id == role_id
        )
    }
    assert PERM_MANAGE_CATALOG not in held
    # Mirror: the same run kept the member's ordinary grants.
    assert default_user_permissions() <= held


def test_boot_strips_a_stray_role_of_everything(db_session):
    """A role row outside the five - only a hand edit could make one - keeps
    nothing across a boot."""
    stray = models.Role(
        system_id=uuid.uuid4(), name="friend", label="Friend", is_root=False
    )
    db_session.add(stray)
    db_session.flush()
    db_session.add(
        models.RolePermission(role_id=stray.system_id, permission=PERM_VIEW_EXTRAS)
    )
    db_session.flush()

    ensure_rbac_seed(db_session)

    assert (
        db_session.query(models.RolePermission)
        .filter(models.RolePermission.role_id == stray.system_id)
        .count()
        == 0
    )
