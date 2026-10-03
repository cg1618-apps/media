"""
The per-list music statuses an anime starts with.

Every anime has one `music_status` note row per song list - OP, ED, insert
songs, OST - saying how far tracking that whole list has got. The rows are
created with the anime rather than on first edit, so the music card always has
a status to show and to PATCH, and so a fresh anime reads "Not Done" from the
database rather than from a default the page has to know.

Which lists and which starting status are the registry's: the music_status
section's `kinds` and `default_status` in app/utils/note_sections.py.
"""

import uuid

from sqlalchemy.orm import Session

from app import models
from app.utils.note_sections import MUSIC_STATUS_SECTION, section_by_key


def seed_music_status(db: Session, entry, viewer) -> None:
    """
    Add one music_status row per song list to a newly created anime.

    A catalogue note is authored by whoever writes it, so the rows are the
    creating viewer's. Called inside the create transaction, after the flush
    that writes the anime's `media` row - note.media_id points at it.
    """
    author_id = getattr(viewer, "user_id", None)
    if author_id is None:
        # author_id is NOT NULL, and a create with nobody behind it has no one
        # to file the rows under. The music card still offers the default.
        return
    section = section_by_key(MUSIC_STATUS_SECTION)
    for position, kind in enumerate(section.kinds):
        db.add(
            models.Note(
                system_id=uuid.uuid4(),
                media_id=entry.system_id,
                author_id=author_id,
                section=section.key,
                kind=kind,
                status=section.default_status,
                sort_index=float(position),
            )
        )
