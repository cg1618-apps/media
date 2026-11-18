"""
`original_or_remake` on anime: Original or Remake.

Anime's `is_main` already answers 本傳 / 外傳 / ..., so whether an entry is the
original work or a remake of one is a column of its own, over its own
vocabulary ANIME_ORIGINAL_OR_REMAKE. It is never empty: a row that says
nothing is the original, and revision a1n2remake34 set every existing row so.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from app import models
from app.services.domain.duplicates import find_duplicate_anime
from app.services.pipelines import pull
from app.utils import constants as c
from app.utils.formatter import parse_anime_from_sheet

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "a1n2remake34_anime_original_or_remake.py"


def test_the_vocabulary_is_original_then_remake():
    assert c.ANIME_ORIGINAL_OR_REMAKE == ("Original", "Remake")


def test_constants_serves_it_beside_is_main(client):
    body = client.get("/api/constants").json()
    assert body["anime_original_or_remake"] == ["Original", "Remake"]
    # The shared vocabulary anime's is_main reads is untouched.
    assert body["is_main"] == list(c.IS_MAIN)


# ---------------------------------------------------------------------------
# Writes through the API
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("value", ["Original", "Remake"])
def test_each_value_round_trips(owner_client, value):
    created = owner_client.post(
        "/api/anime/", json={"anime_name_cn": "動畫", "original_or_remake": value}
    )
    assert created.status_code == 201, created.text
    assert created.json()["original_or_remake"] == value

    fetched = owner_client.get(f"/api/anime/{created.json()['public_id']}").json()
    assert fetched["original_or_remake"] == value


def test_an_anime_that_says_nothing_is_the_original(owner_client):
    created = owner_client.post("/api/anime/", json={"anime_name_cn": "動畫"})
    assert created.status_code == 201, created.text
    assert created.json()["original_or_remake"] == "Original"


@pytest.mark.parametrize("value", ["本傳", "Remaster", "remake", "", None])
def test_a_value_outside_the_vocabulary_is_refused_on_create(owner_client, value):
    # 本傳 is is_main's vocabulary and Remaster is game's: neither belongs
    # here. None and "" are refused too - the column is never empty.
    response = owner_client.post(
        "/api/anime/", json={"anime_name_cn": "動畫", "original_or_remake": value}
    )
    assert response.status_code == 422


@pytest.mark.parametrize("value", ["外傳", None])
def test_a_value_outside_the_vocabulary_is_refused_on_update(owner_client, value):
    created = owner_client.post(
        "/api/anime/", json={"anime_name_cn": "動畫", "original_or_remake": "Original"}
    )
    assert created.status_code == 201, created.text
    entry_id = created.json()["system_id"]
    refused = owner_client.put(f"/api/anime/{entry_id}", json={"original_or_remake": value})
    assert refused.status_code == 422
    # The mirror: a value inside it is accepted on the same route.
    ok = owner_client.put(f"/api/anime/{entry_id}", json={"original_or_remake": "Remake"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["original_or_remake"] == "Remake"


def test_an_update_that_omits_it_keeps_it(owner_client):
    created = owner_client.post(
        "/api/anime/", json={"anime_name_cn": "動畫", "original_or_remake": "Remake"}
    ).json()
    ok = owner_client.put(f"/api/anime/{created['system_id']}", json={"anime_name_en": "Anime"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["original_or_remake"] == "Remake"


# ---------------------------------------------------------------------------
# Sheets
# ---------------------------------------------------------------------------


def test_the_sheet_parser_keeps_a_known_value():
    assert parse_anime_from_sheet({"original_or_remake": "Remake"})["original_or_remake"] == "Remake"


@pytest.mark.parametrize("cell", ["", "本傳", None])
def test_a_blank_or_unknown_cell_reads_as_the_original(cell):
    # A restore must not abort a whole tab over one hand-typed cell, and the
    # column cannot hold NULL.
    parsed = parse_anime_from_sheet({"original_or_remake": cell})
    assert parsed["original_or_remake"] == "Original"


def _pull(db, monkeypatch, headers, rows):
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda name: [headers] + rows)
    return pull.execute_pull_specific(db, "Anime", log_action=False)


def test_a_tab_without_the_header_restores_as_the_original(db_session, monkeypatch):
    result = _pull(db_session, monkeypatch, ["anime_name_cn"], [["舊表"]])

    assert result["status"] == "success"
    anime = db_session.query(models.Anime).filter_by(anime_name_cn="舊表").one()
    assert anime.original_or_remake == "Original"


def test_a_tab_with_the_header_restores_a_remake(db_session, monkeypatch):
    result = _pull(
        db_session, monkeypatch, ["anime_name_cn", "original_or_remake"], [["新表", "Remake"]]
    )

    assert result["status"] == "success"
    anime = db_session.query(models.Anime).filter_by(anime_name_cn="新表").one()
    assert anime.original_or_remake == "Remake"


def test_the_header_is_a_column_not_a_stale_one():
    assert pull.unexpected_headers("Anime", ["original_or_remake"]) == []


# ---------------------------------------------------------------------------
# Duplicates
# ---------------------------------------------------------------------------


class _StubSession:
    def __init__(self, rows):
        self._rows = rows

    def query(self, _model):
        return self

    def all(self):
        return self._rows


def test_a_remake_never_collides_with_its_original():
    # A remake usually shares its original's name exactly.
    franchise = uuid.uuid4()
    rows = [
        models.Anime(system_id=uuid.uuid4(), franchise_id=franchise, airing_type="TV",
                     anime_name_en="Fruits Basket", original_or_remake="Original"),
        models.Anime(system_id=uuid.uuid4(), franchise_id=franchise, airing_type="TV",
                     anime_name_en="Fruits Basket", original_or_remake="Remake"),
    ]
    assert find_duplicate_anime(_StubSession(rows)) == []
    # The mirror: the same two with one answer ARE a duplicate.
    rows[1].original_or_remake = "Original"
    assert len(find_duplicate_anime(_StubSession(rows))) == 1


# ---------------------------------------------------------------------------
# The revision
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_anime_original_or_remake", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _column(conn):
    return conn.execute(
        text(
            "SELECT is_nullable, column_default FROM information_schema.columns "
            "WHERE table_name = 'anime' AND column_name = 'original_or_remake'"
        )
    ).one_or_none()


def test_the_revision_makes_every_existing_anime_the_original(
    db_session, revision, sample_anime
):
    conn = db_session.connection()
    # fk_anime_media is deferred, and PostgreSQL refuses to ALTER a table with
    # deferred checks still pending; a migration runs with none queued.
    conn.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    # The shape before the revision: no column at all. create_all built the
    # current one, so the revision's own downgrade takes it off first.
    revision.drop_column(conn)
    assert _column(conn) is None

    revision.add_column(conn)

    nullable, default = _column(conn)
    assert nullable == "NO"
    assert "Original" in default
    assert conn.execute(
        text("SELECT original_or_remake FROM anime WHERE system_id = :id"),
        {"id": sample_anime.system_id},
    ).scalar() == "Original"
