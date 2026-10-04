"""routers/novel.py — endpoints built from the shared media-router factory.
Per-type config lives in app/registry.py; endpoint logic in app/routers/_factory.py.

Novel additionally exposes two searches for the Add-tab pickers, matching the
two sources Fill reads it from: MyAnimeList (light novels and novels, writing
the pick's `mal_link`) and Open Library (writing `openlibrary_id` and
`openlibrary_link`, for a novel MAL does not carry).
"""

from typing import List

from fastapi import APIRouter, Depends

from app.registry import MEDIA_REGISTRY
from app.routers._external_search import SEARCH_LIMIT, SEARCH_QUERY, run_search
from app.routers._factory import make_media_router
from app.schemas.external_search import ExternalSearchResult
from app.services.integrations.openlibrary import search_openlibrary_works
from app.services.integrations.tenrai import search_mal_novel
from app.services.rbac.resolver import Viewer, require_manage_catalog

# Declared before the factory routes are merged in: the factory registers
# GET /{entry_id}, which would otherwise swallow these literal paths.
router = APIRouter(tags=["Novel"])


@router.get("/api/novel/search-mal", response_model=List[ExternalSearchResult])
def search_mal(
    q: str = SEARCH_QUERY,
    limit: int = SEARCH_LIMIT,
    admin: Viewer = Depends(require_manage_catalog),
):
    """Searches MAL light novels and novels by title."""
    return run_search(search_mal_novel, q, limit)


@router.get("/api/novel/search-openlibrary", response_model=List[ExternalSearchResult])
def search_openlibrary(
    q: str = SEARCH_QUERY,
    limit: int = SEARCH_LIMIT,
    admin: Viewer = Depends(require_manage_catalog),
):
    """Searches Open Library works by title."""
    return run_search(search_openlibrary_works, q, limit)


router.include_router(make_media_router(MEDIA_REGISTRY["novel"]))
