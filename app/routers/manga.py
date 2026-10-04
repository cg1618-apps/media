"""routers/manga.py — endpoints built from the shared media-router factory.
Per-type config lives in app/registry.py; endpoint logic in app/routers/_factory.py.

Manga additionally exposes a MyAnimeList search, without novels and light
novels, for the Add-tab picker, which writes the pick's `mal_link`.
"""

from typing import List

from fastapi import APIRouter, Depends

from app.registry import MEDIA_REGISTRY
from app.routers._external_search import SEARCH_LIMIT, SEARCH_QUERY, run_search
from app.routers._factory import make_media_router
from app.schemas.external_search import ExternalSearchResult
from app.services.integrations.tenrai import search_mal_manga
from app.services.rbac.resolver import Viewer, require_manage_catalog

# Declared before the factory routes are merged in: the factory registers
# GET /{entry_id}, which would otherwise swallow this literal path.
router = APIRouter(tags=["Manga"])


@router.get("/api/manga/search-mal", response_model=List[ExternalSearchResult])
def search_mal(
    q: str = SEARCH_QUERY,
    limit: int = SEARCH_LIMIT,
    admin: Viewer = Depends(require_manage_catalog),
):
    """Searches MAL manga by title, leaving out novels and light novels."""
    return run_search(search_mal_manga, q, limit)


router.include_router(make_media_router(MEDIA_REGISTRY["manga"]))
