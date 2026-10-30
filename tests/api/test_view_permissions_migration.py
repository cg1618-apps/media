"""
The view-permissions revision: an established `user` role gains the four
view.* keys, `guest` gains nothing, and the downgrade takes them back off.

The seed's top-up never reaches a role that already holds something, so on an
existing database this revision is the only thing that grants them. The suite
builds its schema with create_all and never runs Alembic, so this imports the
revision by file path and runs its OWN functions against the test session -
restating the SQL here would pass while the shipped migration was wrong.

Each test first takes the keys off `user` (the state of a database from
before the revision), so the grant has something to add.
"""

import importlib.util
from pathlib import Path

import pytest

from app import models
from app.services.rbac.permissions import VIEW_PERMISSION_KEYS, view_perm

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "v1i2ewperms34_view_permissions_for_user.py"
VIEW_ALL = {view_perm(key) for key in VIEW_PERMISSION_KEYS}


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_view_perms", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _held(db, role_name):
    role = db.query(models.Role).filter(models.Role.name == role_name).one()
    return {
        row.permission
        for row in db.query(models.RolePermission).filter(
            models.RolePermission.role_id == role.system_id
        )
    }


@pytest.fixture
def pre_revision(db_session, client):
    """The seeded roles, with the view keys taken off `user`."""
    user = db_session.query(models.Role).filter(models.Role.name == "user").one()
    db_session.query(models.RolePermission).filter(
        models.RolePermission.role_id == user.system_id,
        models.RolePermission.permission.in_(VIEW_ALL),
    ).delete(synchronize_session=False)
    db_session.flush()
    assert not VIEW_ALL & _held(db_session, "user")
    return db_session


def test_the_names_match_the_code(revision):
    assert set(revision.VIEW_PERMISSIONS) == VIEW_ALL


def test_upgrade_grants_user_and_not_guest(revision, pre_revision):
    db = pre_revision
    guest_before = _held(db, "guest")
    revision.grant_view_permissions(db.connection())
    assert VIEW_ALL <= _held(db, "user")
    assert _held(db, "guest") == guest_before


def test_upgrade_is_idempotent(revision, pre_revision):
    db = pre_revision
    revision.grant_view_permissions(db.connection())
    revision.grant_view_permissions(db.connection())
    user = db.query(models.Role).filter(models.Role.name == "user").one()
    rows = (
        db.query(models.RolePermission)
        .filter(
            models.RolePermission.role_id == user.system_id,
            models.RolePermission.permission.in_(VIEW_ALL),
        )
        .count()
    )
    assert rows == len(VIEW_ALL)


def test_downgrade_takes_them_off_every_role(revision, pre_revision):
    db = pre_revision
    revision.grant_view_permissions(db.connection())
    # `super` holds them by lock; the downgrade must reach it too.
    assert VIEW_ALL <= _held(db, "super")
    revision.revoke_view_permissions(db.connection())
    for role in ("user", "super", "guest"):
        assert not VIEW_ALL & _held(db, role), role
