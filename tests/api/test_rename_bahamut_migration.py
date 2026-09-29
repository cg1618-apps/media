"""
The data migration that renames the Bahamut platform to 動畫瘋.

Imports the revision by file path and runs its own `rename()` against the
test session, as test_netflix_disney_scope_migration.py does: the suite builds
its schema with create_all, so a test restating the SQL would pass while the
shipped migration was wrong.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
from pathlib import Path

import pytest

from app import models
from app.utils.source_fields import BAHAMUT_VALUE

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "r1n2bahaname3_rename_bahamut_platform.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_rename_bahamut", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _option(db, value, category="Platform"):
    option = models.SystemOption(category=category, value=value)
    db.add(option)
    db.flush()
    return option


def _value(db, option):
    db.expire_all()
    return db.get(models.SystemOption, option.system_id).value


def test_the_platform_is_renamed_to_what_the_code_looks_for(db_session, revision):
    baha = _option(db_session, "Bahamut")
    db_session.commit()

    revision.rename(db_session.connection(), revision.OLD_VALUE, revision.NEW_VALUE)
    db_session.commit()

    assert _value(db_session, baha) == "動畫瘋" == BAHAMUT_VALUE


def test_the_same_value_in_another_category_is_untouched(db_session, revision):
    # Made non-empty on purpose: without it there is nothing the migration
    # could wrongly rename, and the assertion would pass vacuously.
    other = _option(db_session, "Bahamut", category="Serialization Platform")
    db_session.commit()

    revision.rename(db_session.connection(), revision.OLD_VALUE, revision.NEW_VALUE)
    db_session.commit()

    assert _value(db_session, other) == "Bahamut"


def test_an_existing_new_value_blocks_the_rename(db_session, revision):
    baha = _option(db_session, "Bahamut")
    taken = _option(db_session, "動畫瘋")
    db_session.commit()

    revision.rename(db_session.connection(), revision.OLD_VALUE, revision.NEW_VALUE)
    db_session.commit()

    assert _value(db_session, baha) == "Bahamut"
    assert _value(db_session, taken) == "動畫瘋"


def test_downgrade_renames_it_back(db_session, revision):
    baha = _option(db_session, "動畫瘋")
    db_session.commit()

    revision.rename(db_session.connection(), revision.NEW_VALUE, revision.OLD_VALUE)
    db_session.commit()

    assert _value(db_session, baha) == "Bahamut"
