"""Turns an Add-tab picker search into an HTTP response.

Every ``/api/<type>/search-<source>`` route is the same three lines: validate
``q`` and ``limit``, call the source's search function, and map a failure to a
502 the SPA can show. This is those lines.
"""

from typing import Any, Callable, Dict, List

from fastapi import HTTPException, Query

from app.schemas.external_search import ExternalSearchResult
from app.services.integrations.external_search import ExternalSearchError

SEARCH_QUERY = Query(..., min_length=1, description="Title to search for")
SEARCH_LIMIT = Query(10, ge=1, le=50)


def run_search(
    search: Callable[..., List[Dict[str, Any]]], q: str, limit: int, **kwargs: Any
) -> List[ExternalSearchResult]:
    """Calls ``search(q, limit, **kwargs)``; an ``ExternalSearchError`` is a 502."""
    try:
        rows = search(q, limit, **kwargs)
    except ExternalSearchError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return [ExternalSearchResult(**row) for row in rows]
