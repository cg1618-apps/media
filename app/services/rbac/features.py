"""
services/rbac/features.py
Per-account feature switches.

A feature is a setting on one ACCOUNT, not a permission on its role: two
`user` accounts can differ in whether they see quotes and memes. Each feature
is a boolean column on `users` (`feature_<name>`), so it travels on the Sheets
Users tab with the rest of the account's settings.

Only a `user` or `super` account may hold one. PATCH /api/users/{id} refuses
switching one on for any other account with 409, and every role change an
admin can make stays inside those two roles. A Pull can still store one from
a hand-edited sheet, so held_features asks the role as well as the column.

Only `quotes_memes` gates anything today - the quote and meme reads, and the
Quotes and Memes sections of a detail page. The other three are storage and a
switch on /users until the features they name gain teeth.

THE ROOT ROLE HOLDS `quotes_memes` WITHOUT THE SWITCH. The admin account may
never be switched on, and the quote and meme reads were view.extras until
now, which the root short-circuit gave it - so it still reads what it writes.
Only that one: the other three name personal data, which the root role does
not hold (Viewer.has()'s `self` exception), so they are not short-circuited.
"""

from typing import Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models
from app.dependencies import get_db
from app.models.system import USER_FEATURE_COLUMNS, USER_FEATURE_NAMES
from app.services.rbac.permissions import SUPER_ROLE_NAME, USER_ROLE_NAME
from app.services.rbac.resolver import Viewer, get_viewer

FEATURE_QUOTES_MEMES = "quotes_memes"
FEATURE_NAMES: tuple[str, ...] = USER_FEATURE_NAMES

# The roles whose accounts may hold a feature.
FEATURE_ROLE_NAMES: frozenset[str] = frozenset({USER_ROLE_NAME, SUPER_ROLE_NAME})

# The features the root role holds without its account's switch.
ROOT_FEATURES: frozenset[str] = frozenset({FEATURE_QUOTES_MEMES})


FEATURE_COLUMNS: tuple[str, ...] = USER_FEATURE_COLUMNS


def feature_column(name: str) -> str:
    """The `users` column holding one feature."""
    return FEATURE_COLUMNS[FEATURE_NAMES.index(name)]


def held_features(user: Optional[models.User], is_root: bool) -> list[str]:
    """The features this account holds, in FEATURE_NAMES order.

    What /api/auth/me publishes as `features` and what require_feature asks,
    so the SPA and the server cannot disagree. A guest holds none.
    """
    # The role is asked as well as the column: PATCH refuses a switch on any
    # other account, but a Pull restores whatever the sheet says, so a hand-
    # edited Users tab could store one on a shared account.
    may_hold = user is not None and user.role in FEATURE_ROLE_NAMES
    return [
        name
        for name in FEATURE_NAMES
        if (is_root and name in ROOT_FEATURES)
        or (may_hold and getattr(user, feature_column(name)))
    ]


def _user_of(db: Session, viewer: Viewer) -> Optional[models.User]:
    if viewer.user_id is None:
        return None
    return db.get(models.User, viewer.user_id)


def has_feature(db: Session, viewer: Viewer, name: str) -> bool:
    """Whether this viewer holds one feature. The one server-side question.

    Every gate that turns on a feature asks this - the read routes through
    require_feature below, and any later code that branches on a switch - so
    there is one answer. Raises ValueError on a name outside FEATURE_NAMES,
    so a misspelt feature fails loudly rather than reading as switched off.
    """
    if name not in FEATURE_NAMES:
        raise ValueError(f"Unknown feature {name!r}")
    return name in held_features(_user_of(db, viewer), viewer.is_root)


def require_feature(name: str):
    """
    Dependency factory gating a route on one feature of the caller's account.

    The same 401 and header require_permission answers, so a route moving from
    a permission to a feature changes nothing the SPA has to handle.
    """
    if name not in FEATURE_NAMES:
        raise ValueError(f"Unknown feature {name!r}")

    def _dependency(
        viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)
    ) -> Viewer:
        if not has_feature(db, viewer, name):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials or insufficient permissions",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return viewer

    return _dependency


require_feature_quotes_memes = require_feature(FEATURE_QUOTES_MEMES)
