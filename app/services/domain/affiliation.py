"""
Person affiliations: which studios a person belongs to (person_affiliation) -
a director on a studio's staff, a seiyuu with an agency.

The person is the writing side: the person form sends the whole set with the
person, and replace_affiliations makes it so. The studio's page reads the same
rows the other way round (people_of).

NOT a connection in the shared-record sense: an affiliation never makes a
hidden studio or a hidden person visible. Each read simply omits the ends the
viewer may not see, and a write keeps the rows naming a studio the writer
cannot see - a narrowed editor saving a list it could only partly see must not
delete what it was never shown. The same rule club membership follows
(membership.py).
"""

from collections import defaultdict
from typing import Iterable
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.services.rbac.shared_visibility import apply_shared_visibility


def _visible(db: Session, viewer, model, ids: Iterable[UUID]) -> dict:
    """{id: record} for the ids of `model` the viewer may see. One query."""
    ids = set(ids)
    if not ids:
        return {}
    query = db.query(model).filter(model.system_id.in_(ids))
    return {r.system_id: r for r in apply_shared_visibility(query, model, db, viewer)}


def _ref(record) -> dict:
    return {
        "system_id": record.system_id,
        "public_id": record.public_id,
        "display_name": record.display_name,
    }


def _by_name(refs: list[dict]) -> list[dict]:
    return sorted(refs, key=lambda r: (r["display_name"].casefold(), str(r["system_id"])))


def affiliations_by_person(db: Session, viewer, person_ids: list[UUID]) -> dict:
    """{person_id: [the visible studios they belong to, by name]}, for a page
    of people in two queries."""
    out: dict[UUID, list[dict]] = {person_id: [] for person_id in person_ids}
    if not person_ids:
        return out
    rows = (
        db.query(models.PersonAffiliation)
        .filter(models.PersonAffiliation.person_id.in_(person_ids))
        .all()
    )
    studios = _visible(db, viewer, models.Studio, (r.studio_id for r in rows))
    grouped: dict[UUID, list[dict]] = defaultdict(list)
    for row in rows:
        studio = studios.get(row.studio_id)
        if studio is not None:
            grouped[row.person_id].append(_ref(studio))
    for person_id, refs in grouped.items():
        out[person_id] = _by_name(refs)
    return out


def people_of(db: Session, viewer, studio_id: UUID) -> list[dict]:
    """The visible people who belong to this studio, by name."""
    rows = db.query(models.PersonAffiliation).filter_by(studio_id=studio_id).all()
    people = _visible(db, viewer, models.Person, (r.person_id for r in rows))
    return _by_name([_ref(p) for p in people.values()])


def replace_affiliations(
    db: Session, viewer, person_id: UUID, studio_ids: list[UUID]
) -> None:
    """
    Make `studio_ids` the studios this person belongs to. Does not commit.

    Each must be a studio the writer may see (422 otherwise); a repeated id
    counts once. Affiliations with studios the writer cannot see are kept.
    """
    wanted = list(dict.fromkeys(studio_ids))
    visible_wanted = _visible(db, viewer, models.Studio, wanted)
    missing = [str(i) for i in wanted if i not in visible_wanted]
    if missing:
        raise HTTPException(
            status_code=422, detail=f"Unknown studio(s): {', '.join(missing)}"
        )
    rows = db.query(models.PersonAffiliation).filter_by(person_id=person_id).all()
    held = {r.studio_id: r for r in rows}
    visible_held = _visible(db, viewer, models.Studio, held)
    for studio_id, row in held.items():
        if studio_id in visible_held and studio_id not in wanted:
            db.delete(row)
    for studio_id in wanted:
        if studio_id not in held:
            db.add(models.PersonAffiliation(person_id=person_id, studio_id=studio_id))
    db.flush()


def merge_affiliations(db: Session, column: str, keep_id: UUID, drop_id: UUID) -> None:
    """
    Move the loser's affiliations onto the survivor, for a merge of two
    people (`column` "person_id") or two studios ("studio_id"). A row the
    survivor already has is dropped. Does not commit.
    """
    other = "studio_id" if column == "person_id" else "person_id"
    query = db.query(models.PersonAffiliation)
    held = {getattr(r, other) for r in query.filter_by(**{column: keep_id})}
    for row in query.filter_by(**{column: drop_id}).all():
        if getattr(row, other) in held:
            db.delete(row)
            continue
        setattr(row, column, keep_id)
        held.add(getattr(row, other))
    db.flush()
