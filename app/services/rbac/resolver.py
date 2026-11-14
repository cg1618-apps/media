"""
Request -> Viewer.

One function answers "who is asking" for every route, authenticated or not.
It never raises: a missing, malformed, expired or badly-signed cookie, a user
row that has since been deleted, an account that is not active, a token whose
sessions were revoked, and a role that no longer exists all resolve to the
guest viewer. Failing closed rather than erroring is what lets the same
call serve /api/auth/me, which three tests require never to raise, and the
public read routes, which must stay public.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app import models
from app.dependencies import ALGORITHM, SECRET_KEY, get_db
from app.models.system import USER_STATUS_ACTIVE
from app.services.rbac import cache
from app.services.rbac.modes import default_mode_id, resolve_mode
from app.services.rbac.permissions import (
    PERM_ADMIN_AUTHZ,
    PERM_MANAGE_ANNOUNCEMENTS,
    PERM_MANAGE_CATALOG,
    PERM_MANAGE_IMAGES,
    PERM_MANAGE_OPTIONS,
    PERM_MANAGE_PIPELINES,
    PERM_MANAGE_REQUESTS,
    PERM_MANAGE_RESOURCES,
    PERM_SELF_REQUESTS,
    PERM_VIEW_CHARACTER,
    PERM_VIEW_EXTRAS,
    PERM_VIEW_PERSON,
    PERM_VIEW_PUBLISHER,
    PERM_VIEW_RANDOM_PICKER,
    PERM_VIEW_SEARCH,
    PERM_VIEW_STUDIO,
)

GUEST_ROLE = "guest"

# The cookie holding a switched-to access mode. The login cookie says WHO is
# asking and lasts a month; this one says which mode they chose, and is a
# browser-session cookie holding a token that expires
# settings.access_mode_override_minutes after the switch when the mode is wider
# than the default, and with the login otherwise (its `timed` claim is then
# false). With no live override the session is in the account's default mode.
MODE_OVERRIDE_COOKIE = "access_mode"


@dataclass(frozen=True)
class Viewer:
    """Who is asking, and what they may see."""

    username: Optional[str]
    role_id: Optional[UUID]
    role_name: str
    permissions: frozenset[str]
    # The resolved user's id, so a request can join their user_media_list row
    # without a second lookup. None for a guest - see user_list.acting_user_id
    # for what a guest reads until step 2 ships accounts. Declared here rather
    # than beside `username` as the plan suggested: a dataclass cannot put a
    # defaulted field before an undefaulted one, and GUEST_FALLBACK does not
    # pass it.
    user_id: Optional[UUID] = None
    # The decoded JWT. Nothing reads this for authorization, and now that the
    # old single-admin dependency that used to hand it back is gone, no call
    # site reads it at all - it is dead weight kept here rather than removed
    # in this task, since removing it is a separate decision.
    token_payload: Optional[dict[str, Any]] = field(default=None)
    # ------------------------------------------------------------------
    # The ACTIVE access mode, resolved per request.
    # ------------------------------------------------------------------
    # `permissions` above still means the ROLE's capability set, and has() is
    # unchanged. The two axes are disjoint by construction: the role axis
    # holds admin.*, manage.*, media_type.* and self.*; these four fields hold
    # content labels and field groups. Neither can express the other, which is
    # what lets an admin account sit in a narrow mode.
    mode_id: Optional[UUID] = None
    mode_key: Optional[str] = None
    # The labels this session may SEE. enforcement.hidden_label_ids derives
    # the complement; do not invert this.
    visible_label_ids: frozenset[UUID] = frozenset()
    field_groups: frozenset[str] = frozenset()
    # When the active mode stops applying and the session returns to the
    # account's default. None when the session is already in the default.
    mode_expires_at: Optional[datetime] = None
    # ------------------------------------------------------------------
    # The hiding state, PRECOMPUTED. None means "not precomputed - ask the
    # database", which is every viewer resolve_viewer returns. Only
    # cover_viewer.get_cover_viewer fills these in, so that the hundred cover
    # requests one library page fires pay for them once rather than each.
    # enforcement.hidden_label_ids and shared_visibility._hiding read them
    # when present; nothing else may.
    # ------------------------------------------------------------------
    hidden_labels: Optional[tuple[UUID, ...]] = None
    hidden_gated: Optional[frozenset[str]] = None

    def has(self, permission: str) -> bool:
        """
        Whether this viewer holds one permission: a set membership test, for
        every role. No role short-circuits - the admin holds exactly its
        fixed set (permissions.ADMIN_FIXED_PERMISSIONS), so a permission or
        a media type added tomorrow reaches it only by being granted. The
        SPA's AuthContext.has() is the same test.
        """
        return permission in self.permissions


# The object-set fields take their defaults, which are empty - already the
# fail-closed answer. A viewer we could not resolve sees nothing labelled and
# no gated field, which is stricter than the guest default mode and correct:
# we do not know who this is.
GUEST_FALLBACK = Viewer(
    username=None,
    role_id=None,
    role_name=GUEST_ROLE,
    permissions=frozenset(),
)


def _decode(request: Request) -> Optional[dict[str, Any]]:
    token = request.cookies.get("access_token")
    if not token or not token.startswith("Bearer "):
        return None
    try:
        return jwt.decode(token.split(" ")[1], SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None


def _mode_override(request: Request, username: str) -> Optional[dict[str, Any]]:
    """
    The live access-mode override for this account, or None.

    Expired, badly signed, or minted for another account all read as no
    override, and the session falls back to the account's default. That
    fallback is the point of the override being temporary; it is not the
    revoked-mode case, which resolve_mode still answers with the empty set.
    """
    token = request.cookies.get(MODE_OVERRIDE_COOKIE)
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("sub") != username or _mode_claim(payload) is None:
        return None
    return payload


def _mode_claim(payload: Optional[dict[str, Any]]) -> Optional[UUID]:
    """
    The `mode` claim as a uuid, or None.

    A missing, empty or malformed claim is None, which resolve_mode turns into
    the empty set for a signed-in caller. Fail closed: a claim we cannot parse
    must not be treated as "no restriction".
    """
    raw = (payload or {}).get("mode")
    if not raw:
        return None
    try:
        return UUID(str(raw))
    except (ValueError, AttributeError, TypeError):
        return None


def role_for_user(db: Session, user: Optional[models.User]) -> Optional[models.Role]:
    """
    The user's role, or the guest role for an anonymous caller.

    role_id is NOT NULL since migration C, so a user always has one. A user
    whose role row has since been deleted still falls to guest rather than
    erroring - least access, not most.
    """
    if user is not None and user.role_ref is not None:
        return user.role_ref
    return db.query(models.Role).filter(models.Role.name == GUEST_ROLE).first()


def session_is_current(user: models.User, payload: dict[str, Any]) -> bool:
    """
    Whether a login token still speaks for its account.

    Only an `active` account has sessions, and only a token whose `sv` claim
    equals users.session_version is one of them - the column is incremented
    by revoke_sessions() (app/services/domain/accounts.py) to end every
    session at once. A token with no `sv` predates the claim and reads as 0,
    every account's starting value, so the deploy that added it signed
    nobody out. A claim that is not an integer reads as a mismatch.
    """
    if user.status != USER_STATUS_ACTIVE:
        return False
    try:
        return int(payload.get("sv", 0)) == (user.session_version or 0)
    except (TypeError, ValueError):
        return False


def resolve_viewer(request: Request, db: Session) -> Viewer:
    """
    A plain function, not a dependency, so /api/auth/me and the capability
    dependencies below (require_admin_authz and friends) can call it directly
    rather than through FastAPI's injection.
    """
    try:
        payload = _decode(request)
        user = None
        if payload and payload.get("sub"):
            user = (
                db.query(models.User)
                .filter(models.User.username == payload["sub"])
                .first()
            )
            if user is not None and not session_is_current(user, payload):
                user = None

        role = role_for_user(db, user)
        if role is None:
            return GUEST_FALLBACK

        # The login token's own `mode` claim is NOT read. It records the
        # default at login time, and a cookie minted before overrides existed
        # carries whatever mode was last switched to, for up to a month.
        mode_id = None
        mode_expires_at = None
        if user is not None:
            override = _mode_override(request, user.username)
            if override is not None:
                mode_id = _mode_claim(override)
                # An override with no `timed` claim predates the claim, and
                # every one of those was on the clock.
                if override.get("timed", True):
                    mode_expires_at = datetime.fromtimestamp(
                        override["exp"], tz=timezone.utc
                    )
            else:
                mode_id = default_mode_id(db, user)
        mode = resolve_mode(db, user, mode_id)

        return Viewer(
            username=user.username if user else None,
            user_id=user.id if user else None,
            role_id=role.system_id,
            role_name=role.name,
            permissions=cache.permissions_for(db, role.system_id),
            token_payload=payload,
            mode_id=mode.mode_id,
            mode_key=mode.mode_key,
            visible_label_ids=mode.label_ids,
            field_groups=mode.field_groups,
            mode_expires_at=mode_expires_at,
        )
    except Exception:
        # A viewer we cannot resolve sees what an anonymous stranger sees.
        return GUEST_FALLBACK


def get_viewer(request: Request, db: Session = Depends(get_db)) -> Viewer:
    """FastAPI dependency form. Deduped per request by the dependency cache."""
    return resolve_viewer(request, db)


def require_permission(permission: str):
    """
    Dependency factory gating a route on one permission.

    401 rather than 403, matching the one error message and header shape the
    SPA's error handling has always expected.
    """

    def _dependency(viewer: Viewer = Depends(get_viewer)) -> Viewer:
        if not viewer.has(permission):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials or insufficient permissions",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return viewer

    return _dependency


# The three capability gates, bound once at import. Routers depend on these by
# name rather than calling require_permission inline, so that swapping a
# router's gate is a one-word edit and so that grepping for a capability finds
# every route holding it.
require_admin_authz = require_permission(PERM_ADMIN_AUTHZ)
require_manage_catalog = require_permission(PERM_MANAGE_CATALOG)
require_manage_pipelines = require_permission(PERM_MANAGE_PIPELINES)

# The admin's own pages, each on its own key rather than manage.catalog, so
# that reaching them writes no catalogue row. /api/resources asks its key for
# reads as well as writes: the site-wide Resources page is the admin's and
# super's alone.
require_manage_announcements = require_permission(PERM_MANAGE_ANNOUNCEMENTS)
require_manage_options = require_permission(PERM_MANAGE_OPTIONS)
require_manage_images = require_permission(PERM_MANAGE_IMAGES)
require_manage_resources = require_permission(PERM_MANAGE_RESOURCES)

# The view gates: reads a guest does not get. Bound per read route rather than
# on the router, so that a write on the same router answers to manage.catalog
# alone and a role holding that is not also required to hold the read.
# One gate per entity kind. The person gate covers the seiyuu library
# (/api/person?role=seiyuu) and the character gate covers identities.
require_view_studio = require_permission(PERM_VIEW_STUDIO)
require_view_publisher = require_permission(PERM_VIEW_PUBLISHER)
require_view_person = require_permission(PERM_VIEW_PERSON)
require_view_character = require_permission(PERM_VIEW_CHARACTER)
require_view_search = require_permission(PERM_VIEW_SEARCH)
require_view_extras = require_permission(PERM_VIEW_EXTRAS)
require_view_random_picker = require_permission(PERM_VIEW_RANDOM_PICKER)

# Requests and reports: the only two gates /api/requests uses. Filing is a
# self.* permission, which the admin role has locked off - an administrative
# account handles requests and files none.
require_file_requests = require_permission(PERM_SELF_REQUESTS)
require_handle_requests = require_permission(PERM_MANAGE_REQUESTS)


def viewer_user_id(viewer) -> Optional[UUID]:
    """
    The viewer's OWN user id, or None when nobody is logged in.

    There is deliberately no fallback to another account. plan_next and
    seasonal are per-user from Step 3 on, and every route that returns them
    demands a real account through get_current_user_id. This helper exists for
    the two paths that stay public and must simply show nothing per-user: the
    entry watch_next / read_next flags on the catalogue endpoints, and the
    seasonal bucket of /api/search. None there means "no flags, empty bucket",
    never "somebody else's".

    Takes no Session and holds no policy - it is one attribute read plus the
    None-viewer guard that _factory._finish(db, entry, viewer=None) needs.
    """
    return getattr(viewer, "user_id", None) if viewer is not None else None
