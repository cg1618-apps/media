"""
Withholding personal content from a viewer without view.personal.

A different axis from field_gate.py. Field groups are the ACCESS MODE's
(which fields of a reachable entry this session sees); this is the ROLE's -
a `view.*` permission, resolved through Viewer.has(), so the root short-circuit
reaches it and a guest does not hold it.

What is personal here is opinion stored on catalogue rows: the owner's rating
and expectation of a group or an entity, and a novel unit's remark. A viewer
without the permission gets the field as null - the key stays in the response,
so every response keeps one shape whoever asks.

A viewer holding manage.catalog is exempt. Those columns are written through
the catalogue forms, which load the row with a GET and send it back whole; a
manager who was handed a null would write the null back over the real value.

Like field_gate, the response is built from a COPY when the input is an ORM
row: these are real columns, and blanking one on a live instance would be
flushed to disk by the next autoflush.
"""

from typing import Any, Optional

from pydantic import BaseModel

from app.services.rbac.permissions import PERM_MANAGE_CATALOG, PERM_VIEW_PERSONAL
from app.services.rbac.resolver import Viewer

# Per kind of row: the fields withheld. The kind is the owner type for the
# grouping tiers and the router name for the entities.
PERSONAL_FIELDS: dict[str, tuple[str, ...]] = {
    "collection": ("my_rating", "collection_expectation"),
    "franchise": ("my_rating", "franchise_expectation"),
    "series": ("my_rating", "series_expectation"),
    "person": ("my_rating",),
    "studio": ("my_rating",),
    "publisher": ("my_rating",),
    "character": ("my_rating",),
}

# Per media type: a nested collection, and the fields withheld on each of its
# items. A unit's my_rating is not here - it is the viewer's OWN rating
# (user_novel_unit_rating), attached per viewer, and a guest has none.
NESTED_PERSONAL_FIELDS: dict[str, tuple[str, tuple[str, ...]]] = {
    "novel": ("units", ("remark",)),
}


def withholds_personal(viewer: Optional[Viewer]) -> bool:
    """
    Whether this viewer is denied personal content.

    A None viewer withholds nothing, as in field_gate: internal callers pass
    None to mean "not a request".
    """
    if viewer is None:
        return False
    return not (viewer.has(PERM_VIEW_PERSONAL) or viewer.has(PERM_MANAGE_CATALOG))


def _as_model(item: Any, schema) -> BaseModel:
    if isinstance(item, BaseModel):
        return item
    if schema is None:
        raise TypeError("strip_personal needs a schema to copy an ORM row")
    return schema.model_validate(item)


def _strip_one(item: Any, kind: str, schema) -> Any:
    fields = PERSONAL_FIELDS.get(kind, ())
    nested = NESTED_PERSONAL_FIELDS.get(kind)
    if not fields and nested is None:
        return item
    model = _as_model(item, schema)
    update: dict[str, Any] = {name: None for name in fields}
    if nested is not None:
        attr, nested_fields = nested
        blank = {name: None for name in nested_fields}
        update[attr] = [
            child.model_copy(update=blank) for child in (getattr(model, attr) or [])
        ]
    return model.model_copy(update=update)


def strip_personal(
    viewer: Optional[Viewer],
    kind: str,
    payload: Any,
    schema=None,
):
    """
    Null the personal fields of one row or a list of them, for a viewer who
    may not see them. `kind` is a key of PERSONAL_FIELDS or
    NESTED_PERSONAL_FIELDS; any other kind returns the payload untouched.

    Returns the payload unchanged when nothing is withheld. Otherwise returns
    schema instances - ORM rows are copied through `schema`, which must then
    be the route's response_model; schema instances are copied as they are.
    """
    if not withholds_personal(viewer):
        return payload
    if kind not in PERSONAL_FIELDS and kind not in NESTED_PERSONAL_FIELDS:
        return payload
    if isinstance(payload, list):
        return [_strip_one(item, kind, schema) for item in payload]
    return _strip_one(payload, kind, schema)
