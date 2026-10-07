"""Turns a picked MyAnimeList search result into the Add form's prefill.

``GET /api/<type>/mal-prefill/{mal_id}`` for anime, anime movie, manga and
novel: the shape is app/services/domain/mal_prefill.py's; this is the HTTP
half - an unknown id is a 404, Tenrai failing a 502.
"""

from typing import Any, Dict

from fastapi import HTTPException, Path
from sqlalchemy.orm import Session

from app.services.domain.mal_prefill import mal_prefill
from app.services.integrations.external_search import ExternalSearchError

MAL_ID = Path(..., ge=1, description="The picked MyAnimeList id")


def run_mal_prefill(db: Session, media_type: str, mal_id: int) -> Dict[str, Any]:
    """Calls ``mal_prefill``: no such id 404, upstream failure 502."""
    try:
        prefill = mal_prefill(db, media_type, mal_id)
    except ExternalSearchError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    if prefill is None:
        raise HTTPException(
            status_code=404, detail=f"MyAnimeList has no entry with id {mal_id}."
        )
    return prefill
