"""
routers/me_favorites.py
The caller's own favourite quotes and memes.

Whether a quote or a meme is a favourite is each account's own
(`user_favorite`), and it is a granted feature: the route is behind the
caller's `favourites` switch (services/rbac/features.py), and behind
`quotes_memes` as well, the switch every quote and meme read is behind. The
catalogue endpoints do not write it - a catalogue write is
`manage.catalog`'s and would make one account's choice everybody's.

Deliberately narrow, as /api/me/ratings is. The route writes ONE row - the
caller's, for one item - and never takes a user id, so it cannot address
anybody else's. It is idempotent: favouring a favourite, or clearing what is
not one, changes nothing.

Writes follow reads: an item the caller's GET would answer 404 for is a 404
here too, in the same words, so a hidden quote cannot be confirmed by
favouring it.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.services.domain.user_favorite import (
    FAVORITE_KINDS,
    FEATURE_FAVOURITES,
    write_favorite,
)
from app.services.rbac.enforcement import drop_hidden_rows, entry_visible
from app.services.rbac.features import require_feature, require_feature_quotes_memes
from app.services.rbac.resolver import Viewer

router = APIRouter(
    prefix="/api/me",
    tags=["My Favourites"],
    # Router-level, as in me_ratings.py: a route added here later is gated
    # by default. 401, never 403.
    dependencies=[
        Depends(require_feature(FEATURE_FAVOURITES)),
        Depends(require_feature_quotes_memes),
    ],
)

# The not-found words each item's own GET uses.
NOT_FOUND: dict[str, str] = {"quote": "Quote not found.", "meme": "Meme not found."}


class FavoriteWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_favorite: bool


class FavoriteRead(BaseModel):
    kind: str
    item_id: UUID
    is_favorite: bool


def _visible(db: Session, viewer: Viewer, kind: str, item) -> bool:
    """Whether the item's own GET would answer this viewer."""
    if kind == "quote":
        if item.media_type and item.entry_id:
            return entry_visible(db, viewer, item.media_type, item.entry_id)
        return True
    return bool(drop_hidden_rows(db, viewer, [item], "owner_type", "owner_id"))


@router.put(
    "/favorites/{kind}/{item_id}",
    response_model=FavoriteRead,
    summary="Write My Favourite",
)
def write_my_favorite(
    kind: str,
    item_id: UUID,
    payload: FavoriteWrite,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_feature(FEATURE_FAVOURITES)),
):
    """
    Make one quote or meme the caller's favourite, or not. `kind` is `quote`
    or `meme`; `item_id` its system_id.

    404 for an unknown kind, and for an item that does not exist or that the
    caller may not see.
    """
    if kind not in FAVORITE_KINDS:
        raise HTTPException(status_code=404, detail="Unknown favourite kind.")
    model, _column = FAVORITE_KINDS[kind]
    item = db.get(model, item_id)
    if item is None or not _visible(db, viewer, kind, item):
        raise HTTPException(status_code=404, detail=NOT_FOUND[kind])

    stored = write_favorite(db, viewer.user_id, kind, item.system_id, payload.is_favorite)
    db.commit()
    return FavoriteRead(kind=kind, item_id=item.system_id, is_favorite=stored)
