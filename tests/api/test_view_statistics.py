"""
view.statistics: the Statistics page and its catalogue counts.

super, user and shared hold it by lock, and guest and admin never do. Until
this key the page opened on any ordinary `media_type.*`, which reached the
guest. Every refusal reads a catalogue with an entry in it, so a 401 cannot be
an empty table answering, and each is mirrored by a holder reading the same
counts.

The s1t2atistics3 revision grants it to the three holders; its own functions
are imported by file path and run against the test session, as
test_view_random_picker_migration.py does, since the suite builds its schema
with create_all and never runs Alembic.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest

from app import models
from app.services.rbac import cache as rbac_cache
from app.services.rbac.permissions import (
    PERM_VIEW_STATISTICS,
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

STATS = "/api/statistics/catalogue"
ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "s1t2atistics3_view_statistics.py"
HOLDERS = ("super", "user", "shared")


@pytest.fixture
def an_entry(db_session, sample_franchise):
    """One anime the gate has to keep from a guest."""
    db_session.add(
        models.Anime(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            anime_name_en="Counted Anime",
            airing_type="TV",
        )
    )
    db_session.flush()


def _sign_in_as(db_session, client, role_name):
    """`client`, signed in as a fresh account of the seeded role, in `safe`."""
    user = models.User(
        id=uuid.uuid4(),
        username=f"stats-{role_name}",
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


def _anime_count(response):
    rows = {r["media_type"]: r["entry_count"] for r in response.json()["by_type"]}
    return rows.get("anime")


# ---------------------------------------------------------------------------
# The key, its locks and the seed
# ---------------------------------------------------------------------------


def test_the_key_is_in_the_catalog_with_a_label():
    assert PERM_VIEW_STATISTICS in static_catalog()
    label, description = VIEW_PERMISSION_LABELS["statistics"]
    assert label and description


@pytest.mark.parametrize("role_name", HOLDERS)
def test_it_is_locked_on_for_super_user_and_shared(role_name):
    on, _ = locked_permissions(role_name)
    assert PERM_VIEW_STATISTICS in on


@pytest.mark.parametrize("role_name", ("guest", "admin"))
def test_it_is_locked_off_for_guest_and_admin(role_name):
    """The admin's lock is its fixed set and every other key, so a key minted
    later is locked off without naming it - asserted here, not coded."""
    on, off = locked_permissions(role_name)
    assert PERM_VIEW_STATISTICS in off
    assert PERM_VIEW_STATISTICS not in on


def test_the_seed_defaults_follow_the_locks():
    assert PERM_VIEW_STATISTICS in default_super_permissions()
    assert PERM_VIEW_STATISTICS in default_user_permissions()
    assert PERM_VIEW_STATISTICS in default_shared_permissions()
    assert PERM_VIEW_STATISTICS not in default_guest_permissions()


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
        json={"permissions": sorted(set(held) | {PERM_VIEW_STATISTICS})},
    )
    assert response.status_code == 409


def test_saving_shared_without_it_is_409(admin_client):
    shared = _role(admin_client, "shared")
    held = admin_client.get(f"/api/roles/{shared['system_id']}").json()["permissions"]
    assert PERM_VIEW_STATISTICS in held
    response = admin_client.put(
        f"/api/roles/{shared['system_id']}/permissions",
        json={"permissions": sorted(set(held) - {PERM_VIEW_STATISTICS})},
    )
    assert response.status_code == 409


# ---------------------------------------------------------------------------
# The read
# ---------------------------------------------------------------------------


def test_a_guest_cannot_read_the_catalogue_counts(client, an_entry):
    """The guest holds media_type.anime and the anime exists, so the 401 is
    the statistics gate and not an empty catalogue."""
    assert client.get("/api/anime/").status_code == 200
    assert client.get(STATS).status_code == 401


@pytest.mark.parametrize("role_name", ("shared", "user", "super"))
def test_each_holder_reads_them(db_session, client, an_entry, role_name):
    response = _sign_in_as(db_session, client, role_name).get(STATS)
    assert response.status_code == 200, response.text
    assert _anime_count(response) == 1


def test_the_admin_cannot_read_them(admin_client, an_entry):
    assert admin_client.get(STATS).status_code == 401


# ---------------------------------------------------------------------------
# The revision
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_view_statistics", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _holds(db, role_name):
    role = db.query(models.Role).filter(models.Role.name == role_name).one()
    return (
        db.query(models.RolePermission)
        .filter_by(role_id=role.system_id, permission=PERM_VIEW_STATISTICS)
        .count()
    )


@pytest.fixture
def pre_revision(db_session, client):
    """The state before the revision: nobody holds the key."""
    db_session.query(models.RolePermission).filter_by(
        permission=PERM_VIEW_STATISTICS
    ).delete(synchronize_session=False)
    db_session.flush()
    return db_session


def test_the_frozen_name_matches(revision):
    assert revision.STATISTICS == PERM_VIEW_STATISTICS


def test_upgrade_grants_the_three_holders_and_not_guest_or_admin(revision, pre_revision):
    db = pre_revision
    assert all(_holds(db, name) == 0 for name in HOLDERS)
    revision.apply_upgrade(db.connection())
    for name in HOLDERS:
        assert _holds(db, name) == 1, name
    for name in ("guest", "admin"):
        assert _holds(db, name) == 0, name


def test_upgrade_is_idempotent(revision, pre_revision):
    db = pre_revision
    revision.apply_upgrade(db.connection())
    revision.apply_upgrade(db.connection())
    for name in HOLDERS:
        assert _holds(db, name) == 1, name


def test_downgrade_takes_it_off_everyone(revision, pre_revision):
    db = pre_revision
    revision.apply_upgrade(db.connection())
    revision.apply_downgrade(db.connection())
    for name in (*HOLDERS, "guest", "admin"):
        assert _holds(db, name) == 0, name
