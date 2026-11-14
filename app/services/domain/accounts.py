"""
An account's sessions: ending them, and minting the cookie that starts one.

A login token carries `sv`, the account's users.session_version when it was
minted, and resolve_viewer resolves to the guest unless the two agree
(app/services/rbac/resolver.py). So incrementing the column ends every session
the account holds, at once, with no token list to keep.

Every increment goes through revoke_sessions(), so "what signs an account
out" is answered by grepping one name. Today that is:

  * a reset link spent              - routers/auth.py, reset_password
  * the account disabled            - routers/users.py, update_user
  * the admin setting its password  - routers/users.py, update_user, gated on
                                      ADMIN_SET_PASSWORD_REVOKES_SESSIONS

and deliberately NOT changing your own password (you are the one holding the
session) or logging out (which only clears one browser's cookie).

Every login cookie is minted by set_login_cookie(), so the token's claims and
the cookie's flags are written once: by login, and by update_user when the
admin's change ended the caller's own sessions.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import Response
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.services.rbac.modes import default_mode_id
from app.services.security import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token

# The owner's decision: an admin setting a password on /users signs that
# account out everywhere, as a spent reset link does. It matters most for a
# leaked shared login, where the new password is worthless if the old
# sessions carry on.
ADMIN_SET_PASSWORD_REVOKES_SESSIONS = True

# The owner's decision: when that account is the caller's own, the
# caller's browser is given a fresh cookie at the new counter, so the browser
# that made the change stays signed in and every other device is signed out
# (Django's update_session_auth_hash does the same). /users is the admin's
# only way to change its own password - the admin role has self.password
# locked off - so without this the admin signs itself out by doing it.
# False restores the plain sign-out.
KEEP_OWN_SESSION_ON_ADMIN_SET_PASSWORD = True

LOGIN_COOKIE = "access_token"


def revoke_sessions(user: models.User) -> None:
    """
    End every session `user` holds, from the next request on.

    Increments the counter on the row and nothing else; the caller commits,
    and calls rbac.cache.bump() after the commit, because the cover route
    caches a resolved viewer per cookie (cover_viewer.py) and that entry must
    not outlive the session it describes.
    """
    user.session_version = (user.session_version or 0) + 1


def set_login_cookie(
    response: Response,
    db: Session,
    user: models.User,
    expires_at: Optional[datetime] = None,
) -> None:
    """
    Mint a login token for `user` at its current session_version and set it.

    `expires_at` is for a REISSUE and must be the deadline of the login being
    replaced: the lifetime is flat with no refresh, so a reissue minting a
    fresh month would let any password change extend a session without end
    (create_access_token says the same). Omitted, the login starts its full
    ACCESS_TOKEN_EXPIRE_MINUTES.
    """
    # `mode` is decorative, like `role`: resolve_viewer does not read it. A
    # session is in the account's default mode, read from the database on
    # every request, unless the access_mode cookie holds a live override.
    #
    # `sv` is NOT decorative: resolve_viewer refuses the token once it stops
    # matching users.session_version (resolver.session_is_current).
    token_data = {
        "sub": user.username,
        "role": user.role,
        "mode": str(default_mode_id(db, user) or ""),
        "sv": user.session_version or 0,
    }
    access_token = create_access_token(data=token_data, expires_at=expires_at)
    if expires_at is None:
        max_age = ACCESS_TOKEN_EXPIRE_MINUTES * 60
    else:
        max_age = max(0, int((expires_at - datetime.now(timezone.utc)).total_seconds()))

    # httponly=True prevents JavaScript (document.cookie) from reading the token.
    response.set_cookie(
        key=LOGIN_COOKIE,
        value=f"Bearer {access_token}",
        httponly=True,
        max_age=max_age,
        samesite="lax",
        # Follows APP_ENV, not the request scheme. Behind a tunnel the scheme
        # is only trustworthy if proxy headers are configured correctly, and a
        # missing header would silently produce an insecure cookie over HTTPS -
        # the failure this flag exists to prevent. Django's
        # SESSION_COOKIE_SECURE and Rails' config.force_ssl are per-environment
        # settings for the same reason. Read per request, not at import, so a
        # test can move the setting.
        secure=not settings.is_development,
    )


def login_deadline(token_payload: Optional[dict]) -> Optional[datetime]:
    """The `exp` of a decoded login token as an aware datetime, or None."""
    exp = (token_payload or {}).get("exp")
    if exp is None:
        return None
    try:
        return datetime.fromtimestamp(int(exp), tz=timezone.utc)
    except (TypeError, ValueError, OverflowError):
        return None
