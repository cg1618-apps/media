"""
Reading which content labels an object carries.

The WRITE side is app/routers/content_labels.py; this is only the read-time
attachment that puts `content_labels` on a response so a detail page can show
what restricts the thing it is showing.

Showing them is safe by construction: a viewer only reaches an object whose
labels their active mode carries (app/services/rbac/enforcement.py), so the
set attached here is always a subset of what that session may already see.
There is therefore no gate on this attachment, and adding one would blank the
display for exactly the sessions allowed to read it.
"""

from uuid import UUID

from sqlalchemy.orm import Session

from app import models


def _labels_by_owner(
    db: Session, join_model, owner_column, owner_ids: list[UUID]
) -> dict[UUID, list[models.ContentLabel]]:
    """One query for many owners, so a list page is never an N+1."""
    if not owner_ids:
        return {}
    rows = (
        db.query(owner_column, models.ContentLabel)
        .join(
            models.ContentLabel,
            models.ContentLabel.system_id == join_model.label_id,
        )
        .filter(owner_column.in_(owner_ids))
        .order_by(join_model.position, models.ContentLabel.key)
        .all()
    )
    out: dict[UUID, list[models.ContentLabel]] = {}
    for owner_id, label in rows:
        out.setdefault(owner_id, []).append(label)
    return out


def attach_content_labels(db: Session, entries) -> None:
    """
    Set `entry.content_labels` on ORM media entries in place.

    The entry's OWN labels only - not its franchise's. The two restrict the
    same entry but they are different facts, and a detail page that ran them
    together would offer no way to tell which one to edit to reveal it.
    The franchise's set is shown on the franchise, where it can be changed.
    """
    if entries is None:
        return
    rows = list(entries) if isinstance(entries, (list, tuple)) else [entries]
    if not rows:
        return
    by_owner = _labels_by_owner(
        db,
        models.MediaContentLabel,
        models.MediaContentLabel.media_id,
        [row.system_id for row in rows],
    )
    for row in rows:
        row.content_labels = by_owner.get(row.system_id, [])


def attach_franchise_content_labels(db: Session, franchises) -> None:
    """Set `franchise.content_labels` on ORM franchises in place."""
    if franchises is None:
        return
    rows = list(franchises) if isinstance(franchises, (list, tuple)) else [franchises]
    if not rows:
        return
    by_owner = _labels_by_owner(
        db,
        models.FranchiseContentLabel,
        models.FranchiseContentLabel.franchise_id,
        [row.system_id for row in rows],
    )
    for row in rows:
        row.content_labels = by_owner.get(row.system_id, [])


def label_keys_for_franchise(db: Session, franchise_id: UUID) -> list[str]:
    """The label keys one franchise carries, sorted - the write path's read."""
    rows = (
        db.query(models.ContentLabel.key)
        .join(
            models.FranchiseContentLabel,
            models.FranchiseContentLabel.label_id
            == models.ContentLabel.system_id,
        )
        .filter(models.FranchiseContentLabel.franchise_id == franchise_id)
        .all()
    )
    return sorted(key for (key,) in rows)


def label_keys_for_entry(db: Session, entry_id: UUID) -> list[str]:
    """The label keys one media entry carries, sorted."""
    rows = (
        db.query(models.ContentLabel.key)
        .join(
            models.MediaContentLabel,
            models.MediaContentLabel.label_id == models.ContentLabel.system_id,
        )
        .filter(models.MediaContentLabel.media_id == entry_id)
        .all()
    )
    return sorted(key for (key,) in rows)


__all__ = [
    "attach_content_labels",
    "attach_franchise_content_labels",
    "label_keys_for_entry",
    "label_keys_for_franchise",
]
