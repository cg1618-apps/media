"""Shared behaviour for the interactive searches behind the Add-tab pickers.

A picker search is not a Fill. Fill runs in the background and can afford the
clients' five-attempt exponential retry; a search box cannot — the admin is
watching it, and a request that retries for half a minute and then 500s is
worse than one that fails at once and says why. So every search function:

- makes a **single attempt** with a short timeout (``SEARCH_TIMEOUT``),
- raises ``ExternalSearchError`` when the source is unreachable, answers with
  an error, or its key is not configured — never returns ``[]`` for a failure,
  because an empty list reads as "no such title",
- is wrapped in ``cached_search`` so retyping a query, or two tabs asking the
  same thing, costs one upstream call per ``CACHE_TTL_SECONDS``. That matters
  most for Comic Vine (200 requests an hour).
"""

import functools
import threading
import time
from collections import OrderedDict
from typing import Any, Callable, Dict, Hashable, List, Tuple, TypeVar

SEARCH_TIMEOUT = 8
CACHE_TTL_SECONDS = 600
CACHE_MAX_ENTRIES = 256

F = TypeVar("F", bound=Callable[..., List[Dict[str, Any]]])


class ExternalSearchError(Exception):
    """A search could not be answered. The message is shown to the admin."""


def cached_search(func: F) -> F:
    """Memoises a search function's successful results for ``CACHE_TTL_SECONDS``.

    Keyed on the positional and keyword arguments, with string arguments
    normalised (stripped, case-folded) so "Frieren" and "frieren " share an
    entry. Failures are not cached: ``ExternalSearchError`` propagates and the
    next call tries again. Per process, like the clients' rate limiters.
    """
    entries: "OrderedDict[Hashable, Tuple[float, List[Dict[str, Any]]]]" = OrderedDict()
    lock = threading.Lock()

    def _norm(value: Any) -> Any:
        return value.strip().casefold() if isinstance(value, str) else value

    @functools.wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> List[Dict[str, Any]]:
        key = (
            tuple(_norm(a) for a in args),
            tuple(sorted((k, _norm(v)) for k, v in kwargs.items())),
        )
        now = time.monotonic()
        with lock:
            hit = entries.get(key)
            if hit and now - hit[0] < CACHE_TTL_SECONDS:
                entries.move_to_end(key)
                return hit[1]
        result = func(*args, **kwargs)
        with lock:
            entries[key] = (now, result)
            entries.move_to_end(key)
            while len(entries) > CACHE_MAX_ENTRIES:
                entries.popitem(last=False)
        return result

    wrapper.cache_clear = entries.clear  # type: ignore[attr-defined]
    return wrapper  # type: ignore[return-value]
