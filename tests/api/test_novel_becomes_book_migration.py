"""
API integration tests for revision b1o2okrename3: Novel becomes Book.

Runs the shipped revision against the test session, as
test_progress_floats.py does: create_all built the Book shape, so each test
writes its rows in that shape, runs the revision's own downgrade to reach the
Novel shape, checks it, and upgrades back. Everything runs inside the test's
transaction, which rolls back at teardown.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import importlib.util
import json
import uuid
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "b1o2okrename3_novel_becomes_book.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_novel_becomes_book", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def conn(db_session, revision, monkeypatch):
    connection = db_session.connection()
    connection.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    monkeypatch.setattr(revision, "op", Operations(MigrationContext.configure(connection)))
    return connection


@pytest.fixture
def library(db_session, conn):
    """One of every stored spelling the revision rewrites, in the Book shape."""
    franchise = models.Franchise(
        system_id=uuid.uuid4(),
        franchise_name_en="Rename Franchise",
        franchise_type="Anime, Book",
        type_slots={"Novel": 3},
    )
    db_session.add(franchise)
    db_session.flush()
    book = models.Book(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        book_name_en="Rename Book",
        book_name_cn="改名",
        type="輕小說",
        release_date_jp="2006-03",
        release_date_tw="2010",
    )
    db_session.add(book)
    db_session.flush()
    book.cover_image_file = f"book/{book.system_id}.jpg"
    franchise.type_covers = {"Book": str(book.system_id)}
    unit = models.BookUnit(
        system_id=uuid.uuid4(), book_id=book.system_id, unit_kind="volume", position=1
    )
    user = db_session.query(models.User).first()
    plan = models.PlanNext(
        user_id=user.id, media_type="book", media_id=book.system_id, kind="next"
    )
    image = models.Image(
        storage_key=f"covers/book/{book.system_id}.jpg",
        checksum=f"legacy:book/{book.system_id}.jpg",
    )
    db_session.add_all([unit, plan, image])
    db_session.flush()
    db_session.add(
        models.ImageAttachment(image_id=image.system_id, owner_type="book", owner_id=book.system_id)
    )
    db_session.add_all(
        [
            models.SystemConfigs(
                config_key="form_defaults:book",
                config_value=json.dumps(
                    {
                        "version": 1,
                        "defaults": {"book_name_en": "", "release_date_jp": "", "release_date_tw": "", "type": "網路小說"},
                        "autofill": ["book_name_cn", "release_date_jp", "type"],
                    }
                ),
            ),
            models.SystemConfigs(
                config_key="random_picker_defaults:book",
                config_value=json.dumps(
                    {"version": 1, "filters": {"type": ["輕小說", "小說"], "readingStatus": ["Planned"]}}
                ),
            ),
        ]
    )
    db_session.flush()
    conn.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    return {"franchise": franchise, "book": book, "unit": unit, "image": image}


def _one(conn, sql, **params):
    return conn.execute(text(sql), params).one()


def _scalar(conn, sql, **params):
    return conn.execute(text(sql), params).scalar()


def _tables(conn):
    return set(
        conn.execute(
            text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        ).scalars()
    )


def _config(conn, key):
    raw = _scalar(conn, "SELECT config_value FROM system_configs WHERE config_key = :k", k=key)
    return None if raw is None else json.loads(raw)


def test_the_downgrade_puts_every_novel_spelling_back(conn, revision, library):
    book_id = library["book"].system_id

    revision.downgrade()

    tables = _tables(conn)
    assert {"novel", "novel_unit", "user_novel_unit_rating"} <= tables
    assert not {"book", "book_unit", "user_book_unit_rating"} & tables
    row = _one(
        conn,
        "SELECT novel_name_en, novel_name_cn, type, release_date, media_type "
        "FROM novel WHERE system_id = :id",
        id=book_id,
    )
    assert tuple(row) == ("Rename Book", "改名", "Light Novel", "2006-03", "novel")
    assert _scalar(conn, "SELECT novel_id FROM novel_unit") == book_id
    assert _one(
        conn, "SELECT media_type, cover_image_file FROM media WHERE system_id = :id", id=book_id
    ) == ("novel", f"novel/{book_id}.jpg")
    assert _scalar(conn, "SELECT media_type FROM plan_next WHERE media_id = :id", id=book_id) == "novel"
    assert _one(
        conn, "SELECT storage_key, checksum FROM image WHERE system_id = :id",
        id=library["image"].system_id,
    ) == (f"covers/novel/{book_id}.jpg", f"legacy:novel/{book_id}.jpg")
    assert _scalar(conn, "SELECT owner_type FROM image_attachment WHERE owner_id = :id", id=book_id) == "novel"

    franchise = _one(
        conn,
        "SELECT franchise_type, type_covers, type_slots FROM franchise WHERE system_id = :id",
        id=library["franchise"].system_id,
    )
    assert franchise.franchise_type == "Anime, Novel"
    assert franchise.type_covers == {"Novel": str(book_id)}
    # The favourite grid's key, not a franchise type: never rewritten.
    assert franchise.type_slots == {"Novel": 3}

    assert _config(conn, "form_defaults:book") is None
    assert _config(conn, "form_defaults:novel") == {
        "version": 1,
        "defaults": {"novel_name_en": "", "release_date": "", "type": "Web"},
        "autofill": ["novel_name_cn", "release_date", "type"],
    }
    assert _config(conn, "random_picker_defaults:novel")["filters"]["type"] == ["Light Novel", "Novel"]

    assert _scalar(conn, "SELECT count(*) FROM role_permission WHERE permission = 'media_type.book'") == 0
    assert _scalar(conn, "SELECT count(*) FROM pg_sequences WHERE sequencename = 'novel_public_id_seq'") == 1
    assert _scalar(conn, "SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_novel_delete_media'") == 1


def test_the_upgrade_renames_every_spelling_and_maps_the_vocabulary(
    db_session, conn, revision, library
):
    book_id = library["book"].system_id
    permitted = _scalar(conn, "SELECT count(*) FROM role_permission WHERE permission = 'media_type.book'")
    # Mirror of the refusal below: the seeded roles hold the permission, so
    # the rename has something to rename.
    assert permitted > 0
    revision.downgrade()
    conn.execute(
        text("UPDATE novel SET type = 'Other' WHERE system_id = :id"), {"id": book_id}
    )

    revision.upgrade()

    tables = _tables(conn)
    assert {"book", "book_unit", "user_book_unit_rating"} <= tables
    assert not {"novel", "novel_unit", "user_novel_unit_rating"} & tables
    row = _one(
        conn,
        "SELECT book_name_en, type, release_date_jp, release_date_tw, media_type "
        "FROM book WHERE system_id = :id",
        id=book_id,
    )
    # The TW date had no column in the Novel shape, so it does not come back.
    assert tuple(row) == ("Rename Book", "其他", "2006-03", None, "book")
    assert _one(
        conn, "SELECT media_type, cover_image_file FROM media WHERE system_id = :id", id=book_id
    ) == ("book", f"book/{book_id}.jpg")
    assert _scalar(conn, "SELECT media_type FROM plan_next WHERE media_id = :id", id=book_id) == "book"
    franchise = _one(
        conn,
        "SELECT franchise_type, type_covers, type_slots FROM franchise WHERE system_id = :id",
        id=library["franchise"].system_id,
    )
    assert (franchise.franchise_type, franchise.type_covers, franchise.type_slots) == (
        "Anime, Book",
        {"Book": str(book_id)},
        {"Novel": 3},
    )
    assert _config(conn, "form_defaults:novel") is None
    assert _config(conn, "form_defaults:book") == {
        "version": 1,
        "defaults": {"book_name_en": "", "release_date_jp": "", "type": "網路小說"},
        "autofill": ["book_name_cn", "release_date_jp", "type"],
    }
    assert _config(conn, "random_picker_defaults:book")["filters"] == {
        "type": ["輕小說", "小說"],
        "readingStatus": ["Planned"],
    }
    assert _scalar(conn, "SELECT count(*) FROM role_permission WHERE permission = 'media_type.book'") == permitted
    assert _scalar(conn, "SELECT count(*) FROM role_permission WHERE permission = 'media_type.novel'") == 0
    assert _scalar(conn, "SELECT column_default FROM information_schema.columns "
                         "WHERE table_name = 'book' AND column_name = 'media_type'").startswith("'book'")

    # The ORM reads the result: the shape is the models' again.
    db_session.expire_all()
    book = db_session.get(models.Book, book_id)
    assert book.type == "其他" and [u.system_id for u in book.units] == [library["unit"].system_id]


def test_the_two_new_types_go_down_as_other(conn, revision, library):
    book_id = library["book"].system_id
    conn.execute(text("UPDATE book SET type = '指南/設定集' WHERE system_id = :id"), {"id": book_id})

    revision.downgrade()

    assert _scalar(conn, "SELECT type FROM novel WHERE system_id = :id", id=book_id) == "Other"


def test_the_upgraded_constraints_bite(conn, revision, library):
    """The recreated checks and FKs are live, not just named."""
    book_id = library["book"].system_id
    revision.downgrade()
    revision.upgrade()

    savepoint = conn.begin_nested()
    with pytest.raises(Exception, match="ck_book_media_type"):
        conn.execute(text("UPDATE book SET media_type = 'novel' WHERE system_id = :id"), {"id": book_id})
    savepoint.rollback()

    savepoint = conn.begin_nested()
    with pytest.raises(Exception, match="ck_book_release_date_tw_iso"):
        conn.execute(text("UPDATE book SET release_date_tw = 'soon' WHERE system_id = :id"), {"id": book_id})
    savepoint.rollback()

    # A plan row still cannot claim the entry under another type.
    savepoint = conn.begin_nested()
    with pytest.raises(Exception, match="fk_plan_next_media_type"):
        conn.execute(text("UPDATE plan_next SET media_type = 'manga' WHERE media_id = :id"), {"id": book_id})
    savepoint.rollback()


@pytest.mark.parametrize(
    "value, expected",
    [
        ("Novel", "Book"),
        ("Anime, Novel", "Anime, Book"),
        ("Novel,TV", "Book,TV"),
        ("Book, Novel", "Book"),
        ("Anime Movie", "Anime Movie"),
        (None, None),
    ],
)
def test_the_franchise_token_rewrite(revision, value, expected):
    assert revision.retoken(value, "Novel", "Book") == expected
