"""
security.py
Provides cryptographic utilities for the application.
Handles password hashing via bcrypt and session management via JWT.
"""

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import bcrypt
import jwt

from app.config import settings

# ==========================================
# JWT CONFIGURATION
# ==========================================
SECRET_KEY = settings.jwt_secret_key
ALGORITHM = settings.algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes


# ==========================================
# PASSWORD HASHING (BCRYPT)
# ==========================================


# The hash stored for an account that has no password on this machine.
#
# users.hashed_password does NOT travel in the Google Sheet: it is credential
# material for other people's accounts, and a Backup writes the sheet outside
# this database's trust boundary. Pull therefore restores the account and
# stamps this marker, and an admin sets a real password through
# PUT /api/users/{id} on the arriving machine.
#
# "!" is not a bcrypt hash and cannot be produced by get_password_hash (every
# bcrypt hash starts "$2"), so no input can ever verify against it: checkpw
# raises on the malformed salt and verify_password returns False. Django uses
# the same leading "!" convention for the same reason.
UNUSABLE_PASSWORD_HASH = "!"


def is_unusable_password_hash(value: str | None) -> bool:
    """True when this account cannot be logged into until a password is set."""
    return not value or value.startswith("!")


# bcrypt reads only the first 72 bytes of its input, and bcrypt 5 raises on
# anything longer. A password past that is REFUSED, not truncated: a quiet
# truncation would accept any password that agrees with the stored one up to
# byte 72, which is a different password from the one the person chose.
MAX_PASSWORD_BYTES = 72

# A new username: 3 to 32 characters of lowercase letters, digits, `-` and
# `_`. Lowercase only, so the name you sign in with and the name stored are
# one string; login lowercases what is typed (routers/auth.py).
USERNAME_PATTERN = re.compile(r"[a-z0-9_-]{3,32}")
# Refused anywhere in a NEW name, so nobody can register a name that reads as
# the site's own administrator or as the anonymous visitor.
RESERVED_USERNAME_PARTS: tuple[str, ...] = ("admin", "guest")


def validate_new_username(name: str) -> str:
    """
    The username policy, applied to every NEW name: /users create, /users
    rename, and registration. Not applied to rows that already exist, which is
    how the `admin` account keeps its name.

    Returns the name unchanged; raises ValueError with a sentence fit to show
    the person typing it. Uniqueness is not checked here - it is
    case-insensitive and lives in the database (`uq_users_username_lower`), so
    the caller asks it.
    """
    lowered = (name or "").lower()
    for part in RESERVED_USERNAME_PARTS:
        if part in lowered:
            raise ValueError(
                'A username cannot contain "admin" or "guest".'
            )
    if not USERNAME_PATTERN.fullmatch(name or ""):
        raise ValueError(
            "A username is 3 to 32 characters: lowercase letters, digits, "
            "- and _."
        )
    return name


def validate_new_password(password: str) -> None:
    """
    The two checks every NEW password passes - register, reset, changing your
    own, and /users create and set-password.

    Not a policy, by the owner's decision: no minimum length and no
    composition rules. Both checks are technical. An empty string is no
    credential at all, and bcrypt cannot tell apart two passwords that agree
    on their first 72 bytes. Bytes, not characters: a character outside basic
    Latin is two to four bytes in UTF-8.
    """
    if not password:
        raise ValueError("A password cannot be empty.")
    size = len(password.encode("utf-8"))
    if size > MAX_PASSWORD_BYTES:
        raise ValueError(
            f"A password can be at most {MAX_PASSWORD_BYTES} bytes; this one "
            f"is {size}. Letters outside basic Latin take two to four bytes "
            "each."
        )


def get_password_hash(password: str) -> str:
    """
    Hashes a plain-text password using the bcrypt algorithm.

    No truncation: every caller has passed the password through
    validate_new_password first, and one that has not gets a ValueError here
    rather than a hash of a shorter password than the one it was handed.
    """
    pwd_bytes = password.encode("utf-8")
    if len(pwd_bytes) > MAX_PASSWORD_BYTES:
        raise ValueError(
            f"A password can be at most {MAX_PASSWORD_BYTES} bytes."
        )
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Checks a plain-text password against a known bcrypt hash.
    Returns True if the credentials match, False otherwise.

    KEEPS the 72-byte slice that get_password_hash dropped. An account whose
    password was set before the length check may have been hashed from the
    first 72 bytes of a longer one; the person still types the whole thing,
    and bcrypt 5 raises on more than 72 bytes rather than reading the prefix.
    """
    try:
        pwd_bytes = plain_password.encode("utf-8")[:MAX_PASSWORD_BYTES]
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False


# ==========================================
# SESSION TOKEN MANAGEMENT (JWT)
# ==========================================


def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
    expires_at: Optional[datetime] = None,
) -> str:
    """
    Generates a signed JWT access token containing the provided data payload.

    Includes an 'exp' (expiration) claim. If no specific expires_delta is provided,
    the token defaults to the global ACCESS_TOKEN_EXPIRE_MINUTES configuration.

    `expires_at` is used VERBATIM and takes precedence over both. The
    access-mode switch uses it so an override never outlives the login it
    belongs to. Anything that reissues a login token in future must pass the
    original deadline here: the lifetime is flat with no refresh flow, so a
    reissue that minted a fresh month would be an unlimited session-extension
    oracle. Revocation is the `sv` claim against users.session_version
    (resolver.py), which ends a session early but never extends one.
    """
    to_encode = data.copy()

    # Use timezone-aware UTC to ensure consistency across cloud regions
    if expires_at is not None:
        expire = expires_at
    elif expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode.update({"exp": expire})

    # Sign the token using the secret key and defined algorithm
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
