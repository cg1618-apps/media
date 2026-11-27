"""
How many people, studios, publishers and characters exist, as one viewer
may count them.

Two readers share these tallies: the person list's header
(`GET /api/person/role-counts`, a `view.person` read) and System Options'
Tier 3 (`GET /api/options/record-counts`, a `manage.options` read). Both
count only what the viewer may see - a record every connection of which is
hidden is not counted, and a gated type the viewer cannot see is not told to
exist - so the two can never disagree. Only numbers leave here, never a name.
"""

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models
from app.services.rbac.gated_types import hidden_person_roles
from app.services.rbac.shared_visibility import apply_shared_visibility, hidden_scopes
from app.utils.credit_roles import PERSON_ROLES


def person_role_counts(db: Session, viewer) -> dict[str, int]:
    """
    How many distinct people hold each person_role, zeros included.

    Counts people, not person_role rows - a director scoped for all three of
    their media types has three rows but is one person. A role that exists
    only for hidden gated types is left out, and so is every scope row naming
    one.
    """
    hidden = hidden_scopes(db, viewer)
    roles = [role for role in PERSON_ROLES if role not in hidden_person_roles(hidden)]
    query = db.query(
        models.PersonRole.role,
        func.count(func.distinct(models.PersonRole.person_id)),
    ).join(models.Person, models.PersonRole.person_id == models.Person.system_id)
    query = apply_shared_visibility(query, models.Person, db, viewer)
    if hidden:
        query = query.filter(
            or_(
                models.PersonRole.scope.is_(None),
                models.PersonRole.scope.notin_(hidden),
            )
        )
    tallied = dict(query.group_by(models.PersonRole.role).all())
    return {role: tallied.get(role, 0) for role in roles}


def entity_count(db: Session, viewer, model) -> int:
    """How many rows of one shared-record model (studio, publisher, character) this viewer may see."""
    return apply_shared_visibility(db.query(model), model, db, viewer).count()


def studio_count(db: Session, viewer) -> int:
    """How many studios this viewer may see."""
    return entity_count(db, viewer, models.Studio)
