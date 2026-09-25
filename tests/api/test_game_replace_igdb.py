"""
Replace on a game or an h-game runs both of its sources: IGDB, then Steam.

One function serves both types (`apply_single_replace_game`), and it backs the
detail page's Autofill button, the single and bulk Replace routes and the
write hook. Every fetch and the cover download are patched out.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid
from decimal import Decimal

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.post_processing import apply_single_replace_game
from app.services.pipelines.specs import PIPELINES
from app.utils.game_vocabulary import seed_game_vocabulary

IGDB = {
    "release_date": "2022-02-25",
    "igdb_link": "https://www.igdb.com/games/zvornik",
    "steam_appid": 1245620,
    "steam_link": "https://store.steampowered.com/app/1245620/",
    "cover_image_url": None,
    "developers": ["Zvornik Dev"],
    "publishers": [],
    "genres": [],
    "themes": [],
    "game_modes": [],
    "platforms": [],
    "parent_igdb_id": None,
}

STEAM = {
    "metacritic_score": 96,
    "achievements_total": None,
    "is_free": False,
    "price_original_us": None,
    "price_current_us": Decimal("35.99"),
    "price_original_jp": None,
    "price_current_jp": None,
    "price_original_tw": None,
    "price_current_tw": None,
}


@pytest.fixture(autouse=True)
def vocabulary(db_session):
    seed_game_vocabulary(db_session)
    db_session.flush()


@pytest.fixture
def calls(monkeypatch):
    """Records which source each fetch went to, in order."""
    seen = []
    monkeypatch.setattr(
        autofill_module,
        "fetch_igdb_game",
        lambda igdb_id: seen.append(("igdb", igdb_id)) or {"id": igdb_id},
    )
    monkeypatch.setattr(autofill_module, "map_igdb_to_game_data", lambda raw: dict(IGDB))
    monkeypatch.setattr(
        autofill_module, "fetch_igdb_time_to_beat", lambda igdb_id: {"hltb_main": 5.0}
    )
    monkeypatch.setattr(
        autofill_module,
        "fetch_steam_appdetails",
        lambda appid, cc="us": seen.append(("steam", appid)) or {"d": 1},
    )
    monkeypatch.setattr(autofill_module, "map_steam_to_game_data", lambda p: dict(STEAM))
    monkeypatch.setattr(autofill_module, "fetch_owned_games", lambda: {})
    monkeypatch.setattr(autofill_module, "fetch_player_achievements", lambda appid: None)
    return seen


def _game(db_session, **kwargs):
    entry = models.Game(system_id=uuid.uuid4(), game_name_en="Zvornik", **kwargs)
    db_session.add(entry)
    db_session.flush()
    return entry


def _h_game(db_session, **kwargs):
    entry = models.HGame(system_id=uuid.uuid4(), h_game_name_en="Zvornik", **kwargs)
    db_session.add(entry)
    db_session.flush()
    return entry


MAKERS = {"game": _game, "h-game": _h_game}


@pytest.mark.parametrize("key", ["game", "h-game"])
class TestSingleReplaceRunsBothSources:
    def test_an_igdb_only_entry_is_filled_from_igdb_then_steam(self, key, db_session, calls):
        """IGDB supplies the appid, so Steam runs in the same pass."""
        entry = MAKERS[key](db_session, igdb_id=1029)

        apply_single_replace_game(db_session, entry)

        assert entry.release_date == "2022-02-25"
        assert entry.hltb_main == 5.0
        assert entry.steam_appid == 1245620
        assert entry.price_current_us == Decimal("35.99")
        assert [source for source, _ in calls] == ["igdb", "steam", "steam", "steam"]

    def test_the_igdb_id_is_derived_from_a_pasted_link(self, key, db_session, calls):
        entry = MAKERS[key](db_session, igdb_link="https://api.igdb.com/v4/games/1029")

        apply_single_replace_game(db_session, entry)

        assert entry.igdb_id == 1029
        assert ("igdb", 1029) in calls

    def test_igdb_stays_fill_only(self, key, db_session, calls):
        """Nothing IGDB supplies drifts, so Replace keeps a value already set -
        the same bargain the MAL Replace makes with everything but its scores."""
        entry = MAKERS[key](db_session, igdb_id=1029, release_date="2020-01-01", hltb_main=40.0)

        apply_single_replace_game(db_session, entry)

        assert entry.release_date == "2020-01-01"
        assert entry.hltb_main == 40.0
        # The mirror: IGDB did run, so the kept values were a choice.
        assert ("igdb", 1029) in calls

    def test_a_steam_only_entry_makes_no_igdb_call(self, key, db_session, calls):
        entry = MAKERS[key](db_session, steam_appid=1245620)

        apply_single_replace_game(db_session, entry)

        assert entry.price_current_us == Decimal("35.99")
        assert all(source == "steam" for source, _ in calls)

    def test_the_route_runs_igdb(self, key, admin_client, db_session, calls):
        """The endpoint behind the detail page's Autofill button."""
        entry = MAKERS[key](db_session, igdb_id=1029)
        db_session.commit()
        response = admin_client.post(f"/api/data-control/replace/{key}/{entry.system_id}")

        assert response.status_code == 200, response.text
        assert ("igdb", 1029) in calls


@pytest.mark.parametrize("key", ["game", "h-game"])
def test_bulk_replace_selects_an_entry_carrying_only_igdb(key, db_session):
    make = MAKERS[key]
    by_steam_id = make(db_session, steam_appid=1245620)
    by_steam_link = make(db_session, steam_link="https://store.steampowered.com/app/570/")
    by_igdb_id = make(db_session, igdb_id=119133)
    by_igdb_link = make(db_session, igdb_link="https://api.igdb.com/v4/games/119134")
    unlinked = make(db_session)

    ids = {str(e.system_id) for e in PIPELINES[key].replace_select(db_session)}

    for linked in (by_steam_id, by_steam_link, by_igdb_id, by_igdb_link):
        assert str(linked.system_id) in ids
    # The mirror: an entry with no source at all is still left out.
    assert str(unlinked.system_id) not in ids
