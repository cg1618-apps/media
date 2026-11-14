"""
The view.random_picker revision: super, user and shared gain the key, guest
never does, and the downgrade takes it back off.

The suite builds its schema with create_all and never runs Alembic, so this
imports the revision by file path and runs its OWN functions against the test
session. Each test first takes the key off every role (the state of a database
from before the revision), so the grant has something to add.
"""

import importlib.util
from pathlib import Path

import pytest

from app import models
from app.services.rbac.permissions import PERM_VIEW_RANDOM_PICKER

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "v1i2ewextras3_view_random_picker.py"
HOLDERS = ("super", "user", "shared")


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_view_random_picker", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _holds(db, role_name):
    role = db.query(models.Role).filter(models.Role.name == role_name).one()
    return (
        db.query(models.RolePermission)
        .filter(
            models.RolePermission.role_id == role.system_id,
            models.RolePermission.permission == PERM_VIEW_RANDOM_PICKER,
        )
        .count()
    )


@pytest.fixture
def pre_revision(db_session, client):
    """The seeded roles, with the key taken off all of them."""
    db_session.query(models.RolePermission).filter(
        models.RolePermission.permission == PERM_VIEW_RANDOM_PICKER
    ).delete(synchronize_session=False)
    db_session.flush()
    return db_session


def test_the_name_matches_the_code(revision):
    assert revision.RANDOM_PICKER == PERM_VIEW_RANDOM_PICKER


def test_upgrade_grants_the_three_holders_and_not_guest(revision, pre_revision):
    db = pre_revision
    revision.grant_random_picker(db.connection())
    for name in HOLDERS:
        assert _holds(db, name) == 1, name
    assert _holds(db, "guest") == 0


def test_upgrade_is_idempotent(revision, pre_revision):
    db = pre_revision
    revision.grant_random_picker(db.connection())
    revision.grant_random_picker(db.connection())
    for name in HOLDERS:
        assert _holds(db, name) == 1, name


def test_downgrade_takes_it_back_off(revision, pre_revision):
    db = pre_revision
    revision.grant_random_picker(db.connection())
    revision.revoke_random_picker(db.connection())
    for name in (*HOLDERS, "guest"):
        assert _holds(db, name) == 0, name
