"""
Anime's `ep_special` is text: specials are numbered `17.5A`, `17.5B`.

The value is a label for where a special sits, shown as written and compared
by equality only. One rule makes it canonical wherever it arrives - the API
or a Sheets cell: a plain number is written without a trailing `.0`
(`17.0` -> `17`), and anything else is kept as typed, trimmed.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import pytest

from app import models
from app.services.pipelines import pull
from app.utils.ep_special import normalize_ep_special
from app.utils.formatter import parse_anime_from_sheet

# ---------------------------------------------------------------------------
# The rule
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "value, expected",
    [
        (17.0, "17"),
        (17.5, "17.5"),
        (0, "0"),
        (0.0, "0"),
        (14, "14"),
        ("17", "17"),
        ("17.0", "17"),
        ("17.50", "17.5"),
        (" 17.5 ", "17.5"),
        ("007", "7"),
        ("17.5A", "17.5A"),
        (" 17.5B ", "17.5B"),
        ("SP1", "SP1"),
        ("", None),
        ("   ", None),
        (None, None),
    ],
)
def test_a_number_loses_its_trailing_zero_and_a_label_is_kept(value, expected):
    assert normalize_ep_special(value) == expected


# ---------------------------------------------------------------------------
# The API
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "sent, stored",
    [("17.5A", "17.5A"), ("17.5", "17.5"), ("17.0", "17"), (17.5, "17.5"), (0, "0"), ("", None)],
)
def test_a_create_stores_the_canonical_text(owner_client, sent, stored):
    created = owner_client.post(
        "/api/anime/", json={"anime_name_cn": "動畫", "ep_special": sent}
    )
    assert created.status_code == 201, created.text
    assert created.json()["ep_special"] == stored

    fetched = owner_client.get(f"/api/anime/{created.json()['public_id']}").json()
    assert fetched["ep_special"] == stored


def test_an_update_writes_a_lettered_special(owner_client):
    created = owner_client.post(
        "/api/anime/", json={"anime_name_cn": "動畫", "ep_special": "17.5A"}
    ).json()
    ok = owner_client.put(f"/api/anime/{created['system_id']}", json={"ep_special": "17.5B"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["ep_special"] == "17.5B"


# ---------------------------------------------------------------------------
# Sheets
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "cell, expected",
    [("17.0", "17"), ("17.5", "17.5"), ("17", "17"), ("0", "0"), ("17.5A", "17.5A"), ("", None)],
)
def test_the_sheet_parser_reads_an_old_numeric_cell_as_text(cell, expected):
    # A Backup taken while the column was a float wrote 17.0 for 17.
    assert parse_anime_from_sheet({"ep_special": cell})["ep_special"] == expected


def test_pull_restores_old_and_new_cells(db_session, monkeypatch):
    monkeypatch.setattr(
        pull,
        "get_all_raw_rows",
        lambda name: [["anime_name_cn", "ep_special"], ["舊", "17.0"], ["新", "17.5A"]],
    )
    result = pull.execute_pull_specific(db_session, "Anime", log_action=False)

    assert result["status"] == "success"
    old = db_session.query(models.Anime).filter_by(anime_name_cn="舊").one()
    new = db_session.query(models.Anime).filter_by(anime_name_cn="新").one()
    assert old.ep_special == "17"
    assert new.ep_special == "17.5A"

