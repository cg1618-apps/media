"""
routers/users.py
User accounts, created and managed by the admin.

There is no self-registration by design: accounts exist so one person can hand
out a level of access, not so strangers can ask for one.

Two guards exist because both mistakes lock the admin out of their own site:
you cannot delete yourself, and you cannot remove the last account that can
still administer anything.
"""

import logging
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.domain.requests import default_request_limit, limit_is_fixed
from app.services.rbac import cache
from app.services.rbac.modes import ModeSets, check_mode_pair, set_mode_ceiling
from app.services.rbac.permissions import PERM_ADMIN_AUTHZ
from app.services.rbac.resolver import Viewer, require_admin_authz, role_for_user
from app.services.security import get_password_hash

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
        open_request_limit=user.open_request_limit,
    )


def _get_or_404(db: Session, user_id: UUID) -> models.User:
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


def _role_or_422(db: Session, role_id: UUID) -> models.Role:
    role = db.get(models.Role, role_id)
    if role is None:
        raise HTTPException(status_code=422, detail="Unknown role.")
    return role


def _can_administer(db: Session, role: models.Role) -> bool:
    if role is None:
        return False
    if role.is_root:
        return True
    # No role can be GRANTED admin.authz any more - it is locked off for every
    # one of them (permissions.locked_permissions), so in practice the branch
    # above is the only one that answers True. The row lookup stays because
    # this guard decides whether the last administrator may be demoted, and a
    # guard that reads the grants directly keeps answering correctly if the
    # lock table ever widens.
    return (
        db.query(models.RolePermission)
        .filter(
            models.RolePermission.role_id == role.system_id,
            models.RolePermission.permission == PERM_ADMIN_AUTHZ,
        )
        .first()
        is not None
    )


def _admin_count(db: Session, excluding: UUID = None) -> int:
    count = 0
    for user in db.query(models.User).all():
        if excluding is not None and user.id == excluding:
            continue
        if _can_administer(db, role_for_user(db, user)):
            count += 1
    return count


@router.get("/", response_model=List[schemas.ManagedUserResponse], summary="List Users")
def list_users(db: Session = Depends(get_db)):
    users = db.query(models.User).order_by(models.User.username).all()
    return [_to_response(user, db) for user in users]


@router.post(
    "/",
    response_model=schemas.ManagedUserResponse,
    status_code=201,
    summary="Create User",
)
def create_user(payload: schemas.ManagedUserCreate, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(status_code=409, detail="That username is taken.")
    role = _role_or_422(db, payload.role_id)

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
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_admin_authz),
):
    user = _get_or_404(db, user_id)
    new_role = None
    if payload.role_id and payload.role_id != user.role_id:
        new_role = _role_or_422(db, payload.role_id)
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

    if payload.username and payload.username != user.username:
        clash = (
            db.query(models.User)
            .filter(models.User.username == payload.username)
            .first()
        )
        if clash:
            raise HTTPException(status_code=409, detail="That username is taken.")
        user.username = payload.username

    if payload.password:
        user.hashed_password = get_password_hash(payload.password)

    if new_role is not None:
        would_lose_admin = _can_administer(
            db, role_for_user(db, user)
        ) and not _can_administer(db, new_role)
        if would_lose_admin and _admin_count(db, excluding=user.id) == 0:
            raise HTTPException(
                status_code=409,
                detail="This is the last account that can administer the site.",
            )
        user.role_id = new_role.system_id

    # The limit follows the role: a role change resets it to the new role's
    # default, unless this same save sets it.
    if limit_set:
        user.open_request_limit = payload.open_request_limit
    elif new_role is not None:
        user.open_request_limit = default_request_limit(new_role.name)

    db.commit()
    db.refresh(user)
    cache.bump()
    return _to_response(user, db)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_admin_authz),
):
    user = _get_or_404(db, user_id)

    if admin.username == user.username:
        raise HTTPException(status_code=409, detail="You cannot delete yourself.")
    if _can_administer(db, role_for_user(db, user)) and _admin_count(
        db, excluding=user.id
    ) == 0:
        raise HTTPException(
            status_code=409,
            detail="This is the last account that can administer the site.",
        )

    db.delete(user)
    db.commit()
    # The account's live cookies must stop resolving to it at once - the
    # cover route caches viewers per cookie (cover_viewer.py).
    cache.bump()
    return None
