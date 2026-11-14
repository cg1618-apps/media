"""
New accounts: whether a name is free, registration by invite link, and the
admin's answer to a registration.

An invite (account_codes.issue_invite) names nobody. Whoever holds the link
registers here, which spends the invite and creates the account `pending`, on
the `user` role and with no mode. A pending account cannot sign in
(routers/auth.py, STATUS_REFUSALS) and resolves as the guest. The admin then
approves it, choosing the role, ceiling and default, or declines it, which
deletes the account and leaves the invite spent.

Both register_account and approve_registration flush and never commit: the
caller's transaction holds the spend and the account together, so a refused
name or password rolls the spend back and the link still works.
"""

from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.models.system import USER_STATUS_ACTIVE, USER_STATUS_PENDING
from app.services.domain.account_codes import PURPOSE_INVITE, spend_code
from app.services.domain.requests import default_request_limit
from app.services.rbac import cache
from app.services.rbac.modes import set_mode_ceiling
from app.services.rbac.permissions import (
    ASSIGNABLE_ROLE_NAMES,
    USER_ROLE_NAME,
)
from app.services.security import (
    get_password_hash,
    validate_new_password,
    validate_new_username,
)

# The approval form never hands out `unrestricted`; the admin grants it later
# on /users, per person (docs/notes/decisions.md, "Account lifecycle, second
# half").
APPROVAL_REFUSED_MODE = "unrestricted"


class UsernameTaken(Exception):
    """The name is already an account's, ignoring case."""


class NotPending(Exception):
    """Approve and decline answer a registration, and this account is not one."""


def username_taken(db: Session, username: str, excluding=None) -> bool:
    """Case-insensitive, as uq_users_username_lower is."""
    query = db.query(models.User).filter(
        func.lower(models.User.username) == username.lower()
    )
    if excluding is not None:
        query = query.filter(models.User.id != excluding)
    return query.first() is not None


def _role_named(db: Session, name: str) -> models.Role:
    return db.query(models.Role).filter(models.Role.name == name).one()


def register_account(
    db: Session, code: str, username: str, password: str
) -> models.User:
    """
    Spend an invite and create the pending account it is for. Flushes.

    Raises account_codes.InvalidCode for an unusable invite, ValueError with
    the sentence to show for a refused name or password, and UsernameTaken.
    The caller rolls back on any of them, which un-spends the invite.
    """
    row = spend_code(db, code, PURPOSE_INVITE)
    validate_new_username(username)
    validate_new_password(password)
    if username_taken(db, username):
        raise UsernameTaken()

    user = models.User(
        username=username,
        hashed_password=get_password_hash(password),
        role_id=_role_named(db, USER_ROLE_NAME).system_id,
        status=USER_STATUS_PENDING,
    )
    db.add(user)
    db.flush()
    # No mode until approval: a pending account resolves the empty set.
    set_mode_ceiling(db, user, None, None)
    row.created_user_id = user.id
    db.flush()
    return user


def approve_registration(
    db: Session,
    user: models.User,
    role: Optional[models.Role],
    ceiling_key: str,
    default_key: str,
) -> None:
    """
    Make a pending account active, on `role` (default `user`) at the chosen
    ceiling and default. Flushes and bumps the rbac cache; the caller commits.

    Raises NotPending, and ValueError for a role other than user or super, for
    `unrestricted`, or for a pair set_mode_ceiling refuses.
    """
    if user.status != USER_STATUS_PENDING:
        raise NotPending()
    if role is None:
        role = _role_named(db, USER_ROLE_NAME)
    if role.name not in ASSIGNABLE_ROLE_NAMES:
        raise ValueError("An account's role is either user or super.")
    if APPROVAL_REFUSED_MODE in (ceiling_key, default_key):
        raise ValueError(
            "Unrestricted is granted on Users after approval, not from this form."
        )

    set_mode_ceiling(db, user, ceiling_key, default_key)
    user.role_id = role.system_id
    user.open_request_limit = default_request_limit(role.name)
    user.status = USER_STATUS_ACTIVE
    db.flush()
    cache.bump()


def decline_registration(db: Session, user: models.User) -> None:
    """Delete a pending account. Its invite keeps `spent_at` and loses only
    `created_user_id` (ON DELETE SET NULL), so the link stays used. Raises
    NotPending. Flushes; the caller commits."""
    if user.status != USER_STATUS_PENDING:
        raise NotPending()
    db.delete(user)
    db.flush()
    cache.bump()
