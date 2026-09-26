"""
What varies per media type in the Fill / Replace pipelines - and nothing else.

Read alongside runner.py: the runner owns the loop, the SSE messages, the
commit/rollback per entry, disconnect handling and audit logging; each spec
below only says which model to walk, how to tell an entry needs filling, which
external autofill to call, what to derive afterwards, and how long to pause
between external calls (Tenrai's public rate limit wants a second; TMDB/OMDb
do not).
"""

from sqlalchemy import or_

from app.models import (
    Anime,
    AnimeMovies,
    Cartoon,
    Comic,
    Game,
    HComic,
    Hentai,
    HGame,
    Manga,
    Movies,
    Novel,
    Studio,
    TVShows,
)
from app.services.calculation import (
    run_sync_anime,
    run_sync_anime_movie,
    run_sync_cartoon,
    run_sync_comic,
    run_sync_game,
    run_sync_gated_labels,
    run_sync_h_comic,
    run_sync_hentai,
    run_sync_manga,
    run_sync_novel,
    run_sync_tv_show,
)
from app.services.domain import (
    anime_movie_post_processing,
    anime_post_processing,
    apply_extract_comicvine_id,
    apply_extract_game_ids,
    apply_extract_hentai_ids,
    apply_extract_imdb_id,
    apply_extract_mal_id_anime,
    apply_extract_mal_id_manga_novel,
    apply_extract_mal_id_studio,
    apply_extract_novel_ids,
    apply_single_replace_anime,
    apply_single_replace_anime_movie,
    apply_single_replace_cartoon,
    apply_single_replace_game,
    apply_single_replace_h_comic,
    apply_single_replace_h_game,
    apply_single_replace_hentai,
    apply_single_replace_manga,
    apply_single_replace_movie,
    apply_single_replace_novel,
    apply_single_replace_tv_show,
    autofill_anime_from_mal,
    autofill_anime_movie_from_mal,
    autofill_cartoon_from_imdb,
    autofill_comic_from_comicvine,
    autofill_cover_from_steam,
    autofill_from_anilist,
    autofill_game_cover_from_igdb,
    autofill_game_from_igdb,
    autofill_game_from_steam,
    autofill_h_comic_from_mal,
    autofill_h_game_from_dlsite,
    autofill_hentai_from_anidb,
    autofill_hentai_from_mal,
    autofill_manga_from_mal,
    autofill_movie_from_imdb,
    autofill_novel_from_mal,
    autofill_novel_from_openlibrary,
    autofill_studio_from_mal,
    autofill_tv_show_from_imdb,
    cartoon_post_processing,
    derive_ep_previous_all_anime,
    game_post_processing,
    has_missing_values_anime,
    has_missing_values_anime_movie,
    has_missing_values_cartoon,
    has_missing_values_comic,
    has_missing_values_game,
    has_missing_values_game_steam,
    has_missing_values_h_comic,
    has_missing_values_h_game_dlsite,
    has_missing_values_hentai,
    has_missing_values_hentai_anidb,
    has_missing_values_manga,
    has_missing_values_movie,
    has_missing_values_novel,
    has_missing_values_novel_openlibrary,
    has_missing_values_studio,
    has_missing_values_tv_show,
    manga_post_processing,
    tv_show_post_processing,
)
from app.services.integrations import anidb
from app.services.integrations.anilist import (
    ANIME,
    MANGA,
    prime_anilist_cache,
    reset_anilist_cache,
)
from app.services.integrations.comicvine import comicvine_rate_limiter
from app.services.integrations.steam import (
    reset_owned_games_cache,
    steam_store_rate_limiter,
)
from app.services.pipelines.runner import PipelineSpec

# Tenrai (MAL) asks for ~1 request/second from unauthenticated clients.
MAL_PAUSE = 1
COMICVINE_PAUSE = 1
IGDB_PAUSE = 0.25
STEAM_PAUSE = 0.5


def _linked(model, *columns):
    """Bulk Replace only re-fetches entries that already carry an external id/link."""
    return lambda db: db.query(model).filter(or_(*[c.isnot(None) for c in columns])).all()


def _fill_anime(db, entry) -> None:
    """Tenrai first, then AniList: two sources, one pass, like _fill_game."""
    autofill_anime_from_mal(entry, force_replace_ratings=True, db=db)
    autofill_from_anilist(entry, ANIME, db)


def _fill_anime_movie(db, entry) -> None:
    autofill_anime_movie_from_mal(entry, force_replace_ratings=True, db=db)
    autofill_from_anilist(entry, ANIME, db)


def _fill_manga(db, entry) -> None:
    # The Tenrai autofill takes no session - unchanged. AniList's half needs
    # one for its media_source row, and gets it here.
    autofill_manga_from_mal(entry, force_replace_ratings=True)
    autofill_from_anilist(entry, MANGA, db)


def _fill_novel(db, entry) -> None:
    # Novel keeps its two-source routing: a mal_link means Tenrai, otherwise
    # Open Library. AniList applies to the Tenrai branch only - an entry with
    # no mal_id has nothing for AniList to key on either.
    if entry.mal_link:
        autofill_novel_from_mal(entry, force_replace_ratings=True)
        autofill_from_anilist(entry, MANGA, db)
    else:
        autofill_novel_from_openlibrary(entry, db)


def _fill_game(db, entry) -> None:
    """Both of game's sources, in order: IGDB supplies the appid that Steam
    then keys off, so a brand-new entry is complete after one pass.

    The SteamDB row is NOT derived here. It used to be, and that put it behind
    `fill_eligible`, which reads columns - so a game Steam had already filled
    was never queued and never got its row. It is `game_post_processing` now,
    which runs for every entry in the run, still after this queue, so an appid
    IGDB supplied in this pass is picked up either way."""
    autofill_game_from_igdb(entry, db)
    autofill_game_from_steam(entry, db)


def _fill_h_game(db, entry) -> None:
    """Game's two sources with DLsite in front, and the cover taken in
    priority order: DLsite, then Steam's library capsule, then IGDB.

    Every write is fill-only, so the order IS the priority. DLsite goes first.
    IGDB goes second, cover held back, because it may supply the appid Steam
    keys off. Steam then writes its columns and offers its capsule, and IGDB's
    cover is fetched last, only for an entry that still has none."""
    autofill_h_game_from_dlsite(entry, db)
    autofill_game_from_igdb(entry, db, cover=False)
    autofill_game_from_steam(entry, db)
    autofill_cover_from_steam(entry)
    autofill_game_cover_from_igdb(entry)


def _fill_hentai(db, entry) -> None:
    """MAL first, then AniDB for whatever MAL left blank.

    Both are fill-only, so the order IS the priority: MAL's cover, date and
    status win whenever MAL has them, and AniDB covers the OVAs MAL does not
    list. AniDB paces itself (anidb.MIN_INTERVAL) and asks only while
    something is still blank after MAL."""
    autofill_hentai_from_mal(entry, db=db)
    autofill_hentai_from_anidb(entry, db=db)


def _start_game_run(db) -> None:
    """
    Drops the cached Steam library so a run reads today's playtime.

    The cache exists so one run costs one library request instead of one per
    game. In a long-lived uvicorn process it would otherwise outlive the run
    that filled it, and a Replace started tomorrow would write yesterday's
    hours. Wired as `pre_run` on the game spec so it fires exactly once, at
    the start of a Fill or a Replace, before any entry is queued - never
    once per entry, and never for the single-entry write hook, which touches
    one already-fetched entry and does not walk the library at all.
    """
    reset_owned_games_cache()


PIPELINES: dict[str, PipelineSpec] = {
    "anime": PipelineSpec(
        key="anime", label="Anime", model=Anime,
        extract_id=apply_extract_mal_id_anime,
        fill_eligible=lambda db, e: e.mal_id is not None and has_missing_values_anime(e),
        fill=_fill_anime,
        pre_run=lambda db: prime_anilist_cache(db, Anime, ANIME),
        post_run=lambda db: reset_anilist_cache(),
        fill_sleep=MAL_PAUSE,
        post_process=anime_post_processing,
        fill_after=(
            ("Deriving episode counts...", derive_ep_previous_all_anime),
            ("Syncing seasonal data...", run_sync_anime),
        ),
        replace_select=_linked(Anime, Anime.mal_id, Anime.mal_link),
        replace=lambda db, e, bulk: apply_single_replace_anime(db, e, bulk=bulk),
        replace_sleep=MAL_PAUSE,
        replace_after=(
            ("Deriving episode counts...", derive_ep_previous_all_anime),
            ("Syncing seasonal data...", run_sync_anime),
        ),
        single_after=(run_sync_anime,),
    ),
    "anime-movie": PipelineSpec(
        key="anime-movie", label="Anime Movie", model=AnimeMovies,
        extract_id=apply_extract_mal_id_anime,
        fill_eligible=lambda db, e: e.mal_id is not None and has_missing_values_anime_movie(e),
        fill=_fill_anime_movie,
        pre_run=lambda db: prime_anilist_cache(db, AnimeMovies, ANIME),
        post_run=lambda db: reset_anilist_cache(),
        fill_sleep=MAL_PAUSE,
        post_process=anime_movie_post_processing,
        fill_after=(("Syncing system options...", run_sync_anime_movie),),
        replace_select=_linked(AnimeMovies, AnimeMovies.mal_id, AnimeMovies.mal_link),
        replace=lambda db, e, bulk: apply_single_replace_anime_movie(db, e),
        replace_sleep=MAL_PAUSE,
        replace_after=(("Syncing system options...", run_sync_anime_movie),),
        single_after=(run_sync_anime_movie,),
    ),
    "movie": PipelineSpec(
        key="movie", label="Movie", model=Movies,
        extract_id=apply_extract_imdb_id,
        fill_eligible=has_missing_values_movie,
        fill=lambda db, e: autofill_movie_from_imdb(e, db),
        replace_select=_linked(Movies, Movies.imdb_id, Movies.imdb_link),
        replace=lambda db, e, bulk: apply_single_replace_movie(db, e, bulk=bulk),
    ),
    "tv-show": PipelineSpec(
        key="tv-show", label="TV Show", model=TVShows,
        extract_id=apply_extract_imdb_id,
        fill_eligible=lambda db, e: has_missing_values_tv_show(e),
        fill=lambda db, e: autofill_tv_show_from_imdb(e, db),
        post_process=tv_show_post_processing,
        fill_after=(("Syncing system options...", run_sync_tv_show),),
        replace_select=_linked(TVShows, TVShows.imdb_id, TVShows.imdb_link),
        replace=lambda db, e, bulk: apply_single_replace_tv_show(db, e, bulk=bulk),
        replace_after=(("Syncing system options...", run_sync_tv_show),),
    ),
    "cartoon": PipelineSpec(
        key="cartoon", label="Cartoon", model=Cartoon,
        extract_id=apply_extract_imdb_id,
        # Only TV and Movie cartoons have a TMDB/OMDb record to fetch.
        fill_eligible=lambda db, e: e.airing_type in {"Movie", "TV"} and has_missing_values_cartoon(e),
        fill=lambda db, e: autofill_cartoon_from_imdb(e, db),
        post_process=cartoon_post_processing,
        fill_after=(("Syncing system options...", run_sync_cartoon),),
        replace_select=lambda db: db.query(Cartoon).filter(
            Cartoon.airing_type.in_(["Movie", "TV"]),
            or_(Cartoon.imdb_id.isnot(None), Cartoon.imdb_link.isnot(None)),
        ).all(),
        replace=lambda db, e, bulk: apply_single_replace_cartoon(db, e, bulk=bulk),
        replace_after=(("Syncing system options...", run_sync_cartoon),),
        single_after=(run_sync_cartoon,),
    ),
    "manga": PipelineSpec(
        key="manga", label="Manga", model=Manga,
        extract_id=apply_extract_mal_id_manga_novel,
        fill_eligible=lambda db, e: e.mal_id is not None and has_missing_values_manga(e),
        fill=_fill_manga,
        pre_run=lambda db: prime_anilist_cache(db, Manga, MANGA),
        post_run=lambda db: reset_anilist_cache(),
        fill_sleep=MAL_PAUSE,
        post_process=manga_post_processing,
        fill_after=(("Syncing system options...", run_sync_manga),),
        replace_select=_linked(Manga, Manga.mal_id, Manga.mal_link),
        replace=lambda db, e, bulk: apply_single_replace_manga(db, e, bulk=bulk),
        replace_sleep=MAL_PAUSE,
        replace_after=(("Syncing system options...", run_sync_manga),),
        single_after=(run_sync_manga,),
    ),
    "novel": PipelineSpec(
        key="novel", label="Novel", model=Novel,
        # Novel is the one type with two sources, so both extractors run.
        extract_id=apply_extract_novel_ids,
        # A mal_link means Tenrai, which returns strictly more. Open Library
        # covers only the novels MAL does not have. The `not e.mal_link`
        # guard on the second branch keeps eligibility identical to the
        # routing below: without it, a MAL-complete novel with no author
        # credit would be eligible forever and never progress. Both branches
        # test mal_link (and openlibrary_id) truthily, matching `fill`'s
        # routing and the autofill's own guard, so an empty string can't
        # disagree between them the way it would under an `is not None`
        # check.
        fill_eligible=lambda db, e: bool(
            (e.mal_link and has_missing_values_novel(e))
            or (
                not e.mal_link
                and e.openlibrary_id
                and has_missing_values_novel_openlibrary(db, e)
            )
        ),
        fill=_fill_novel,
        pre_run=lambda db: prime_anilist_cache(db, Novel, MANGA),
        post_run=lambda db: reset_anilist_cache(),
        fill_sleep=MAL_PAUSE,
        fill_after=(("Syncing system options...", run_sync_novel),),
        replace_select=_linked(Novel, Novel.mal_id, Novel.mal_link),
        replace=lambda db, e, bulk: apply_single_replace_novel(db, e, bulk=bulk),
        replace_sleep=MAL_PAUSE,
        replace_after=(("Syncing system options...", run_sync_novel),),
        single_after=(run_sync_novel,),
    ),
    "comic": PipelineSpec(
        key="comic", label="Comic", model=Comic,
        extract_id=apply_extract_comicvine_id,
        fill_eligible=lambda db, e: e.comicvine_id is not None and has_missing_values_comic(db, e),
        fill=lambda db, e: autofill_comic_from_comicvine(e, db),
        fill_sleep=COMICVINE_PAUSE,
        fill_after=(("Syncing system options...", run_sync_comic),),
        # ~200 requests/hour: stop when the budget is gone rather than block.
        budget=comicvine_rate_limiter.has_capacity,
        # Fill Comic is run on its own, never inside Fill All (quota), and there
        # is no bulk Replace: the single-entry hook only re-syncs options.
        in_fill_all=False,
        replace_select=None,
        replace=None,
        single_after=(run_sync_comic,),
        in_replace_all=False,
    ),
    "game": PipelineSpec(
        key="game", label="Game", model=Game,
        extract_id=apply_extract_game_ids,
        # Two sources with independent gates. IGDB's half is fill-only and
        # stops when its columns are full; Steam's runs while it has written
        # nothing at all. The two clauses are not independent in practice,
        # though: `_fill_game` always calls both autofills, and
        # autofill_game_from_igdb only skips on a missing igdb_id - not on
        # already-complete columns - so an entry admitted solely by the
        # Steam clause still spends its two IGDB requests. That is accepted
        # rather than gated: has_missing_values_game reads columns only, and
        # gating IGDB on it would also skip the credit/tag/Steam-pair writes
        # that legitimately still run once the columns are full.
        fill_eligible=lambda db, e: (
            (e.igdb_id is not None and has_missing_values_game(e))
            or has_missing_values_game_steam(e)
        ),
        fill=_fill_game,
        # Every entry, not just the queue: the SteamDB row is a pure
        # derivation off the appid and must not be gated on a column check
        # meant for network fetches.
        post_process=game_post_processing,
        pre_run=_start_game_run,
        # IGDB paces at 4/second; the Steam storefront's window is far
        # tighter, so it sets the pace of a game run.
        fill_sleep=STEAM_PAUSE,
        fill_after=(("Syncing system options...", run_sync_game),),
        # ~200 requests/5 minutes: stop when the window is gone rather than
        # block, the same bargain Comic Vine makes with its hourly quota.
        budget=steam_store_rate_limiter.has_capacity,
        # Both sources, as Fill: IGDB fill-only, then Steam, whose current
        # prices and Metacritic score are what Replace overwrites. An entry
        # linked to either source is selected; the Steam budget gates every
        # entry, since IGDB can hand Steam an appid mid-run.
        replace_select=_linked(
            Game, Game.steam_appid, Game.steam_link, Game.igdb_id, Game.igdb_link
        ),
        replace=lambda db, e, bulk: apply_single_replace_game(db, e, bulk=bulk),
        replace_sleep=STEAM_PAUSE,
        replace_after=(("Syncing system options...", run_sync_game),),
        single_after=(run_sync_game,),
    ),
    # Tenrai's manga record, like manga minus AniList and the ratings:
    # serialization status, the two dates, the cover, and a finished KR
    # entry's chapter total, all fill-only (autofill_h_comic_from_mal). Every
    # run and the single-entry hook end in the h-comic sync, which keeps the
    # region rule, and the gated label sync, which keeps the label on.
    "h-comic": PipelineSpec(
        key="h-comic", label="H-Comic", model=HComic,
        extract_id=apply_extract_mal_id_manga_novel,
        fill_eligible=lambda db, e: e.mal_id is not None and has_missing_values_h_comic(e),
        fill=lambda db, e: autofill_h_comic_from_mal(e, db=db),
        fill_sleep=MAL_PAUSE,
        fill_after=(
            ("Syncing h-comic invariants...", run_sync_h_comic),
            ("Syncing gated labels...", run_sync_gated_labels),
        ),
        replace_select=_linked(HComic, HComic.mal_id, HComic.mal_link),
        replace=lambda db, e, bulk: apply_single_replace_h_comic(db, e, bulk=bulk),
        replace_sleep=MAL_PAUSE,
        replace_after=(
            ("Syncing h-comic invariants...", run_sync_h_comic),
            ("Syncing gated labels...", run_sync_gated_labels),
        ),
        single_after=(run_sync_h_comic, run_sync_gated_labels),
    ),
    # Tenrai, like anime minus AniList, for three things only: airing status,
    # release date and the cover, then AniDB for whichever of them MAL left
    # blank - all fill-only (_fill_hentai). Every run and the single-entry
    # hook end in the hentai sync and the gated label sync, which keeps the
    # label on.
    "hentai": PipelineSpec(
        key="hentai", label="Hentai", model=Hentai,
        extract_id=apply_extract_hentai_ids,
        # Two gates, as h-game's: an entry with only an AniDB link is queued
        # while AniDB is enabled, and never while it is not.
        fill_eligible=lambda db, e: (
            (e.mal_id is not None and has_missing_values_hentai(e))
            or has_missing_values_hentai_anidb(e)
        ),
        fill=_fill_hentai,
        # Lifts a halt left by the previous run's AniDB error.
        pre_run=lambda db: anidb.start_run(),
        fill_sleep=MAL_PAUSE,
        # AniDB bans a client that keeps asking after an error, so the first
        # error answer (a ban above all) ends the run here, with the rest
        # reported as left for the next one.
        budget=anidb.has_capacity,
        fill_after=(
            ("Syncing system options...", run_sync_hentai),
            ("Syncing gated labels...", run_sync_gated_labels),
        ),
        replace_select=_linked(
            Hentai, Hentai.mal_id, Hentai.mal_link, Hentai.anidb_id, Hentai.anidb_link
        ),
        replace=lambda db, e, bulk: apply_single_replace_hentai(db, e, bulk=bulk),
        replace_sleep=MAL_PAUSE,
        replace_after=(
            ("Syncing system options...", run_sync_hentai),
            ("Syncing gated labels...", run_sync_gated_labels),
        ),
        single_after=(run_sync_hentai, run_sync_gated_labels),
    ),
    # Game's spec on the h-game table plus DLsite: game's two sources, gates
    # and pacing, with DLsite in front and the cover taken DLsite, then
    # Steam, then IGDB (_fill_h_game). The autofills write only the columns
    # and tags the table has (autofill.py). In Fill All and Replace All, as
    # Game is.
    "h-game": PipelineSpec(
        key="h-game", label="H-Game", model=HGame,
        extract_id=apply_extract_game_ids,
        fill_eligible=lambda db, e: (
            (e.igdb_id is not None and has_missing_values_game(e))
            or has_missing_values_game_steam(e)
            or has_missing_values_h_game_dlsite(db, e)
        ),
        fill=_fill_h_game,
        post_process=game_post_processing,
        pre_run=_start_game_run,
        fill_sleep=STEAM_PAUSE,
        fill_after=(
            ("Syncing system options...", run_sync_game),
            ("Syncing gated labels...", run_sync_gated_labels),
        ),
        budget=steam_store_rate_limiter.has_capacity,
        replace_select=_linked(
            HGame,
            HGame.steam_appid,
            HGame.steam_link,
            HGame.igdb_id,
            HGame.igdb_link,
            HGame.dlsite_link_jp,
            HGame.dlsite_link_tw,
        ),
        replace=lambda db, e, bulk: apply_single_replace_h_game(db, e, bulk=bulk),
        replace_sleep=STEAM_PAUSE,
        replace_after=(
            ("Syncing system options...", run_sync_game),
            ("Syncing gated labels...", run_sync_gated_labels),
        ),
        single_after=(run_sync_game, run_sync_gated_labels),
    ),
    "studio": PipelineSpec(
        key="studio", label="Studio", model=Studio,
        # Not a media entry: nothing to post-process and nothing to sync
        # afterwards. It does have an id to derive - a producer URL is
        # /anime/producer/<id>/<slug>, which needs its own pattern.
        extract_id=apply_extract_mal_id_studio,
        fill_eligible=lambda db, e: e.mal_id is not None and has_missing_values_studio(e),
        fill=lambda db, e: autofill_studio_from_mal(e),
        fill_sleep=MAL_PAUSE,
        fill_only=True,
        in_replace_all=False,
    ),
}

FILL_ALL = [s for s in PIPELINES.values() if s.in_fill_all]
REPLACE_ALL = [s for s in PIPELINES.values() if s.in_replace_all]
