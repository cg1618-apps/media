"""
API integration tests for revision f1r2filterrm3: every `system_option` in the
`Franchise for Filter` category goes, with its scope, usage and alias rows,
and no other category's values are touched.

Runs the shipped revision's own statements against the test session. A
revision's own test, deleted once the revision has deployed (docs/testing.md,
"Migration tests").

Requires PostgreSQL. See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = (
    ROOT / "alembic" / "versions" / "f1r2filterrm3_remove_franchise_for_filter.py"
)


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location(
        "_remove_franchise_for_filter", REVISION
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _option(db, category, value):
    option = models.SystemOption(system_id=uuid.uuid4(), category=category, value=value)
    db.add(option)
    db.flush()
    db.add(models.SystemOptionScope(option_id=option.system_id, scope="movie"))
    db.add(models.SystemOptionUsage(option_id=option.system_id, usage="watch"))
    db.add(
        models.SystemOptionAlias(option_id=option.system_id, source="igdb", value=value)
    )
    db.flush()
    return option


def _count(db, sql, **params) -> int:
    return db.execute(text(sql), params).scalar()


def test_franchise_for_filter_values_go_and_every_other_category_stays(
    db_session, revision
):
    """The deleted values are mirrored by a kept one carrying the same
    dependents, so a green says the category predicate did the sparing."""
    doomed = [
        _option(db_session, "Franchise for Filter", "Marvel"),
        _option(db_session, "Franchise for Filter", "DC"),
    ]
    kept = _option(db_session, "Genre Main", "Zvornik Genre")

    assert revision.remove_franchise_for_filter(db_session.connection()) == 2

    gone = [o.system_id for o in doomed]
    assert (
        _count(
            db_session,
            "SELECT count(*) FROM system_option WHERE category = 'Franchise for Filter'",
        )
        == 0
    )
    for table in ("system_option_scope", "system_option_usage", "system_option_alias"):
        assert (
            _count(
                db_session,
                f"SELECT count(*) FROM {table} WHERE option_id = ANY(:ids)",
                ids=gone,
            )
            == 0
        ), table
        assert (
            _count(
                db_session,
                f"SELECT count(*) FROM {table} WHERE option_id = :id",
                id=kept.system_id,
            )
            == 1
        ), table
    assert (
        _count(
            db_session,
            "SELECT count(*) FROM system_option WHERE system_id = :id",
            id=kept.system_id,
        )
        == 1
    )


def test_the_revision_declares_itself_irreversible(revision):
    assert revision.irreversible is True
