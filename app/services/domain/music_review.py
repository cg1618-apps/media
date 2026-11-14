"""
Music review query: every anime whose music tracking is waiting on something,
for the asking viewer.

The music sections (app/utils/note_sections.py) are catalogue notes: one
`music_status` row per anime per song list, and any number of song rows on
the four song lists. How far tracking a list or a song has got is NOT the
row's - it is each viewer's own status, in that viewer's note_mark for the
row (note_sections: `personal_status`, granted by the `music_status`
feature). So an anime is listed when the VIEWER's own status on one of its
lists or songs is one of FLAGGED_MUSIC_STATUSES, and a viewer without the
feature, having no music status at all, is listed nothing.
"""

from sqlalchemy.orm import Session

from app.models import Anime, Note, NoteMark
from app.services.rbac import features
from app.utils.note_sections import (
    MUSIC_STATUS_SECTION,
    MUSIC_TYPE_KEYS,
    PERSONAL_STATUS_KEY,
)

# The statuses that mean "come back to this". "Not Done" is not one of them:
# it is where every list starts, so it would list every anime there is.
# Done and All Done are finished.
FLAGGED_MUSIC_STATUSES: tuple[str, ...] = ("Need", "Pending", "No Full Version")

MUSIC_FEATURE = "music_status"


def _song_order(note: Note) -> tuple:
    return (
        MUSIC_TYPE_KEYS.index(note.section),
        note.sort_index is None,
        note.sort_index or 0,
        note.created_at,
    )


def find_flagged_music(db: Session, viewer) -> list[dict]:
    """
    One row per anime with a list or a song the viewer has flagged, by
    display name.

    Each row names the anime (system_id, public_id, its CN and EN names and
    display name) and lists only what is flagged, with the viewer's status:
    `lists` in song-list order, `songs` in song-list order and then the order
    the notes page shows.
    """
    user_id = getattr(viewer, "user_id", None)
    if user_id is None or not features.has_feature(db, viewer, MUSIC_FEATURE):
        return []
    status = NoteMark.values[PERSONAL_STATUS_KEY].astext
    flagged = (
        db.query(Note, status)
        .join(NoteMark, NoteMark.note_id == Note.system_id)
        .filter(
            NoteMark.user_id == user_id,
            Note.media_id.isnot(None),
            status.in_(FLAGGED_MUSIC_STATUSES),
            Note.section.in_((MUSIC_STATUS_SECTION, *MUSIC_TYPE_KEYS)),
        )
        .all()
    )
    if not flagged:
        return []

    by_anime: dict = {}
    for note, value in flagged:
        by_anime.setdefault(note.media_id, []).append((note, value))

    anime = db.query(Anime).filter(Anime.system_id.in_(list(by_anime))).all()
    rows = []
    for entry in anime:
        mine = by_anime[entry.system_id]
        lists = sorted(
            (
                (n, v)
                for n, v in mine
                if n.section == MUSIC_STATUS_SECTION and n.kind in MUSIC_TYPE_KEYS
            ),
            key=lambda pair: MUSIC_TYPE_KEYS.index(pair[0].kind),
        )
        songs = sorted(
            ((n, v) for n, v in mine if n.section in MUSIC_TYPE_KEYS),
            key=lambda pair: _song_order(pair[0]),
        )
        rows.append(
            {
                "system_id": entry.system_id,
                "public_id": entry.public_id,
                "anime_name_cn": entry.anime_name_cn,
                "anime_name_en": entry.anime_name_en,
                "display_name": entry.display_name,
                "lists": [{"kind": n.kind, "status": v} for n, v in lists],
                "songs": [
                    {
                        "section": n.section,
                        "title": n.title,
                        "status": v,
                        "locator": n.locator,
                    }
                    for n, v in songs
                ],
            }
        )
    rows.sort(key=lambda r: (r["display_name"] or "").lower())
    return rows
