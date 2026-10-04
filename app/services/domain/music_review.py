"""
Music review query: every anime whose music tracking is waiting on something.

The music sections (app/utils/note_sections.py) are notes: one `music_status`
row per anime per song list, carrying the LIST's status, and any number of
song rows on the four song lists, each carrying its own. An anime is listed
when either kind of row holds one of FLAGGED_MUSIC_STATUSES.

Not filtered by author. The music sections are CATALOGUE notes - one shared
set of rows per anime, whoever wrote each one - so "my" music rows is not a
question the data can answer, and filtering by author would hide a row the
page shows everybody.
"""

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import Anime, Note
from app.utils.note_sections import MUSIC_STATUS_SECTION, MUSIC_TYPE_KEYS

# The statuses that mean "come back to this". "Not Done" is not one of them:
# it is where every list starts, so it would list every anime there is.
# Done and All Done are finished.
FLAGGED_MUSIC_STATUSES: tuple[str, ...] = ("Need", "Pending", "No Full Version")


def _song_order(note: Note) -> tuple:
    return (
        MUSIC_TYPE_KEYS.index(note.section),
        note.sort_index is None,
        note.sort_index or 0,
        note.created_at,
    )


def find_flagged_music(db: Session) -> list[dict]:
    """
    One row per anime with a flagged song list or song, by display name.

    Each row names the anime (system_id, public_id, its CN and EN names and
    display name) and lists only what is flagged: `lists` in song-list order,
    `songs` in song-list order and then the order the notes page shows.
    """
    notes = (
        db.query(Note)
        .filter(
            Note.media_id.isnot(None),
            Note.status.in_(FLAGGED_MUSIC_STATUSES),
            or_(
                Note.section == MUSIC_STATUS_SECTION,
                Note.section.in_(MUSIC_TYPE_KEYS),
            ),
        )
        .all()
    )
    if not notes:
        return []

    by_anime: dict = {}
    for note in notes:
        by_anime.setdefault(note.media_id, []).append(note)

    anime = db.query(Anime).filter(Anime.system_id.in_(list(by_anime))).all()
    rows = []
    for entry in anime:
        mine = by_anime[entry.system_id]
        lists = sorted(
            (n for n in mine if n.section == MUSIC_STATUS_SECTION and n.kind in MUSIC_TYPE_KEYS),
            key=lambda n: MUSIC_TYPE_KEYS.index(n.kind),
        )
        songs = sorted((n for n in mine if n.section in MUSIC_TYPE_KEYS), key=_song_order)
        rows.append(
            {
                "system_id": entry.system_id,
                "public_id": entry.public_id,
                "anime_name_cn": entry.anime_name_cn,
                "anime_name_en": entry.anime_name_en,
                "display_name": entry.display_name,
                "lists": [{"kind": n.kind, "status": n.status} for n in lists],
                "songs": [
                    {
                        "section": n.section,
                        "title": n.title,
                        "status": n.status,
                        "locator": n.locator,
                    }
                    for n in songs
                ],
            }
        )
    rows.sort(key=lambda r: (r["display_name"] or "").lower())
    return rows
