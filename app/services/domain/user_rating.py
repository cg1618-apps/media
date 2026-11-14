"""
Reading and writing one account's rating and expectation of a catalogue row.

`user_rating` holds, per account, the rating of a collection, franchise,
series, character, person, studio or publisher, and the expectation of the
three tiers. The response schemas keep the field names the shared columns had
- `my_rating`, `collection_expectation`, `franchise_expectation`,
`series_expectation` - so this module puts the VIEWER'S own values back on the
ORM instances before they are serialised, the way user_list.attach_list_fields
does for the list row. Nobody asking means nothing to show: a guest reads
null, never somebody else's value.

Writes come through PUT /api/me/ratings/... (routers/me_ratings.py), never
through the catalogue endpoints.
"""

import uuid
from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.database import get_taipei_now
from app.models.user_rating import USER_RATING_OWNER_COLUMNS

# Owner type -> the user_rating column naming it.
OWNER_COLUMNS: dict[str, str] = {
    "collection": "collection_id",
    "franchise": "franchise_id",
    "series": "series_id",
    "character": "character_id",
    "person": "person_id",
    "studio": "studio_id",
    "publisher": "publisher_id",
}

assert set(OWNER_COLUMNS.values()) == set(USER_RATING_OWNER_COLUMNS)

# Owner type -> the ORM model the owner column points at.
OWNER_MODELS: dict[str, type] = {
    "collection": models.Collection,
    "franchise": models.Franchise,
    "series": models.Series,
    "character": models.Character,
    "person": models.Person,
    "studio": models.Studio,
    "publisher": models.Publisher,
}

# The tiers carry an expectation as well, under a field named per tier.
EXPECTATION_FIELDS: dict[str, str] = {
    "collection": "collection_expectation",
    "franchise": "franchise_expectation",
    "series": "series_expectation",
}

# merge_fill's owner types -> ours. The person merge calls itself "staff"
# because that is its cover-image owner type.
MERGE_OWNER_TYPES: dict[str, str] = {
    "character": "character",
    "staff": "person",
    "studio": "studio",
    "publisher": "publisher",
}


def _items(entries) -> list:
    if entries is None:
        return []
    if isinstance(entries, Iterable) and not hasattr(entries, "system_id"):
        return list(entries)
    return [entries]


def ratings_by_owner(
    db: Session, owner_type: str, owner_ids: list, user_id: Optional[UUID]
) -> dict:
    """{owner id: UserRating} for one account, one query for the whole page."""
    if user_id is None or not owner_ids:
        return {}
    column = getattr(models.UserRating, OWNER_COLUMNS[owner_type])
    rows = (
        db.query(models.UserRating)
        .filter(models.UserRating.user_id == user_id, column.in_(owner_ids))
        .all()
    )
    return {getattr(row, OWNER_COLUMNS[owner_type]): row for row in rows}


def attach_ratings(db: Session, owner_type: str, entries, user_id) -> None:
    """
    Set `my_rating` (and the tier's expectation field) on one row or a page
    of them, to this account's own values.

    Every row is blanked FIRST and then filled, so a row the query does not
    match reads None rather than whatever an earlier attach left on a cached
    instance - the attributes are plain ones, which nothing else clears.
    `user_id` None - nobody asking - leaves them all None.
    """
    items = _items(entries)
    if not items:
        return
    expectation_field = EXPECTATION_FIELDS.get(owner_type)
    for entry in items:
        entry.my_rating = None
        if expectation_field:
            setattr(entry, expectation_field, None)
    found = ratings_by_owner(db, owner_type, [e.system_id for e in items], user_id)
    for entry in items:
        row = found.get(entry.system_id)
        if row is None:
            continue
        entry.my_rating = row.my_rating
        if expectation_field:
            setattr(entry, expectation_field, row.expectation)


def own_expectations(
    db: Session, owner_type: str, owner_ids: list, user_id: Optional[UUID]
) -> dict:
    """{owner id: expectation} for one account; tiers only, else empty."""
    if owner_type not in EXPECTATION_FIELDS:
        return {}
    return {
        owner_id: row.expectation
        for owner_id, row in ratings_by_owner(db, owner_type, owner_ids, user_id).items()
        if row.expectation
    }


def rating_row(db: Session, user_id: UUID, owner_type: str, owner_id) -> Optional[models.UserRating]:
    """One account's row for one owner, or None. Never creates."""
    column = getattr(models.UserRating, OWNER_COLUMNS[owner_type])
    return (
        db.query(models.UserRating)
        .filter(models.UserRating.user_id == user_id, column == owner_id)
        .first()
    )


def write_rating(
    db: Session, user_id: UUID, owner_type: str, owner_id, changes: dict
) -> Optional[models.UserRating]:
    """
    Apply a partial change - `my_rating` and/or `expectation`, only the keys
    present - to one account's row for one owner. Validation is the caller's.

    Returns the row, or None when it holds nothing afterwards and was
    therefore deleted (or never created). Added to the session, not
    committed: the caller owns the transaction.
    """
    row = rating_row(db, user_id, owner_type, owner_id)
    my_rating = changes.get("my_rating", row.my_rating if row else None)
    expectation = changes.get("expectation", row.expectation if row else None)
    if my_rating is None and expectation is None:
        if row is not None:
            db.delete(row)
            db.flush()
        return None
    if row is None:
        row = models.UserRating(
            system_id=uuid.uuid4(),
            user_id=user_id,
            **{OWNER_COLUMNS[owner_type]: owner_id},
        )
        db.add(row)
    row.my_rating = my_rating
    row.expectation = expectation
    row.updated_at = get_taipei_now()
    db.flush()
    return row


def merge_user_ratings(db: Session, merge_owner_type: str, keep_id, drop_id) -> None:
    """
    Before the loser of a merge is deleted: each account's rating of the
    loser moves to the survivor when that account has none there; the rest
    are dropped (the survivor's own rating wins, as its columns do in
    merge_fill). Runs as SQL at once, so the ON DELETE CASCADE the delete
    fires next finds nothing left to take that should have moved.
    """
    owner_type = MERGE_OWNER_TYPES.get(merge_owner_type, merge_owner_type)
    if owner_type not in OWNER_COLUMNS:
        return
    column = getattr(models.UserRating, OWNER_COLUMNS[owner_type])
    rated_keep = {
        user_id
        for (user_id,) in db.query(models.UserRating.user_id).filter(column == keep_id)
    }
    losers = db.query(models.UserRating).filter(column == drop_id)
    if rated_keep:
        losers.filter(models.UserRating.user_id.in_(rated_keep)).delete(
            synchronize_session=False
        )
    db.query(models.UserRating).filter(column == drop_id).update(
        {OWNER_COLUMNS[owner_type]: keep_id}, synchronize_session=False
    )
