"""
DLsite on an h-game, and the cover order it sits at the front of.

DLsite fills three things, fill-only: the release date, the circle or brand as
the studio credit, and the cover. The h-game fill then takes its cover from
DLsite, else Steam's library capsule, else IGDB - while IGDB still runs before
Steam so it can hand Steam an appid. Game's fill is untouched: Steam writes no
cover there.

Every fetch and the cover download are patched out - these tests lock down
behaviour, not the network layer.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid
from decimal import Decimal

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_h_game_from_dlsite
from app.services.domain.credits import credit_names, replace_credits
from app.services.domain.post_processing import apply_single_replace_h_game
from app.services.pipelines.specs import PIPELINES
from app.utils.game_vocabulary import seed_game_vocabulary

JP_LINK = "https://www.dlsite.com/maniax/work/=/product_id/RJ173356.html"
TW_LINK = "https://www.dlsite.com/maniax/work/=/product_id/RJ173356.html/?locale=zh_TW"

DLSITE_RECORD = {
    "workno": "RJ173356",
    "regist_date": "2016-03-17 00:00:00",
    "maker_name": "ONEONE1",
    "image_main": {"url": "//img.dlsite.jp/RJ173356_img_main.jpg"},
}
DLSITE_COVER = "https://img.dlsite.jp/RJ173356_img_main.jpg"
STEAM_COVER = "https://steam.example/library_600x900_2x.jpg"
IGDB_COVER = "https://images.igdb.com/big.jpg"

IGDB = {
    "release_date": "2022-02-25",
    "igdb_link": "https://www.igdb.com/games/zvornik",
    "steam_appid": 1245620,
    "steam_link": "https://store.steampowered.com/app/1245620/",
    "cover_image_url": IGDB_COVER,
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
    "achievements_total": 42,
    "is_free": False,
    "price_original_us": Decimal("59.99"),
    "price_current_us": Decimal("35.99"),
}


@pytest.fixture(autouse=True)
def vocabulary(db_session):
    seed_game_vocabulary(db_session)
    db_session.flush()


@pytest.fixture
def sources(monkeypatch):
    """
    All three sources answering, with every request and cover download
    recorded. A test switches one source off by setting its answer to None.

    The download returns a key naming the URL it fetched, so the stored cover
    says which source won. It is not the owner's own key, so a later source
    never mistakes it for a lost download and re-fetches.
    """
    state = {
        "dlsite": dict(DLSITE_RECORD),
        "steam_cover": STEAM_COVER,
        "igdb": dict(IGDB),
        "calls": [],
        "downloads": [],
    }

    def fetch_dlsite(product_id):
        state["calls"].append(("dlsite", product_id))
        return state["dlsite"]

    def fetch_capsule(appid):
        state["calls"].append(("steam_cover", appid))
        return state["steam_cover"]

    def fetch_igdb(igdb_id):
        state["calls"].append(("igdb", igdb_id))
        return {"id": igdb_id} if state["igdb"] is not None else None

    def appdetails(appid, cc="us"):
        state["calls"].append(("steam", appid, cc))
        return {"x": 1}

    def download(url, owner_type, sid):
        state["downloads"].append((url, owner_type))
        return f"stored:{url}"

    monkeypatch.setattr(autofill_module, "fetch_dlsite_product", fetch_dlsite)
    monkeypatch.setattr(autofill_module, "fetch_steam_library_capsule_url", fetch_capsule)
    monkeypatch.setattr(autofill_module, "fetch_igdb_game", fetch_igdb)
    monkeypatch.setattr(
        autofill_module, "map_igdb_to_game_data", lambda raw: dict(state["igdb"])
    )
    monkeypatch.setattr(autofill_module, "fetch_igdb_time_to_beat", lambda igdb_id: {})
    monkeypatch.setattr(autofill_module, "fetch_steam_appdetails", appdetails)
    monkeypatch.setattr(autofill_module, "map_steam_to_game_data", lambda p: dict(STEAM))
    monkeypatch.setattr(autofill_module, "fetch_owned_games", lambda: {})
    monkeypatch.setattr(autofill_module, "fetch_player_achievements", lambda appid: None)
    monkeypatch.setattr(autofill_module, "download_cover_image", download)
    return state


def _h_game(db_session, **kwargs):
    defaults = dict(system_id=uuid.uuid4(), h_game_name_en="DLsite Fill")
    defaults.update(kwargs)
    entry = models.HGame(**defaults)
    db_session.add(entry)
    db_session.flush()
    return entry


# ---------------------------------------------------------------------------
# The DLsite autofill on its own
# ---------------------------------------------------------------------------


class TestDlsiteAutofill:
    def test_fills_release_date_studio_and_cover(self, db_session, sources):
        entry = _h_game(db_session, dlsite_link_jp=JP_LINK)
        autofill_h_game_from_dlsite(entry, db_session)
        assert entry.release_date == "2016-03-17"
        assert credit_names(db_session, entry.system_id, "studio") == ["ONEONE1"]
        assert entry.cover_image_file == f"stored:{DLSITE_COVER}"
        # Stored under the entry's own owner type.
        assert sources["downloads"] == [(DLSITE_COVER, "h-game")]

    def test_keys_off_the_tw_link_when_there_is_no_jp_one(self, db_session, sources):
        entry = _h_game(db_session, dlsite_link_tw=TW_LINK)
        autofill_h_game_from_dlsite(entry, db_session)
        assert sources["calls"] == [("dlsite", "RJ173356")]
        assert entry.release_date == "2016-03-17"

    def test_prefers_the_jp_link(self, db_session, sources):
        entry = _h_game(
            db_session,
            dlsite_link_jp=JP_LINK,
            dlsite_link_tw="https://www.dlsite.com/maniax/work/=/product_id/RJ999999.html",
        )
        autofill_h_game_from_dlsite(entry, db_session)
        assert sources["calls"] == [("dlsite", "RJ173356")]

    def test_no_link_makes_no_request(self, db_session, sources):
        entry = _h_game(db_session)
        autofill_h_game_from_dlsite(entry, db_session)
        assert sources["calls"] == []
        assert entry.release_date is None

    def test_is_fill_only(self, db_session, sources):
        """Every value set beforehand - the refusal needs something to keep."""
        entry = _h_game(
            db_session,
            dlsite_link_jp=JP_LINK,
            release_date="2015-01-01",
            cover_image_file="library/hand-picked.jpg",
        )
        replace_credits(db_session, "h-game", entry.system_id, "studio", ["Hand Studio"])

        autofill_h_game_from_dlsite(entry, db_session)

        assert entry.release_date == "2015-01-01"
        assert entry.cover_image_file == "library/hand-picked.jpg"
        assert credit_names(db_session, entry.system_id, "studio") == ["Hand Studio"]
        assert sources["downloads"] == []

    def test_the_studio_resolves_to_an_existing_record(self, db_session, sources):
        """Written through replace_credits, as IGDB's developer is: a studio of
        that name already on file is credited, not duplicated."""
        existing = models.Studio(name_en="ONEONE1")
        db_session.add(existing)
        db_session.flush()
        entry = _h_game(db_session, dlsite_link_jp=JP_LINK)

        autofill_h_game_from_dlsite(entry, db_session)

        credit = (
            db_session.query(models.MediaCredit)
            .filter_by(media_id=entry.system_id, role="studio")
            .one()
        )
        assert credit.studio_id == existing.system_id
        assert db_session.query(models.Studio).filter_by(name_en="ONEONE1").count() == 1

    def test_an_unknown_product_writes_nothing(self, db_session, sources):
        sources["dlsite"] = None
        entry = _h_game(db_session, dlsite_link_jp=JP_LINK)
        autofill_h_game_from_dlsite(entry, db_session)
        assert entry.release_date is None
        assert entry.cover_image_file is None

    def test_a_failure_is_swallowed(self, db_session, sources, monkeypatch):
        def boom(product_id):
            raise RuntimeError("DLsite is down")

        monkeypatch.setattr(autofill_module, "fetch_dlsite_product", boom)
        entry = _h_game(db_session, dlsite_link_jp=JP_LINK)
        autofill_h_game_from_dlsite(entry, db_session)
        assert entry.release_date is None


# ---------------------------------------------------------------------------
# The h-game pipeline: DLsite first, and the cover DLsite > Steam > IGDB
# ---------------------------------------------------------------------------


def _fill(db_session, entry):
    PIPELINES["h-game"].fill(db_session, entry)


class TestCoverPriority:
    def test_dlsite_wins_over_steam_and_igdb(self, db_session, sources):
        entry = _h_game(db_session, dlsite_link_jp=JP_LINK, igdb_id=1029)
        _fill(db_session, entry)
        assert entry.cover_image_file == f"stored:{DLSITE_COVER}"
        assert [url for url, _ in sources["downloads"]] == [DLSITE_COVER]

    def test_steam_wins_over_igdb(self, db_session, sources):
        sources["dlsite"] = dict(DLSITE_RECORD, image_main=None)
        entry = _h_game(db_session, dlsite_link_jp=JP_LINK, igdb_id=1029)
        _fill(db_session, entry)
        assert entry.cover_image_file == f"stored:{STEAM_COVER}"
        assert [url for url, _ in sources["downloads"]] == [STEAM_COVER]

    def test_igdb_is_the_last_resort(self, db_session, sources):
        sources["dlsite"] = None
        sources["steam_cover"] = None
        entry = _h_game(db_session, dlsite_link_jp=JP_LINK, igdb_id=1029)
        _fill(db_session, entry)
        assert entry.cover_image_file == f"stored:{IGDB_COVER}"

    def test_igdb_hands_steam_the_appid_before_steam_runs(self, db_session, sources):
        """No appid on the row: IGDB's must reach Steam, whose capsule then
        beats IGDB's own cover."""
        entry = _h_game(db_session, igdb_id=1029)
        _fill(db_session, entry)
        assert entry.steam_appid == 1245620
        assert ("steam_cover", 1245620) in sources["calls"]
        assert entry.cover_image_file == f"stored:{STEAM_COVER}"
        assert entry.price_original_us == Decimal("59.99")

    def test_an_existing_cover_is_kept_by_every_source(self, db_session, sources):
        entry = _h_game(
            db_session,
            dlsite_link_jp=JP_LINK,
            igdb_id=1029,
            steam_appid=1245620,
            cover_image_file="library/hand-picked.jpg",
        )
        _fill(db_session, entry)
        assert entry.cover_image_file == "library/hand-picked.jpg"
        assert sources["downloads"] == []

    def test_dlsite_release_date_and_studio_come_before_igdb(self, db_session, sources):
        entry = _h_game(db_session, dlsite_link_jp=JP_LINK, igdb_id=1029)
        _fill(db_session, entry)
        assert entry.release_date == "2016-03-17"
        assert credit_names(db_session, entry.system_id, "studio") == ["ONEONE1"]

    def test_replace_takes_the_same_order_and_stays_fill_only(self, db_session, sources):
        entry = _h_game(
            db_session,
            dlsite_link_jp=JP_LINK,
            igdb_id=1029,
            release_date="2015-01-01",
        )
        apply_single_replace_h_game(db_session, entry)
        assert entry.release_date == "2015-01-01"
        assert entry.cover_image_file == f"stored:{DLSITE_COVER}"
        assert PIPELINES["h-game"].replace is not None


class TestGameIsUnchanged:
    def test_steam_writes_no_cover_on_a_game(self, db_session, sources, monkeypatch):
        def explode(appid):
            raise AssertionError("a game's cover never comes from Steam")

        monkeypatch.setattr(autofill_module, "fetch_steam_library_capsule_url", explode)
        sources["igdb"] = dict(IGDB, cover_image_url=None)
        game = models.Game(
            system_id=uuid.uuid4(), game_name_en="Game Fill", steam_appid=1245620
        )
        db_session.add(game)
        db_session.flush()

        PIPELINES["game"].fill(db_session, game)
        PIPELINES["game"].replace(db_session, game, False)

        assert game.cover_image_file is None
        assert game.price_original_us == Decimal("59.99")

    def test_a_game_takes_igdb_cover_as_before(self, db_session, sources):
        game = models.Game(system_id=uuid.uuid4(), game_name_en="Game Fill", igdb_id=1029)
        db_session.add(game)
        db_session.flush()
        PIPELINES["game"].fill(db_session, game)
        assert game.cover_image_file == f"stored:{IGDB_COVER}"
        assert not any(c[0] in ("dlsite", "steam_cover") for c in sources["calls"])


# ---------------------------------------------------------------------------
# Eligibility and selection
# ---------------------------------------------------------------------------


class TestSelection:
    def test_an_entry_with_only_a_dlsite_link_is_eligible(self, db_session):
        entry = _h_game(db_session, dlsite_link_tw=TW_LINK)
        assert PIPELINES["h-game"].fill_eligible(db_session, entry) is True

    def test_a_dlsite_link_without_a_product_id_is_not(self, db_session):
        entry = _h_game(db_session, dlsite_link_jp="https://www.dlsite.com/maniax/")
        assert PIPELINES["h-game"].fill_eligible(db_session, entry) is False

    def test_a_dlsite_complete_entry_is_not_eligible(self, db_session):
        """The mirror of the first test, with every DLsite field filled."""
        entry = _h_game(
            db_session,
            dlsite_link_jp=JP_LINK,
            release_date="2016-03-17",
            cover_image_file="library/hand-picked.jpg",
        )
        assert PIPELINES["h-game"].fill_eligible(db_session, entry) is True
        replace_credits(db_session, "h-game", entry.system_id, "studio", ["ONEONE1"])
        assert PIPELINES["h-game"].fill_eligible(db_session, entry) is False

    def test_replace_selects_an_entry_linked_only_to_dlsite(self, db_session):
        entry = _h_game(db_session, dlsite_link_jp=JP_LINK)
        selected = PIPELINES["h-game"].replace_select(db_session)
        assert entry in selected
