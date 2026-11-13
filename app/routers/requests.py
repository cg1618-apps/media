"""
routers/requests.py
Requests and reports: what a member files, and the inbox that handles them.

Two gates and no others. `self.requests` (require_file_requests) files a
request and reads and edits your own; `manage.requests`
(require_handle_requests) is the inbox. Both answer 401 when refused, the one
error shape the SPA knows. Filing is a self.* permission, so an administrative
account, which holds none, handles requests and files none.

The rules themselves live in app/services/domain/requests.py.
"""

from typing import List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app import schemas
from app.dependencies import get_db
from app.services.domain import requests as service
from app.services.rbac.resolver import (
    Viewer,
    require_file_requests,
    require_handle_requests,
)
from app.utils.constants import REQUEST_STATUS_OPEN, REQUEST_STATUSES

router = APIRouter(prefix="/api/requests", tags=["Requests"])

StatusFilter = Literal[REQUEST_STATUSES]
InboxFilter = Literal[(*REQUEST_STATUSES, service.ALL_STATUSES)]


# ==========================================
# THE CALLER'S OWN
# ==========================================


@router.get(
    "/mine", response_model=List[schemas.UserRequestResponse], summary="My Requests"
)
def list_my_requests(
    status_filter: Optional[StatusFilter] = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_file_requests),
):
    """The caller's own requests, newest first, every status unless filtered."""
    rows = service.list_mine(db, viewer.user_id, status_filter)
    return service.to_responses(db, rows, viewer)


@router.post(
    "",
    response_model=schemas.UserRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="File a Request",
)
def file_request(
    payload: schemas.UserRequestCreate,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_file_requests),
):
    row = service.file_request(db, viewer, payload)
    return service.to_responses(db, [row], viewer)[0]


@router.patch(
    "/{request_id}",
    response_model=schemas.UserRequestResponse,
    summary="Edit My Request",
)
def edit_my_request(
    request_id: UUID,
    payload: schemas.UserRequestUpdate,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_file_requests),
):
    row = service.edit_own(db, viewer, request_id, payload)
    return service.to_responses(db, [row], viewer)[0]


# ==========================================
# THE INBOX
# ==========================================


@router.get(
    "", response_model=List[schemas.UserRequestResponse], summary="Request Inbox"
)
def list_inbox(
    status_filter: InboxFilter = Query(default=REQUEST_STATUS_OPEN, alias="status"),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_handle_requests),
):
    """Every account's requests, newest first; open ones unless filtered."""
    rows = service.list_inbox(db, status_filter)
    return service.to_responses(db, rows, viewer)


@router.get(
    "/summary", response_model=schemas.UserRequestSummary, summary="Request Summary"
)
def request_summary(
    db: Session = Depends(get_db),
    _viewer: Viewer = Depends(require_handle_requests),
):
    return schemas.UserRequestSummary(open=service.open_count(db))


@router.put(
    "/{request_id}/status",
    response_model=schemas.UserRequestResponse,
    summary="Set a Request's Status",
)
def set_request_status(
    request_id: UUID,
    payload: schemas.UserRequestStatusUpdate,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_handle_requests),
):
    row = service.set_status(db, viewer, request_id, payload)
    return service.to_responses(db, [row], viewer)[0]


@router.delete(
    "/{request_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a Request",
)
def delete_request(
    request_id: UUID,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_handle_requests),
):
    service.delete_request(db, viewer, request_id)
    return None
