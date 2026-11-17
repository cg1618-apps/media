"""Anime movie derivations.

An ONA streams on one date everywhere, so it has one release date. It is held
in both `release_date_jp` and `release_date_tw`, which this keeps equal on
every write, so every reader of either column - the list pages, the Coming
Next tracker, the sheet - sees the same date without knowing about ONA. A
Cinema release keeps the two apart.
"""

from sqlalchemy import inspect

from app.utils.constants import ANIME_MOVIE_ONA


def sync_ona_release_date(db, entry) -> None:
    """
    Make an ONA's two release dates one.

    The date written in this request wins: a write that changes only the TW
    date carries it to JP, and anything else - a change to JP, a change to
    both, or switching a Cinema release to ONA - carries JP to TW. JP is the
    fallback because it is the date MAL fills.
    """
    if entry.release_type != ANIME_MOVIE_ONA:
        return
    attrs = inspect(entry).attrs
    tw_changed = attrs.release_date_tw.history.has_changes()
    jp_changed = attrs.release_date_jp.history.has_changes()
    if tw_changed and not jp_changed:
        entry.release_date_jp = entry.release_date_tw
    elif entry.release_date_jp is not None or jp_changed:
        entry.release_date_tw = entry.release_date_jp
    else:
        entry.release_date_jp = entry.release_date_tw
