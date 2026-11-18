"""
Pull of a sheet written before Novel became Book.

Backup writes only the new names, but the sheet in Google Drive is as old as
its last Backup: its tabs are still titled Novel, Novel Unit and User Novel
Unit Rating, their headers say novel_name_* / novel_id / release_date, and its
cells say `novel`, `Novel` and the old type vocabulary. Pull reads it as if it
were current (app/services/pipelines/legacy_names.py).

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import json
import uuid

import pytest

from app import models
from app.services.pipelines import backup, pull
from app.services.pipelines.legacy_names import legacy_cell_values
from app.services.pipelines.tabs import TAB_NAMES


@pytest.fixture
def sheet(monkeypatch):
    """Install a stubbed sheet: {title: matrix}. Titles it lacks read empty."""
    read: list[str] = []

    def _install(tabs: dict):
        def rows(tab):
            read.append(tab)
            return tabs.get(tab, [])

        monkeypatch.setattr(pull, "get_all_raw_rows", rows)
        monkeypatch.setattr(pull, "sheet_tab_titles", lambda: frozenset(tabs))
        return read

    return _install


def _book_tab(book_id, extra_headers=(), extra=()):
    return [
        ["system_id", "franchise_id", "novel_name_en", "novel_name_cn", "type",
         "release_date", "cover_image_file", *extra_headers],
        [str(book_id), "Pre-Rename Franchise", "Old Sheet Book", "舊表", "Light Novel",
         "2006-03", f"novel/{book_id}.jpg", *extra],
    ]


def test_an_old_novel_tab_restores_as_book(db_session, sheet):
    book_id = uuid.uuid4()
    read = sheet({"Novel": _book_tab(book_id)})

    result = pull.execute_pull_specific(db_session, "Book", log_action=False)

    assert result["status"] == "success", result
    assert result["rows_added"] == 1
    # No header of the old tab reads as a stale column.
    assert result["unresolved_refs"] == []
    assert read == ["Book", "Novel"]
    book = db_session.get(models.Book, book_id)
    assert (book.book_name_en, book.book_name_cn) == ("Old Sheet Book", "舊表")
    assert book.type == "輕小說"
    assert (book.release_date_jp, book.release_date_tw) == ("2006-03", None)
    assert book.cover_image_file == f"book/{book_id}.jpg"
    assert book.media_row.media_type == "book"
    franchise = db_session.get(models.Franchise, book.franchise_id)
    assert franchise.franchise_name_en == "Pre-Rename Franchise"


def test_the_old_unit_tab_restores_under_its_new_name(db_session, sheet):
    book_id = uuid.uuid4()
    unit_id = uuid.uuid4()
    sheet(
        {
            "Novel": _book_tab(book_id),
            "Novel Unit": [
                ["system_id", "novel_id", "unit_kind", "position", "unit_key"],
                [str(unit_id), str(book_id), "volume", "1", "Vol 1"],
            ],
        }
    )
    pull.execute_pull_specific(db_session, "Book", log_action=False)

    result = pull.execute_pull_specific(db_session, "Book Unit", log_action=False)

    assert result["status"] == "success", result
    assert result["unresolved_refs"] == []
    unit = db_session.get(models.BookUnit, unit_id)
    assert (unit.book_id, unit.unit_key) == (book_id, "Vol 1")


def test_a_current_tab_wins_over_a_stale_old_one(db_session, sheet):
    """A sheet backed up after the rename may still hold the old tab beside the
    new one; the old one is stale and must not be read."""
    book_id = uuid.uuid4()
    read = sheet(
        {
            "Book": [
                ["system_id", "book_name_en", "type", "release_date_jp", "release_date_tw"],
                [str(book_id), "Current Book", "網路小說", "2020", "2021"],
            ],
            "Novel": _book_tab(uuid.uuid4()),
        }
    )

    pull.execute_pull_specific(db_session, "Book", log_action=False)

    assert read == ["Book"]
    book = db_session.get(models.Book, book_id)
    assert (book.book_name_en, book.type, book.release_date_jp, book.release_date_tw) == (
        "Current Book", "網路小說", "2020", "2021",
    )
    assert db_session.query(models.Book).count() == 1


def test_an_old_title_the_sheet_lacks_is_never_read(db_session, sheet):
    """Mirror of the alias: reading a missing title would create it on the
    backup sheet, so it is asked for only when the sheet lists it."""
    read = sheet({"Anime": [["anime_name_en"], ["x"]]})

    result = pull.execute_pull_specific(db_session, "Book", log_action=False)

    assert result["status"] == "success"
    assert read == ["Book"]


def test_franchise_and_config_cells_are_renamed(db_session, sheet):
    cover_id = str(uuid.uuid4())
    sheet(
        {
            "Franchise": [
                ["system_id", "franchise_name_en", "franchise_type", "type_covers", "type_slots"],
                [str(uuid.uuid4()), "Old Typed", "Anime, Novel", json.dumps({"Novel": cover_id}),
                 json.dumps({"Novel": 2})],
            ],
            "System Configs": [
                ["config_key", "config_value"],
                [
                    "form_defaults:novel",
                    json.dumps(
                        {"version": 1, "defaults": {"novel_name_en": "", "type": "Web"},
                         "autofill": ["novel_name_cn", "release_date"]}
                    ),
                ],
            ],
        }
    )

    pull.execute_pull_specific(db_session, "Franchise", log_action=False)
    pull.execute_pull_specific(db_session, "System Configs", log_action=False)

    franchise = db_session.query(models.Franchise).filter_by(franchise_name_en="Old Typed").one()
    assert franchise.franchise_type == "Anime, Book"
    assert franchise.type_covers == {"Book": cover_id}
    assert franchise.type_slots == {"Novel": 2}
    configs = {c.config_key: c.config_value for c in db_session.query(models.SystemConfigs)}
    assert "form_defaults:novel" not in configs
    assert json.loads(configs["form_defaults:book"]) == {
        "version": 1,
        "defaults": {"book_name_en": "", "type": "網路小說"},
        "autofill": ["book_name_cn", "release_date_jp"],
    }


@pytest.mark.parametrize(
    "tab, column",
    [
        ("Media", "media_type"),
        ("User Media List", "media_type"),
        ("Plan Next", "media_type"),
        ("Character Casting", "media_type"),
        ("Character Casting Voice", "media_type"),
        ("Media Relation", "from_type"),
        ("Media Relation", "to_type"),
        ("Person Role", "scope"),
        ("Publisher Scope", "scope"),
        ("System Option Scope", "scope"),
    ],
)
def test_a_novel_key_cell_reads_as_book(tab, column):
    assert legacy_cell_values(tab, {column: "novel", "other": "novel"}) == {
        column: "book",
        "other": "novel",
    }


def test_a_current_row_is_returned_unchanged():
    row = {"media_type": "book", "cover_image_file": "book/x.jpg"}
    assert legacy_cell_values("Media", row) is row


def test_a_current_config_value_is_left_as_written():
    """Only an old key's value is in the old spelling."""
    value = json.dumps({"defaults": {"type": "Other", "release_date": "x"}})
    row = {"config_key": "form_defaults:book", "config_value": value}
    assert legacy_cell_values("System Configs", row) == row


def test_backup_writes_only_the_new_names(db_session, monkeypatch, sample_franchise):
    db_session.add(models.Book(book_name_en="Backed Up", franchise_id=sample_franchise.system_id))
    db_session.flush()
    written = {}

    def record(tab, matrix):
        written[tab] = matrix
        return True

    monkeypatch.setattr(backup, "bulk_overwrite_sheet", record)
    backup.execute_backup(db_session)

    assert {"Book", "Book Unit", "User Book Unit Rating"} <= set(TAB_NAMES)
    assert not {"Novel", "Novel Unit", "User Novel Unit Rating"} & set(TAB_NAMES)
    assert "Book" in written
    assert not {"Novel", "Novel Unit", "User Novel Unit Rating"} & set(written)
    headers = written["Book"][0]
    assert {"book_name_en", "release_date_jp", "release_date_tw"} <= set(headers)
    assert not [h for h in headers if "novel" in str(h)]
    assert "release_date" not in headers
