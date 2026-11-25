"""
An entity's remarks: the catalogue's 備註 Remark list on a studio, publisher,
person, character or identity.

Each entity once held one `remark` column. That became the first row of its
Remark list (revision e1n2tremark3), and a remark arriving any other way - a
cast row's remark synced up to its original, an older sheet's entity tab
pulled back - is added to the list the same way, here. A row already in the
list is never written twice.
"""

import uuid
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.models.note import ENTITY_NOTE_COLUMNS

REMARK_SECTION = "remark"

# Pull stashes an older sheet's entity remark cells here (Session.info), and
# convert_stashed_remarks turns them into Remark rows once every tab - the
# Note tab among them - has been restored.
STASH_KEY = "legacy_entity_remarks"

# The sheet tabs of the five entities.
ENTITY_TABS: dict[str, str] = {
    "Studio": "studio",
    "Publisher": "publisher",
    "Person": "person",
    "Character": "character",
    "Character Identity": "identity",
}


def _remark_rows(db: Session, owner_type: str, owner_id):
    column = getattr(models.Note, ENTITY_NOTE_COLUMNS[owner_type])
    return db.query(models.Note).filter(
        column == owner_id,
        models.Note.section == REMARK_SECTION,
        models.Note.personal.is_(False),
    )


def has_remark(db: Session, owner_type: str, owner_id) -> bool:
    """Whether the entity's Remark list holds any row."""
    return db.query(_remark_rows(db, owner_type, owner_id).exists()).scalar()


def remark_author_id(db: Session) -> Optional[uuid.UUID]:
    """
    Who a remark written by no one in particular is attributed to: the
    installation's owner - whose rows a restore or a pipeline writes
    (user_list.installation_owner_id).
    """
    from app.services.domain.user_list import installation_owner_id

    return installation_owner_id(db)


def add_remark(
    db: Session, owner_type: str, owner_id, text: str, author_id=None
) -> bool:
    """
    Append `text` to the entity's Remark list, unless a row already says it.
    Returns whether a row was added. Does not commit.
    """
    text = (text or "").strip()
    if not text:
        return False
    rows = _remark_rows(db, owner_type, owner_id)
    if rows.filter(func.btrim(models.Note.content) == text).first() is not None:
        return False
    author_id = author_id or remark_author_id(db)
    if author_id is None:
        return False
    last = rows.with_entities(func.max(models.Note.sort_index)).scalar()
    next_index = (last if last is not None else -1) + 1
    db.add(
        models.Note(
            system_id=uuid.uuid4(),
            section=REMARK_SECTION,
            content=text,
            links=[],
            sort_index=next_index,
            author_id=author_id,
            personal=False,
            **{ENTITY_NOTE_COLUMNS[owner_type]: owner_id},
        )
    )
    db.flush()
    return True


def stash_legacy_remark(db: Session, tab_name: str, row: dict) -> None:
    """Keep an older sheet's entity remark cell for convert_stashed_remarks."""
    owner_type = ENTITY_TABS.get(tab_name)
    text = (row.get("remark") or "").strip() if isinstance(row.get("remark"), str) else ""
    if owner_type and text and row.get("system_id"):
        db.info.setdefault(STASH_KEY, []).append((owner_type, row["system_id"], text))


def convert_stashed_remarks(db: Session) -> int:
    """
    Turn every stashed remark into a Remark row of its entity, when the entity
    exists and its list holds no row yet. Clears the stash. Does not commit.
    """
    added = 0
    for owner_type, owner_id, text in db.info.pop(STASH_KEY, []):
        model = {
            "studio": models.Studio,
            "publisher": models.Publisher,
            "person": models.Person,
            "character": models.Character,
            "identity": models.CharacterIdentity,
        }[owner_type]
        if db.get(model, owner_id) is None or has_remark(db, owner_type, owner_id):
            continue
        added += add_remark(db, owner_type, owner_id, text)
    return added


def move_entity_notes(db: Session, owner_type: str, keep_id, drop_id) -> None:
    """
    A merge's loser's notes - its Remark rows and every viewer's personal
    notes - onto the survivor, after the survivor's own rows in each section,
    before the loser's delete would cascade them away. Does not commit.
    """
    column = ENTITY_NOTE_COLUMNS.get(owner_type)
    if column is None:
        return
    keep_col = getattr(models.Note, column)
    for note in (
        db.query(models.Note).filter(keep_col == drop_id).order_by(models.Note.sort_index)
    ):
        last = (
            db.query(func.max(models.Note.sort_index))
            .filter(keep_col == keep_id, models.Note.section == note.section)
            .scalar()
        )
        setattr(note, column, keep_id)
        note.sort_index = (last if last is not None else -1) + 1
        db.flush()
