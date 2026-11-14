"""
The v1i2ewextras3 revision: super, user and shared gain view.random_picker,
guest and admin never do, and every view.extras grant goes. The downgrade puts
view.extras back on user and super and takes the new key off everyone.

The suite builds its schema with create_all and never runs Alembic, so this
imports the revision by file path and runs its OWN functions against the test
session. `pre_revision` puts the database in the state from before the
revision - view.extras on user and super, the new key on nobody - so each step
has something to do.
"""

import importlib.util
from pathlib import Path

import pytest

from app import models
from app.services.rbac.permissions import PERM_VIEW_RANDOM_PICKER

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "v1i2ewextras3_view_random_picker.py"
HOLDERS = ("super", "user", "shared")
# Frozen: the key no longer exists in app code.
EXTRAS = "view.extras"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_view_random_picker", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _role(db, name):
    return db.query(models.Role).filter(models.Role.name == name).one()


def _holds(db, role_name, permission):
    return (
        db.query(models.RolePermission)
        .filter(
            models.RolePermission.role_id == _role(db, role_name).system_id,
            models.RolePermission.permission == permission,
        )
        .count()
    )


@pytest.fixture
def pre_revision(db_session, client):
    db_session.query(models.RolePermission).filter(
        models.RolePermission.permission.in_([PERM_VIEW_RANDOM_PICKER, EXTRAS])
    ).delete(synchronize_session=False)
    for name in ("user", "super"):
        db_session.add(
            models.RolePermission(role_id=_role(db_session, name).system_id, permission=EXTRAS)
        )
    db_session.flush()
    return db_session


def test_the_names_match(revision):
    assert revision.RANDOM_PICKER == PERM_VIEW_RANDOM_PICKER
    assert revision.EXTRAS == EXTRAS


def test_upgrade_grants_the_three_holders_and_not_guest_or_admin(revision, pre_revision):
    db = pre_revision
    revision.apply_upgrade(db.connection())
    for name in HOLDERS:
        assert _holds(db, name, PERM_VIEW_RANDOM_PICKER) == 1, name
    for name in ("guest", "admin"):
        assert _holds(db, name, PERM_VIEW_RANDOM_PICKER) == 0, name


def test_upgrade_deletes_every_view_extras_grant(revision, pre_revision):
    db = pre_revision
    assert _holds(db, "user", EXTRAS) == 1  # so the deletion has a row to bite
    revision.apply_upgrade(db.connection())
    assert db.query(models.RolePermission).filter_by(permission=EXTRAS).count() == 0


def test_upgrade_is_idempotent(revision, pre_revision):
    db = pre_revision
    revision.apply_upgrade(db.connection())
    revision.apply_upgrade(db.connection())
    for name in HOLDERS:
        assert _holds(db, name, PERM_VIEW_RANDOM_PICKER) == 1, name


def test_downgrade_restores_view_extras_on_user_and_super_only(revision, pre_revision):
    db = pre_revision
    revision.apply_upgrade(db.connection())
    revision.apply_downgrade(db.connection())
    assert _holds(db, "user", EXTRAS) == 1
    assert _holds(db, "super", EXTRAS) == 1
    for name in ("shared", "guest", "admin"):
        assert _holds(db, name, EXTRAS) == 0, name
    for name in (*HOLDERS, "guest", "admin"):
        assert _holds(db, name, PERM_VIEW_RANDOM_PICKER) == 0, name
