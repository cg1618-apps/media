"""
Studio relations: which studios relate to which, each side with its own remark.

A relation is mutual and stored as two rows, one per side (app/models/staff.py,
StudioRelation). This module is the only writer, and it keeps the pair whole:
adding a relation from one side creates the other side's row with no remark,
and removing it from either side removes both rows. Each side's remark is its
own and is written only from that side.

Visibility follows the shared-record rule without adding to it. A relation is
NOT a connection (app/services/rbac/shared_visibility.py): it never makes a
hidden studio visible. What it does is filter - a visible studio's related
list, and the count the library filters on, omit the studios the viewer may
not see.

The writer REPLACES one side's whole list, the way the editor submits, and
leaves alone the rows naming a studio the writer cannot see: a narrowed editor
saving a list it could only partly see must not delete what it was never
shown. The same rule club membership follows (membership.py).
"""

from typing import Iterable, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.services.rbac.shared_visibility import apply_shared_visibility

Relation = models.StudioRelation


def _visible_studios(db: Session, viewer, ids: Iterable[UUID]) -> dict:
    """{id: Studio} for the ids the viewer may see. One query."""
    ids = list(set(ids))
    if not ids:
        return {}
    query = db.query(models.Studio).filter(models.Studio.system_id.in_(ids))
    query = apply_shared_visibility(query, models.Studio, db, viewer)
    return {s.system_id: s for s in query.all()}


def _clean_remark(remark: Optional[str]) -> Optional[str]:
    remark = (remark or "").strip()
    return remark or None


def related_of(db: Session, viewer, studio_id: UUID) -> list[dict]:
    """The studios related to this one that the viewer may see, by name, each
    with the remark this studio's side gives it."""
    rows = db.query(Relation).filter(Relation.studio_id == studio_id).all()
    visible = _visible_studios(db, viewer, (r.related_studio_id for r in rows))
    out = [
        {
            "system_id": studio.system_id,
            "public_id": studio.public_id,
            "display_name": studio.display_name,
            "remark": row.remark,
        }
        for row in rows
        if (studio := visible.get(row.related_studio_id)) is not None
    ]
    return sorted(
        out, key=lambda ref: (ref["display_name"].casefold(), str(ref["system_id"]))
    )


def related_counts(db: Session, viewer, studio_ids: list[UUID]) -> dict[UUID, int]:
    """{studio_id: how many related studios the viewer may see}, for a page of
    studios in two queries. A relation to a hidden studio does not count, so
    the library's "has relation" filter reveals nothing either."""
    counts = {studio_id: 0 for studio_id in studio_ids}
    if not studio_ids:
        return counts
    rows = (
        db.query(Relation.studio_id, Relation.related_studio_id)
        .filter(Relation.studio_id.in_(studio_ids))
        .all()
    )
    visible = _visible_studios(db, viewer, (related for _, related in rows))
    for studio_id, related in rows:
        if related in visible:
            counts[studio_id] += 1
    return counts


def replace_related(
    db: Session, viewer, studio_id: UUID, relations: list[tuple[UUID, Optional[str]]]
) -> None:
    """
    Make `relations` - (related studio id, this side's remark) pairs - the
    studios related to this one. Does not commit.

    Each must be a studio the writer may see and must not be this studio;
    a repeated id keeps its first remark. A new relation also creates the
    other side's row, with no remark; a removed one takes the other side's
    row with it. Relations to studios the writer cannot see are kept.
    """
    wanted: dict[UUID, Optional[str]] = {}
    for related_id, remark in relations:
        wanted.setdefault(related_id, _clean_remark(remark))
    if studio_id in wanted:
        raise HTTPException(
            status_code=422, detail="A studio cannot be related to itself."
        )
    visible_wanted = _visible_studios(db, viewer, wanted)
    missing = [str(i) for i in wanted if i not in visible_wanted]
    if missing:
        raise HTTPException(
            status_code=422, detail=f"Unknown studio(s): {', '.join(missing)}"
        )

    rows = db.query(Relation).filter(Relation.studio_id == studio_id).all()
    visible_held = _visible_studios(db, viewer, (r.related_studio_id for r in rows))
    by_related = {r.related_studio_id: r for r in rows}

    for row in rows:
        related_id = row.related_studio_id
        # Only the rows the writer could see are theirs to remove.
        if related_id in visible_held and related_id not in wanted:
            db.delete(row)
            db.query(Relation).filter(
                Relation.studio_id == related_id,
                Relation.related_studio_id == studio_id,
            ).delete(synchronize_session="fetch")

    for related_id, remark in wanted.items():
        row = by_related.get(related_id)
        if row is None:
            db.add(
                Relation(
                    studio_id=studio_id, related_studio_id=related_id, remark=remark
                )
            )
        else:
            row.remark = remark
        mirror = (
            db.query(Relation)
            .filter(
                Relation.studio_id == related_id,
                Relation.related_studio_id == studio_id,
            )
            .first()
        )
        if mirror is None:
            db.add(Relation(studio_id=related_id, related_studio_id=studio_id))
    db.flush()


def merge_relations(db: Session, keep_id: UUID, drop_id: UUID) -> None:
    """
    Move every relation of `drop_id` onto `keep_id`, for a studio merge.

    Both sides move together. A row that would duplicate one the survivor
    already holds - the survivor's remark wins - or would relate the survivor
    to itself is dropped. Does not commit.
    """
    kept_out = {
        r.related_studio_id for r in db.query(Relation).filter_by(studio_id=keep_id)
    }
    kept_in = {
        r.studio_id for r in db.query(Relation).filter_by(related_studio_id=keep_id)
    }
    for row in db.query(Relation).filter_by(studio_id=drop_id).all():
        if row.related_studio_id == keep_id or row.related_studio_id in kept_out:
            db.delete(row)
            continue
        row.studio_id = keep_id
        kept_out.add(row.related_studio_id)
    for row in db.query(Relation).filter_by(related_studio_id=drop_id).all():
        if row.studio_id == keep_id or row.studio_id in kept_in:
            db.delete(row)
            continue
        row.related_studio_id = keep_id
        kept_in.add(row.studio_id)
    db.flush()
