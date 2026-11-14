"""
routers/users.py
User accounts, created and managed by the admin.

Accounts are created here by the admin, or arrive through an invite link: the
admin issues the invite, whoever holds it registers (routers/auth.py), and the
account waits `pending` until the admin approves or declines it here. Nobody
registers without an invite.

You cannot delete or disable yourself: either mistake locks the admin out of
their own site.

The roles are fixed, and so is who holds two of them. An account is given
`user` or `super` and nothing else (422 otherwise). The `admin` account's role
and a shared account's role never change, neither account is ever deleted,
and neither has its mode edited - the admin has no mode, a shared account a
fixed one. Each is a 409 of its own.

Every NEW username and password passes the checks in services/security.py
(validate_new_username, validate_new_password), and a refusal is a 422 whose
detail is the sentence to show. Names already stored are left alone.
"""

import logging
from typing import List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.models.system import (
    USER_STATUS_DISABLED,
    USER_STATUS_PENDING,
)
from app.services.domain.account_codes import (
    issue_invite,
    issue_reset_link,
    reset_refusal,
)
from app.services.domain.accounts import (
    ADMIN_SET_PASSWORD_REVOKES_SESSIONS,
    KEEP_OWN_SESSION_ON_ADMIN_SET_PASSWORD,
    login_deadline,
    revoke_sessions,
    set_login_cookie,
)
from app.services.domain.registration import (
    NotPending,
    approve_registration,
    decline_registration,
    username_taken,
)
from app.services.domain.requests import default_request_limit, limit_is_fixed
from app.services.rbac import cache
from app.services.rbac.features import FEATURE_COLUMNS, FEATURE_ROLE_NAMES
from app.services.rbac.modes import ModeSets, check_mode_pair, set_mode_ceiling
from app.services.rbac.permissions import (
    ADMIN_ROLE_NAME,
    ASSIGNABLE_ROLE_NAMES,
    SHARED_ROLE_NAME,
)
from app.services.rbac.resolver import Viewer, require_admin_authz, role_for_user
from app.services.security import (
    get_password_hash,
    validate_new_password,
    validate_new_username,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/users",
    tags=["User Management"],
    dependencies=[Depends(require_admin_authz)],
)


def _denied_keys(db: Session, user: models.User) -> tuple[list, list]:
    """This account's denials, as (label keys, field group keys), sorted.

    Rendered by the per-account panel as the CEILING's own list with
    tick-to-deny, which is what makes decision 8 visible: denials only
    subtract, so a control that shows the ceiling and lets you remove from it
    cannot express something outside it.
    """
    label_names = {
        system_id: key
        for system_id, key in db.query(
            models.ContentLabel.system_id, models.ContentLabel.key
        )
    }
    labels, groups = [], []
    for label_id, group_key in db.query(
        models.UserAccessModeDenial.label_id,
        models.UserAccessModeDenial.field_group_key,
    ).filter(models.UserAccessModeDenial.user_id == user.id):
        if label_id is not None and label_id in label_names:
            labels.append(label_names[label_id])
        if group_key is not None:
            groups.append(group_key)
    return sorted(labels), sorted(groups)


def _to_response(
    user: models.User, db: Session = None
) -> schemas.ManagedUserResponse:
    denied_labels, denied_groups = (
        _denied_keys(db, user) if db is not None else ([], [])
    )
    return schemas.ManagedUserResponse(
        id=user.id,
        username=user.username,
        role_id=user.role_id,
        role_name=user.role_ref.name if user.role_ref else None,
        mode_ceiling=user.mode_ceiling,
        mode_default=user.mode_default,
        denied_label_keys=denied_labels,
        denied_field_group_keys=denied_groups,
        status=user.status,
        open_request_limit=user.open_request_limit,
        **{column: getattr(user, column) for column in FEATURE_COLUMNS},
    )


def _get_or_404(db: Session, user_id: UUID) -> models.User:
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


def _checked(check, value):
    """Run one of the security.py checks, answering a refusal as a 422."""
    try:
        return check(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


def _role_or_422(db: Session, role_id: UUID) -> models.Role:
    role = db.get(models.Role, role_id)
    if role is None:
        raise HTTPException(status_code=422, detail="Unknown role.")
    return role


def _assignable_role_or_422(db: Session, role_id: UUID) -> models.Role:
    """A role an admin may give an account: `user` or `super`."""
    role = _role_or_422(db, role_id)
    if role.name not in ASSIGNABLE_ROLE_NAMES:
        raise HTTPException(
            status_code=422,
            detail="An account's role is either user or super.",
        )
    return role


# The roles whose holders keep them: the one admin account, and the shared
# accounts the seed maintains. Each answer names which.
_FIXED_ROLE_REFUSALS: dict[str, str] = {
    ADMIN_ROLE_NAME: "The admin account's role is fixed.",
    SHARED_ROLE_NAME: "A shared account's role is fixed.",
}


def _is_shared(db: Session, user: models.User) -> bool:
    role = role_for_user(db, user)
    return role is not None and role.name == SHARED_ROLE_NAME


def _is_admin_account(db: Session, user: models.User) -> bool:
    role = role_for_user(db, user)
    return role is not None and role.name == ADMIN_ROLE_NAME


@router.get("/", response_model=List[schemas.ManagedUserResponse], summary="List Users")
def list_users(
    status_filter: Optional[Literal["pending", "active", "disabled"]] = Query(
        None, alias="status"
    ),
    db: Session = Depends(get_db),
):
    """Every account, or only those with `status` - `?status=pending` is the
    pending-registrations panel's list."""
    query = db.query(models.User)
    if status_filter is not None:
        query = query.filter(models.User.status == status_filter)
    users = query.order_by(models.User.username).all()
    return [_to_response(user, db) for user in users]


@router.post(
    "/invites",
    response_model=schemas.InviteLinkResponse,
    summary="Issue an invite link",
)
def create_invite(
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_admin_authz),
):
    """
    A one-time link that lets whoever holds it register one account, valid
    24 hours. The account arrives `pending` and waits for approval.

    Returned once: only a hash of the code is stored. Unlike a reset link, a
    new invite does not void the open ones - each is for a different person.
    """
    link, expires_at = issue_invite(db, created_by_id=admin.user_id)
    db.commit()
    logger.info("%s issued an invite link", admin.username)
    return {"link": link, "expires_at": expires_at}


def _pending_or_409(fn):
    try:
        return fn()
    except NotPending:
        raise HTTPException(
            status_code=409, detail="This account is not a pending registration."
        ) from None


@router.post(
    "/{user_id}/approve",
    response_model=schemas.ManagedUserResponse,
    summary="Approve a pending registration",
)
def approve_user(
    user_id: UUID,
    payload: schemas.RegistrationApproval,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_admin_authz),
):
    """
    Make a pending account active: its role (`user` or `super`, default
    `user`), ceiling and default (default `normal` / `normal`, never
    `unrestricted`) and the role's request limit, in one transaction. 409 for
    an account that is not pending, 422 for a refused role or mode.
    """
    user = _get_or_404(db, user_id)
    role = _role_or_422(db, payload.role_id) if payload.role_id else None
    try:
        _pending_or_409(
            lambda: approve_registration(
                db, user, role, payload.ceiling_mode, payload.default_mode
            )
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from None
    db.commit()
    db.refresh(user)
    logger.info("%s approved the registration of %s", admin.username, user.username)
    return _to_response(user, db)


@router.post(
    "/{user_id}/reject",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Decline a pending registration",
)
def reject_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_admin_authz),
):
    """Delete a pending account (409 for any other). The invite that created
    it stays spent."""
    user = _get_or_404(db, user_id)
    username = user.username
    _pending_or_409(lambda: decline_registration(db, user))
    db.commit()
    logger.info("%s declined the registration of %s", admin.username, username)
    return None


@router.post(
    "/",
    response_model=schemas.ManagedUserResponse,
    status_code=201,
    summary="Create User",
)
def create_user(payload: schemas.ManagedUserCreate, db: Session = Depends(get_db)):
    _checked(validate_new_username, payload.username)
    _checked(validate_new_password, payload.password)
    if username_taken(db, payload.username):
        raise HTTPException(status_code=409, detail="That username is taken.")
    role = _assignable_role_or_422(db, payload.role_id)

    user = models.User(
        username=payload.username,
        hashed_password=get_password_hash(payload.password),
        role_id=role.system_id,
        open_request_limit=default_request_limit(role.name),
    )
    db.add(user)
    # No mode is assigned here: the columns' default puts a new account at
    # ceiling and default `normal` - narrow enough to hold no labelled entry,
    # wide enough that the invitee does not land on an empty site.
    db.commit()
    db.refresh(user)
    # A login cookie naming this username resolved as a guest until now, and
    # the cover route may still hold that answer (cover_viewer.py).
    cache.bump()
    return _to_response(user, db)


@router.put(
    "/{user_id}/access-modes",
    response_model=schemas.ManagedUserResponse,
    summary="Replace an account's access modes",
)
def replace_access_modes(
    user_id: UUID,
    payload: schemas.UserAccessModes,
    db: Session = Depends(get_db),
):
    """
    Replace an account's ceiling, default and denials in one write.

    One payload, one write, one bump(), no partial states: the same contract
    PUT /roles/{id}/permissions has, and for the same reason - a half-applied
    authorization change is worse than a refused one. So everything is
    checked before anything is written.
    """
    user = _get_or_404(db, user_id)
    if _is_shared(db, user):
        raise HTTPException(
            status_code=409, detail="A shared account's mode is fixed."
        )
    if _is_admin_account(db, user):
        raise HTTPException(
            status_code=409, detail="The admin account has no mode."
        )

    try:
        check_mode_pair(payload.ceiling, payload.default)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None

    # DECISION 8: the ceiling is an upper bound. A denial naming something the
    # ceiling does not show subtracts nothing in any mode the account can
    # use, so storing it would be a no-op that reads like a setting. The panel
    # is built so it cannot ask for one; this makes that a guarantee rather
    # than a rendering choice. "Shows" is cache.mode_sets, so `unrestricted`
    # is its derived everything rather than whatever rows it holds.
    shown = ModeSets()
    if payload.ceiling is not None:
        ceiling = (
            db.query(models.AccessMode)
            .filter(models.AccessMode.key == payload.ceiling)
            .first()
        )
        if ceiling is not None:
            shown = cache.mode_sets(db, ceiling.system_id)
    label_ids = {
        key: system_id
        for system_id, key in db.query(
            models.ContentLabel.system_id, models.ContentLabel.key
        )
    }
    stray = {
        key
        for key in payload.denied_label_keys
        if label_ids.get(key) not in shown.label_ids
    }
    if stray:
        raise HTTPException(
            status_code=422,
            detail=(
                f"A ceiling of {payload.ceiling} does not show content "
                f"label(s): {', '.join(sorted(stray))}. A denial can only "
                "subtract what the ceiling shows."
            ),
        )
    stray_groups = set(payload.denied_field_group_keys) - shown.field_groups
    if stray_groups:
        raise HTTPException(
            status_code=422,
            detail=(
                f"A ceiling of {payload.ceiling} does not show field "
                f"group(s): {', '.join(sorted(stray_groups))}. A denial can "
                "only subtract what the ceiling shows."
            ),
        )

    set_mode_ceiling(db, user, payload.ceiling, payload.default)
    db.query(models.UserAccessModeDenial).filter(
        models.UserAccessModeDenial.user_id == user.id
    ).delete(synchronize_session=False)
    for key in sorted(set(payload.denied_label_keys)):
        db.add(models.UserAccessModeDenial(user_id=user.id, label_id=label_ids[key]))
    for key in sorted(set(payload.denied_field_group_keys)):
        db.add(models.UserAccessModeDenial(user_id=user.id, field_group_key=key))

    db.commit()
    # set_mode_ceiling bumped before the commit; this one clears whatever a
    # concurrent request cached from the old rows in between.
    cache.bump()
    db.refresh(user)
    return _to_response(user, db)


@router.patch(
    "/{user_id}", response_model=schemas.ManagedUserResponse, summary="Update User"
)
def update_user(
    user_id: UUID,
    payload: schemas.ManagedUserUpdate,
    response: Response,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_admin_authz),
):
    """
    Rename, set a password, change role, disable / enable, or switch the
    account's features (services/rbac/features.py).

    Setting a password ends the account's sessions
    (ADMIN_SET_PASSWORD_REVOKES_SESSIONS) and so does disabling it; enabling
    does not, because the sessions already ended when it was disabled. A
    pending registration is approved or declined, not edited here (409).

    When the account is the caller's own, the caller's browser is given a
    fresh cookie at the new counter and the old deadline
    (KEEP_OWN_SESSION_ON_ADMIN_SET_PASSWORD), so it alone stays signed in.
    """
    own_sessions_revoked = False
    user = _get_or_404(db, user_id)
    new_role = None
    if payload.role_id and payload.role_id != user.role_id:
        current = role_for_user(db, user)
        refusal = _FIXED_ROLE_REFUSALS.get(current.name if current else "")
        if refusal:
            raise HTTPException(status_code=409, detail=refusal)
        new_role = _assignable_role_or_422(db, payload.role_id)
    limit_set = "open_request_limit" in payload.model_fields_set
    resulting_role = new_role or role_for_user(db, user)
    if (
        limit_set
        and payload.open_request_limit is not None
        and limit_is_fixed(resulting_role.name if resulting_role else None)
    ):
        raise HTTPException(
            status_code=422,
            detail="A super account has no open-request limit.",
        )
    # Only a user or super account holds a feature. Switching one OFF is
    # always allowed; ON for anything else - the admin account, a shared one -
    # is a 409, like the other fixed facts about those accounts. Every role
    # change this route makes stays inside user and super, so a stored switch
    # never outlives the role that could hold it.
    features = {
        column: getattr(payload, column)
        for column in FEATURE_COLUMNS
        if column in payload.model_fields_set and getattr(payload, column) is not None
    }
    if any(features.values()) and (
        resulting_role is None or resulting_role.name not in FEATURE_ROLE_NAMES
    ):
        raise HTTPException(
            status_code=409,
            detail="Only a user or super account can have a feature switched on.",
        )

    if user.status == USER_STATUS_PENDING:
        raise HTTPException(
            status_code=409,
            detail="A pending registration is approved or declined, not edited.",
        )
    if (
        payload.status == USER_STATUS_DISABLED
        and admin.username == user.username
    ):
        raise HTTPException(status_code=409, detail="You cannot disable yourself.")

    if payload.username is not None and payload.username != user.username:
        _checked(validate_new_username, payload.username)
        if username_taken(db, payload.username, excluding=user.id):
            raise HTTPException(status_code=409, detail="That username is taken.")
        user.username = payload.username

    # None is "leave it"; anything else, the empty string included, is a new
    # password and passes the checks.
    if payload.password is not None:
        _checked(validate_new_password, payload.password)
        user.hashed_password = get_password_hash(payload.password)
        if ADMIN_SET_PASSWORD_REVOKES_SESSIONS:
            revoke_sessions(user)
            own_sessions_revoked = admin.user_id == user.id

    if payload.status is not None and payload.status != user.status:
        if payload.status == USER_STATUS_DISABLED:
            revoke_sessions(user)
        user.status = payload.status

    if new_role is not None:
        user.role_id = new_role.system_id

    # The limit follows the role: a role change resets it to the new role's
    # default, unless this same save sets it.
    if limit_set:
        user.open_request_limit = payload.open_request_limit
    elif new_role is not None:
        user.open_request_limit = default_request_limit(new_role.name)
    for column, value in features.items():
        setattr(user, column, value)

    db.commit()
    db.refresh(user)
    cache.bump()
    if own_sessions_revoked and KEEP_OWN_SESSION_ON_ADMIN_SET_PASSWORD:
        set_login_cookie(
            response, db, user, expires_at=login_deadline(admin.token_payload)
        )
    return _to_response(user, db)


@router.post(
    "/{user_id}/reset-link",
    response_model=schemas.ResetLinkResponse,
    summary="Issue a password reset link",
)
def create_reset_link(
    user_id: UUID,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_admin_authz),
):
    """
    A one-time link that lets the account set a new password, valid 24 hours.

    Returned once: only a hash of the code is stored, so the link cannot be
    shown again - issuing another replaces it, and the older link stops
    working. Active, non-shared accounts only (409 otherwise).
    """
    user = _get_or_404(db, user_id)
    refusal = reset_refusal(user)
    if refusal:
        raise HTTPException(status_code=409, detail=refusal)
    link, expires_at = issue_reset_link(db, user, created_by_id=admin.user_id)
    db.commit()
    logger.info("%s issued a reset link for %s", admin.username, user.username)
    return {"link": link, "expires_at": expires_at}


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_admin_authz),
):
    user = _get_or_404(db, user_id)

    if admin.username == user.username:
        raise HTTPException(status_code=409, detail="You cannot delete yourself.")
    if _is_shared(db, user):
        raise HTTPException(
            status_code=409,
            detail="A shared account cannot be deleted. Disable it instead.",
        )
    if _is_admin_account(db, user):
        raise HTTPException(
            status_code=409, detail="The admin account cannot be deleted."
        )

    db.delete(user)
    db.commit()
    # The account's live cookies must stop resolving to it at once - the
    # cover route caches viewers per cookie (cover_viewer.py).
    cache.bump()
    return None
