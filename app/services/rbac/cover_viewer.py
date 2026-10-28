"""
The cover route's viewer, resolved once per session every few seconds.

A library page fires a hundred or more `GET /api/covers/...` at once, and each
one used to resolve the viewer (two to four queries) and its hiding state (one
or two more) before the one or two queries that are actually about the image.
Those first four to six answers are identical across every cover a session
fetches, and each request held a worker thread and a pooled connection while
it asked them, so ordinary API requests queued behind the images.

So the cover route depends on get_cover_viewer instead of get_viewer, and this
module keeps what it resolves for COVER_VIEWER_TTL_SECONDS. Every other route
still resolves on every request: the cache is scoped to the one route where
the repetition is, and a route that writes never sees a cached viewer.

What a cached entry holds, and everything it depends on
-------------------------------------------------------
The value is resolve_viewer's Viewer, plus the two hiding answers computed
from it (hidden_labels, hidden_gated). Read resolver.resolve_viewer and
enforcement.hidden_label_ids for the full derivation; its inputs are:

  from the request   the `access_token` cookie and the `access_mode`
                     override cookie - nothing else (no header, no path, no
                     query). Both RAW values are the key, so a different
                     login, a mode switch, a logout or a re-login is a
                     different key, never a stale hit.
  from the clock     each token's `exp`. An entry never outlives either
                     token it was resolved from, so a login or an override
                     that expires mid-TTL stops applying on time.
  from the database  users (by username), role, role_permission,
                     user_access_mode (the default grant and the active one),
                     access_mode, access_mode_label, access_mode_field_group,
                     user_access_mode_denial, content_label.

The database inputs are not in the key - they cannot be, without reading them
- so they are covered by invalidation instead: every write path to those
tables calls cache.bump(), and an entry resolved under an older
cache.generation() is discarded. The TTL bounds whatever a bump cannot reach:
a hand-edit in psql, and a second process, since each uvicorn worker holds its
own copy and a bump in one clears only that one.

NOT an input, and deliberately not cached: which labels an entry or franchise
CARRIES (media_content_label, franchise_content_label) and every shared-record
connection. Those are the per-image probe the route still runs on every
request, so assigning a label to an entry hides its cover on the very next
fetch, cached viewer or not.
"""

import threading
import time
from dataclasses import replace
from typing import Optional

import jwt
from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.services.rbac import cache
from app.services.rbac.enforcement import hidden_label_ids
from app.services.rbac.gated_types import hidden_gated_types
from app.services.rbac.resolver import (
    GUEST_FALLBACK,
    MODE_OVERRIDE_COOKIE,
    Viewer,
    resolve_viewer,
)

# Five seconds. Long enough that one page load - every cover in the first
# screenful, then a scroll's worth - resolves the viewer once rather than once
# per image; short enough that a change no bump reaches (psql, another worker)
# is live within a few seconds, which is less than it takes to switch tabs
# and reload.
COVER_VIEWER_TTL_SECONDS = 5.0

# The key is two caller-supplied cookie strings, so a client sending a fresh
# junk cookie per request could otherwise grow the dict without limit inside
# one TTL. Far above the number of sessions this installation has.
MAX_ENTRIES = 512

AUTH_COOKIE = "access_token"

# Indirected so a test can move the clock. Monotonic for the TTL, so a wall
# clock stepped backwards cannot stretch an entry's life; the wall clock only
# for token `exp`, which is a wall-clock instant.
_monotonic = time.monotonic
_wall = time.time

# key -> (generation, monotonic deadline, viewer)
_ENTRIES: dict[tuple[Optional[str], Optional[str]], tuple[int, float, Viewer]] = {}
_LOCK = threading.Lock()


def clear() -> None:
    """Drop every entry. Tests use it; production relies on bump()."""
    with _LOCK:
        _ENTRIES.clear()


def _token_exp(token: Optional[str]) -> Optional[float]:
    """
    A token's `exp`, read WITHOUT verifying it.

    Only ever used to make an entry die sooner, never to admit anything: the
    viewer itself was resolved by resolve_viewer, which verified both tokens.
    A cookie that does not parse has no deadline of its own here.
    """
    if not token:
        return None
    if token.startswith("Bearer "):
        token = token.split(" ", 1)[1]
    try:
        exp = jwt.decode(token, options={"verify_signature": False}).get("exp")
    except jwt.PyJWTError:
        return None
    return float(exp) if isinstance(exp, (int, float)) else None


def _deadline(
    auth: Optional[str], override: Optional[str], viewer: Viewer
) -> float:
    """The monotonic instant this entry stops being served."""
    lifetime = COVER_VIEWER_TTL_SECONDS
    wall_now = _wall()
    expiries = [_token_exp(auth), _token_exp(override)]
    if viewer.mode_expires_at is not None:
        expiries.append(viewer.mode_expires_at.timestamp())
    for exp in expiries:
        if exp is not None:
            lifetime = min(lifetime, exp - wall_now)
    return _monotonic() + max(lifetime, 0.0)


def _with_hiding(db: Session, viewer: Viewer) -> Viewer:
    """The viewer with its hiding state filled in, by the uncached functions."""
    hidden = hidden_label_ids(db, viewer)
    return replace(
        viewer,
        hidden_labels=tuple(hidden),
        hidden_gated=hidden_gated_types(db, hidden),
    )


def resolve_cover_viewer(request: Request, db: Session) -> Viewer:
    auth = request.cookies.get(AUTH_COOKIE)
    override = request.cookies.get(MODE_OVERRIDE_COOKIE)
    key = (auth, override)

    # Read BEFORE resolving: see cache.py on why the order closes the race.
    generation = cache.generation()
    now = _monotonic()
    with _LOCK:
        hit = _ENTRIES.get(key)
    if hit is not None:
        hit_generation, deadline, viewer = hit
        if hit_generation == generation and now < deadline:
            return viewer

    viewer = resolve_viewer(request, db)
    if viewer is GUEST_FALLBACK:
        # resolve_viewer's error path. Fail-closed already, but a transient
        # error is not worth remembering for five seconds.
        return viewer
    viewer = _with_hiding(db, viewer)
    deadline = _deadline(auth, override, viewer)

    with _LOCK:
        if cache.generation() != generation:
            # A bump landed while this was resolving, so what was read may
            # predate the write. Serve it - this request began before the
            # write - but do not keep it.
            return viewer
        for stale in [
            k
            for k, (g, d, _) in _ENTRIES.items()
            if g != generation or d <= now
        ]:
            del _ENTRIES[stale]
        while len(_ENTRIES) >= MAX_ENTRIES:
            del _ENTRIES[next(iter(_ENTRIES))]
        _ENTRIES[key] = (generation, deadline, viewer)
    return viewer


def get_cover_viewer(request: Request, db: Session = Depends(get_db)) -> Viewer:
    """FastAPI dependency form, for the cover route only."""
    return resolve_cover_viewer(request, db)

