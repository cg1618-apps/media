"""
routers/me_highlights.py
The caller's own order of the highlight groups on an h-comic or an h-game.

The h_comic_highlights and h_game_highlights sections are personal notes, and
their read view draws one group per female character name. Which group comes
first is the caller's own too (`user_highlight_group_order`), served back as
the entry's `highlight_group_order`. The entry endpoints do not write it - an
entry write is `manage.catalog`'s and would make one account's order
everybody's. It is written here, behind `self.personal_notes`, the permission
the highlight rows themselves are written under.

Deliberately narrow, as /api/me/ratings is: the route writes ONE row - the
caller's, for one entry - and never takes a user id. The order is read and
written whole; null or an empty list clears it, and a cleared order is not
stored.

Writes follow reads: an entry the caller's GET would answer 404 for is a 404
here too, so a hidden entry cannot be confirmed by ordering it.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy.orm import Session

from app import models
from app.dependencies import get_db
from app.services.domain.h_comic import normalize_group_order
from app.services.domain.highlight_group_order import (
    GROUP_ORDER_TYPES,
    write_group_order,
)
from app.services.rbac.enforcement import entry_visible
from app.services.rbac.permissions import PERM_SELF_PERSONAL_NOTES
from app.services.rbac.resolver import Viewer, require_permission
from app.utils.constants import H_COMIC_REGION_JP

router = APIRouter(
    prefix="/api/me",
    tags=["My Highlights"],
    # Router-level, as in me_ratings.py: every route here writes the caller's
    # own rows, so a route added later is gated by default. 401, never 403 -
    # and the admin, whose root flag never passes a self.* permission, is
    # refused too: it keeps no personal data.
    dependencies=[Depends(require_permission(PERM_SELF_PERSONAL_NOTES))],
)

NOT_FOUND = "Entry not found."


class GroupOrderWrite(BaseModel):
    """{group_order: [names] | null}. The key is required; null clears."""

    model_config = ConfigDict(extra="forbid")

    group_order: Optional[List[str]]

    @field_validator("group_order", mode="before")
    @classmethod
    def _names(cls, v):
        return normalize_group_order(v)


class GroupOrderRead(BaseModel):
    media_id: UUID
    group_order: Optional[List[str]] = None


@router.put(
    "/highlight-group-order/{media_id}",
    response_model=GroupOrderRead,
    summary="Write My Highlight Group Order",
)
def write_my_group_order(
    media_id: UUID,
    payload: GroupOrderWrite,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_permission(PERM_SELF_PERSONAL_NOTES)),
):
    """
    Set or clear the caller's order of the highlight groups on one h-comic or
    h-game. `media_id` is the entry's system_id.

    404 for an entry that does not exist, is of any other type, or that the
    caller may not see. 422 for a value that is not a list of names, and for
    a JP h-comic, which has no highlights section to order.
    """
    media = db.get(models.Media, media_id)
    if (
        media is None
        or media.media_type not in GROUP_ORDER_TYPES
        or not entry_visible(db, viewer, media.media_type, media.system_id)
    ):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    if viewer.user_id is None:
        # A guard, as in me_ratings.py: a permission held by no account.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials or insufficient permissions",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if media.media_type == "h-comic":
        entry = db.get(models.HComic, media.system_id)
        if entry is not None and entry.region == H_COMIC_REGION_JP:
            raise HTTPException(
                status_code=422,
                detail="A JP h-comic has no highlights, so no group order.",
            )

    order = write_group_order(db, viewer.user_id, media.system_id, payload.group_order)
    db.commit()
    return GroupOrderRead(media_id=media.system_id, group_order=order)
