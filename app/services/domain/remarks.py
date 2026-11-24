"""Remark review query."""

import logging
from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    Anime,
    AnimeMovies,
    Book,
    Cartoon,
    Comic,
    Game,
    HComic,
    Hentai,
    HGame,
    Manga,
    Movies,
    Note,
    TVShows,
)
from app.services.domain.order import release_display
from app.services.domain.user_list import STATUS_FIELD, attach_list_fields

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
# type's status and its remarks (see _row). EN leads for comic, whose display
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
    _RemarkTab("book", "book", Book,
               ("book_name_cn", "book_name_en", "is_main")),
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


def _row(tab: _RemarkTab, entry, remarks: list[str]) -> dict:
    status_field = STATUS_FIELD[tab.media_type]
    row = {"system_id": str(entry.system_id), "public_id": entry.public_id}
    row.update({name: getattr(entry, name) for name in tab.fields})
    if tab.media_type == "movie":
        # The stored date, USA first and TW as the fallback - never an
        # invented day (release_display).
        row["release_date"] = release_display(entry, "movie")
    row[status_field] = getattr(entry, status_field)
    row["remarks"] = remarks
    return row


def find_all_remarks(db: Session, viewer_id=None) -> dict:
    """
    Every entry carrying at least one non-empty remark, grouped by media type
    - all twelve. Each row's `remarks` lists every one of the entry's 備註
    rows, in the order the notes page shows them.

    `remark` is a catalogue-scope list section, shared, so the remarks are the
    same for every caller. Only `section == 'remark'` counts: 個人筆記
    Personal Notes and the other personal sections are not remarks, however
    much they read like one.

    The status is the CALLER's (viewer_id), read from `user_media_list`
    through `attach_list_fields`: no detail table has a status column, so an
    instance loaded here carries none until that runs. An entry the caller
    never listed reads its type's default status.

    The two-step query is not an oversight. A remark is a note row, not a
    column, so the ids come from `note` first and the entries second.
    """
    remarks: dict = defaultdict(list)
    rows = (
        db.query(Note.media_id, Note.content)
        .filter(
            Note.section == "remark",
            Note.media_id.isnot(None),
            Note.content.isnot(None),
            Note.content != "",
        )
        # The notes page's order (note._ordered): a NULL sort_index reads as
        # 0. created_at only makes a tie deterministic.
        .order_by(func.coalesce(Note.sort_index, 0), Note.created_at)
    )
    for owner_id, content in rows:
        remarks[owner_id].append(content)

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
            attach_list_fields(db, tab.media_type, entries, viewer_id)
        result[tab.key] = [
            _row(tab, entry, remarks[entry.system_id]) for entry in entries
        ]
    return result
