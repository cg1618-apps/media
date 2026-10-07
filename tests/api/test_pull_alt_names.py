"""
Pull resolves a franchise, collection or series given by name in a foreign-key
cell, and an *_alt column is a comma-separated list: a name matches when it is
any one fragment of it.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.pipelines import pull


@pytest.fixture
def sheet(monkeypatch):
    def _install(headers, rows):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    return _install


@pytest.fixture
def franchise(db_session):
    f = models.Franchise(
        system_id=uuid.uuid4(),
        franchise_name_en="Cowboy Bebop",
        franchise_name_alt="CB, Space Cowboys",
        franchise_type="ACG",
    )
    db_session.add(f)
    db_session.flush()
    return f


def _series_named(db_session, name):
    return db_session.query(models.Series).filter_by(series_name_en=name).one_or_none()


def test_a_series_row_naming_its_franchise_by_an_alt_fragment_resolves(
    db_session, sheet, franchise
):
    sheet(["series_name_en", "franchise_id"], [["Bebop Movies", "Space Cowboys"]])
    result = pull.execute_pull_specific(db_session, "Series", log_action=False)
    assert result["status"] == "success", result
    assert _series_named(db_session, "Bebop Movies").franchise_id == franchise.system_id


def test_a_series_row_naming_no_fragment_is_skipped(db_session, sheet, franchise):
    # Mirror: the franchise exists, and its whole alt value is the name given.
    sheet(["series_name_en", "franchise_id"], [["Bebop Movies", "CB, Space Cowboys"]])
    pull.execute_pull_specific(db_session, "Series", log_action=False)
    assert _series_named(db_session, "Bebop Movies") is None


def test_a_franchise_row_naming_its_collection_by_an_alt_fragment_resolves(
    db_session, sheet
):
    collection = models.Collection(
        system_id=uuid.uuid4(),
        collection_name_en="Sunrise Works",
        collection_name_alt="Sunrise, サンライズ",
    )
    db_session.add(collection)
    db_session.flush()
    sheet(
        ["franchise_name_en", "franchise_type", "collection_id"],
        [["Gundam", "ACG", "サンライズ"], ["Trigun", "ACG", "Sunrise, サンライズ"]],
    )
    result = pull.execute_pull_specific(db_session, "Franchise", log_action=False)
    assert result["status"] == "success", result
    gundam = db_session.query(models.Franchise).filter_by(franchise_name_en="Gundam").one()
    assert gundam.collection_id == collection.system_id
    # Mirror: the whole stored value is not one of the collection's names.
    trigun = db_session.query(models.Franchise).filter_by(franchise_name_en="Trigun").one()
    assert trigun.collection_id is None
