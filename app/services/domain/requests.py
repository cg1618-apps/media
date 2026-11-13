"""
Requests and reports: the rules behind /api/requests.

A member files a request - a missing entry, wrong or incomplete data, a bug,
anything else - optionally about one target (an entry, a grouping tier or an
entity). Its author reads and edits it while it is open; a handler marks it
done or declined with an optional response, sets it back to open, or deletes
it.

The rules, each in one place below:

- **The limit** counts the author's OPEN requests. At or over a non-null
  `users.open_request_limit` filing is a 409. A handled request frees its
  slot. The super role is never limited, whatever is stored
  (effective_request_limit).
- **Editing** is the author's, `description` and `remark` only, and only
  while the request is open (409 otherwise). Another account's request is a
  404: writes follow reads.
- **Handling** sets the status. Closing records who and when; reopening
  clears both and re-enables the author's editing.
- **A target** must exist (422), but its visibility is not checked:
  requesting something the filer's mode hides is allowed.

Every write logs one line with the id, the kind and the actor - for a
deletion, that line is the only record left.
"""

import logging
from typing import Iterable, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_taipei_now
from app.services.rbac.permissions import (
    SHARED_ROLE_NAME,
    SUPER_ROLE_NAME,
    USER_ROLE_NAME,
)
from app.services.rbac.resolver import Viewer
from app.utils.constants import REQUEST_STATUS_OPEN
from app.utils.media_resolver import (
    REQUEST_TARGET_TABLES,
    entry_ref_for,
    resolve_entries,
)

logger = logging.getLogger(__name__)

# Each role's starting open-request limit. A role not named here starts with
# none. Applied when an account is created and when its role changes.
DEFAULT_REQUEST_LIMITS: dict[str, int] = {USER_ROLE_NAME: 15, SHARED_ROLE_NAME: 10}

# The roles whose limit is fixed at none: never stored, never enforced.
UNLIMITED_ROLES: frozenset[str] = frozenset({SUPER_ROLE_NAME})

# What GET /api/requests accepts for ?status=, beyond the statuses themselves.
ALL_STATUSES = "all"


def default_request_limit(role_name: Optional[str]) -> Optional[int]:
    """The open-request limit an account in this role starts with; None is none."""
    return DEFAULT_REQUEST_LIMITS.get(role_name or "")


def limit_is_fixed(role_name: Optional[str]) -> bool:
    """Whether this role's limit is fixed at none, so not an admin's to set."""
    return role_name in UNLIMITED_ROLES


def effective_request_limit(user: models.User) -> Optional[int]:
    """The limit filing enforces for this account; None is no limit."""
    role_name = user.role_ref.name if user.role_ref else None
    if limit_is_fixed(role_name):
        return None
    return user.open_request_limit


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


def list_mine(
    db: Session, user_id: UUID, status: Optional[str] = None
) -> list[models.UserRequest]:
    query = db.query(models.UserRequest).filter(
        models.UserRequest.author_id == user_id
    )
    if status:
        query = query.filter(models.UserRequest.status == status)
    return query.order_by(models.UserRequest.created_at.desc()).all()


def list_inbox(db: Session, status: str) -> list[models.UserRequest]:
    query = db.query(models.UserRequest)
    if status != ALL_STATUSES:
        query = query.filter(models.UserRequest.status == status)
    return query.order_by(models.UserRequest.created_at.desc()).all()


def open_count(db: Session) -> int:
    return (
        db.query(models.UserRequest)
        .filter(models.UserRequest.status == REQUEST_STATUS_OPEN)
        .count()
    )


def to_responses(
    db: Session, rows: Iterable[models.UserRequest], viewer: Viewer
) -> list[schemas.UserRequestResponse]:
    """Serialise a page of requests: one query per table for the targets and
    one for the usernames, however many rows there are."""
    rows = list(rows)
    resolved = resolve_entries(
        db,
        [(row.target_type, row.target_id) for row in rows],
        tables=REQUEST_TARGET_TABLES,
    )
    account_ids = {
        account_id
        for row in rows
        for account_id in (row.author_id, row.handled_by_id)
        if account_id is not None
    }
    usernames = (
        dict(
            db.query(models.User.id, models.User.username).filter(
                models.User.id.in_(account_ids)
            )
        )
        if account_ids
        else {}
    )
    out = []
    for row in rows:
        target = None
        if row.target_type and row.target_id:
            ref = entry_ref_for(resolved, row.target_type, row.target_id)
            table = REQUEST_TARGET_TABLES.get(row.target_type)
            target = schemas.UserRequestTarget(
                type=row.target_type,
                type_label=table.label if table else None,
                id=row.target_id,
                label=ref.display_name if not ref.missing else row.target_label,
                nav_path=ref.nav_path,
                missing=ref.missing,
            )
        out.append(
            schemas.UserRequestResponse(
                id=row.system_id,
                kind=row.kind,
                status=row.status,
                description=row.description,
                remark=row.remark,
                page_path=row.page_path,
                target=target,
                author_username=usernames.get(row.author_id),
                response=row.response,
                handled_by_username=usernames.get(row.handled_by_id),
                handled_at=row.handled_at,
                created_at=row.created_at,
                updated_at=row.updated_at,
                can_edit=_can_edit(row, viewer),
            )
        )
    return out


def _can_edit(row: models.UserRequest, viewer: Viewer) -> bool:
    return (
        viewer.user_id is not None
        and row.author_id == viewer.user_id
        and row.status == REQUEST_STATUS_OPEN
    )


def _get_or_404(db: Session, request_id: UUID) -> models.UserRequest:
    row = db.get(models.UserRequest, request_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Request not found.")
    return row


# ---------------------------------------------------------------------------
# The author's writes
# ---------------------------------------------------------------------------


def _target_label_or_422(
    db: Session, target_type: Optional[str], target_id: Optional[UUID]
) -> Optional[str]:
    """The target's name now, for target_label. Existence only - not
    visibility."""
    if target_type is None and target_id is None:
        return None
    if target_type is None or target_id is None:
        raise HTTPException(
            status_code=422,
            detail="A target needs both target_type and target_id.",
        )
    table = REQUEST_TARGET_TABLES.get(target_type)
    if table is None:
        raise HTTPException(
            status_code=422, detail=f"Unknown target type: {target_type}."
        )
    row = db.get(table.model, target_id)
    if row is None:
        raise HTTPException(
            status_code=422, detail=f"No {table.label} with id {target_id}."
        )
    return row.display_name


def file_request(
    db: Session, viewer: Viewer, payload: schemas.UserRequestCreate
) -> models.UserRequest:
    author = db.get(models.User, viewer.user_id)
    if author is None:
        # self.requests is only ever held by a resolved account, so this is a
        # session whose account vanished mid-request.
        raise HTTPException(status_code=401, detail="Not signed in.")

    limit = effective_request_limit(author)
    if limit is not None:
        held = (
            db.query(models.UserRequest)
            .filter(
                models.UserRequest.author_id == author.id,
                models.UserRequest.status == REQUEST_STATUS_OPEN,
            )
            .count()
        )
        if held >= limit:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"You already have {held} open requests, and your limit is "
                    f"{limit}. One frees up when it is handled."
                ),
            )

    label = _target_label_or_422(db, payload.target_type, payload.target_id)
    row = models.UserRequest(
        author_id=author.id,
        kind=payload.kind,
        target_type=payload.target_type,
        target_id=payload.target_id,
        target_label=label,
        page_path=payload.page_path,
        description=payload.description,
        remark=payload.remark,
        status=REQUEST_STATUS_OPEN,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info(
        "Request %s filed (kind=%s) by %s", row.system_id, row.kind, viewer.username
    )
    return row


def edit_own(
    db: Session,
    viewer: Viewer,
    request_id: UUID,
    payload: schemas.UserRequestUpdate,
) -> models.UserRequest:
    row = db.get(models.UserRequest, request_id)
    # Another account's request answers exactly as a missing one does.
    if row is None or row.author_id != viewer.user_id:
        raise HTTPException(status_code=404, detail="Request not found.")
    if row.status != REQUEST_STATUS_OPEN:
        raise HTTPException(
            status_code=409,
            detail="This request has been handled and can no longer be edited.",
        )
    fields = payload.model_fields_set
    if "description" in fields:
        if payload.description is None:
            raise HTTPException(
                status_code=422, detail="A request needs a description."
            )
        row.description = payload.description
    if "remark" in fields:
        row.remark = payload.remark
    db.commit()
    db.refresh(row)
    logger.info(
        "Request %s edited (kind=%s) by %s", row.system_id, row.kind, viewer.username
    )
    return row


# ---------------------------------------------------------------------------
# The handler's writes
# ---------------------------------------------------------------------------


def set_status(
    db: Session,
    viewer: Viewer,
    request_id: UUID,
    payload: schemas.UserRequestStatusUpdate,
) -> models.UserRequest:
    row = _get_or_404(db, request_id)
    row.status = payload.status
    row.response = payload.response
    if payload.status == REQUEST_STATUS_OPEN:
        row.handled_by_id = None
        row.handled_at = None
    else:
        row.handled_by_id = viewer.user_id
        row.handled_at = get_taipei_now()
    db.commit()
    db.refresh(row)
    logger.info(
        "Request %s set to %s (kind=%s) by %s",
        row.system_id,
        row.status,
        row.kind,
        viewer.username,
    )
    return row


def delete_request(db: Session, viewer: Viewer, request_id: UUID) -> None:
    row = _get_or_404(db, request_id)
    request_id, kind = row.system_id, row.kind
    db.delete(row)
    db.commit()
    logger.info("Request %s deleted (kind=%s) by %s", request_id, kind, viewer.username)
