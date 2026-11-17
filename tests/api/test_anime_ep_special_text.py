"""
Anime's `ep_special` is text: specials are numbered `17.5A`, `17.5B`.

The value is a label for where a special sits, shown as written and compared
by equality only. One rule makes it canonical wherever it arrives - the API,
a Sheets cell, the revision that converted the old floats: a plain number is
written without a trailing `.0` (`17.0` -> `17`), and anything else is kept as
typed, trimmed.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import text

from app import models
from app.services.pipelines import pull
from app.utils.ep_special import normalize_ep_special
from app.utils.formatter import parse_anime_from_sheet

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "e1p2special3_ep_special_text.py"


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


# ---------------------------------------------------------------------------
# The revision
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_ep_special_text", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _anime(db, name):
    row = models.Anime(anime_name_cn=name)
    db.add(row)
    db.flush()
    return row


def _type(conn):
    return conn.execute(
        text(
            "SELECT data_type FROM information_schema.columns "
            "WHERE table_name = 'anime' AND column_name = 'ep_special'"
        )
    ).scalar()


def _value(conn, row):
    return conn.execute(
        text("SELECT ep_special FROM anime WHERE system_id = :id"), {"id": row.system_id}
    ).scalar()


@pytest.fixture
def conn(db_session):
    connection = db_session.connection()
    # fk_anime_media is deferred, and PostgreSQL refuses to ALTER a table with
    # deferred checks still pending; a migration runs with none queued.
    connection.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    return connection


def test_the_upgrade_writes_each_float_without_a_trailing_zero(db_session, conn, revision):
    rows = {name: _anime(db_session, name) for name in ("whole", "half", "zero", "none")}
    conn.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    # The shape before the revision: create_all built the text column, so the
    # revision's own downgrade puts the float back first.
    revision.to_float(conn)
    assert _type(conn) == "double precision"
    for name, value in (("whole", 17.0), ("half", 17.5), ("zero", 0.0)):
        conn.execute(
            text("UPDATE anime SET ep_special = :v WHERE system_id = :id"),
            {"v": value, "id": rows[name].system_id},
        )

    revision.to_text(conn)

    assert _type(conn) == "character varying"
    assert _value(conn, rows["whole"]) == "17"
    assert _value(conn, rows["half"]) == "17.5"
    assert _value(conn, rows["zero"]) == "0"
    assert _value(conn, rows["none"]) is None


def test_the_downgrade_keeps_what_parses_and_nulls_the_rest(db_session, conn, revision):
    values = {"whole": "17", "half": "17.5", "lettered": "17.5A", "none": None}
    rows = {}
    for name, value in values.items():
        rows[name] = _anime(db_session, name)
        rows[name].ep_special = value
    db_session.flush()
    conn.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))

    revision.to_float(conn)

    assert _type(conn) == "double precision"
    assert _value(conn, rows["whole"]) == 17.0
    assert _value(conn, rows["half"]) == 17.5
    # A lettered special has no float to go back to: it is lost.
    assert _value(conn, rows["lettered"]) is None
    assert _value(conn, rows["none"]) is None
