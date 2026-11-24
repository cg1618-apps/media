"""
API integration tests for revision r1e2lcascade3: before the two foreign keys
go on, every media relation naming a missing entry - or an id filed under a
type that is not its own - is deleted, and no other relation is.

Runs the shipped revision's own statement against the test session. A
revision's own test, deleted once the revision has deployed (docs/testing.md,
"Migration tests").

The suite builds its schema with create_all, so the keys are already on the
table; each test drops them inside its own transaction to put the database
back in the state the revision meets, and the rollback at teardown restores
them.

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
    ROOT / "alembic" / "versions" / "r1e2lcascade3_media_relation_cascades.py"
)


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_media_relation_cascades", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def without_keys(db_session):
    """The table as the revision finds it: no foreign keys on either end."""
    for name in ("fk_media_relation_from", "fk_media_relation_to"):
        db_session.execute(
            text(f"ALTER TABLE media_relation DROP CONSTRAINT {name}")
        )
    return db_session


def _relation(db, from_type, from_id, to_type, to_id, kind="related"):
    row = models.MediaRelation(
        system_id=uuid.uuid4(),
        from_type=from_type,
        from_id=from_id,
        relation_type=kind,
        to_type=to_type,
        to_id=to_id,
    )
    db.add(row)
    db.flush()
    return row.system_id


def test_only_relations_naming_a_missing_entry_are_deleted(
    revision, without_keys, sample_anime, sample_franchise
):
    db = without_keys
    manga = models.Manga(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        manga_name_en="Still Here",
    )
    db.add(manga)
    db.flush()
    anime_id, manga_id = sample_anime.system_id, manga.system_id

    # The survivor makes the test bite: a statement deleting every row would
    # otherwise pass as well.
    kept = _relation(db, "anime", anime_id, "manga", manga_id, "adaptation")
    _relation(db, "anime", anime_id, "manga", uuid.uuid4())  # to end missing
    _relation(db, "movie", uuid.uuid4(), "anime", anime_id)  # from end missing
    _relation(db, "anime", anime_id, "movie", manga_id)  # wrong type for the id

    assert revision.delete_dangling_relations(db.connection()) == 3

    db.expire_all()
    remaining = [row.system_id for row in db.query(models.MediaRelation).all()]
    assert remaining == [kept]
