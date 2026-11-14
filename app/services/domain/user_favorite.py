"""
Reading and writing one account's favourite quotes and memes.

`user_favorite` holds, per account, which quotes and memes it favours. The
quote and meme responses keep the field name the shared column had,
`is_favorite`, so this module puts the VIEWER'S own answer back on the ORM
instances before they are serialised, the way user_rating.attach_ratings does
for a rating.

Favourites are a granted feature (`favourites`, services/rbac/features.py):
an account without the switch keeps none, so it reads false on every row and
its `is_favorite` filter matches as if it had none. `favorite_owner` is that
one decision - the account whose favourites a viewer reads, or None.

Writes come through PUT /api/me/favorites/{kind}/{id}
(routers/me_favorites.py), never through the catalogue endpoints.
"""

import uuid
from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy import false, select, true
from sqlalchemy.orm import Session

from app import models
from app.database import get_taipei_now
from app.services.rbac import features
from app.services.rbac.resolver import Viewer

FEATURE_FAVOURITES = "favourites"

# kind -> (the favourited model, the user_favorite column naming it).
FAVORITE_KINDS: dict[str, tuple[type, str]] = {
    "quote": (models.Quote, "quote_id"),
    "meme": (models.Meme, "meme_id"),
}


def favorite_owner(db: Session, viewer: Viewer) -> Optional[UUID]:
    """The account whose favourites this viewer reads: its own, when it
    holds the `favourites` feature; otherwise nobody's."""
    if viewer.user_id is None:
        return None
    if not features.has_feature(db, viewer, FEATURE_FAVOURITES):
        return None
    return viewer.user_id


def _column(kind: str):
    return getattr(models.UserFavorite, FAVORITE_KINDS[kind][1])


def favorite_ids(db: Session, kind: str, item_ids: list, user_id: Optional[UUID]) -> set:
    """The ids among `item_ids` this account favours, in one query."""
    if user_id is None or not item_ids:
        return set()
    column = _column(kind)
    rows = db.query(column).filter(
        models.UserFavorite.user_id == user_id, column.in_(list(item_ids))
    )
    return {item_id for (item_id,) in rows}


def attach_favorites(db: Session, kind: str, items: Iterable, user_id: Optional[UUID]) -> None:
    """
    Set `is_favorite` on each quote or meme to this account's own answer.

    Every row is set, so a row the query does not match reads False rather
    than whatever an earlier attach left on a cached instance. `user_id` None
    - nobody, or an account without the feature - leaves them all False.
    """
    items = [item for item in items if item is not None]
    if not items:
        return
    found = favorite_ids(db, kind, [item.system_id for item in items], user_id)
    for item in items:
        item.is_favorite = item.system_id in found


def favorite_filter(kind: str, wanted: bool, user_id: Optional[UUID]):
    """
    The WHERE clause for the list endpoints' `is_favorite` filter: the items
    this account favours (wanted) or does not (not wanted). An account with
    no favourites - nobody, or no feature - favours nothing.
    """
    model, _column_name = FAVORITE_KINDS[kind]
    if user_id is None:
        return false() if wanted else true()
    column = _column(kind)
    favoured = select(column).where(
        models.UserFavorite.user_id == user_id, column.isnot(None)
    )
    if wanted:
        return model.system_id.in_(favoured)
    return model.system_id.notin_(favoured)


def write_favorite(db: Session, user_id: UUID, kind: str, item_id, value: bool) -> bool:
    """
    Make one item this account's favourite, or not. Idempotent: favouring a
    favourite, or clearing what is not one, changes nothing. Returns the
    stored answer. Added to the session, not committed: the caller owns the
    transaction.
    """
    column = _column(kind)
    row = (
        db.query(models.UserFavorite)
        .filter(models.UserFavorite.user_id == user_id, column == item_id)
        .first()
    )
    if not value:
        if row is not None:
            db.delete(row)
            db.flush()
        return False
    if row is None:
        db.add(
            models.UserFavorite(
                system_id=uuid.uuid4(),
                user_id=user_id,
                created_at=get_taipei_now(),
                updated_at=get_taipei_now(),
                **{FAVORITE_KINDS[kind][1]: item_id},
            )
        )
        db.flush()
    return True
