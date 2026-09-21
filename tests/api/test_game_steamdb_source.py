"""
The SteamDB reference row, derived from a game's Steam appid.

SteamDB is a display-only link, so it is a media_source reference row rather
than a column (games.steam_link and games.igdb_link are columns because a
pipeline fetches on them). The row needs no fetch of its own: the appid the
store URL already carries is the whole of a SteamDB URL.
"""

import pytest

from app import models
from app.services.domain.derivation import (
    apply_extract_steam_appid,
    derive_steamdb_source,
)
from app.services.domain.sources import upsert_main_source
from app.utils.source_fields import REFERENCE_CATEGORY, STEAMDB_VALUE
from app.utils.steam_utils import steamdb_link_for

SEKIRO_STORE = (
    "https://store.steampowered.com/app/814380/Sekiro_Shadows_Die_Twice__GOTY_Edition/"
)
SEKIRO_STEAMDB = "https://steamdb.info/app/814380/"


@pytest.fixture
def game(db_session):
    """A game with its `media` supertable row, which media_source FKs."""
    media = models.Media(
        media_type="game", public_id=990001, display_name="Sekiro"
    )
    db_session.add(media)
    db_session.flush()

    entry = models.Game(
        system_id=media.system_id,
        media_type="game",
        game_name_en="Sekiro: Shadows Die Twice",
    )
    db_session.add(entry)
    db_session.flush()
    return entry


def _steamdb_row(db, entry):
    return (
        db.query(models.MediaSource)
        .join(
            models.SystemOption,
            models.SystemOption.system_id == models.MediaSource.option_id,
        )
        .filter(
            models.MediaSource.media_id == entry.system_id,
            models.SystemOption.value == STEAMDB_VALUE,
        )
        .one_or_none()
    )


class TestTheUrl:
    def test_the_steamdb_url_is_built_from_the_appid(self):
        assert steamdb_link_for(814380) == SEKIRO_STEAMDB

    def test_a_store_url_derives_the_steamdb_url_end_to_end(self, db_session, game):
        """The owner's own example: a pasted store URL, and nothing else."""
        game.steam_link = SEKIRO_STORE

        apply_extract_steam_appid(game)
        derive_steamdb_source(game, db_session)
        db_session.flush()

        assert game.steam_appid == 814380
        assert _steamdb_row(db_session, game).url == SEKIRO_STEAMDB


class TestTheRow:
    def test_it_is_a_reference_main_row_on_the_vocabulary(self, db_session, game):
        game.steam_appid = 814380

        assert derive_steamdb_source(game, db_session) is True
        db_session.flush()

        row = _steamdb_row(db_session, game)
        assert row.kind == "reference"
        assert row.bucket == "main"
        # A main row points at the vocabulary rather than carrying its own text.
        assert row.name is None

        option = (
            db_session.query(models.SystemOption)
            .filter(models.SystemOption.system_id == row.option_id)
            .one()
        )
        assert option.category == REFERENCE_CATEGORY

    def test_a_game_with_no_appid_gets_no_row(self, db_session, game):
        """A game that is not on Steam, or whose link is a community URL."""
        game.steam_link = "https://steamcommunity.com/app/814380/"

        apply_extract_steam_appid(game)

        assert game.steam_appid is None
        assert derive_steamdb_source(game, db_session) is False
        assert _steamdb_row(db_session, game) is None

    def test_a_hand_entered_row_is_left_alone(self, db_session, game):
        """upsert_main_source is fill-only, so a typed url wins."""
        game.steam_appid = 814380
        upsert_main_source(
            db_session,
            game.system_id,
            "reference",
            STEAMDB_VALUE,
            "https://steamdb.info/app/typed-by-hand/",
        )
        db_session.flush()

        assert derive_steamdb_source(game, db_session) is False
        db_session.flush()

        assert (
            _steamdb_row(db_session, game).url
            == "https://steamdb.info/app/typed-by-hand/"
        )

    def test_a_second_derivation_adds_no_second_row(self, db_session, game):
        """Every save runs the write hook; the row is written once."""
        game.steam_appid = 814380

        derive_steamdb_source(game, db_session)
        db_session.flush()
        derive_steamdb_source(game, db_session)
        db_session.flush()

        rows = (
            db_session.query(models.MediaSource)
            .filter(models.MediaSource.media_id == game.system_id)
            .all()
        )
        assert len(rows) == 1


class TestWiring:
    """
    The derivation is only worth anything where it actually runs: the write
    hook behind every create and update (and the bulk Replace behind it), and
    the Fill pipeline.
    """

    def test_the_write_hook_derives_the_row(self, db_session, game, monkeypatch):
        from app.services.domain import post_processing

        # Replace's Steam half is a network call; the SteamDB row must not
        # depend on it, so it is stubbed out entirely here.
        monkeypatch.setattr(
            post_processing, "autofill_game_from_steam", lambda entry, db: None
        )
        game.steam_link = SEKIRO_STORE

        post_processing.apply_single_replace_game(db_session, game)
        db_session.flush()

        assert _steamdb_row(db_session, game).url == SEKIRO_STEAMDB

    def test_a_fill_run_derives_the_row_for_a_queued_entry(
        self, db_session, game, monkeypatch
    ):
        """
        The new-entry path, asserted the way the runner actually executes it.

        `fill()` no longer derives the row - `post_process` does, because
        fill() only ever sees entries that passed `fill_eligible`. So this
        exercises the pair in the runner's order (every queued entry through
        fill, then every entry through post_process) rather than calling
        fill() and assuming the rest.
        """
        from app.services.pipelines import specs

        monkeypatch.setattr(
            specs, "autofill_game_from_igdb", lambda entry, db: None
        )
        monkeypatch.setattr(
            specs, "autofill_game_from_steam", lambda entry, db: None
        )
        spec = specs.PIPELINES["game"]
        game.steam_appid = 814380

        # Nothing of Steam's has landed, so this entry IS queued - the mirror
        # of the already-filled case below.
        assert spec.fill_eligible(db_session, game) is True

        spec.fill(db_session, game)
        spec.post_process(game, db_session)
        db_session.flush()

        assert _steamdb_row(db_session, game).url == SEKIRO_STEAMDB

    def test_a_game_steam_has_already_filled_still_gets_its_row(
        self, db_session, game
    ):
        """
        The row has to be derived for entries Fill does NOT queue.

        `fill()` above is only ever called for an entry that passed
        `fill_eligible`, and that gate reads COLUMNS: once Steam has written a
        price, a Metacritic score or an achievement count,
        has_missing_values_game_steam is False for ever and the entry is never
        queued again. Deriving the row inside fill() therefore reached new
        entries only - 66 of 67 games with an appid had no SteamDB row, and 65
        of those were ineligible for exactly this reason.

        `metacritic_score` below is what makes this test bite: without it the
        entry is eligible, fill() would run, and the assertion would pass with
        the defect still in place.
        """
        from app.services.pipelines import specs

        spec = specs.PIPELINES["game"]
        game.steam_appid = 814380
        game.metacritic_score = 90

        assert spec.fill_eligible(db_session, game) is False
        assert spec.post_process is not None, "game spec has no post_process"

        spec.post_process(game, db_session)
        db_session.flush()

        assert _steamdb_row(db_session, game).url == SEKIRO_STEAMDB

    def test_post_processing_runs_for_an_entry_with_no_appid(
        self, db_session, game
    ):
        """
        The mirror of the test above, on the same hook: post-processing sees
        every entry in the run, so it must be a no-op for a game that has no
        Steam link at all rather than writing a row for appid None.
        """
        from app.services.pipelines import specs

        specs.PIPELINES["game"].post_process(game, db_session)
        db_session.flush()

        assert _steamdb_row(db_session, game) is None
