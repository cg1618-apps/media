"""
routers/account.py
The caller's own account settings.

Separate from routers/users.py, which is admin-only at the router level and
acts on other people. Everything here acts on the caller and only the caller:
no path takes a user id, and the update payload carries no identity, so there
is no shape of request that could point one of these at another account.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.rbac.resolver import Viewer, get_viewer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/account", tags=["Account"])


def _current_user(db: Session, viewer: Viewer) -> models.User:
    """
    The row behind the session, or 401.

    resolve_viewer never raises - a bad cookie resolves to the guest viewer
    with username None - so "who is asking" and "is anyone asking" are two
    questions and this asks the second. 401 with the same detail and header
    every other refusal in this app sends, so the SPA sees one shape.
    """
    unauthenticated = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials or insufficient permissions",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not viewer.username:
        raise unauthenticated
    user = (
        db.query(models.User)
        .filter(models.User.username == viewer.username)
        .first()
    )
    if user is None:
        raise unauthenticated
    return user


def _to_response(user: models.User) -> schemas.AccountSettingsResponse:
    return schemas.AccountSettingsResponse(
        username=user.username,
        role_name=user.role_ref.name if user.role_ref else "guest",
    )


@router.get(
    "/settings",
    response_model=schemas.AccountSettingsResponse,
    summary="My Account Settings",
)
def get_settings(
    db: Session = Depends(get_db), viewer: Viewer = Depends(get_viewer)
):
    return _to_response(_current_user(db, viewer))
