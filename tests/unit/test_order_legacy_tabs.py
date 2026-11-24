"""A sheet backed up before watch orders became orders still restores.

The four tabs were titled `Watch Order …`; Pull reads each from its old title
when the new one is empty and the sheet carries the old one. The fixture
sheet holds rows ONLY under the old title, so a pass means the fallback did
the reading - with rows under the new title too, the test would pass without
it. The mirror test proves the new title wins when it holds rows.
"""

import pytest

from app.services.pipelines import pull
from app.services.pipelines.legacy_names import LEGACY_TAB_NAMES

RENAMED = {
    "Order List": "Watch Order List",
    "Order Section": "Watch Order Section",
    "Order Item": "Watch Order Item",
    "Order Follow": "Watch Order Follow",
}

OLD_ROWS = [["system_id", "list_name"], ["11111111-1111-1111-1111-111111111111", "old"]]
NEW_ROWS = [["system_id", "list_name"], ["22222222-2222-2222-2222-222222222222", "new"]]


@pytest.mark.parametrize("tab, legacy", RENAMED.items())
def test_each_order_tab_names_its_old_title(tab, legacy):
    assert LEGACY_TAB_NAMES[tab] == (legacy,)


@pytest.mark.parametrize("tab, legacy", RENAMED.items())
def test_an_old_sheet_is_read_from_its_old_title(monkeypatch, tab, legacy):
    sheet = {legacy: OLD_ROWS}
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda name: sheet.get(name, []))
    monkeypatch.setattr(pull, "sheet_tab_titles", lambda: set(sheet))
    assert pull.read_sheet_tab(tab) == OLD_ROWS


@pytest.mark.parametrize("tab, legacy", RENAMED.items())
def test_the_new_title_wins_when_it_holds_rows(monkeypatch, tab, legacy):
    sheet = {legacy: OLD_ROWS, tab: NEW_ROWS}
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda name: sheet.get(name, []))
    monkeypatch.setattr(pull, "sheet_tab_titles", lambda: set(sheet))
    assert pull.read_sheet_tab(tab) == NEW_ROWS
