"""
待補充 Needs Work: marking an entry or a group as not complete yet.

A mark is one `needs_work` row (app/models/needs_work.py) on any OWNER_TABLES
owner - the twelve media types and the three grouping tiers - with an
optional note. The row is the flag: clearing deletes it.

The page lists every mark grouped by note, and is not narrowed by the
viewer's access mode. Its readers are the ones who handle requests
(manage.requests: super and the admin), and the admin account reaches no
catalogue object at all, so narrowing would leave it an empty page. The
request inbox names its targets the same way.
"""

from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.utils.media_resolver import (
    MEDIA_TABLES,
    OWNER_TABLES,
    OWNER_TYPE_KEYS,
    entry_ref_for,
    resolve_entries,
)


class OwnerNotFound(LookupError):
    """The owner type is unknown, or names no row of that type."""


def owner_column(owner_type: str) -> str:
    """The needs_work column that holds an owner of this type."""
    return "media_id" if owner_type in MEDIA_TABLES else f"{owner_type}_id"


def nav_path(owner_type: str, owner_id: UUID) -> str:
    """
    The SPA detail path of an owner. Every owner has a page, a series
    included (/series/:ref), so this is built here rather than read from
    MediaRef.nav_path, which is None for a series.
    """
    return f"/{owner_type}/{owner_id}"


def require_owner(db: Session, owner_type: str, owner_id: UUID):
    """The owner's row, or OwnerNotFound. A media id filed under the wrong
    type is not found: an anime is not a manga."""
    ref = OWNER_TABLES.get(owner_type)
    if ref is None:
        raise OwnerNotFound(f"Unknown owner type: {owner_type}")
    row = db.query(ref.model).filter(ref.model.system_id == owner_id).first()
    if row is None:
        raise OwnerNotFound(f"{ref.label} not found.")
    return row


def get_mark(
    db: Session, owner_type: str, owner_id: UUID
) -> Optional[models.NeedsWork]:
    column = getattr(models.NeedsWork, owner_column(owner_type))
    return db.query(models.NeedsWork).filter(column == owner_id).first()


def set_mark(
    db: Session, owner_type: str, owner_id: UUID, note: Optional[str]
) -> models.NeedsWork:
    """Mark the owner, or change the note of its mark. One row per owner."""
    require_owner(db, owner_type, owner_id)
    row = get_mark(db, owner_type, owner_id)
    if row is None:
        row = models.NeedsWork(**{owner_column(owner_type): owner_id})
        db.add(row)
    row.note = note
    db.commit()
    db.refresh(row)
    return row


def clear_mark(db: Session, owner_type: str, owner_id: UUID) -> None:
    """Delete the owner's mark. Clearing what is not marked changes nothing."""
    require_owner(db, owner_type, owner_id)
    row = get_mark(db, owner_type, owner_id)
    if row is not None:
        db.delete(row)
        db.commit()


def grouped(db: Session) -> list[dict]:
    """
    Every mark, grouped by note: the noted groups by note, then the group of
    marks with no note. Inside a group, by owner type in OWNER_TABLES order,
    then by name.
    """
    rows = db.query(models.NeedsWork).all()
    resolved = resolve_entries(
        db, [(row.owner_type, row.owner_id) for row in rows], OWNER_TABLES
    )
    groups: dict[Optional[str], list[dict]] = {}
    for row in rows:
        owner_type = row.owner_type
        ref = OWNER_TABLES.get(owner_type)
        if ref is None:
            continue
        hit = entry_ref_for(resolved, owner_type, row.owner_id)
        groups.setdefault(row.note, []).append(
            {
                "owner_type": owner_type,
                "owner_id": row.owner_id,
                "type_label": ref.label,
                "is_tier": ref.is_tier,
                "display_name": hit.display_name,
                "nav_path": nav_path(owner_type, row.owner_id),
                "note": row.note,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            }
        )

    def item_order(item: dict):
        return (
            OWNER_TYPE_KEYS.index(item["owner_type"]),
            (item["display_name"] or "").casefold(),
        )

    notes = sorted((n for n in groups if n is not None), key=str.casefold)
    if None in groups:
        notes.append(None)
    return [
        {"note": note, "items": sorted(groups[note], key=item_order)}
        for note in notes
    ]
