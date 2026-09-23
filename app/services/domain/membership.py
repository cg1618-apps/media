"""
Club membership: which artists belong to which clubs.

Both ends are `person` rows (app/models/staff.py, PersonMembership). A club is
a person holding the `club` role in any scope, which the writers below check -
no constraint can, because a role is a set of rows.

Visibility follows the shared-record rule without adding to it. Membership is
NOT a connection (app/services/rbac/shared_visibility.py): it never makes a
hidden club or a hidden artist visible. What it does is filter - a visible
club's member list omits the members the viewer may not see, and a visible
artist's club list omits the clubs.

Both writers REPLACE a whole list, the way the Add/Modify forms submit, and
both leave alone the rows naming a person the writer cannot see: a narrowed
editor saving a list it could only partly see must not delete what it was
never shown. The same rule the person-role and scope writers follow.
"""

from typing import Iterable
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.services.rbac.shared_visibility import apply_shared_visibility

CLUB_ROLE = "club"


def is_club(db: Session, person_id: UUID) -> bool:
    """Whether this person holds the `club` role in any scope."""
    return (
        db.query(models.PersonRole.id)
        .filter(
            models.PersonRole.person_id == person_id,
            models.PersonRole.role == CLUB_ROLE,
        )
        .first()
        is not None
    )


def _visible_people(db: Session, viewer, ids: Iterable[UUID]) -> dict:
    """{id: Person} for the ids the viewer may see. One query."""
    ids = list(set(ids))
    if not ids:
        return {}
    query = db.query(models.Person).filter(models.Person.system_id.in_(ids))
    query = apply_shared_visibility(query, models.Person, db, viewer)
    return {p.system_id: p for p in query.all()}


def _ref(person: models.Person, position: int) -> dict:
    return {
        "system_id": person.system_id,
        "public_id": person.public_id,
        "display_name": person.display_name,
        "position": position,
    }


def clubs_of(db: Session, viewer, member_id: UUID) -> list[dict]:
    """The clubs a person belongs to that the viewer may see, by name."""
    rows = (
        db.query(models.PersonMembership)
        .filter(models.PersonMembership.member_id == member_id)
        .all()
    )
    visible = _visible_people(db, viewer, (r.club_id for r in rows))
    out = [_ref(visible[r.club_id], r.position) for r in rows if r.club_id in visible]
    return sorted(out, key=lambda ref: (ref["display_name"].lower(), str(ref["system_id"])))


def members_of(db: Session, viewer, club_id: UUID) -> list[dict]:
    """A club's members that the viewer may see, in the club's order."""
    rows = (
        db.query(models.PersonMembership)
        .filter(models.PersonMembership.club_id == club_id)
        .order_by(models.PersonMembership.position, models.PersonMembership.created_at)
        .all()
    )
    visible = _visible_people(db, viewer, (r.member_id for r in rows))
    return [_ref(visible[r.member_id], r.position) for r in rows if r.member_id in visible]


def _require_people(db: Session, viewer, ids: list[UUID], what: str) -> None:
    """Every id names a person the writer may see - an unknown one is a 422,
    in the same words whether it is absent or hidden."""
    visible = _visible_people(db, viewer, ids)
    missing = [str(i) for i in ids if i not in visible]
    if missing:
        raise HTTPException(
            status_code=422, detail=f"Unknown {what}: {', '.join(missing)}"
        )


def _dedupe(ids: Iterable[UUID]) -> list[UUID]:
    out: list[UUID] = []
    for i in ids:
        if i not in out:
            out.append(i)
    return out


def replace_clubs(db: Session, viewer, member_id: UUID, club_ids: list[UUID]) -> None:
    """
    Make `club_ids` the clubs this person belongs to. Does not commit.

    Each must be a person the writer may see, must hold the `club` role, and
    must not be the member. A new membership joins the END of its club's
    member list; one that already exists keeps its place there.
    """
    wanted = _dedupe(club_ids)
    if member_id in wanted:
        raise HTTPException(status_code=422, detail="A person cannot be their own club.")
    _require_people(db, viewer, wanted, "club(s)")
    not_clubs = [str(c) for c in wanted if not is_club(db, c)]
    if not_clubs:
        raise HTTPException(
            status_code=422,
            detail=f"Not a club (no `club` role): {', '.join(not_clubs)}",
        )

    rows = (
        db.query(models.PersonMembership)
        .filter(models.PersonMembership.member_id == member_id)
        .all()
    )
    visible = _visible_people(db, viewer, (r.club_id for r in rows))
    held = {r.club_id for r in rows}
    for row in rows:
        # Only the rows the writer could see are theirs to remove.
        if row.club_id in visible and row.club_id not in wanted:
            db.delete(row)
    for club_id in wanted:
        if club_id in held:
            continue
        last = (
            db.query(func.max(models.PersonMembership.position))
            .filter(models.PersonMembership.club_id == club_id)
            .scalar()
        )
        db.add(
            models.PersonMembership(
                member_id=member_id,
                club_id=club_id,
                position=0 if last is None else last + 1,
            )
        )
    db.flush()


def replace_members(db: Session, viewer, club_id: UUID, member_ids: list[UUID]) -> None:
    """
    Make `member_ids` this club's members, in this order. Does not commit.

    The club must hold the `club` role; each member must be a person the
    writer may see and must not be the club. Members hidden from the writer
    keep their rows and follow the visible ones.
    """
    if not is_club(db, club_id):
        raise HTTPException(
            status_code=422, detail="This person is not a club (no `club` role)."
        )
    wanted = _dedupe(member_ids)
    if club_id in wanted:
        raise HTTPException(status_code=422, detail="A club cannot be its own member.")
    _require_people(db, viewer, wanted, "member(s)")

    rows = (
        db.query(models.PersonMembership)
        .filter(models.PersonMembership.club_id == club_id)
        .order_by(models.PersonMembership.position)
        .all()
    )
    visible = _visible_people(db, viewer, (r.member_id for r in rows))
    by_member = {r.member_id: r for r in rows}
    for row in rows:
        if row.member_id in visible and row.member_id not in wanted:
            db.delete(row)
    for position, member_id in enumerate(wanted):
        row = by_member.get(member_id)
        if row is None:
            db.add(
                models.PersonMembership(
                    member_id=member_id, club_id=club_id, position=position
                )
            )
        else:
            row.position = position
    hidden = [r for r in rows if r.member_id not in visible]
    for offset, row in enumerate(hidden):
        row.position = len(wanted) + offset
    db.flush()


def merge_memberships(db: Session, keep_id: UUID, drop_id: UUID) -> None:
    """
    Move every membership from `drop_id` onto `keep_id`, for a person merge.

    A row that would duplicate one the survivor already holds, or would make
    the survivor its own club, is dropped. Does not commit.
    """
    kept_as_member = {
        r.club_id
        for r in db.query(models.PersonMembership).filter_by(member_id=keep_id)
    }
    kept_as_club = {
        r.member_id
        for r in db.query(models.PersonMembership).filter_by(club_id=keep_id)
    }
    for row in db.query(models.PersonMembership).filter_by(member_id=drop_id).all():
        if row.club_id == keep_id or row.club_id in kept_as_member:
            db.delete(row)
            continue
        row.member_id = keep_id
        kept_as_member.add(row.club_id)
    for row in db.query(models.PersonMembership).filter_by(club_id=drop_id).all():
        if row.member_id == keep_id or row.member_id in kept_as_club:
            db.delete(row)
            continue
        row.club_id = keep_id
        kept_as_club.add(row.member_id)
    db.flush()
