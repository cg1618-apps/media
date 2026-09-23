"""
Gated media types: a type every entry of which carries one content label.

A media type named here is a GATED TYPE. Every entry of it carries its
required label, so a session whose mode lacks that label sees none of the
type's entries - and, through the shared-record rule in
`shared_visibility.py`, none of the people, vocabulary values or other
records that exist only for it.

The map is keyed on the hyphenated media-type key (`spec.owner_type`, the
form every `media_type` column and permission uses) and names a
`content_label.key`, not an id: ids are minted per database, and the key is
what a seed, a migration and a test can all spell.

A viewer CAN SEE a gated type when the type's required label is not in the
viewer's hidden label set (`enforcement.hidden_label_ids`). An ungated type -
every type not named here - is always seeable on this axis; whether the
viewer holds `media_type.<key>` is the role axis, asked separately by
`Viewer.has()`.
"""

from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.services.rbac.enforcement import hidden_label_ids

# media-type key -> content-label key. Empty until a gated type is registered.
REQUIRED_LABEL_FOR_TYPE: dict[str, str] = {}


def gated_types() -> frozenset[str]:
    """Every media type that names a required label."""
    return frozenset(REQUIRED_LABEL_FOR_TYPE)


def hidden_gated_types(db: Session, hidden: Iterable[UUID]) -> frozenset[str]:
    """
    The gated types whose required label is in `hidden`.

    `hidden` is `enforcement.hidden_label_ids(db, viewer)`, passed in rather
    than recomputed so a caller asking both questions pays for the label
    query once. A required label that does not exist as a row is not hidden:
    no mode can lack a label nobody has created, and the type is then gated
    on nothing.
    """
    hidden = set(hidden)
    if not REQUIRED_LABEL_FOR_TYPE or not hidden:
        return frozenset()
    ids_by_key = dict(
        db.query(models.ContentLabel.key, models.ContentLabel.system_id)
        .filter(models.ContentLabel.key.in_(set(REQUIRED_LABEL_FOR_TYPE.values())))
        .all()
    )
    return frozenset(
        media_type
        for media_type, label_key in REQUIRED_LABEL_FOR_TYPE.items()
        if ids_by_key.get(label_key) in hidden
    )


def can_see_gated_type(db: Session, viewer: Optional[object], media_type: str) -> bool:
    """
    Whether `viewer` may see gated type `media_type`.

    True for an ungated type, and for a `None` viewer - "not a request", as
    everywhere in `enforcement.py`.
    """
    if viewer is None or media_type not in REQUIRED_LABEL_FOR_TYPE:
        return True
    return media_type not in hidden_gated_types(db, hidden_label_ids(db, viewer))
