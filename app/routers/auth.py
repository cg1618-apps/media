"""
routers/auth.py
Handles the generation and destruction of secure authentication sessions.
Uses JWTs stored in HTTP-Only cookies to protect against XSS attacks.
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import settings
from app.dependencies import get_db
from app.models.system import USER_STATUS_DISABLED, USER_STATUS_PENDING
from app.services import rate_limit
from app.services.domain.account_codes import (
    INVALID_CODE_MESSAGE,
    PURPOSE_INVITE,
    PURPOSE_RESET,
    InvalidCode,
    find_code,
    reset_target,
    spend_code,
)
from app.services.domain.accounts import revoke_sessions, set_login_cookie
from app.services.domain.registration import UsernameTaken, register_account
from app.services.rbac import cache
from app.services.rbac.gated_types import visible_gated_types
from app.services.rbac.modes import (
    ResolvedMode,
    default_mode_id,
    held_modes,
    resolve_mode,
    switch_requires_password,
    within_ceiling,
)
from app.services.rbac.permissions import PERM_MANAGE_CATALOG
from app.services.rbac.resolver import (
    GUEST_FALLBACK,
    MODE_OVERRIDE_COOKIE,
    resolve_viewer,
)
from app.services.security import (
    create_access_token,
    get_password_hash,
    validate_new_password,
    verify_password,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# The owner's limits, per 15 minutes. Login counts FAILED attempts only, keyed
# both on the username (one account being guessed at) and on the address (one
# visitor guessing at many); a correct password clears the username's count.
# Reset and register count every request from an address, GET and POST alike,
# because the GET alone answers "is this code real". The counter is in-process - see
# app/services/rate_limit.py for why that is enough and when it stops being.
RATE_WINDOW_SECONDS = 15 * 60
LOGIN_FAILURES_PER_USERNAME = 5
LOGIN_FAILURES_PER_ADDRESS = 20
RESET_REQUESTS_PER_ADDRESS = 10
REGISTER_REQUESTS_PER_ADDRESS = 10

STATUS_REFUSALS = {
    USER_STATUS_PENDING: "Your account is waiting for the admin's approval.",
    USER_STATUS_DISABLED: "This account is disabled.",
}


def _client_address(request: Request) -> str:
    """The visitor's address. uvicorn runs with --proxy-headers, so behind the
    tunnel this is the visitor and not cloudflared."""
    return request.client.host if request.client else "unknown"


def _too_many(wait_seconds: int) -> HTTPException:
    minutes = max(1, -(-wait_seconds // 60))
    unit = "minute" if minutes == 1 else "minutes"
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"Too many attempts. Try again in {minutes} {unit}.",
        headers={"Retry-After": str(wait_seconds)},
    )


@router.post("/login", summary="Authenticate User and Set Cookie")
def login_for_access_token(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Validates user credentials against the database.
    If valid, generates a JWT and sets it as an HTTP-Only, Lax SameSite cookie.

    The order is deliberate. The rate limit answers first, so a locked
    username stays locked whatever is typed. A wrong password is the generic
    401 whatever the account's status; only after a CORRECT one does a
    pending or disabled account learn why it cannot sign in (403, no cookie).
    So an account's status reaches nobody who does not know its password.
    """
    # Every new name is lowercase (validate_new_username), so the typed one is
    # lowered rather than matched as typed. Compared through lower() on the
    # column as well, which is what uq_users_username_lower indexes.
    username = form_data.username.lower()
    user_key = f"login:user:{username}"
    address_key = f"login:ip:{_client_address(request)}"
    waits = [
        rate_limit.check(user_key, LOGIN_FAILURES_PER_USERNAME),
        rate_limit.check(address_key, LOGIN_FAILURES_PER_ADDRESS),
    ]
    if any(waits):
        logger.warning("Rate-limited login attempt for username: %s", username)
        raise _too_many(max(w for w in waits if w))

    # 1. Fetch user from database
    user = (
        db.query(models.User)
        .filter(func.lower(models.User.username) == username)
        .first()
    )

    # 2. Verify existence and password match
    if not user or not verify_password(form_data.password, user.hashed_password):
        logger.warning("Failed login attempt for username: %s", username)
        rate_limit.hit(user_key, RATE_WINDOW_SECONDS)
        rate_limit.hit(address_key, RATE_WINDOW_SECONDS)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    refusal = STATUS_REFUSALS.get(user.status)
    if refusal:
        logger.info("Refused login for %s account: %s", user.status, user.username)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=refusal)
    rate_limit.reset(user_key)

    # 3. Mint the token and set the cookie - claims and flags live in
    # set_login_cookie, shared with update_user's reissue.
    set_login_cookie(response, db, user)
    # A new login starts in the default mode, whoever was signed in before.
    _clear_mode_override(response)

    logger.info("Successful login for user: %s", user.username)
    return {"message": "Successfully logged in", "role": user.role}


def _clear_mode_override(response: Response) -> None:
    response.delete_cookie(
        key=MODE_OVERRIDE_COOKIE,
        path="/",
        httponly=True,
        samesite="lax",
        secure=not settings.is_development,
    )


def _user_for(db: Session, viewer):
    """The account row behind a resolved viewer, or None for a guest.

    /me resolves a Viewer rather than a User, and held_modes needs the row.
    One lookup on a route the SPA calls once per mount.
    """
    if not viewer.username:
        return None
    return (
        db.query(models.User).filter(models.User.username == viewer.username).first()
    )


@router.get("/me", summary="Get Current Auth Status")
def get_me(request: Request, db: Session = Depends(get_db)):
    """
    Returns the current viewer's auth status. Used by React AuthContext on mount.

    This is the one place the SPA learns what it may show, so it carries the
    whole permission set, not just the admin flag. `is_admin` and `username`
    keep their old meaning and shape - every existing consumer of useAuth()
    reads those and must not break.

    Never raises. An anonymous or unresolvable caller is the guest role, which
    is a real row with real grants, so the SPA gets a usable answer either way.
    """
    try:
        viewer = resolve_viewer(request, db)
    except Exception:
        logger.exception("Failed to resolve viewer; falling back to guest")
        viewer = GUEST_FALLBACK

    return {
        # Means "may edit the catalogue", not "is an administrator". The SPA's
        # 394 isAdmin call sites gate edit buttons, notes editors and tracker
        # controls, which is exactly manage.catalog - so a super account
        # correctly gains them. The three authorization pages ask for
        # admin.authz instead; see App.jsx.
        "is_admin": viewer.has(PERM_MANAGE_CATALOG),
        "username": viewer.username,
        "role": viewer.role_name,
        "is_root": viewer.is_root,
        # TWO AXES, ONE LIST, deliberately. The role half answers "what may
        # this account DO"; the field_group.* half answers "which fields of a
        # reachable entry may this SESSION see" and comes from the active
        # access mode minus its denials. They are merged here, and ONLY here,
        # so the SPA asks one has() for either; the server never merges the
        # two anywhere else. The SPA reads no field_group.* key today - the
        # one group left, sources_restricted, is filtered server-side.
        #
        # The literal prefix is deliberate too: field_group_perm() was deleted
        # in Phase B precisely so a stale call site becomes an ImportError,
        # and re-introducing a helper for one call site would invite back the
        # thing the deletion was meant to prevent.
        "permissions": sorted(
            set(viewer.permissions)
            | {f"field_group.{key}" for key in viewer.field_groups}
        ),
        # Content labels are NOT published. They scope whole entries
        # server-side, the browser never needs them, and listing them would
        # tell a narrowed session exactly what it is being kept from.
        #
        # The gated media types this session may see (gated_types.py), so
        # the SPA can offer their navigation. Only the seeable ones are named:
        # a session that cannot see a gated type is not told it exists, so an
        # empty list and "no gated types" read the same.
        "visible_gated_types": visible_gated_types(db, viewer),
        "mode": {
            "id": str(viewer.mode_id) if viewer.mode_id else None,
            "key": viewer.mode_key,
            # When the session returns to the account's default mode; None
            # while it is already there. The SPA reloads at this moment so
            # what is on screen does not outlive the mode it was fetched in.
            "expires_at": (
                viewer.mode_expires_at.isoformat()
                if viewer.mode_expires_at
                else None
            ),
        },
        # What the switcher needs: which modes are available - every one up
        # to the account's ceiling - and what each would COST. `requires_password` is the subset test from decision 3,
        # computed server-side precisely so the SPA never has to model it.
        # A guest gets an empty list - no account, nothing to switch between.
        "modes": held_modes(
            db,
            _user_for(db, viewer),
            ResolvedMode(
                viewer.mode_id,
                viewer.mode_key,
                viewer.visible_label_ids,
                viewer.field_groups,
            ),
        ),
    }


@router.post("/access-mode", summary="Switch the active access mode")
def switch_access_mode(
    payload: schemas.AccessModeSwitch,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Change which objects this session may reach, without logging out.

    Narrowing is instant; widening asks for the password again (decision 3),
    so nobody widens a session they merely find logged in. The test
    is a set comparison and it is the SAME function /api/auth/me uses to
    advertise the cost - the endpoint that ENFORCES the rule must not be able
    to disagree with the payload that ADVERTISES it.

    A SWITCHED-TO MODE IS TEMPORARY. Switching to anything but the account's
    default sets the access_mode cookie: a browser-session cookie (no
    max_age, so closing the browser drops it) holding a token. A mode WIDER
    than the default expires settings.access_mode_override_minutes from now;
    a narrower one lasts as long as the login. Neither outlives the login.
    Switching to the default clears it. The login cookie is not reissued, so
    switching cannot extend a session.
    """
    viewer = resolve_viewer(request, db)
    user = _user_for(db, viewer)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to change access mode.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Available means ranked at or below the account's ceiling. 404 for a
    # mode above it, and deliberately the same answer a mode that does not
    # exist gets: which modes exist is not this caller's business, and it is
    # NOT a password problem - answering `requires_password` here would
    # invite the SPA to prompt for something that cannot help.
    mode = db.get(models.AccessMode, payload.mode_id)
    if mode is None or not within_ceiling(user, mode.key):
        raise HTTPException(status_code=404, detail="Access mode not found.")

    target = resolve_mode(db, user, payload.mode_id)
    current = ResolvedMode(
        viewer.mode_id,
        viewer.mode_key,
        viewer.visible_label_ids,
        viewer.field_groups,
    )

    if switch_requires_password(current, target):
        if not payload.password or not verify_password(
            payload.password, user.hashed_password
        ):
            # Returned, not raised: HTTPException cannot carry a body field
            # beside `detail`, and `requires_password` has to reach the SPA so
            # it prompts rather than guessing which switches are free.
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "detail": "Widening an access mode needs your password.",
                    "requires_password": True,
                },
            )

    default_id = default_mode_id(db, user)
    if payload.mode_id == default_id:
        _clear_mode_override(response)
    else:
        login_expires_at = datetime.fromtimestamp(
            (viewer.token_payload or {})["exp"], tz=timezone.utc
        )
        # Only a mode that reaches past the default is on a clock. "Past" is
        # the password prompt's own subset test, against the DEFAULT rather
        # than the mode being left, so the answer does not depend on the
        # route taken to the target.
        timed = switch_requires_password(
            resolve_mode(db, user, default_id), target
        )
        claims = {"sub": user.username, "mode": str(payload.mode_id)}
        if timed:
            expires_at = min(
                datetime.now(timezone.utc)
                + timedelta(minutes=settings.access_mode_override_minutes),
                login_expires_at,
            )
        else:
            expires_at = login_expires_at
            # Tells /me there is no end to report: the login's own end is a
            # month away, past what the SPA's reload timer can hold.
            claims["timed"] = False
        token = create_access_token(claims, expires_at=expires_at)
        # No max_age and no expires: a browser-session cookie. The token's
        # own `exp` is what ends it in a browser that restores its session.
        response.set_cookie(
            key=MODE_OVERRIDE_COOKIE,
            value=token,
            httponly=True,
            samesite="lax",
            secure=not settings.is_development,
        )
    return {"mode": {"id": str(target.mode_id), "key": target.mode_key}}


@router.post("/logout", summary="Logout User and Clear Cookie")
def logout_user():
    """Clears the HttpOnly access token cookie to properly log out the admin."""
    response = JSONResponse(content={"message": "Successfully logged out"})
    response.delete_cookie(key="access_token", path="/", httponly=True, samesite="lax")
    _clear_mode_override(response)
    return response


# ---------------------------------------------------------------------------
# Password reset links
# ---------------------------------------------------------------------------
# Issued by the admin (POST /api/users/{id}/reset-link) or by the CLI on the
# box (python -m app.cli reset-link <username>); spent here, once, by whoever
# holds the link. No session is needed - that is the point of the link.


def _limit_per_address(request: Request, scope: str, limit: int) -> None:
    key = f"{scope}:ip:{_client_address(request)}"
    wait = rate_limit.check(key, limit)
    if wait:
        raise _too_many(wait)
    rate_limit.hit(key, RATE_WINDOW_SECONDS)


def _limit_reset(request: Request) -> None:
    _limit_per_address(request, "reset", RESET_REQUESTS_PER_ADDRESS)


def _invalid_link() -> HTTPException:
    return HTTPException(status_code=404, detail=INVALID_CODE_MESSAGE)


@router.get(
    "/reset",
    response_model=schemas.ResetCodeInfo,
    summary="Check a password reset link",
)
def check_reset_code(
    request: Request, code: str = "", db: Session = Depends(get_db)
):
    """Whose account a reset link is for, WITHOUT spending it. Every unusable
    code - unknown, spent, expired, another purpose - is the same 404."""
    _limit_reset(request)
    try:
        user = reset_target(db, find_code(db, code, PURPOSE_RESET))
    except InvalidCode:
        raise _invalid_link()
    return {"username": user.username}


@router.post(
    "/reset",
    response_model=schemas.ResetCodeInfo,
    summary="Set a new password from a reset link",
)
def reset_password(
    payload: schemas.PasswordReset, request: Request, db: Session = Depends(get_db)
):
    """
    Spend the code, set the password and end the account's sessions, in ONE
    transaction. A refused password (422) rolls the spend back, so a typo does
    not burn the link.

    Clears this browser's login cookie as well: whoever was signed in here is
    not necessarily the account just reset. Returns the username so the SPA
    can pre-fill the sign-in form.
    """
    _limit_reset(request)
    try:
        row = spend_code(db, payload.code, PURPOSE_RESET)
        user = reset_target(db, row)
        validate_new_password(payload.password)
    except InvalidCode:
        db.rollback()
        raise _invalid_link()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc))

    user.hashed_password = get_password_hash(payload.password)
    revoke_sessions(user)
    db.commit()
    # The cover route caches a resolved viewer per cookie (cover_viewer.py).
    cache.bump()
    logger.info("Password reset by link for user: %s", user.username)

    response = JSONResponse(content={"username": user.username})
    response.delete_cookie(key="access_token", path="/", httponly=True, samesite="lax")
    _clear_mode_override(response)
    return response


# ---------------------------------------------------------------------------
# Registration by invite link
# ---------------------------------------------------------------------------
# The admin issues the invite (POST /api/users/invites); whoever holds it
# registers here, once. The account waits `pending` for the admin's approval
# and cannot sign in until then. Without an invite there is no registration.


def _limit_register(request: Request) -> None:
    _limit_per_address(request, "register", REGISTER_REQUESTS_PER_ADDRESS)


@router.get(
    "/register",
    response_model=schemas.InviteCodeInfo,
    summary="Check an invite link",
)
def check_invite_code(
    request: Request, code: str = "", db: Session = Depends(get_db)
):
    """Whether an invite can be used, WITHOUT spending it. Every unusable code
    is the same 404 as on /reset."""
    _limit_register(request)
    try:
        find_code(db, code, PURPOSE_INVITE)
    except InvalidCode:
        raise _invalid_link()
    return {"valid": True}


@router.post(
    "/register",
    response_model=schemas.RegisteredAccount,
    status_code=status.HTTP_201_CREATED,
    summary="Register an account from an invite link",
)
def register(
    payload: schemas.Registration, request: Request, db: Session = Depends(get_db)
):
    """
    Spend the invite and create the account, `pending`, in ONE transaction. A
    refused name or password (422) or a taken name (409) rolls the spend back,
    so a typo does not burn the link. No cookie is set: the account signs in
    once the admin has approved it.
    """
    _limit_register(request)
    try:
        user = register_account(db, payload.code, payload.username, payload.password)
    except InvalidCode:
        db.rollback()
        raise _invalid_link()
    except UsernameTaken:
        db.rollback()
        raise HTTPException(status_code=409, detail="That username is taken.")
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc))
    db.commit()
    logger.info("Registration waiting for approval: %s", user.username)
    return {"username": user.username}
