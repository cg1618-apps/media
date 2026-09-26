"""Per-entry post-processing, single-entry replace, and franchise-wide derive-related orchestration."""

import logging

from sqlalchemy.orm import Session

from app.models import (
    Anime,
    AnimeMovies,
    Cartoon,
    Game,
    Manga,
    Media,
    Movies,
    Novel,
    TVShows,
)
from app.services.domain.autofill import (
    autofill_anime_from_mal,
    autofill_anime_movie_from_mal,
    autofill_cartoon_from_imdb,
    autofill_from_anilist,
    autofill_game_from_igdb,
    autofill_game_from_steam,
    autofill_h_comic_from_mal,
    autofill_hentai_from_mal,
    autofill_manga_from_mal,
    autofill_movie_from_imdb,
    autofill_novel_from_mal,
    autofill_tv_show_from_imdb,
)
from app.services.domain.checking import (
    apply_check_baha,
    apply_validate_ch_math,
    apply_validate_episode_math,
    apply_validate_vol_math,
)
from app.services.domain.derivation import (
    apply_calculate_seasonal_from_month,
    apply_extract_game_ids,
    apply_extract_imdb_id,
    apply_extract_mal_id_anime,
    apply_extract_mal_id_manga_novel,
    apply_extract_novel_ids,
    apply_extract_season_from_title,
    derive_ep_previous_anime,
    derive_season_1_anime,
    derive_season_1_cartoon,
    derive_season_1_tv_show,
    derive_steamdb_source,
)
from app.services.integrations.anilist import ANIME, MANGA

logger = logging.getLogger(__name__)


def apply_single_replace_anime(
    db: Session, anime: Anime, bulk: bool = False, force_replace_ratings: bool = True
) -> None:
    """
    Core 'Replace' logic for a single anime entry.
    When bulk=False (single-entry update), also derives ep_previous across every
    acg franchise. When bulk=True (batch replace), the caller does that once
    after the loop instead of per entry.
    """
    apply_extract_mal_id_anime(anime)
    autofill_anime_from_mal(
        anime, force_replace_ratings=force_replace_ratings, db=db
    )
    autofill_from_anilist(anime, ANIME, db)
    anime_post_processing(anime, db)

    if not bulk:
        derive_ep_previous_all_anime(db)


def apply_single_replace_anime_movie(
    db: Session,
    anime_movie: AnimeMovies,
    force_replace_ratings: bool = True,
) -> None:
    """
    Core 'Replace' logic for a single AnimeMovies entry.
    Used by both single-entry and bulk replace paths.
    """
    apply_extract_mal_id_anime(anime_movie)
    autofill_anime_movie_from_mal(
        anime_movie, force_replace_ratings=force_replace_ratings, db=db
    )
    autofill_from_anilist(anime_movie, ANIME, db)
    anime_movie_post_processing(anime_movie, db)


def apply_single_replace_h_comic(db: Session, h_comic, bulk: bool = False) -> None:
    """
    Core 'Replace' logic for a single h-comic entry: manga's Tenrai fields,
    fill-only. No AniList, and nothing derived afterwards - the region rule
    and the label are the spec's syncs. `bulk` is kept for signature parity
    with the other media types.
    """
    apply_extract_mal_id_manga_novel(h_comic)
    autofill_h_comic_from_mal(h_comic, db=db)


def apply_single_replace_hentai(db: Session, hentai, bulk: bool = False) -> None:
    """
    Core 'Replace' logic for a single hentai entry: Tenrai's three fields,
    fill-only like anime's. No AniList, and nothing derived afterwards.
    `bulk` is kept for signature parity with the other media types.
    """
    apply_extract_mal_id_anime(hentai)
    autofill_hentai_from_mal(hentai, db=db)


def apply_single_replace_movie(db: Session, movie: Movies, bulk: bool = False) -> None:
    """Core 'Replace' logic for a single Movies entry."""
    apply_extract_imdb_id(movie)
    autofill_movie_from_imdb(movie, db)


def apply_single_replace_tv_show(
    db: Session, tv_show: TVShows, bulk: bool = False
) -> None:
    """
    Core 'Replace' logic for a single TVShows entry.
    Nothing is derived franchise-wide any more - watch order was the only such
    field and it moved to watch_order_list - so `bulk` no longer changes what
    this does. It is kept for signature parity with the other media types.
    """
    apply_extract_imdb_id(tv_show)
    autofill_tv_show_from_imdb(tv_show, db)
    tv_show_post_processing(tv_show, db)


def apply_single_replace_cartoon(
    db: Session, cartoon: Cartoon, bulk: bool = False
) -> None:
    """
    Core 'Replace' logic for a single Cartoon entry.
    Nothing is derived franchise-wide any more - watch order was the only such
    field and it moved to watch_order_list - so `bulk` no longer changes what
    this does. It is kept for signature parity with the other media types.
    """
    apply_extract_imdb_id(cartoon)
    autofill_cartoon_from_imdb(cartoon, db)
    cartoon_post_processing(cartoon, db)


def apply_single_replace_manga(db: Session, manga: Manga, bulk: bool = False) -> None:
    """
    Core 'Replace' logic for a single Manga entry.
    Nothing is derived franchise-wide for manga; `bulk` is accepted for
    signature parity with the other media types.
    """
    apply_extract_mal_id_manga_novel(manga)
    autofill_manga_from_mal(manga, force_replace_ratings=True)
    autofill_from_anilist(manga, MANGA, db)
    manga_post_processing(manga, db)



def apply_single_replace_novel(db: Session, novel: Novel, bulk: bool = False) -> None:
    """
    Core 'Replace' logic for a single Novel entry.
    No post_processing and nothing derived franchise-wide — novel has neither.

    Both ids are derived, but only MAL is re-fetched: Replace is deliberately
    not wired to Open Library. Deriving openlibrary_id here anyway keeps the id
    in step with its link, so the next Fill has something to key off.
    """
    apply_extract_novel_ids(novel)
    autofill_novel_from_mal(novel, force_replace_ratings=True)
    autofill_from_anilist(novel, MANGA, db)


def apply_single_replace_game(db: Session, game, bulk: bool = False) -> None:
    """
    Core 'Replace' logic for a single Game or HGame entry: IGDB, then Steam.

    Both sources, in the Fill's order, so the detail page's Autofill button
    finishes an entry in one press - IGDB can supply the appid Steam then keys
    off. IGDB stays fill-only here as it is in Fill: nothing it carries
    drifts, so Replace keeps what is already set, the same bargain the MAL
    Replace makes with everything but its scores. Steam's current prices and
    Metacritic score are what Replace overwrites. `bulk` is accepted for
    signature parity with the other media types.

    The SteamDB row is derived before the Steam fetch, not after it: it needs
    only the appid, so a storefront that is down or rate-limited must not cost
    the entry its link.
    """
    apply_extract_game_ids(game)
    autofill_game_from_igdb(game, db)
    derive_steamdb_source(game, db)
    autofill_game_from_steam(game, db)


def anime_post_processing(anime: Anime, db: Session) -> None:
    apply_validate_episode_math(anime)
    apply_check_baha(db, anime, "anime")

    # No completion check here any more. Whether an entry is finished is one
    # person's fact and lives on their user_media_list row; a pipeline that
    # decided it would be silently rewriting somebody's list. What a pipeline
    # may still say is that the WORK has finished airing, and only when the
    # source it fetched from says so - which autofill already writes.

    if (
        anime.release_season is None
        and anime.release_date is not None
        and anime.airing_type == "TV"
    ):
        apply_calculate_seasonal_from_month(anime)

    if anime.season_part is None:
        apply_extract_season_from_title(anime)
        derive_season_1_anime(anime, db)


def anime_movie_post_processing(anime_movie: AnimeMovies, db: Session) -> None:
    apply_check_baha(db, anime_movie, "anime-movie")
    # No completion check here any more - see anime_post_processing.


def tv_show_post_processing(tv_show: TVShows, db: Session) -> None:
    apply_validate_episode_math(tv_show)

    # No completion check here any more - see anime_post_processing.

    if tv_show.season_part is None:
        apply_extract_season_from_title(tv_show)
        derive_season_1_tv_show(tv_show, db)


def cartoon_post_processing(cartoon: Cartoon, db: Session) -> None:
    apply_validate_episode_math(cartoon)

    # No completion check here any more - see anime_post_processing.

    if cartoon.season_part is None:
        apply_extract_season_from_title(cartoon)
        derive_season_1_cartoon(cartoon, db)


def manga_post_processing(manga: Manga, db: Session) -> None:
    """Runs all single-entry checks and repairs for one manga entry."""
    apply_validate_vol_math(manga)
    apply_validate_ch_math(manga)

    # No completion check here any more - see anime_post_processing.


def game_post_processing(game: Game, db: Session) -> None:
    """
    The SteamDB row, for every game in the run rather than every game Fill
    queued.

    Post-processing is the right home for it because it needs no fetch: the
    appid is the whole of a SteamDB URL, so there is no external call to gate
    and no reason to make the row wait on one. `fill_eligible` reads columns,
    and `has_missing_values_game_steam` is deliberately "Steam has written
    nothing at all" - so once a game has a price, a Metacritic score or an
    achievement count it is never queued again, and a row derived inside
    fill() would never reach it.

    The appid itself is already in place by the time this runs: `extract_id`
    is applied to every entry before the queue is built, not to the queue.
    Running after the queue also means an appid IGDB supplied earlier in this
    same pass is picked up.
    """
    derive_steamdb_source(game, db)


def derive_ep_previous_all_anime(db: Session) -> None:
    """Derives ep_previous for every acg franchise.

    Was derive_related_anime, which also assigned watch_order. Ordering moved
    to watch_order_list / watch_order_item, where it is curated rather than
    guessed, so ep_previous is all that is still derived franchise-wide.
    """
    rows = (
        db.query(Media.franchise_id)
        .filter(Media.media_type == "anime", Media.franchise_id.isnot(None))
        .distinct()
        .all()
    )
    franchise_ids = [r[0] for r in rows]
    for fid in franchise_ids:
        derive_ep_previous_anime(db, fid)
    if franchise_ids:
        db.commit()


