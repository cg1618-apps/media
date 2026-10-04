"""routers/game.py — endpoints built from the shared media-router factory.
Per-type config lives in app/registry.py; endpoint logic in app/routers/_factory.py.

Game additionally exposes an IGDB search for the Add-tab picker, so the admin
can pick the right entry and store its ID, which is Fill's only handle on the
game. It answers in the shared ``ExternalSearchResult`` shape and turns an
unreachable or unconfigured IGDB into a 502.
"""

from typing import List

from fastapi import APIRouter, Depends

from app.registry import MEDIA_REGISTRY
from app.routers._external_search import SEARCH_LIMIT, SEARCH_QUERY, run_search
from app.routers._factory import make_media_router
from app.schemas.external_search import ExternalSearchResult
from app.services.integrations.igdb import search_igdb_games
from app.services.rbac.resolver import Viewer, require_manage_catalog

# Declared before the factory routes are merged in: the factory registers
# GET /{entry_id}, which would otherwise swallow this literal path.
router = APIRouter(tags=["Game"])


@router.get("/api/game/search-igdb", response_model=List[ExternalSearchResult])
def search_igdb(
    q: str = SEARCH_QUERY,
    limit: int = SEARCH_LIMIT,
    admin: Viewer = Depends(require_manage_catalog),
) -> List[ExternalSearchResult]:
    """Searches IGDB games by name so the admin can identify the right entry."""
    return run_search(search_igdb_games, q, limit)


router.include_router(make_media_router(MEDIA_REGISTRY["game"]))
