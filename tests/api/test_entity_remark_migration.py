"""
API integration tests for revision e1n2tremark3: each entity's non-blank
remark becomes a catalogue Remark row of that entity, attributed to the
installation's owner, and the downgrade joins the rows back into the column.

Runs the shipped revision's own functions against the test session. A
revision's own test, deleted once the revision has deployed (docs/testing.md,
"Migration tests").

The suite builds its schema from the models, which no longer carry `remark`,
so each test adds the five columns back inside its own transaction - the
state the revision meets - and the rollback at teardown removes them.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "e1n2tremark3_entity_remark_list.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_entity_remark_list", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def with_remark_columns(db_session, revision):
    for table in revision.ENTITIES:
        db_session.execute(text(f"ALTER TABLE {table} ADD COLUMN remark TEXT"))
    return db_session


def _set_remark(db, table, system_id, value):
    db.execute(text(f"UPDATE {table} SET remark = :v WHERE system_id = :id"), {"v": value, "id": system_id})


def test_each_non_blank_remark_becomes_a_remark_row_of_its_entity(
    revision, with_remark_columns, owner_user
):
    db = with_remark_columns
    studio = models.Studio(system_id=uuid.uuid4(), name_en="Shaft")
    character = models.Character(system_id=uuid.uuid4(), name_en="Hitagi")
    blank = models.Character(system_id=uuid.uuid4(), name_en="Blank")
    none = models.Person(system_id=uuid.uuid4(), name_en="Nobody")
    db.add_all([studio, character, blank, none])
    db.flush()
    _set_remark(db, "studio", studio.system_id, "Head tilts")
    _set_remark(db, "character", character.system_id, "  Crab  ")
    # A blank remark and a NULL one write nothing - the mirror cases.
    _set_remark(db, "character", blank.system_id, "   ")

    assert revision.move_remarks(db.connection()) == 2
    db.expire_all()
    rows = {(n.owner_type, n.owner_id): n for n in db.query(models.Note).all()}
    assert set(rows) == {("studio", studio.system_id), ("character", character.system_id)}
    crab = rows[("character", character.system_id)]
    assert (crab.section, crab.content, crab.personal, crab.author_id) == ("remark", "Crab", False, owner_user.id)

    # The downgrade joins them back.
    revision.restore_remarks(db.connection())
    back = db.execute(text("SELECT remark FROM character WHERE system_id = :id"), {"id": character.system_id}).scalar()
    assert back == "Crab"


def test_nothing_to_move_needs_no_author(revision, with_remark_columns):
    assert revision.move_remarks(with_remark_columns.connection()) == 0
