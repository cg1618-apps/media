"""
GOOGLE_PULL_SHEET_ID: a development machine may Pull from another spreadsheet
(production's) while Backup keeps writing only to GOOGLE_SHEET_ID.

The point of a separate setting is the asymmetry. Pointing GOOGLE_SHEET_ID at
the production sheet would also point Backup at it, and Backup overwrites
every tab. So these tests pin both halves against one configuration where the
two ids DIFFER: the read opens the pull sheet, the write still opens the
backup sheet - a test with only one id set could not tell them apart.

Nothing here reaches Google. conftest's autouse guard replaces
`get_google_sheet_tab` for every test; this file puts the real one back
(captured below, at import, before any fixture runs) and stubs the layer
beneath it, `_get_google_spreadsheet`, with a fake that records which id it
was asked for.
"""

import pytest
from gspread.exceptions import WorksheetNotFound
from pydantic import ValidationError

from app.config import Settings
from app.services.integrations import sheets

REAL_GET_TAB = sheets.get_google_sheet_tab

BACKUP_ID = "backup-sheet-id"
PULL_ID = "production-sheet-id"


class FakeSpreadsheet:
    """Holds named tabs; records any tab it is asked to create."""

    def __init__(self, tabs):
        self._tabs = tabs
        self.created = []

    def worksheet(self, name):
        if name not in self._tabs:
            raise WorksheetNotFound(name)
        return self._tabs[name]

    def add_worksheet(self, title, rows, cols):
        self.created.append(title)
        self._tabs[title] = FakeWorksheet([])
        return self._tabs[title]


class FakeWorksheet:
    def __init__(self, rows):
        self._rows = rows

    def get_all_values(self):
        return self._rows


@pytest.fixture
def opened(monkeypatch):
    """Install fake spreadsheets per id; returns the ids opened, in order."""
    calls = []
    books = {
        BACKUP_ID: FakeSpreadsheet({"Anime": FakeWorksheet([["h"], ["backup row"]])}),
        PULL_ID: FakeSpreadsheet({"Anime": FakeWorksheet([["h"], ["production row"]])}),
    }

    def fake_open(sheet_id):
        calls.append(sheet_id)
        return books[sheet_id]

    monkeypatch.setattr(sheets, "get_google_sheet_tab", REAL_GET_TAB)
    monkeypatch.setattr(sheets, "_get_google_spreadsheet", fake_open)
    monkeypatch.setattr(sheets.settings, "google_sheet_id", BACKUP_ID)
    return calls, books


def test_pull_reads_the_pull_sheet_when_one_is_set(opened, monkeypatch):
    calls, _ = opened
    monkeypatch.setattr(sheets.settings, "google_pull_sheet_id", PULL_ID)
    assert sheets.get_all_raw_rows("Anime") == [["h"], ["production row"]]
    assert calls == [PULL_ID]


def test_backup_still_writes_the_backup_sheet_when_a_pull_sheet_is_set(opened, monkeypatch):
    """The mirror, with the SAME configuration: the write never follows."""
    calls, _ = opened
    monkeypatch.setattr(sheets.settings, "google_pull_sheet_id", PULL_ID)
    sheets.get_google_sheet_tab("Anime")
    assert calls == [BACKUP_ID]


def test_pull_reads_the_backup_sheet_when_no_pull_sheet_is_set(opened, monkeypatch):
    calls, _ = opened
    monkeypatch.setattr(sheets.settings, "google_pull_sheet_id", None)
    assert sheets.get_all_raw_rows("Anime") == [["h"], ["backup row"]]
    assert calls == [BACKUP_ID]


def test_a_tab_missing_from_the_pull_sheet_fails_and_creates_nothing(opened, monkeypatch):
    """Reading it as empty would make Pull empty that table here; and the
    pull sheet is someone else's, so it is never written to."""
    _, books = opened
    monkeypatch.setattr(sheets.settings, "google_pull_sheet_id", PULL_ID)
    with pytest.raises(sheets.SheetsUnavailableError):
        sheets.get_all_raw_rows("Manga")
    assert books[PULL_ID].created == []


def test_a_tab_missing_from_the_backup_sheet_is_still_created(opened, monkeypatch):
    """The existing behaviour, unchanged when no pull sheet is set."""
    _, books = opened
    monkeypatch.setattr(sheets.settings, "google_pull_sheet_id", None)
    assert sheets.get_all_raw_rows("Manga") == []
    assert books[BACKUP_ID].created == ["Manga"]


def test_a_pull_sheet_outside_development_refuses_to_load():
    with pytest.raises(ValidationError, match="GOOGLE_PULL_SHEET_ID"):
        Settings(_env_file=None, app_env="production", google_pull_sheet_id=PULL_ID)


def test_a_pull_sheet_in_development_loads():
    settings = Settings(_env_file=None, app_env="development", google_pull_sheet_id=PULL_ID)
    assert settings.google_pull_sheet_id == PULL_ID
