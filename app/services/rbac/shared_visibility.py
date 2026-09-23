"""
Which shared records a viewer may see.

A shared record is one that entries point at rather than one that belongs to
an entry: a person, a character, a studio, a publisher, a vocabulary value
(`system_option`). None of them carries a content label, so none can be
hidden by one directly. They are hidden by what they are connected to:

    A shared record is hidden when it has at least one connection and every
    connection it has is hidden. A record with no connections at all stays
    visible.

A connection is one of three things:

  appearance   a row placing the record on an entry - a `media_credit`, a
               `character_casting`, a `media_tag`. Hidden when the ENTRY is
               label-hidden, by its own label or its franchise's. A media-type
               permission gap does NOT hide an appearance: a guest lacking
               `media_type.game` still sees a person credited only on games.
  scope        a row declaring which media types the record belongs to - a
               `person_role`, a `publisher_scope`, a `system_option_scope`.
               Only a scope naming a GATED type (`gated_types.py`) is a
               connection, and it is hidden when the viewer cannot see that
               type. A scope naming an ordinary type is not a connection at
               all: it would otherwise keep visible every person whose only
               credits are hidden, since every credit writes a matching role.

  declared     a vocabulary value's own category, when every tag field using
               that category serves gated types only (the h-comic genres).
               The code declares it, so no row is needed: a value created
               with no scope is still connected to - and hidden with - the
               type. See DeclaredScope.

So crediting somebody on a visible entry reveals them, and removing that
credit hides them again; nothing is stored, and nothing needs remembering.

Everything is one SQL condition, built by `_hidden_condition`, applied as a
filter on list and search queries and as a one-row probe on detail routes -
the same reason `enforcement.py` works in SQL: filtering after a LIMIT would
shrink pages.

The connection tables are ALIASED inside the condition. A caller's query may
already join one of them (the person list joins `person_role` to filter by
role), and an unaliased EXISTS over the same table would silently correlate
to the caller's row instead of scanning its own.
"""

from dataclasses import dataclass
from typing import Iterable, Optional, Union
from uuid import UUID

import sqlalchemy as sa
from fastapi import HTTPException
from sqlalchemy.orm import Query, Session, aliased

from app import models
from app.services.rbac.enforcement import _hidden_by_label, hidden_label_ids
from app.services.rbac.gated_types import (
    gated_tag_categories,
    gated_types,
    hidden_gated_types,
)


@dataclass(frozen=True)
class Appearance:
    """A row placing the record on an entry."""

    table: type
    record_column: str  # the column naming the shared record
    entry_column: str  # the column naming the entry (a media.system_id)


@dataclass(frozen=True)
class Scope:
    """A row naming a media type the record belongs to."""

    table: type
    record_column: str
    scope_column: str


@dataclass(frozen=True)
class DeclaredScope:
    """
    A column on the record itself whose value the CODE declares as serving
    some media types - a vocabulary value's `category`, whose tag fields name
    them. Only a value serving gated types alone is a connection
    (gated_types.gated_tag_categories), so the shared Official Source
    vocabulary is untouched while every H Genre value is connected to h-comic
    whatever scope rows it has, or has not, been given.
    """

    record_column: str


Connection = Union[Appearance, Scope, DeclaredScope]

# Every shared record, and every way it can be connected. A person's castings
# count as appearances because a seiyuu is credited through character_casting
# rather than media_credit (credit_roles.CreditRole.credited_via) - the same
# two stores credit_count and /entries already read.
CONNECTIONS: dict[type, tuple[Connection, ...]] = {
    models.Person: (
        Appearance(models.MediaCredit, "person_id", "media_id"),
        Appearance(models.CharacterCasting, "person_id", "entry_id"),
        Scope(models.PersonRole, "person_id", "scope"),
    ),
    models.Character: (
        Appearance(models.CharacterCasting, "character_id", "entry_id"),
    ),
    models.Studio: (Appearance(models.MediaCredit, "studio_id", "media_id"),),
    models.Publisher: (
        Appearance(models.MediaCredit, "publisher_id", "media_id"),
        Scope(models.PublisherScope, "publisher_id", "scope"),
    ),
    models.SystemOption: (
        Appearance(models.MediaTag, "option_id", "media_id"),
        Scope(models.SystemOptionScope, "option_id", "scope"),
        DeclaredScope("category"),
    ),
}

# The cover owners that are shared records, keyed as image_manager.COVER_OWNERS
# and images.ATTACHABLE_OWNERS spell them. `staff` is Person.
ENTITY_OWNER_MODELS: dict[str, type] = {
    "staff": models.Person,
    "character": models.Character,
    "publisher": models.Publisher,
    "studio": models.Studio,
}


@dataclass(frozen=True)
class _Hiding:
    """What one viewer cannot see, resolved once per request."""

    hidden_labels: list[UUID]
    hidden_types: frozenset[str]

    def __bool__(self) -> bool:
        return bool(self.hidden_labels or self.hidden_types)


def _hiding(db: Session, viewer) -> _Hiding:
    if viewer is None:
        return _Hiding([], frozenset())
    hidden = hidden_label_ids(db, viewer)
    return _Hiding(hidden, hidden_gated_types(db, hidden))


def _hidden_condition(model, hiding: _Hiding):
    """
    "This record has a connection, and none of its connections is visible",
    correlated on `model.system_id`.
    """
    record_id = model.system_id
    gated = gated_types()
    visible_types = gated - hiding.hidden_types
    any_connection = []
    visible_connection = []
    for connection in CONNECTIONS[model]:
        if isinstance(connection, DeclaredScope):
            served = gated_tag_categories()
            if not served:
                continue
            column = getattr(model, connection.record_column)
            any_connection.append(column.in_(list(served)))
            seen = [value for value, types in served.items() if types & visible_types]
            if seen:
                visible_connection.append(column.in_(seen))
            continue
        table = aliased(connection.table)
        owns = getattr(table, connection.record_column) == record_id
        if isinstance(connection, Appearance):
            entry_id = getattr(table, connection.entry_column)
            any_connection.append(sa.exists().where(owns))
            if hiding.hidden_labels:
                visible_connection.append(
                    sa.exists().where(
                        owns, ~_hidden_by_label(entry_id, hiding.hidden_labels)
                    )
                )
            else:
                visible_connection.append(sa.exists().where(owns))
            continue
        if not gated:
            continue
        scope = getattr(table, connection.scope_column)
        any_connection.append(sa.exists().where(owns, scope.in_(gated)))
        if visible_types:
            visible_connection.append(
                sa.exists().where(owns, scope.in_(visible_types))
            )
    condition = sa.or_(*any_connection)
    if visible_connection:
        condition = sa.and_(condition, ~sa.or_(*visible_connection))
    return condition


def apply_shared_visibility(query: Query, model, db: Session, viewer) -> Query:
    """Narrow a query over one shared-record model to what `viewer` may see."""
    hiding = _hiding(db, viewer)
    if not hiding:
        return query
    return query.filter(~_hidden_condition(model, hiding))


def shared_record_visible(db: Session, viewer, model, record_id) -> bool:
    """
    Whether one shared record may be seen. Callers 404 in the words they
    already use for missing, so a hidden record answers exactly as an absent
    one.
    """
    if record_id is None:
        return True
    hiding = _hiding(db, viewer)
    if not hiding:
        return True
    return (
        db.query(model.system_id)
        .filter(model.system_id == record_id, _hidden_condition(model, hiding))
        .first()
        is None
    )


def require_visible_shared(
    db: Session, viewer, model, record_id, detail: str
) -> None:
    """shared_record_visible, raising the caller's own 404 on False."""
    if not shared_record_visible(db, viewer, model, record_id):
        raise HTTPException(status_code=404, detail=detail)


def hidden_scopes(db: Session, viewer) -> frozenset[str]:
    """
    The scope values a viewer may not see: the gated types it cannot see.

    A visible record omits its hidden connections, and for a scope row that
    means leaving the value out of the record's `roles` / `scopes` list - the
    list would otherwise name the very type being hidden. The writers that
    replace those lists wholesale keep these rows, so a narrowed editor
    saving a form it could only partly see does not delete what it was never
    shown.
    """
    if viewer is None or not gated_types():
        return frozenset()
    return _hiding(db, viewer).hidden_types


def without_hidden_scopes(values: Iterable, hidden: frozenset[str], attr: Optional[str] = None):
    """`values` minus those naming a hidden scope. `attr` reads the scope off a row."""
    if not hidden:
        return list(values)
    return [
        value
        for value in values
        if (getattr(value, attr) if attr else value) not in hidden
    ]
