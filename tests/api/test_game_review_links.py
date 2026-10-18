"""
The Metacritic and HowLongToBeat reference rows on a game and an h-game.

Both are display-only links, so - like SteamDB - they are media_source
reference rows rather than columns, and both are fill-only: a hand-entered
row wins. Metacritic's url rides on the Steam storefront answer the Steam
autofill already fetches; HowLongToBeat's comes from the site's own search,
kept only for a confident match.

Every fetch is patched out - these tests lock down behaviour, not the
network layer.
"""

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import (
    autofill_game_from_steam,
    autofill_hltb_source,
    reset_hltb_misses,
)
from app.services.domain.sources import find_main_source, upsert_main_source
from app.utils.source_fields import HOWLONGTOBEAT_VALUE, METACRITIC_VALUE

ELDEN_RING_STEAM = {
    "is_free": False,
    "metacritic": {
        "score": 94,
        "url": "https://www.metacritic.com/game/pc/elden-ring?ftag=MCD-06-10aaa1f",
    },
}
ELDEN_RING_METACRITIC = "https://www.metacritic.com/game/elden-ring/"


@pytest.fixture(autouse=True)
def no_remembered_misses():
    """The miss memory is process-wide; no test may inherit another's."""
    reset_hltb_misses()
    yield
    reset_hltb_misses()


def _with_media(db_session, model, media_type, public_id, **columns):
    media = models.Media(
        media_type=media_type, public_id=public_id, display_name="Review links"
    )
    db_session.add(media)
    db_session.flush()
    entry = model(system_id=media.system_id, media_type=media_type, **columns)
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def game(db_session):
    return _with_media(
        db_session,
        models.Game,
        "game",
        990101,
        game_name_en="Elden Ring",
        release_date="2022-02-25",
    )


@pytest.fixture
def h_game(db_session):
    return _with_media(
        db_session,
        models.HGame,
        "h-game",
        990102,
        h_game_name_en="Zvornik Links",
        h_game_name_jp="ズヴォルニク",
        release_date="2021",
    )


def _url(db_session, entry, value):
    row = find_main_source(db_session, entry.system_id, "reference", value)
    return row.url if row is not None else None


@pytest.fixture
def storefront(monkeypatch):
    """The storefront answers ELDEN_RING_STEAM for every region; the real
    mapper runs, so the url normalisation is exercised end to end."""
    state = {"us": dict(ELDEN_RING_STEAM)}

    monkeypatch.setattr(
        autofill_module,
        "fetch_steam_appdetails",
        lambda appid, cc="us": state["us"] if cc == "us" else None,
    )
    monkeypatch.setattr(autofill_module, "fetch_owned_games", lambda: {})
    monkeypatch.setattr(autofill_module, "fetch_player_achievements", lambda appid: None)
    return state


@pytest.fixture
def hltb(monkeypatch):
    """find_hltb_game_id, recorded; answers `state["answer"]`."""
    state = {"answer": 68151, "calls": []}

    def fake_find(term, names, year):
        state["calls"].append((term, list(names), year))
        return state["answer"]

    monkeypatch.setattr(autofill_module, "find_hltb_game_id", fake_find)
    return state


class TestMetacritic:
    def test_the_steam_answer_writes_the_canonical_link(self, db_session, game, storefront):
        game.steam_appid = 1245620

        autofill_game_from_steam(game, db_session)

        assert game.metacritic_score == 94
        assert _url(db_session, game, METACRITIC_VALUE) == ELDEN_RING_METACRITIC

    def test_an_h_game_gets_the_link_without_the_score_column(
        self, db_session, h_game, storefront
    ):
        h_game.steam_appid = 1245620

        autofill_game_from_steam(h_game, db_session)

        assert _url(db_session, h_game, METACRITIC_VALUE) == ELDEN_RING_METACRITIC

    def test_a_game_steam_has_no_metacritic_page_for_gets_no_row(
        self, db_session, game, storefront
    ):
        storefront["us"] = {"is_free": False}
        game.steam_appid = 1245620

        autofill_game_from_steam(game, db_session)

        assert _url(db_session, game, METACRITIC_VALUE) is None

    def test_a_hand_entered_row_is_left_alone(self, db_session, game, storefront):
        upsert_main_source(
            db_session,
            game.system_id,
            "reference",
            METACRITIC_VALUE,
            "https://www.metacritic.com/game/typed-by-hand/",
        )
        game.steam_appid = 1245620

        autofill_game_from_steam(game, db_session)

        assert (
            _url(db_session, game, METACRITIC_VALUE)
            == "https://www.metacritic.com/game/typed-by-hand/"
        )


class TestHowLongToBeat:
    def test_a_confident_match_writes_the_game_page(self, db_session, game, hltb):
        assert autofill_hltb_source(game, db_session) is True

        assert _url(db_session, game, HOWLONGTOBEAT_VALUE) == "https://howlongtobeat.com/game/68151"
        assert hltb["calls"] == [("Elden Ring", ["Elden Ring"], 2022)]

    def test_no_confident_match_writes_no_row(self, db_session, game, hltb):
        hltb["answer"] = None

        assert autofill_hltb_source(game, db_session) is False
        assert _url(db_session, game, HOWLONGTOBEAT_VALUE) is None

    def test_a_game_with_a_row_is_not_looked_up(self, db_session, game, hltb):
        """
        A hand-entered row wins, and costs no request. `hltb["calls"]` is
        what makes this bite: the upsert is fill-only on its own, so the url
        assertion alone would pass even with a wasted lookup.
        """
        upsert_main_source(
            db_session,
            game.system_id,
            "reference",
            HOWLONGTOBEAT_VALUE,
            "https://howlongtobeat.com/game/1",
        )

        assert autofill_hltb_source(game, db_session) is False
        assert hltb["calls"] == []
        assert _url(db_session, game, HOWLONGTOBEAT_VALUE) == "https://howlongtobeat.com/game/1"

    def test_a_game_with_no_latin_name_is_not_looked_up(self, db_session, game, hltb):
        game.game_name_en = None
        game.game_name_cn = "艾爾登法環"

        assert autofill_hltb_source(game, db_session) is False
        assert hltb["calls"] == []

    def test_the_roman_and_alt_names_join_the_match(self, db_session, game, hltb):
        game.game_name_en = None
        game.game_name_roman = "Erudo Ringu"
        game.game_name_alt = "ER, Elden Ring"
        game.game_name_jp = "エルデンリング"
        game.release_date = None

        autofill_hltb_source(game, db_session)

        assert hltb["calls"] == [
            ("Erudo Ringu", ["Erudo Ringu", "ER", "Elden Ring", "エルデンリング"], None)
        ]

    def test_an_h_game_is_looked_up_on_its_own_names(self, db_session, h_game, hltb):
        assert autofill_hltb_source(h_game, db_session) is True

        assert hltb["calls"] == [("Zvornik Links", ["Zvornik Links", "ズヴォルニク"], 2021)]
        assert _url(db_session, h_game, HOWLONGTOBEAT_VALUE) == "https://howlongtobeat.com/game/68151"


class TestMissPolicy:
    """
    A miss is remembered for the life of the process: Fill does not ask
    again, Replace does.
    """

    def test_fill_does_not_repeat_a_miss(self, db_session, game, hltb):
        hltb["answer"] = None
        autofill_hltb_source(game, db_session, retry_misses=False)

        autofill_hltb_source(game, db_session, retry_misses=False)

        assert len(hltb["calls"]) == 1

    def test_replace_retries_a_miss(self, db_session, game, hltb):
        hltb["answer"] = None
        autofill_hltb_source(game, db_session, retry_misses=False)
        hltb["answer"] = 68151

        assert autofill_hltb_source(game, db_session) is True
        assert len(hltb["calls"]) == 2

    def test_fill_asks_for_a_game_that_never_missed(self, db_session, game, hltb):
        """The mirror of the first test: the memory is per game, not global."""
        assert autofill_hltb_source(game, db_session, retry_misses=False) is True
        assert len(hltb["calls"]) == 1


class TestWiring:
    """Both links are only worth anything where they actually run."""

    @pytest.fixture
    def quiet_sources(self, monkeypatch):
        from app.services.domain import post_processing
        from app.services.pipelines import specs

        for module in (post_processing, specs):
            monkeypatch.setattr(module, "autofill_game_from_igdb", lambda e, db, **k: None)
            monkeypatch.setattr(module, "autofill_cover_from_steam", lambda e: None)
            monkeypatch.setattr(module, "autofill_cover_from_steam_header", lambda e: None)
            monkeypatch.setattr(module, "autofill_game_cover_from_igdb", lambda e: None)
            monkeypatch.setattr(module, "autofill_h_game_from_dlsite", lambda e, db: None)

    @pytest.mark.parametrize("kind", ["game", "h_game"])
    def test_replace_writes_both(self, request, db_session, storefront, hltb, quiet_sources, kind):
        from app.services.domain import post_processing

        entry = request.getfixturevalue(kind)
        entry.steam_appid = 1245620
        replace = (
            post_processing.apply_single_replace_game
            if kind == "game"
            else post_processing.apply_single_replace_h_game
        )

        replace(db_session, entry)

        assert _url(db_session, entry, METACRITIC_VALUE) == ELDEN_RING_METACRITIC
        assert _url(db_session, entry, HOWLONGTOBEAT_VALUE) == "https://howlongtobeat.com/game/68151"

    @pytest.mark.parametrize("kind,spec_key", [("game", "game"), ("h_game", "h-game")])
    def test_fill_writes_both_for_a_queued_entry(
        self, request, db_session, storefront, hltb, quiet_sources, kind, spec_key
    ):
        from app.services.pipelines import specs

        entry = request.getfixturevalue(kind)
        entry.steam_appid = 1245620
        spec = specs.PIPELINES[spec_key]
        assert spec.fill_eligible(db_session, entry) is True

        spec.fill(db_session, entry)

        assert _url(db_session, entry, METACRITIC_VALUE) == ELDEN_RING_METACRITIC
        assert _url(db_session, entry, HOWLONGTOBEAT_VALUE) == "https://howlongtobeat.com/game/68151"

    def test_fill_does_not_repeat_a_miss_but_replace_does(
        self, db_session, game, storefront, hltb, quiet_sources
    ):
        from app.services.domain import post_processing
        from app.services.pipelines import specs

        hltb["answer"] = None
        spec = specs.PIPELINES["game"]
        spec.fill(db_session, game)
        spec.fill(db_session, game)
        assert len(hltb["calls"]) == 1

        post_processing.apply_single_replace_game(db_session, game)
        assert len(hltb["calls"]) == 2
