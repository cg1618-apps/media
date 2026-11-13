"""
An in-process fixed-window counter, keyed by string.

Used by the login route (failed attempts per username and per address) and
the reset routes (requests per address). The caller owns the policy - which
key, what limit, what window - and this module owns only the counting:

    wait = check(key, limit)     # seconds until the window ends, or None
    hit(key, window)             # count one, opening a window if none is open
    reset(key)                   # forget the key, e.g. after a good login

A window opens on the first hit and lasts `window` seconds; when it ends the
count starts again from zero. Fixed rather than sliding: it is the simplest
counter that bounds guessing, and the bound is what matters here.

IN-PROCESS IS A DEPLOYMENT ASSUMPTION. The box runs ONE uvicorn process
(entrypoint.sh passes no --workers), so one dict sees every request. A second
worker process would hold a second dict and double every limit; a deployment
that adds one needs a shared store (Redis, or a table) behind these three
functions instead. A restart forgets every count, which errs toward letting
someone in, never toward locking them out.

The address a caller keys on is `request.client.host`, which is the visitor
rather than the tunnel only because uvicorn runs with --proxy-headers.

No library: slowapi keys per route, and the login limit needs a per-username
key as well as a per-address one.
"""

import math
import threading
import time
from typing import Optional

# key -> (count, window ends at, as time.time())
_COUNTS: dict[str, tuple[int, float]] = {}
_LOCK = threading.Lock()
# Expired windows are dropped lazily; past this many keys a hit sweeps them,
# so a stream of one-off addresses cannot grow the dict without bound.
_SWEEP_AT = 10_000


def _live(key: str, now: float) -> Optional[tuple[int, float]]:
    entry = _COUNTS.get(key)
    if entry is None or entry[1] <= now:
        return None
    return entry


def check(key: str, limit: int) -> Optional[int]:
    """Whole seconds until `key` may try again, or None while under `limit`."""
    now = time.time()
    with _LOCK:
        entry = _live(key, now)
    if entry is None or entry[0] < limit:
        return None
    return max(1, math.ceil(entry[1] - now))


def hit(key: str, window: int) -> None:
    """Count one against `key`, opening a `window`-second window if none is open."""
    now = time.time()
    with _LOCK:
        entry = _live(key, now)
        if entry is None:
            if len(_COUNTS) >= _SWEEP_AT:
                for stale in [k for k, (_c, end) in _COUNTS.items() if end <= now]:
                    del _COUNTS[stale]
            _COUNTS[key] = (1, now + window)
        else:
            _COUNTS[key] = (entry[0] + 1, entry[1])


def reset(key: str) -> None:
    """Forget `key` entirely."""
    with _LOCK:
        _COUNTS.pop(key, None)


def clear() -> None:
    """Forget every key. For tests, which share this process-global dict."""
    with _LOCK:
        _COUNTS.clear()
