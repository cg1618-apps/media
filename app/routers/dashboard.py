"""
routers/dashboard.py
What the dashboard (`/`) needs beyond the pages it links to.

The dashboard differs per viewer (docs/viewers.md, "Dashboard"). Most of it is
drawn from routes that already exist - announcements, the anime list, the
viewer's own tracker. Two pieces are not:

  * the summary of what waits for a handler - pending registrations and open
    requests and reports - shown to super and the admin. Behind
    `manage.requests`, the permission whoever handles them holds;
  * recently added entries, shown on a shared account's dashboard as one
    section per media type. Catalogue data, narrowed to what the viewer may
    see like every catalogue read, and cut per type so a busy type cannot
    crowd a quiet one off the page.
"""

from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.models.system import USER_STATUS_PENDING
from app.services.rbac.enforcement import apply_media_visibility
from app.services.rbac.resolver import Viewer, get_viewer, require_handle_requests
from app.utils.constants import REQUEST_STATUS_OPEN

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

RECENT_PER_TYPE_DEFAULT = 6
RECENT_PER_TYPE_MAX = 24


@router.get(
    "/summary",
    response_model=schemas.DashboardSummary,
    summary="What waits for a handler",
)
def dashboard_summary(
    db: Session = Depends(get_db),
    _viewer: Viewer = Depends(require_handle_requests),
):
    """How many registrations wait for approval and how many requests and
    reports are open. Counts only: the dashboard links to where each is
    handled, and draws nothing when both are zero."""
    return {
        "pending_registrations": db.query(models.User)
        .filter(models.User.status == USER_STATUS_PENDING)
        .count(),
        "open_requests": db.query(models.UserRequest)
        .filter(models.UserRequest.status == REQUEST_STATUS_OPEN)
        .count(),
    }


@router.get(
    "/recent",
    response_model=List[schemas.RecentEntry],
    summary="Recently added entries",
)
def recently_added(
    per_type: int = Query(
        default=RECENT_PER_TYPE_DEFAULT, ge=1, le=RECENT_PER_TYPE_MAX
    ),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """The newest `per_type` entries of each media type the viewer may see,
    newest first. A type the role does not hold and an entry its mode hides
    are left out, as on every catalogue list, and a type with nothing visible
    has no rows at all.

    One query: the visible entries are numbered newest first within their
    type (row_number over a partition by media_type) and cut at `per_type`.
    system_id breaks a tie in created_at, so the cut is stable."""
    newest_first = (models.Media.created_at.desc(), models.Media.system_id)
    rank = (
        func.row_number()
        .over(partition_by=models.Media.media_type, order_by=newest_first)
        .label("rank")
    )
    ranked = (
        apply_media_visibility(db.query(models.Media), db, viewer)
        .with_entities(models.Media.system_id, rank)
        .subquery()
    )
    return (
        db.query(models.Media)
        .join(ranked, ranked.c.system_id == models.Media.system_id)
        .filter(ranked.c.rank <= per_type)
        .order_by(*newest_first)
        .all()
    )
