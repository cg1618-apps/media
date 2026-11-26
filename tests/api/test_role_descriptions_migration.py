"""
API integration tests for revision r1o2ledesc3: the five fixed roles'
stored descriptions are rewritten to the Roles page's copy, and the
downgrade writes the seed's previous texts back.

Runs the shipped revision's own functions against the test session. A
revision's own test, deleted once the revision has deployed (docs/testing.md,
"Migration tests").

Requires PostgreSQL. See tests/api/conftest.py.
"""

import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import text

from app import models
from app.services.rbac.seed import ensure_rbac_seed

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "r1o2ledesc3_role_descriptions.py"

SHARED = "Advanced Guest: Read only with fixed access mode ceiling (normal or borderline)"
ADMIN = "Management only without data like entry page"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_role_descriptions", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _descriptions(db):
    db.expire_all()
    return {r.name: r.description for r in db.query(models.Role).all()}


def test_rewrites_every_role_and_the_downgrade_restores_the_old_texts(
    db_session, revision
):
    # Start from old text on every role, so each blank or rewrite below is
    # something the revision did and not what the test seed already held.
    revision.write_descriptions(db_session.connection(), revision.PREVIOUS_DESCRIPTIONS)
    assert all(_descriptions(db_session).values())

    revision.write_descriptions(db_session.connection(), revision.NEW_DESCRIPTIONS)
    assert _descriptions(db_session) == {
        "guest": None,
        "user": None,
        "super": None,
        "shared": SHARED,
        "admin": ADMIN,
    }

    revision.write_descriptions(db_session.connection(), revision.PREVIOUS_DESCRIPTIONS)
    assert _descriptions(db_session) == revision.PREVIOUS_DESCRIPTIONS


def test_a_fresh_seed_writes_the_same_texts(db_session, revision):
    # The seed creates only missing roles, so move the five existing rows
    # aside under other names and let it create all five afresh; what it
    # writes must match what the revision writes.
    db_session.execute(text("UPDATE role SET name = name || '-aside'"))
    db_session.flush()

    ensure_rbac_seed(db_session)
    fresh = {
        name: description
        for name, description in _descriptions(db_session).items()
        if not name.endswith("-aside")
    }
    assert fresh == revision.NEW_DESCRIPTIONS
