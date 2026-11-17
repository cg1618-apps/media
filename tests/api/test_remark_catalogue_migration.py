"""
API integration tests for revision r1e2mcatalog3: every remark row becomes
its author's 備註列表 row, first in that author's list on that owner, and
ix_note_one_remark_per_owner becomes per owner.

Runs the shipped revision's own steps against the test session, as
test_highlights_personal_migration.py does. The schema here is create_all's,
which already carries the per-owner index, so each test puts the per-author
one back first with the revision's own index_per_author - inside the test's
transaction, which rolls back at teardown.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "r1e2mcatalog3_remark_catalogue.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_remark_catalogue", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def old_schema(db_session, revision):
    conn = db_session.connection()
    revision.index_per_author(conn)
    return conn


def _note(db, owner, author, section, content, sort_index=None, **extra):
    row = models.Note(
        system_id=uuid.uuid4(),
        media_id=owner.system_id,
        author_id=author.id,
        section=section,
        content=content,
        sort_index=sort_index,
        **extra,
    )
    db.add(row)
    db.flush()
    return row


def _row(db, note_id):
    return db.execute(
        text(
            "SELECT section, author_id, content, links, sort_index, created_at "
            "FROM note WHERE system_id = :id"
        ),
        {"id": note_id},
    ).one()


def test_each_remark_becomes_its_authors_first_remark_list_row(
    db_session, old_schema, revision, owner_user, plain_user, sample_anime
):
    """Two authors' remarks on one owner - only possible under the old index -
    each land in that author's own list, never in the other's."""
    mine = _note(db_session, sample_anime, owner_user, "remark", "我的備註")
    theirs = _note(db_session, sample_anime, plain_user, "remark", "他的備註")
    _note(db_session, sample_anime, owner_user, "remark_list", "a", 2.0, links=[])
    _note(db_session, sample_anime, owner_user, "remark_list", "b", 5.0, links=[])
    # Another author's lower index must not pull mine down.
    _note(db_session, sample_anime, plain_user, "remark_list", "c", -10.0, links=[])
    created = _row(db_session, mine.system_id).created_at

    assert revision.move_remarks(old_schema) == 2

    moved = _row(db_session, mine.system_id)
    assert moved.section == "remark_list"
    assert moved.author_id == owner_user.id
    assert moved.content == "我的備註"
    assert moved.links == []
    assert moved.sort_index == 1.0
    assert moved.created_at == created

    other = _row(db_session, theirs.system_id)
    assert other.section == "remark_list"
    assert other.author_id == plain_user.id
    assert other.sort_index == -11.0

    assert db_session.execute(
        text("SELECT count(*) FROM note WHERE section = 'remark'")
    ).scalar() == 0


def test_a_remark_with_no_list_beside_it_is_placed_at_zero(
    db_session, old_schema, revision, owner_user, sample_anime
):
    mine = _note(db_session, sample_anime, owner_user, "remark", "只有備註")
    revision.move_remarks(old_schema)
    assert _row(db_session, mine.system_id).sort_index == 0.0


def test_a_null_sort_index_reads_as_zero(
    db_session, old_schema, revision, owner_user, sample_anime
):
    mine = _note(db_session, sample_anime, owner_user, "remark", "備註")
    _note(db_session, sample_anime, owner_user, "remark_list", "unordered", None, links=[])
    revision.move_remarks(old_schema)
    assert _row(db_session, mine.system_id).sort_index == -1.0


def test_other_sections_are_untouched(
    db_session, old_schema, revision, owner_user, sample_anime
):
    review = _note(db_session, sample_anime, owner_user, "public_reviews", "好看")
    revision.move_remarks(old_schema)
    assert _row(db_session, review.system_id).section == "public_reviews"


def test_the_per_owner_index_refuses_a_second_author_after_the_upgrade(
    db_session, old_schema, revision, owner_user, plain_user, sample_anime
):
    """Mirror first: under the old index two authors' remarks coexist."""
    _note(db_session, sample_anime, owner_user, "remark", "one")
    _note(db_session, sample_anime, plain_user, "remark", "two")
    revision.move_remarks(old_schema)
    revision.index_per_owner(old_schema)

    _note(db_session, sample_anime, owner_user, "remark", "the catalogue one")
    savepoint = db_session.begin_nested()
    with pytest.raises(IntegrityError):
        _note(db_session, sample_anime, plain_user, "remark", "a second")
    savepoint.rollback()
