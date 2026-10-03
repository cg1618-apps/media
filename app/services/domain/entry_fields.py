"""
The non-column fields a page of entries carries in a list response.

The response schemas read from attributes, and a good half of what an entry
card shows is not a column on the entry's table: the viewer's status, progress
and rating live on user_media_list, sources and content labels on their own
tables, and the plan flags, remark and game copies are per viewer. Each has an
attach_* helper; this module is the one place that says which of them a list
of entries gets, so every endpoint that returns cards - the media list routes
and the cross-type search - hands back the same card.
"""

from sqlalchemy.orm import Session

from app.services.domain.content_labels import attach_content_labels
from app.services.domain.credits import attach_link_fields
from app.services.domain.game_copies import attach_own_copies
from app.services.domain.h_comic import attach_animation_status
from app.services.domain.plan_next import PLAN_FLAG_FIELDS, planned_entry_ids
from app.services.domain.remark_field import attach_remark
from app.services.domain.sources import attach_sources
from app.services.domain.user_list import (
    acting_user_id,
    attach_list_fields,
    attach_unit_ratings,
)
from app.services.rbac.resolver import viewer_user_id


def attach_entry_list_fields(db: Session, media_type: str, entries: list, viewer) -> None:
    """Attach every non-column field to a page of entries, a query per field
    for the whole page rather than one per entry."""
    user_id = acting_user_id(db, viewer)
    plan_user_id = viewer_user_id(viewer)
    for field, kind in PLAN_FLAG_FIELDS.get(media_type, ()):
        planned = planned_entry_ids(db, media_type, kind, user_id=plan_user_id)
        for entry in entries:
            setattr(entry, field, entry.system_id in planned)
    attach_link_fields(db, media_type, entries)
    attach_sources(db, media_type, entries, viewer)
    attach_content_labels(db, entries)
    attach_list_fields(db, media_type, entries, user_id)
    attach_unit_ratings(db, media_type, entries, user_id)
    # Filtered to this viewer's own purchases.
    attach_own_copies(db, media_type, entries, user_id)
    # The h-comics' hentai adaptations; a no-op for every other type.
    attach_animation_status(db, media_type, entries)
    # Filtered to this viewer's own remarks.
    attach_remark(db, media_type, entries, plan_user_id)
