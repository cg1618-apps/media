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

# media-type key -> content-label key. The label is a system label: created
# by its migration and by the lifespan seed
# (gated_labels.ensure_system_labels), attached to every entry of the type on
# every write path (app/services/domain/gated_labels.py), and granted to no
# mode but `unrestricted` - see ensure_access_mode_seed, which keeps it off
# the other all-labels mode. A new gated type adds its entry here and its row
# to gated_labels.SYSTEM_LABELS.
REQUIRED_LABEL_FOR_TYPE: dict[str, str] = {
    "h-comic": "h-comic",
    "h-game": "h-game",
}


def required_label_keys() -> frozenset[str]:
    """Every content-label key some gated type requires."""
    return frozenset(REQUIRED_LABEL_FOR_TYPE.values())


def visible_gated_types(db: Session, viewer: Optional[object]) -> list[str]:
    """
    The gated types this viewer may see, sorted.

    What /api/auth/me publishes so the SPA can decide whether to offer a gated
    type's navigation at all. Only the SEEABLE ones are named: a session that
    cannot see a type is not told that it exists.
    """
    if not REQUIRED_LABEL_FOR_TYPE:
        return []
    if viewer is None:
        return sorted(REQUIRED_LABEL_FOR_TYPE)
    hidden = hidden_gated_types(db, hidden_label_ids(db, viewer))
    return sorted(t for t in REQUIRED_LABEL_FOR_TYPE if t not in hidden)


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


# ---------------------------------------------------------------------------
# What a session that cannot see a gated type is not told
# ---------------------------------------------------------------------------
# Hiding a gated type's entries is not enough: a vocabulary, a role or a
# dropdown that exists ONLY for the type names it just as surely. Each helper
# below answers one "does this exist only for types the viewer cannot see?"
# question from a declaration the code already makes - a role's media types,
# a tag field's media types, a franchise type's media types - so a second
# gated type needs no edit here.


def unseeable_gated_types(db: Session, viewer: Optional[object]) -> frozenset[str]:
    """The gated types `viewer` may not see. Empty for a None viewer."""
    if viewer is None or not REQUIRED_LABEL_FOR_TYPE:
        return frozenset()
    return hidden_gated_types(db, hidden_label_ids(db, viewer))


def only_for(media_types, hidden: frozenset[str]) -> bool:
    """True when every one of `media_types` is hidden - a non-empty set only."""
    media_types = set(media_types)
    return bool(media_types) and media_types <= set(hidden)


def gated_tag_categories() -> dict[str, frozenset[str]]:
    """
    {option category: the media types it serves}, for every category whose
    tag fields serve GATED types only - the h-comic genres, not the shared
    Official Source vocabulary. Such a category is itself a connection of
    every value in it (shared_visibility.py), so a value an admin creates with
    no scope row is still hidden with its type.
    """
    from app.utils.credit_roles import TAG_FIELDS

    served: dict[str, set[str]] = {}
    for field in TAG_FIELDS.values():
        served.setdefault(field.category, set()).update(field.media_types)
    gated = gated_types()
    return {
        category: frozenset(types)
        for category, types in served.items()
        if types and types <= gated
    }


def hidden_person_roles(hidden: frozenset[str]) -> frozenset[str]:
    """Person roles every legal scope of which is a hidden gated type."""
    from app.utils.credit_roles import CREDIT_ROLES

    return frozenset(
        key
        for key, role in CREDIT_ROLES.items()
        if role.target == "person" and only_for(role.media_types, hidden)
    )


def hidden_option_categories(hidden: frozenset[str]) -> frozenset[str]:
    """Option categories that serve hidden gated types only."""
    return frozenset(
        category
        for category, types in gated_tag_categories().items()
        if types <= hidden
    )


def hidden_franchise_types(hidden: frozenset[str]) -> frozenset[str]:
    """Franchise types stamped only for hidden gated types (H-Comic)."""
    from app.services.domain.hierarchy import FRANCHISE_TYPE_FOR

    served: dict[str, set[str]] = {}
    for media_type, franchise_type in FRANCHISE_TYPE_FOR.items():
        served.setdefault(str(getattr(franchise_type, "value", franchise_type)), set()).add(
            media_type
        )
    return frozenset(
        franchise_type
        for franchise_type, types in served.items()
        if only_for(types, hidden)
    )
