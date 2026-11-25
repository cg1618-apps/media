"""
API integration tests for revision b1o2okregion3: a book's region moves from
the English codes to their Chinese names - Western 歐美, JP 日本, CN 中國,
KR 韓國, TW 台灣 - in the book rows and in the two stored configs that can
hold one (a book form default and the book random-picker filter), and back
again on the downgrade.

Runs the shipped revision's own functions against the test session. A
revision's own test, deleted once the revision has deployed (docs/testing.md,
"Migration tests").

Requires PostgreSQL. See tests/api/conftest.py.
"""

import importlib.util
import json
import uuid
from pathlib import Path

import pytest

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "b1o2okregion3_book_region_chinese.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_book_region_chinese", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _book(db, region):
    book = models.Book(system_id=uuid.uuid4(), book_name_cn="書", region=region)
    db.add(book)
    db.flush()
    return book.system_id


def _config(db, key, value):
    db.add(models.SystemConfigs(config_key=key, config_value=json.dumps(value)))
    db.flush()


def test_every_code_becomes_its_chinese_name_and_back(revision, db_session):
    db = db_session
    ids = {code: _book(db, code) for code in ("Western", "JP", "CN", "KR", "TW")}
    # Neither an empty region nor a value outside the codes is touched - the
    # mirror cases that make a rewrite-everything statement fail.
    untouched = {_book(db, None): None, _book(db, "Elsewhere"): "Elsewhere"}

    revision.rename_regions(db.connection(), revision.TO_CHINESE)
    db.expire_all()
    after = {code: db.get(models.Book, i).region for code, i in ids.items()}
    assert after == {"Western": "歐美", "JP": "日本", "CN": "中國", "KR": "韓國", "TW": "台灣"}
    for book_id, region in untouched.items():
        assert db.get(models.Book, book_id).region == region

    revision.rename_regions(db.connection(), revision.TO_CODES)
    db.expire_all()
    assert {code: db.get(models.Book, i).region for code, i in ids.items()} == {
        code: code for code in ids
    }


def test_the_stored_book_configs_follow(revision, db_session):
    db = db_session
    _config(db, "form_defaults:book", {"version": 1, "defaults": {"region": "JP", "type": "輕小說"}})
    _config(db, "random_picker_defaults:book", {"version": 1, "filters": {"region": ["JP", "Western"]}})
    # A manga's own region vocabulary is not this one, and must not move.
    _config(db, "random_picker_defaults:manga", {"version": 1, "filters": {"region": ["JP"]}})

    revision.rename_regions(db.connection(), revision.TO_CHINESE)
    db.expire_all()
    def value(key):
        return json.loads(
            db.query(models.SystemConfigs).filter_by(config_key=key).one().config_value
        )

    assert value("form_defaults:book")["defaults"] == {"region": "日本", "type": "輕小說"}
    assert value("random_picker_defaults:book")["filters"]["region"] == ["日本", "歐美"]
    assert value("random_picker_defaults:manga")["filters"]["region"] == ["JP"]
