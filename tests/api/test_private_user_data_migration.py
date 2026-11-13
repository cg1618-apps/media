"""
The data half of revision p1r2ivatedat3: every row naming a removed field
group goes, and nothing naming `sources_restricted` does.

Runs the shipped revision's own `remove_field_group_rows()` against the test
session - the suite has no Alembic harness. The column drop is the schema
half, proved from zero by tests/api/test_migrations_build_the_schema.py.

The test seeds the rows the revision deletes by hand, because the models no
longer allow them to arise: that is what makes the deletion assertions bite.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import text

from app import models
from app.services.rbac.seed_modes import MODE_NORMAL, ensure_access_mode_seed

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "p1r2ivatedat3_private_user_data.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_private_user_data", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def legacy_rows(db_session, admin_user):
    """One row of every kind for each removed group, and the same kinds for
    sources_restricted, which must survive."""
    ensure_access_mode_seed(db_session)
    normal = (
        db_session.query(models.AccessMode)
        .filter(models.AccessMode.key == MODE_NORMAL)
        .one()
    )
    guest = db_session.query(models.Role).filter(models.Role.name == "guest").one()
    grant = models.UserAccessMode(user_id=admin_user.id, mode_id=normal.system_id)
    db_session.add(grant)
    db_session.flush()
    for key in ("sources_other", "personal_notes", "sources_restricted"):
        db_session.execute(
            text(
                "INSERT INTO access_mode_field_group "
                "(system_id, mode_id, field_group_key) "
                "VALUES (gen_random_uuid(), :m, :k) ON CONFLICT DO NOTHING"
            ),
            {"m": normal.system_id, "k": key},
        )
        db_session.execute(
            text(
                "INSERT INTO user_access_mode_denial "
                "(system_id, user_access_mode_id, field_group_key) "
                "VALUES (gen_random_uuid(), :g, :k)"
            ),
            {"g": grant.system_id, "k": key},
        )
        db_session.execute(
            text(
                "INSERT INTO role_permission (role_id, permission) "
                "VALUES (:r, :p) ON CONFLICT DO NOTHING"
            ),
            {"r": guest.system_id, "p": f"field_group.{key}"},
        )
    db_session.flush()
    return normal, grant, guest


def _keys(db, sql, **params):
    return {row[0] for row in db.execute(text(sql), params)}


def test_every_row_naming_a_removed_group_goes(db_session, legacy_rows, revision):
    normal, grant, guest = legacy_rows

    revision.remove_field_group_rows(db_session.connection())

    assert _keys(
        db_session,
        "SELECT field_group_key FROM access_mode_field_group WHERE mode_id = :m",
        m=normal.system_id,
    ) == {"sources_restricted"}
    assert _keys(
        db_session,
        "SELECT field_group_key FROM user_access_mode_denial "
        "WHERE user_access_mode_id = :g",
        g=grant.system_id,
    ) == {"sources_restricted"}
    assert _keys(
        db_session,
        "SELECT permission FROM role_permission "
        "WHERE role_id = :r AND permission LIKE 'field_group.%'",
        r=guest.system_id,
    ) == {"field_group.sources_restricted"}
