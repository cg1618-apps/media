"""
Reading and writing one account's highlight group order on an h-comic or an
h-game.

The h_comic_highlights and h_game_highlights sections are personal, and their
read view draws one group per female character name. The order of those
groups is the viewer's own, in `user_highlight_group_order`. The response
schemas keep the field name `highlight_group_order`, so this module puts the
VIEWER'S order back on the ORM instances before they are serialised, as
user_rating.attach_ratings does for a rating. Nobody asking means nothing to
show: a guest reads null, never somebody else's order.

Writes come through PUT /api/me/highlight-group-order/{media_id}
(routers/me_highlights.py), never through the entry endpoints.
"""

import uuid
from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.database import get_taipei_now
from app.services.domain.h_comic import normalize_group_order

# The media types whose entries carry a highlight group order.
GROUP_ORDER_TYPES: frozenset[str] = frozenset({"h-comic", "h-game"})


def _items(entries) -> list:
    if entries is None:
        return []
    if isinstance(entries, Iterable) and not hasattr(entries, "system_id"):
        return list(entries)
    return [entries]


def group_orders_by_entry(
    db: Session, entry_ids: list, user_id: Optional[UUID]
) -> dict:
    """{entry id: [names]} for one account, one query for the whole page."""
    if user_id is None or not entry_ids:
        return {}
    rows = (
        db.query(models.UserHighlightGroupOrder)
        .filter(
            models.UserHighlightGroupOrder.user_id == user_id,
            models.UserHighlightGroupOrder.media_id.in_(entry_ids),
        )
        .all()
    )
    return {row.media_id: row.group_order for row in rows}


def attach_group_orders(db: Session, media_type: str, entries, user_id) -> None:
    """
    Set `highlight_group_order` on one h-comic or h-game, or a page of them,
    to this account's own order. A no-op for every other type.

    Every row is blanked FIRST and then filled, so a row the query does not
    match reads None rather than whatever an earlier attach left on a cached
    instance. `user_id` None - nobody asking - leaves them all None.
    """
    if media_type not in GROUP_ORDER_TYPES:
        return
    items = _items(entries)
    if not items:
        return
    for entry in items:
        entry.highlight_group_order = None
    found = group_orders_by_entry(db, [e.system_id for e in items], user_id)
    for entry in items:
        entry.highlight_group_order = found.get(entry.system_id)


def group_order_row(
    db: Session, user_id: UUID, media_id
) -> Optional[models.UserHighlightGroupOrder]:
    """One account's row for one entry, or None. Never creates."""
    return (
        db.query(models.UserHighlightGroupOrder)
        .filter(
            models.UserHighlightGroupOrder.user_id == user_id,
            models.UserHighlightGroupOrder.media_id == media_id,
        )
        .first()
    )


def write_group_order(
    db: Session, user_id: UUID, media_id, group_order
) -> Optional[list[str]]:
    """
    Replace one account's order on one entry. The value is normalised
    (normalize_group_order: trimmed, no blanks, no repeats); None or an empty
    list clears it, and a cleared order is not stored - the row is deleted.

    Raises ValueError for a value that is not a list of names. Returns the
    stored order, or None. Added to the session, not committed: the caller
    owns the transaction.
    """
    order = normalize_group_order(group_order)
    row = group_order_row(db, user_id, media_id)
    if order is None:
        if row is not None:
            db.delete(row)
            db.flush()
        return None
    if row is None:
        row = models.UserHighlightGroupOrder(
            system_id=uuid.uuid4(), user_id=user_id, media_id=media_id
        )
        db.add(row)
    row.group_order = order
    row.updated_at = get_taipei_now()
    db.flush()
    return order

