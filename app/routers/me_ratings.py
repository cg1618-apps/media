"""
routers/me_ratings.py
The caller's own rating and expectation of a catalogue row, and its own
rating and remark of a novel unit.

The rating of a collection, franchise, series, character, person, studio or
publisher, and the expectation of the three tiers, are opinions, so each
account keeps its own (`user_rating`); a novel unit's rating and remark sit
on `user_novel_unit_rating` the same way. The catalogue endpoints do not
write them - a catalogue write is `manage.catalog`'s and would make one
account's opinion everybody's. They are written here, behind `self.list`, the
permission every other piece of the caller's own data is written under.

Deliberately narrow, as /api/me/list is. Each route writes ONE row - the
caller's, for one owner - and never takes a user id, so it cannot address
anybody else's. The body is PARTIAL: only the keys sent change, and null (or
"") clears one. A row left holding nothing is deleted.

Writes follow reads: an owner the caller's GET would answer 404 for is a 404
here too, in the same words, so a hidden row cannot be confirmed by rating
it.
"""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy.orm import Session

from app import models
from app.dependencies import get_db
from app.services.domain.novel_unit_writer import write_unit_rating
from app.services.domain.user_rating import (
    EXPECTATION_FIELDS,
    OWNER_COLUMNS,
    OWNER_MODELS,
    write_rating,
)
from app.services.rbac.enforcement import (
    entry_visible,
    franchise_visible,
    series_visible,
)
from app.services.rbac.permissions import PERM_SELF_LIST, PERM_VIEW_ENTITIES
from app.services.rbac.resolver import Viewer, require_permission
from app.services.rbac.shared_visibility import shared_record_visible
from app.utils.constants import FRANCHISE_EXPECTATIONS
from app.utils.entity_ref import find_entity
from app.utils.entity_vocab import check_my_rating

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/me",
    tags=["My Ratings"],
    # Router-level, as in me_list.py: every route here writes the caller's
    # own rows, so a route added later is gated by default. 401, never 403.
    dependencies=[Depends(require_permission(PERM_SELF_LIST))],
)

# The not-found words each owner's own GET uses.
NOT_FOUND: dict[str, str] = {
    "collection": "Collection not found.",
    "franchise": "Franchise not found.",
    "series": "Series not found.",
    "character": "Character not found.",
    "person": "Person not found.",
    "studio": "Studio not found.",
    "publisher": "Publisher not found.",
}

# The entities' GETs sit behind view.entities, as well as their own
# shared-record visibility.
ENTITY_TYPES = frozenset({"character", "person", "studio", "publisher"})


def _blank_to_none(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


class RatingWrite(BaseModel):
    """{my_rating?, expectation?}. A key not sent is left as it is."""

    model_config = ConfigDict(extra="forbid")

    my_rating: Optional[str] = None
    expectation: Optional[str] = None

    @field_validator("my_rating")
    @classmethod
    def _known_rating(cls, v):
        return check_my_rating(v)

    @field_validator("expectation")
    @classmethod
    def _known_expectation(cls, v):
        v = _blank_to_none(v)
        if v is not None and v not in FRANCHISE_EXPECTATIONS:
            raise ValueError(
                f"'{v}' is not an expectation. Expected one of: "
                + ", ".join(FRANCHISE_EXPECTATIONS)
            )
        return v


class RatingRead(BaseModel):
    owner_type: str
    owner_id: UUID
    my_rating: Optional[str] = None
    expectation: Optional[str] = None


class UnitRatingWrite(BaseModel):
    """{my_rating?, remark?}. A key not sent is left as it is."""

    model_config = ConfigDict(extra="forbid")

    my_rating: Optional[str] = None
    remark: Optional[str] = None

    @field_validator("my_rating")
    @classmethod
    def _known_rating(cls, v):
        return check_my_rating(v)


class UnitRatingRead(BaseModel):
    unit_id: UUID
    my_rating: Optional[str] = None
    remark: Optional[str] = None


def _caller_id(viewer: Viewer) -> UUID:
    """A guard, as in me_list.py: a permission held by no account."""
    if viewer.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials or insufficient permissions",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return viewer.user_id


def _visible(db: Session, viewer: Viewer, owner_type: str, owner) -> bool:
    """Whether the owner's own GET would answer this viewer."""
    if owner_type == "franchise":
        return franchise_visible(db, viewer, owner.system_id)
    if owner_type == "series":
        return series_visible(db, viewer, owner.system_id)
    if owner_type in ENTITY_TYPES:
        return viewer.has(PERM_VIEW_ENTITIES) and shared_record_visible(
            db, viewer, OWNER_MODELS[owner_type], owner.system_id
        )
    # A collection's GET applies no visibility rule.
    return True


@router.put(
    "/ratings/{owner_type}/{owner_id}",
    response_model=RatingRead,
    summary="Write My Rating",
)
def write_my_rating(
    owner_type: str,
    owner_id: str,
    payload: RatingWrite,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_permission(PERM_SELF_LIST)),
):
    """
    Set or clear the caller's rating of one owner, and for a collection,
    franchise or series its expectation. `owner_id` is the system_id or the
    public_id, as the owner's own GET accepts.

    404 for an unknown owner type, and for an owner that does not exist or
    that the caller may not see. 422 for a rating outside MY_RATINGS, an
    expectation outside FRANCHISE_EXPECTATIONS, or any expectation on a
    character, person, studio or publisher - they carry none.
    """
    if owner_type not in OWNER_COLUMNS:
        raise HTTPException(status_code=404, detail="Unknown owner type.")
    changes = payload.model_dump(exclude_unset=True)
    if "expectation" in changes and owner_type not in EXPECTATION_FIELDS:
        raise HTTPException(
            status_code=422,
            detail=f"A {owner_type} has no expectation; only a collection, "
            "franchise or series does.",
        )
    owner = find_entity(db, OWNER_MODELS[owner_type], owner_id)
    if owner is None or not _visible(db, viewer, owner_type, owner):
        raise HTTPException(status_code=404, detail=NOT_FOUND[owner_type])
    user_id = _caller_id(viewer)

    row = write_rating(db, user_id, owner_type, owner.system_id, changes)
    db.commit()
    return RatingRead(
        owner_type=owner_type,
        owner_id=owner.system_id,
        my_rating=row.my_rating if row is not None else None,
        expectation=row.expectation if row is not None else None,
    )


@router.put(
    "/novel-units/{unit_id}",
    response_model=UnitRatingRead,
    summary="Write My Novel Unit Rating",
)
def write_my_unit_rating(
    unit_id: UUID,
    payload: UnitRatingWrite,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_permission(PERM_SELF_LIST)),
):
    """
    Set or clear the caller's rating of, and remark on, one novel unit. 404
    for a unit that does not exist or whose novel the caller may not see;
    422 for a rating outside MY_RATINGS.
    """
    unit = db.get(models.NovelUnit, unit_id)
    if unit is None or not entry_visible(db, viewer, "novel", unit.novel_id):
        raise HTTPException(status_code=404, detail="Novel unit not found.")
    user_id = _caller_id(viewer)

    row = write_unit_rating(
        db, user_id, unit.system_id, payload.model_dump(exclude_unset=True)
    )
    db.commit()
    return UnitRatingRead(
        unit_id=unit.system_id,
        my_rating=row.my_rating if row is not None else None,
        remark=row.remark if row is not None else None,
    )
