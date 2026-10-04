"""routers/anime_movie.py - endpoints built from the shared media-router factory.
Per-type config lives in app/registry.py; endpoint logic in app/routers/_factory.py.
Anime movies have no series (`has_series=False`) and no write hook.

Anime Movie additionally exposes a MyAnimeList search, filtered to MAL's
`movie` type, for the Add-tab picker, which writes the pick's `mal_link`.
"""

from typing import List

from fastapi import APIRouter, Depends

from app.registry import MEDIA_REGISTRY
from app.routers._external_search import SEARCH_LIMIT, SEARCH_QUERY, run_search
from app.routers._factory import make_media_router
from app.schemas.external_search import ExternalSearchResult
from app.services.integrations.tenrai import search_mal_anime
from app.services.rbac.resolver import Viewer, require_manage_catalog

# Declared before the factory routes are merged in: the factory registers
# GET /{entry_id}, which would otherwise swallow this literal path.
router = APIRouter(tags=["Anime Movie"])


@router.get("/api/anime-movie/search-mal", response_model=List[ExternalSearchResult])
def search_mal(
    q: str = SEARCH_QUERY,
    limit: int = SEARCH_LIMIT,
    admin: Viewer = Depends(require_manage_catalog),
):
    """Searches MAL anime of the Movie type by title."""
    return run_search(search_mal_anime, q, limit, media_type="movie")


router.include_router(make_media_router(MEDIA_REGISTRY["anime_movie"]))
