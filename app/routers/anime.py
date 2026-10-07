"""routers/anime.py - endpoints built from the shared media-router factory.
Per-type config lives in app/registry.py; endpoint logic in app/routers/_factory.py.
Anime's synchronous autofill + ep_previous derivation on write is its
`pre_commit_hook` (app/services/domain/anime_write.py).

Anime additionally exposes a MyAnimeList search for the Add-tab picker, which
writes the pick's `mal_link`, and the picked record's form prefill
(app/routers/_mal_prefill.py).
"""

from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.registry import MEDIA_REGISTRY
from app.routers._external_search import SEARCH_LIMIT, SEARCH_QUERY, run_search
from app.routers._factory import make_media_router
from app.routers._mal_prefill import MAL_ID, run_mal_prefill
from app.schemas.external_search import ExternalSearchResult
from app.services.integrations.tenrai import search_mal_anime
from app.services.rbac.resolver import Viewer, require_manage_catalog

# Declared before the factory routes are merged in: the factory registers
# GET /{entry_id}, which would otherwise swallow this literal path.
router = APIRouter(tags=["Anime"])


@router.get("/api/anime/search-mal", response_model=List[ExternalSearchResult])
def search_mal(
    q: str = SEARCH_QUERY,
    limit: int = SEARCH_LIMIT,
    admin: Viewer = Depends(require_manage_catalog),
):
    """Searches MAL anime of every type by title."""
    return run_search(search_mal_anime, q, limit)


@router.get("/api/anime/mal-prefill/{mal_id}", response_model=Dict[str, Any])
def mal_prefill(
    mal_id: int = MAL_ID,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """The Add form's fields from one MAL record; see app/services/domain/mal_prefill.py."""
    return run_mal_prefill(db, "anime", mal_id)


router.include_router(make_media_router(MEDIA_REGISTRY["anime"]))
