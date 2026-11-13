"""
Ending an account's sessions.

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
"""

from app import models

# The owner's decision: an admin setting a password on /users signs that
# account out everywhere, as a spent reset link does. It matters most for a
# leaked shared login, where the new password is worthless if the old
# sessions carry on.
ADMIN_SET_PASSWORD_REVOKES_SESSIONS = True


def revoke_sessions(user: models.User) -> None:
    """
    End every session `user` holds, from the next request on.

    Increments the counter on the row and nothing else; the caller commits,
    and calls rbac.cache.bump() after the commit, because the cover route
    caches a resolved viewer per cookie (cover_viewer.py) and that entry must
    not outlive the session it describes.
    """
    user.session_version = (user.session_version or 0) + 1
