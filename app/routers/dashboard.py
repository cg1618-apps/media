"""
routers/dashboard.py
What the dashboard (`/`) needs beyond the pages it links to.

The dashboard differs per viewer (docs/viewers.md, "Dashboard"). Most of it is
drawn from routes that already exist - announcements, the anime list, the
viewer's own tracker. Two pieces are not:

  * the summary of what waits for a handler - pending registrations and open
    requests and reports - shown to super and the admin. Behind
    `manage.requests`, the permission whoever handles them holds;
  * recently added entries, shown on a shared account's dashboard. Catalogue
    data, narrowed to what the viewer may see like every catalogue read.
"""

from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.models.system import USER_STATUS_PENDING
from app.services.rbac.enforcement import apply_media_visibility
from app.services.rbac.resolver import Viewer, get_viewer, require_handle_requests
from app.utils.constants import REQUEST_STATUS_OPEN

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

RECENT_DEFAULT = 12
RECENT_MAX = 50


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
    limit: int = Query(default=RECENT_DEFAULT, ge=1, le=RECENT_MAX),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """The newest entries across every media type the viewer may see, newest
    first. A type the role does not hold and an entry its mode hides are left
    out, as on every catalogue list."""
    query = apply_media_visibility(db.query(models.Media), db, viewer)
    return query.order_by(models.Media.created_at.desc()).limit(limit).all()
