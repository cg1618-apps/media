"""routers/comic.py — endpoints built from the shared media-router factory.
Per-type config lives in app/registry.py; endpoint logic in app/routers/_factory.py.

Comic additionally exposes a Comic Vine volume search for the Add-tab picker,
so the admin can pick a run and store its ID rather than pasting URLs by hand.
It answers in the shared ``ExternalSearchResult`` shape and turns an
unreachable or unconfigured Comic Vine into a 502.
"""

from typing import List

from fastapi import APIRouter, Depends

from app.registry import MEDIA_REGISTRY
from app.routers._external_search import SEARCH_LIMIT, SEARCH_QUERY, run_search
from app.routers._factory import make_media_router
from app.schemas.external_search import ExternalSearchResult
from app.services.integrations.comicvine import search_comicvine_volumes
from app.services.rbac.resolver import Viewer, require_manage_catalog

# Declared before the factory routes are merged in: the factory registers
# GET /{entry_id}, which would otherwise swallow this literal path.
router = APIRouter(tags=["Comic"])


@router.get("/api/comic/search-comicvine", response_model=List[ExternalSearchResult])
def search_comicvine(
    q: str = SEARCH_QUERY,
    limit: int = SEARCH_LIMIT,
    admin: Viewer = Depends(require_manage_catalog),
) -> List[ExternalSearchResult]:
    """Searches Comic Vine volumes by name so the admin can identify the right run."""
    return run_search(search_comicvine_volumes, q, limit)


router.include_router(make_media_router(MEDIA_REGISTRY["comic"]))
