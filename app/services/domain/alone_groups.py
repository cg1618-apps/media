"""
The review queue's relation check: franchises and series holding exactly one
media entry.

A group with one entry is often a group that should not exist - the entry
belongs in a neighbour, or its siblings were never added. Often is not
always, so a group can be marked reviewed: `alone_reviewed_media_id` records
WHICH lone entry was reviewed, and the group stays off the list only while
that same entry is still its only one. Replace the entry and the question is
open again, with nothing to reset by hand.

Entries are counted on the `media` supertable, so all twelve types count and
one query answers each tier.
"""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Franchise, Media, Series

# kind -> (tier model, the media column pointing at it)
_TIERS = {
    "franchise": (Franchise, Media.franchise_id),
    "series": (Series, Media.series_id),
}


class GroupNotFound(Exception):
    pass


class NotAlone(Exception):
    """The group does not hold exactly one entry (any more)."""


def _lone_entries(db: Session, column, group_ids=None) -> dict:
    """{group id: its one Media row}, for every group with exactly one entry."""
    single = (
        db.query(column)
        .filter(column.isnot(None))
        .group_by(column)
        .having(func.count(Media.system_id) == 1)
    )
    if group_ids is not None:
        single = single.filter(column.in_(group_ids))
    ids = single.subquery()
    rows = db.query(Media).filter(column.in_(select(*ids.c))).all()
    return {getattr(row, column.key): row for row in rows}


def _entry(media: Media) -> dict:
    return {
        "system_id": media.system_id,
        "media_type": media.media_type,
        "public_id": media.public_id,
        "display_name": media.display_name,
    }


def find_alone_groups(db: Session) -> dict:
    """
    {"franchise": [...], "series": [...]}: every group with exactly one entry
    whose lone entry is not the one recorded as reviewed, by display name.
    """
    report = {}
    for kind, (model, column) in _TIERS.items():
        lone = _lone_entries(db, column)
        groups = db.query(model).filter(model.system_id.in_(list(lone))).all() if lone else []
        rows = [
            {
                "system_id": group.system_id,
                "public_id": group.public_id,
                "display_name": group.display_name,
                "entry": _entry(lone[group.system_id]),
            }
            for group in groups
            if group.alone_reviewed_media_id != lone[group.system_id].system_id
        ]
        rows.sort(key=lambda r: (r["display_name"] or "").lower())
        report[kind] = rows
    return report


def mark_alone_group_reviewed(db: Session, kind: str, system_id: UUID):
    """
    Record the group's current lone entry as reviewed, and return the group.

    Raises GroupNotFound for an unknown group, NotAlone when it does not hold
    exactly one entry - reviewing "the lone entry" of a group that has two is
    a decision about an entry nobody was shown.
    """
    model, column = _TIERS[kind]
    group = db.get(model, system_id)
    if group is None:
        raise GroupNotFound(kind)
    lone = _lone_entries(db, column, group_ids=[system_id]).get(system_id)
    if lone is None:
        raise NotAlone(kind)
    group.alone_reviewed_media_id = lone.system_id
    db.commit()
    db.refresh(group)
    return group
