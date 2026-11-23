"""
The rule a person's `person_role` rows keep: per role, either one unscoped row
or only scoped ones.

An unscoped row (scope NULL) says the person holds the role in no media type
yet - they are listed under it, and no dropdown offers them. Once the same
role gains a scope that row says nothing the scoped one does not, so it is
dropped. Every writer of person_role goes through one of the two helpers
below, so the rule holds whichever path wrote the row.
"""

from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app import models


def normalized_pairs(
    pairs: Iterable[tuple[str, Optional[str]]],
) -> list[tuple[str, Optional[str]]]:
    """
    `pairs` deduplicated, in order, without an unscoped pair for any role
    that also has a scoped one.
    """
    pairs = list(dict.fromkeys(pairs))
    scoped_roles = {role for role, scope in pairs if scope is not None}
    return [
        (role, scope)
        for role, scope in pairs
        if scope is not None or role not in scoped_roles
    ]


def grant_role(
    db: Session, person: models.Person, role: str, scope: Optional[str]
) -> None:
    """
    Additive: give the person the role on this scope if they lack it, and
    drop the role's unscoped row once it has a scope. An unscoped grant to a
    role the person already holds in some scope changes nothing.
    """
    held = {(r.role, r.scope) for r in person.roles}
    if (role, scope) in held:
        return
    if scope is None:
        if any(held_role == role for held_role, _ in held):
            return
    else:
        for row in list(person.roles):
            if row.role == role and row.scope is None:
                person.roles.remove(row)
                db.delete(row)
    db.add(models.PersonRole(person_id=person.system_id, role=role, scope=scope))
    db.flush()
    db.refresh(person)
