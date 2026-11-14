"""
view.random_picker: the Random Picker and its saved defaults.

super, user and shared hold it by lock, and guest never does - viewers.md gives
the shared account its own Random Picker and the guest none, and no existing
key draws that line. Every refusal reads a mode with saved defaults, so there
is something to refuse, and is mirrored by a holder reading the same row.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.rbac import cache as rbac_cache
from app.services.rbac.permissions import (
    PERM_VIEW_RANDOM_PICKER,
    VIEW_PERMISSION_LABELS,
    locked_permissions,
    static_catalog,
)
from app.services.rbac.seed import (
    default_guest_permissions,
    default_shared_permissions,
    default_super_permissions,
    default_user_permissions,
)
from app.services.rbac.seed_modes import MODE_SAFE
from app.services.security import create_access_token, get_password_hash
from tests.api.conftest import role_id_for

DEFAULTS = "/api/random-picker-defaults/anime"


@pytest.fixture
def configured_mode(admin_client):
    saved = admin_client.put(
        DEFAULTS, json={"filters": {"genre": ["Comedy"]}}
    )
    assert saved.status_code == 200, saved.text


def _sign_in_as(db_session, client, role_name):
    """`client`, signed in as a fresh account of the seeded role, in `safe`."""
    user = models.User(
        id=uuid.uuid4(),
        username=f"picker-{role_name}",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db_session, role_name),
    )
    user.mode_ceiling = MODE_SAFE
    user.mode_default = MODE_SAFE
    db_session.add(user)
    db_session.flush()
    rbac_cache.bump()
    token = create_access_token({"sub": user.username, "role": role_name})
    client.cookies.set("access_token", f"Bearer {token}")
    return client


# ---------------------------------------------------------------------------
# The key, its locks and the seed
# ---------------------------------------------------------------------------


def test_the_key_is_in_the_catalog_with_a_label():
    assert PERM_VIEW_RANDOM_PICKER in static_catalog()
    label, description = VIEW_PERMISSION_LABELS["random_picker"]
    assert label and description


@pytest.mark.parametrize("role_name", ("super", "user", "shared"))
def test_it_is_locked_on_for_super_user_and_shared(role_name):
    on, _ = locked_permissions(role_name, False)
    assert PERM_VIEW_RANDOM_PICKER in on


def test_it_is_locked_off_for_guest():
    _, off = locked_permissions("guest", False)
    assert PERM_VIEW_RANDOM_PICKER in off


def test_the_seed_defaults_follow_the_locks():
    assert PERM_VIEW_RANDOM_PICKER in default_super_permissions()
    assert PERM_VIEW_RANDOM_PICKER in default_user_permissions()
    assert PERM_VIEW_RANDOM_PICKER in default_shared_permissions()
    assert PERM_VIEW_RANDOM_PICKER not in default_guest_permissions()


def _role(admin_client, name):
    for role in admin_client.get("/api/roles/").json():
        if role["name"] == name:
            return role
    raise AssertionError(name)


def test_saving_guest_with_it_is_409(admin_client):
    guest = _role(admin_client, "guest")
    held = admin_client.get(f"/api/roles/{guest['system_id']}").json()["permissions"]
    response = admin_client.put(
        f"/api/roles/{guest['system_id']}/permissions",
        json={"permissions": sorted(set(held) | {PERM_VIEW_RANDOM_PICKER})},
    )
    assert response.status_code == 409


def test_saving_shared_without_it_is_409(admin_client):
    shared = _role(admin_client, "shared")
    held = admin_client.get(f"/api/roles/{shared['system_id']}").json()["permissions"]
    assert PERM_VIEW_RANDOM_PICKER in held
    response = admin_client.put(
        f"/api/roles/{shared['system_id']}/permissions",
        json={"permissions": sorted(set(held) - {PERM_VIEW_RANDOM_PICKER})},
    )
    assert response.status_code == 409


# ---------------------------------------------------------------------------
# The read
# ---------------------------------------------------------------------------


def test_a_guest_cannot_read_saved_defaults(client, configured_mode):
    assert client.get(DEFAULTS).status_code == 401


@pytest.mark.parametrize("role_name", ("shared", "user"))
def test_shared_and_user_read_them(db_session, client, configured_mode, role_name):
    response = _sign_in_as(db_session, client, role_name).get(DEFAULTS)
    assert response.status_code == 200, response.text
    assert response.json()["filters"]["genre"] == ["Comedy"]
