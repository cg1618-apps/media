"""Remark review query."""

import logging
from dataclasses import dataclass

from sqlalchemy.orm import Session

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
    Note,
    Novel,
    TVShows,
)
from app.services.domain.user_list import STATUS_FIELD, attach_list_fields
from app.services.domain.watch_order import release_display

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _RemarkTab:
    """One media type's rows: which model, and which columns the page shows."""

    key: str  # the response key, underscored
    media_type: str  # the hyphenated type key attach_list_fields takes
    model: type
    fields: tuple[str, ...]


# Names first, in the order the page shows them, then the type's own
# disambiguating columns. Every row also carries system_id, public_id, the
# type's status and the remark (see _row). EN leads for comic, whose display
# name falls back EN -> CN -> Alt; every other type leads with CN.
_TABS: tuple[_RemarkTab, ...] = (
    _RemarkTab("anime", "anime", Anime,
               ("anime_name_cn", "anime_name_en", "airing_type")),
    _RemarkTab("anime_movie", "anime-movie", AnimeMovies,
               ("anime_movie_name_cn", "anime_movie_name_en")),
    _RemarkTab("movie", "movie", Movies, ("movie_name_cn", "movie_name_en")),
    _RemarkTab("tv_show", "tv-show", TVShows,
               ("tv_name_cn", "tv_name_en", "season_part")),
    _RemarkTab("cartoon", "cartoon", Cartoon,
               ("cartoon_name_cn", "cartoon_name_en", "airing_type")),
    _RemarkTab("manga", "manga", Manga,
               ("manga_name_cn", "manga_name_en", "is_main")),
    _RemarkTab("novel", "novel", Novel,
               ("novel_name_cn", "novel_name_en", "is_main")),
    _RemarkTab("comic", "comic", Comic,
               ("comic_name_en", "comic_name_cn", "volume_label")),
    _RemarkTab("game", "game", Game,
               ("game_name_cn", "game_name_en", "game_type")),
    _RemarkTab("h_comic", "h-comic", HComic,
               ("h_comic_name_cn", "h_comic_name_en", "region")),
    _RemarkTab("hentai", "hentai", Hentai,
               ("hentai_name_cn", "hentai_name_en", "series_number")),
    _RemarkTab("h_game", "h-game", HGame,
               ("h_game_name_cn", "h_game_name_en", "game_type")),
)


def _row(tab: _RemarkTab, entry, remark: str) -> dict:
    status_field = STATUS_FIELD[tab.media_type]
    row = {"system_id": str(entry.system_id), "public_id": entry.public_id}
    row.update({name: getattr(entry, name) for name in tab.fields})
    if tab.media_type == "movie":
        # The stored date, USA first and TW as the fallback - never an
        # invented day (release_display).
        row["release_date"] = release_display(entry, "movie")
    row[status_field] = getattr(entry, status_field)
    row["remark"] = remark
    return row


def find_all_remarks(db: Session, author_id=None) -> dict:
    """
    Every entry carrying a non-empty remark, grouped by media type - all twelve.

    THE CALLER'S OWN remarks, not everybody's. `remark` is a personal-scope
    note and belongs to its author (decision 12); this is a review screen for
    the operator's own writing, and the response shape carries one remark per
    entry, which only has a meaning once a author is fixed. With a single
    account - the case this installation has been in all along - the answer is
    identical to the old one.

    author_id=None returns nothing rather than everything. There is no caller
    for whom "somebody's remarks, unspecified" is the right answer, and
    failing open here would publish every account's private assessments to a
    screen that used to show only one person's.

    Only `section == 'remark'` counts: the list-shaped personal sections are
    not remarks, however much they read like one.

    The status is the CALLER's, read from `user_media_list` through
    `attach_list_fields`: no detail table has a status column, so an instance
    loaded here carries none until that runs. An entry the caller never
    listed reads its type's default status.

    The two-step query is not an oversight. The remark is a note row, not a
    column, so the ids come from `note` first and the entries second.
    """
    remarks: dict = {}
    if author_id is not None:
        for owner_id, content in db.query(Note.media_id, Note.content).filter(
            Note.section == "remark",
            Note.media_id.isnot(None),
            Note.author_id == author_id,
            Note.content.isnot(None),
            Note.content != "",
        ):
            remarks[owner_id] = content

    result: dict = {}
    for tab in _TABS:
        entries = []
        if remarks:
            entries = (
                db.query(tab.model)
                .filter(tab.model.system_id.in_(list(remarks)))
                .order_by(tab.model.updated_at.desc())
                .all()
            )
            attach_list_fields(db, tab.media_type, entries, author_id)
        result[tab.key] = [
            _row(tab, entry, remarks[entry.system_id]) for entry in entries
        ]
    return result
