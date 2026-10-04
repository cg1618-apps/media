"""routers/h_game.py — endpoints built from the shared media-router factory.
Per-type config lives in app/registry.py; endpoint logic in app/routers/_factory.py.

H-Game is a gated type: every entry carries the `h-game` content label, so the
factory's ordinary visibility gate hides the whole type from a session whose
mode lacks it. Like Game, it also exposes an IGDB search for the Add-tab
picker, so the admin can pick the right entry and store its ID, which is
Fill's only handle on it. It answers in the shared ``ExternalSearchResult``
shape and turns an unreachable or unconfigured IGDB into a 502.
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
router = APIRouter(tags=["H-Game"])


@router.get("/api/h-game/search-igdb", response_model=List[ExternalSearchResult])
def search_igdb(
    q: str = SEARCH_QUERY,
    limit: int = SEARCH_LIMIT,
    admin: Viewer = Depends(require_manage_catalog),
) -> List[ExternalSearchResult]:
    """Searches IGDB games by name so the admin can identify the right entry."""
    return run_search(search_igdb_games, q, limit)


router.include_router(make_media_router(MEDIA_REGISTRY["h_game"]))
