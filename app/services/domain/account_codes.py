"""
Minting and spending the one-time codes behind reset links (and, later, invite
links). The table and why only a SHA-256 of each code is stored:
app/models/account_code.py.

A code is refused when it is unknown, minted for another purpose, expired or
already spent, and every one of those answers with the SAME message,
INVALID_CODE_MESSAGE. Telling them apart would let someone holding a guessed
or stale link learn which codes ever existed.

spend_code() is the only way a code is used. It locks the row, marks it spent
and returns it, and the caller does its own work - setting the password - in
the SAME transaction. A caller whose work fails rolls back, and the spend goes
with it, so a refused password does not burn the link.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.models.system import USER_STATUS_ACTIVE
from app.services.rbac.permissions import SHARED_ROLE_NAME

PURPOSE_INVITE = "invite"
PURPOSE_RESET = "reset"
CODE_LIFETIME = timedelta(hours=24)
INVALID_CODE_MESSAGE = "This link is not valid. Ask the admin for a new one."


class InvalidCode(Exception):
    """A code that cannot be used, for whichever reason. The reason is not
    carried on purpose: every refusal answers the same."""


def hash_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def reset_link(code: str) -> str:
    return f"{settings.public_base_url.rstrip('/')}/reset?code={code}"


def reset_refusal(user: models.User) -> Optional[str]:
    """Why `user` may not be given a reset link, or None when they may.

    Only an active account: a disabled one is switched off, and a pending one
    has never been approved. Never a shared account - several people know
    its password, so whoever opened the link would take it from the rest; its
    password is set by the admin on /users.
    """
    if user.status != USER_STATUS_ACTIVE:
        return "Only an active account can be given a reset link."
    if user.role_ref is not None and user.role_ref.name == SHARED_ROLE_NAME:
        return "A shared account's password is set on Users, not by reset link."
    return None


def issue_reset_link(
    db: Session, user: models.User, created_by_id=None
) -> tuple[str, datetime]:
    """
    A new reset link for `user`, and when it expires. Flushes; the caller
    commits.

    The code is returned inside the link and nowhere else - it is not stored,
    so it cannot be shown again. Any unspent reset link the account already
    has is deleted in the same transaction: a newer link stops an older one
    working. `created_by_id` is None from the CLI.

    Raises ValueError with reset_refusal()'s sentence for an account that may
    not have one.
    """
    refusal = reset_refusal(user)
    if refusal:
        raise ValueError(refusal)

    db.query(models.AccountCode).filter(
        models.AccountCode.user_id == user.id,
        models.AccountCode.purpose == PURPOSE_RESET,
        models.AccountCode.spent_at.is_(None),
    ).delete(synchronize_session=False)

    code = secrets.token_urlsafe(32)
    now = _now()
    expires_at = now + CODE_LIFETIME
    db.add(
        models.AccountCode(
            purpose=PURPOSE_RESET,
            code_hash=hash_code(code),
            user_id=user.id,
            created_by_id=created_by_id,
            created_at=now,
            expires_at=expires_at,
        )
    )
    db.flush()
    return reset_link(code), expires_at


def _check(row: Optional[models.AccountCode], purpose: str) -> models.AccountCode:
    if (
        row is None
        or row.purpose != purpose
        or row.spent_at is not None
        or row.expires_at <= _now()
    ):
        raise InvalidCode()
    return row


def find_code(db: Session, code: str, purpose: str) -> models.AccountCode:
    """The usable code row, WITHOUT spending it - for the page that asks
    "is this link any good" before the form is filled in. Raises InvalidCode."""
    row = (
        db.query(models.AccountCode)
        .filter(models.AccountCode.code_hash == hash_code(code or ""))
        .first()
    )
    return _check(row, purpose)


def spend_code(db: Session, code: str, purpose: str) -> models.AccountCode:
    """
    Spend a code: lock its row, refuse it if it is unusable, mark it spent.

    `SELECT ... FOR UPDATE`, so two requests racing with one link cannot both
    spend it - the second waits, then reads `spent_at` and is refused. Flushes
    and does not commit: the caller's own work belongs in the same
    transaction. Raises InvalidCode.
    """
    row = (
        db.query(models.AccountCode)
        .filter(models.AccountCode.code_hash == hash_code(code or ""))
        .with_for_update()
        .first()
    )
    _check(row, purpose)
    row.spent_at = _now()
    db.flush()
    return row


def reset_target(db: Session, row: models.AccountCode) -> models.User:
    """
    The account a reset code resets, still eligible for one. Raises
    InvalidCode when it no longer is - disabled or made shared after the link
    was issued - with the same message as any other refusal.
    """
    user = db.get(models.User, row.user_id) if row.user_id else None
    if user is None or reset_refusal(user) is not None:
        raise InvalidCode()
    return user
