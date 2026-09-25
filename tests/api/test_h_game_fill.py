"""
The IGDB and Steam fill on an h-game: Game's autofills, generalised over the
model, writing only the columns and tags h_game has.

Every fetch and the cover download are patched out - these tests lock down
behaviour, not the network layer.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid
from decimal import Decimal

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_game_from_igdb, autofill_game_from_steam
from app.services.domain.checking import has_missing_values_game_steam
from app.services.domain.credits import credit_names, tag_values
from app.services.domain.sources import find_main_source
from app.services.pipelines.specs import FILL_ALL, PIPELINES, REPLACE_ALL
from app.utils.game_vocabulary import seed_game_vocabulary
from app.utils.source_fields import STEAMDB_VALUE

IGDB = {
    "release_date": "2022-02-25",
    "igdb_link": "https://www.igdb.com/games/zvornik",
    "steam_appid": 1245620,
    "steam_link": "https://store.steampowered.com/app/1245620/",
    "cover_image_url": "https://images.igdb.com/big.jpg",
    "developers": ["Zvornik Dev"],
    "publishers": ["Zvornik Pub"],
    "genres": ["Role-playing (RPG)"],
    "themes": ["Fantasy"],
    "game_modes": ["Single player"],
    "platforms": ["PC (Microsoft Windows)"],
    "parent_igdb_id": 77,
}

STEAM = {
    "metacritic_score": 96,
    "achievements_total": 42,
    "is_free": False,
    "price_original_us": Decimal("59.99"),
    "price_current_us": Decimal("35.99"),
    "price_original_jp": Decimal("9000.00"),
    "price_current_jp": Decimal("4500.00"),
    "price_original_tw": Decimal("1790.00"),
    "price_current_tw": Decimal("899.00"),
}


@pytest.fixture(autouse=True)
def vocabulary(db_session):
    seed_game_vocabulary(db_session)
    db_session.flush()


@pytest.fixture
def patched(monkeypatch):
    calls = {"download": []}
    monkeypatch.setattr(autofill_module, "fetch_igdb_game", lambda igdb_id: {"id": igdb_id})
    monkeypatch.setattr(autofill_module, "map_igdb_to_game_data", lambda raw: dict(IGDB))
    monkeypatch.setattr(
        autofill_module,
        "fetch_igdb_time_to_beat",
        lambda igdb_id: {"hltb_main": 5.0, "hltb_main_extra": 8.0, "hltb_completionist": 12.0},
    )
    monkeypatch.setattr(
        autofill_module,
        "download_cover_image",
        lambda url, owner_type, sid: calls["download"].append(owner_type) or "stored.jpg",
    )
    monkeypatch.setattr(autofill_module, "fetch_steam_appdetails", lambda appid, cc="us": {"x": 1})
    monkeypatch.setattr(autofill_module, "map_steam_to_game_data", lambda p: dict(STEAM))
    monkeypatch.setattr(autofill_module, "fetch_owned_games", lambda: {1245620: 180})
    monkeypatch.setattr(autofill_module, "fetch_player_achievements", lambda appid: 7)
    return calls


def _h_game(db_session, **kwargs):
    defaults = dict(system_id=uuid.uuid4(), h_game_name_en="Zvornik Fill", igdb_id=1029)
    defaults.update(kwargs)
    entry = models.HGame(**defaults)
    db_session.add(entry)
    db_session.flush()
    return entry


def test_igdb_fills_the_h_game_columns(db_session, patched):
    entry = _h_game(db_session)
    autofill_game_from_igdb(entry, db_session)
    assert entry.release_date == "2022-02-25"
    assert entry.igdb_link == IGDB["igdb_link"]
    assert (entry.steam_appid, entry.steam_link) == (IGDB["steam_appid"], IGDB["steam_link"])
    assert (entry.hltb_main, entry.hltb_main_extra, entry.hltb_completionist) == (5.0, 8.0, 12.0)
    assert entry.cover_image_file == "stored.jpg"
    # The cover is stored under the entry's own owner type.
    assert patched["download"] == ["h-game"]


def test_igdb_writes_studio_genre_and_theme_only(db_session, patched):
    entry = _h_game(db_session)
    autofill_game_from_igdb(entry, db_session)
    assert credit_names(db_session, entry.system_id, "studio") == ["Zvornik Dev"]
    assert tag_values(db_session, entry.system_id, "game_genre") == ["角色扮演"]
    assert tag_values(db_session, entry.system_id, "game_theme") == ["奇幻"]
    # Not h-game's: no publisher credit, no mode or platform tag, and the
    # hand-set platform column is never filled.
    assert credit_names(db_session, entry.system_id, "publisher") == []
    assert tag_values(db_session, entry.system_id, "game_mode") == []
    assert tag_values(db_session, entry.system_id, "game_platform") == []
    assert entry.platform is None


def test_igdb_on_a_game_still_writes_everything(db_session, patched):
    """The mirror: generalising the fill took nothing away from Game."""
    game = models.Game(system_id=uuid.uuid4(), game_name_en="Zvornik Game Fill", igdb_id=1029)
    db_session.add(game)
    db_session.flush()
    autofill_game_from_igdb(game, db_session)
    assert credit_names(db_session, game.system_id, "publisher") == ["Zvornik Pub"]
    assert tag_values(db_session, game.system_id, "game_mode") != []
    assert patched["download"] == ["game"]


def test_the_dlc_parent_is_found_among_h_games_only(db_session, patched):
    game_parent = models.Game(system_id=uuid.uuid4(), game_name_en="Game parent", igdb_id=77)
    db_session.add(game_parent)
    db_session.flush()
    entry = _h_game(db_session)
    autofill_game_from_igdb(entry, db_session)
    # A Game with that IGDB id is not an h-game's base game.
    assert entry.base_game_id is None

    parent = _h_game(db_session, h_game_name_en="H parent", igdb_id=77)
    child = _h_game(db_session, h_game_name_en="H child", igdb_id=1030)
    autofill_game_from_igdb(child, db_session)
    assert child.base_game_id == parent.system_id


def test_steam_writes_prices_and_achievements_only(db_session, patched):
    entry = _h_game(db_session, igdb_id=None, steam_appid=1245620)
    autofill_game_from_steam(entry, db_session)
    assert entry.price_original_us == Decimal("59.99")
    assert entry.price_current_jp == Decimal("4500.00")
    assert entry.achievements_total == 42
    assert entry.achievements_earned == 7
    # No such columns on h_game: nothing was set as a stray attribute.
    assert "hours_played" not in vars(entry)
    assert "metacritic_score" not in vars(entry)


def test_steam_respects_the_progress_lock(db_session, patched):
    entry = _h_game(db_session, igdb_id=None, steam_appid=1245620, steam_progress_sync=False)
    autofill_game_from_steam(entry, db_session)
    assert entry.achievements_earned is None
    assert entry.price_original_us == Decimal("59.99")


def test_the_steam_gate_reads_only_h_game_columns(db_session):
    entry = _h_game(db_session, igdb_id=None, steam_appid=1)
    assert has_missing_values_game_steam(entry) is True
    entry.price_original_us = Decimal("1.00")
    assert has_missing_values_game_steam(entry) is False


def test_the_pipeline_spec_mirrors_game(db_session):
    spec = PIPELINES["h-game"]
    assert spec.model is models.HGame
    assert spec in FILL_ALL
    assert spec in REPLACE_ALL
    entry = _h_game(db_session, igdb_id=None, igdb_link="https://www.igdb.com/games/x/123")
    assert spec.fill_eligible(db_session, entry) is False
    entry.steam_link = "https://store.steampowered.com/app/555/"
    spec.extract_id(entry)
    assert entry.steam_appid == 555
    assert spec.fill_eligible(db_session, entry) is True


def test_post_processing_derives_the_steamdb_row(db_session):
    entry = _h_game(db_session, igdb_id=None, steam_appid=555)
    PIPELINES["h-game"].post_process(entry, db_session)
    row = find_main_source(db_session, entry.system_id, "reference", STEAMDB_VALUE)
    assert row is not None and "555" in row.url


def test_single_replace_runs_steam(db_session, patched):
    from app.services.domain.post_processing import apply_single_replace_game

    entry = _h_game(db_session, igdb_id=None, steam_link="https://store.steampowered.com/app/1245620/")
    apply_single_replace_game(db_session, entry)
    assert entry.steam_appid == 1245620
    assert entry.price_current_us == Decimal("35.99")
    assert find_main_source(db_session, entry.system_id, "reference", STEAMDB_VALUE) is not None
