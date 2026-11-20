"""
API integration tests for revision c1o2untryopt3: the Country common option
category is seeded from the studios' countries, most-used first, once, and
a value already there keeps what it has.

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
REVISION = ROOT / "alembic" / "versions" / "c1o2untryopt3_country_common_options.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_country_options", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _studio(db, name, country):
    db.add(models.Studio(system_id=uuid.uuid4(), name_en=name, country=country))
    db.flush()


def _countries(db):
    return list(
        db.execute(
            text(
                "SELECT value FROM system_option WHERE category = 'Country' "
                "ORDER BY sort_order, value"
            )
        ).scalars()
    )


def test_seeds_each_studio_country_once_most_used_first(db_session, revision):
    """Blank and unset countries are mirrored by real ones, so an empty
    result would mean the filter dropped everything, not that there was
    nothing to seed."""
    _studio(db_session, "A", "Japan")
    _studio(db_session, "B", "Japan")
    _studio(db_session, "C", " USA ")
    _studio(db_session, "D", "")
    _studio(db_session, "E", None)

    added = revision.seed_countries(db_session.connection())

    assert added == 2
    assert _countries(db_session) == ["Japan", "USA"]


def test_is_idempotent_and_keeps_an_existing_value(db_session, revision):
    db_session.execute(
        text(
            "INSERT INTO system_option (system_id, category, value, sort_order, "
            "created_at, updated_at) VALUES (gen_random_uuid(), 'Country', "
            "'Japan', 9, now(), now())"
        )
    )
    _studio(db_session, "A", "Japan")
    _studio(db_session, "B", "China")

    assert revision.seed_countries(db_session.connection()) == 1
    assert revision.seed_countries(db_session.connection()) == 0
    sort_of_japan = db_session.execute(
        text("SELECT sort_order FROM system_option WHERE category='Country' AND value='Japan'")
    ).scalar()
    assert sort_of_japan == 9
    assert sorted(_countries(db_session)) == ["China", "Japan"]
