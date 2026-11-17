"""
Write-through and read-back for the `remark` field.

An entry's or a group's `remark` is the singleton catalogue `remark` row in
`note`, not a column on the owner tables. The Add form, the Modify form and
the detail pages post a plain `remark` string to the owner's own endpoint,
behind manage.catalog, so every write path pops it out of the payload and
lands it here (upsert_remark). Reads attach it per request (attach_remark),
onto the plain `remark` attribute app/models/__init__.py defaults to None.
"""

import uuid
from typing import Any, Optional, Tuple

from sqlalchemy.orm import Session

from app.database import get_taipei_now
from app.models import Note
from app.utils.media_resolver import TIER_TABLES

REMARK_SECTION = "remark"

# The owner is four nullable FK columns on `note` now, not an (owner_type,
# owner_id) pair; callers still speak the pair, so it is translated here.
_TIER_COLUMNS = {
    "collection": "collection_id",
    "franchise": "franchise_id",
    "series": "series_id",
}


def _owner_columns(owner_type: str, owner_id: Any) -> dict:
    if owner_type in TIER_TABLES:
        return {_TIER_COLUMNS[owner_type]: owner_id}
    return {"media_id": owner_id}


def pop_remark(data: dict) -> Tuple[dict, Optional[str], bool]:
    """
    Split `remark` out of a write payload.

    Returns the payload without it, its value, and whether the key was present
    at all. The third value matters: a PATCH that never mentions `remark` must
    leave the note row alone, while a PUT that sends null must clear it.
    """
    if "remark" not in data:
        return data, None, False
    rest = {k: v for k, v in data.items() if k != "remark"}
    return rest, data["remark"], True


def upsert_remark(
    db: Session,
    owner_type: str,
    owner_id: Any,
    text: Optional[str],
    author_id: Any,
) -> None:
    """
    Create, update or clear one owner's singleton remark note.

    Empty or whitespace-only text deletes the row rather than storing a blank
    one, so a cleared remark leaves no empty section on the notes page. The
    text itself is stored as typed - only the emptiness test is stripped.

    `remark` is a catalogue-scope section: one shared row per owner, which
    ix_note_one_remark_per_owner enforces. So this looks the row up by owner
    alone, and whoever writes it edits that one row. `author_id` is stamped on
    a row this creates and left alone on one it edits, as every catalogue note
    keeps the account that first wrote it. Every caller sits behind
    manage.catalog; this function does not check it.
    """
    owner_columns = _owner_columns(owner_type, owner_id)
    row = (
        db.query(Note)
        .filter(
            *[getattr(Note, name) == value for name, value in owner_columns.items()],
            Note.section == REMARK_SECTION,
        )
        .first()
    )

    if not (text or "").strip():
        if row:
            db.delete(row)
        return

    if row:
        row.content = text
        row.updated_at = get_taipei_now()
        return

    db.add(
        Note(
            system_id=uuid.uuid4(),
            **owner_columns,
            section=REMARK_SECTION,
            content=text,
            sort_index=0.0,
            author_id=author_id,
        )
    )


# ---------------------------------------------------------------------------
# Read side
# ---------------------------------------------------------------------------


def attach_remark(db: Session, owner_type: str, entries) -> None:
    """
    Set `remark` on one entry or a page of them.

    `remark` is a catalogue-scope section, so every viewer - a logged-out one
    included - reads the same row. Whether the viewer may see the owner at all
    is the calling route's check, made before this runs.

    ONE query for the whole page, never one per entry - the rule
    attach_list_fields and attach_link_fields already follow.

    Every entry is blanked FIRST and then filled from the query. An entry the
    query does not match must read None, not keep whatever a previous request
    left on a cached instance - and `remark` is a plain attribute, not a
    mapped column, so nothing else would clear it.
    """
    rows = entries if isinstance(entries, list) else [entries]
    if not rows:
        return
    for entry in rows:
        entry.remark = None

    column = _TIER_COLUMNS.get(owner_type, "media_id")
    ids = [entry.system_id for entry in rows]
    owner_column = getattr(Note, column)
    found = {
        owner_id: content
        for owner_id, content in db.query(owner_column, Note.content).filter(
            owner_column.in_(ids),
            Note.section == REMARK_SECTION,
        )
    }
    for entry in rows:
        if entry.system_id in found:
            entry.remark = found[entry.system_id]
