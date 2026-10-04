"""routers/movie.py — endpoints built from the shared media-router factory.
Per-type config lives in app/registry.py; endpoint logic in app/routers/_factory.py.

Movie additionally exposes a TMDB search for the Add-tab picker, and the
lookup that turns the picked result into the IMDb id the row is keyed by.
"""

from typing import List

from fastapi import APIRouter, Depends

from app.registry import MEDIA_REGISTRY
from app.routers._external_search import SEARCH_LIMIT, SEARCH_QUERY, run_search
from app.routers._factory import make_media_router
from app.routers._tmdb_resolve import TMDB_REF, TmdbImdbId, run_resolve
from app.schemas.external_search import ExternalSearchResult
from app.services.integrations.tmdb import resolve_tmdb_imdb_id, search_tmdb
from app.services.rbac.resolver import Viewer, require_manage_catalog

TMDB_KINDS = ("movie",)

# Declared before the factory routes are merged in: the factory registers
# GET /{entry_id}, which would otherwise swallow these literal paths.
router = APIRouter(tags=MEDIA_REGISTRY["movie"].tags)


@router.get("/api/movies/search-tmdb", response_model=List[ExternalSearchResult])
def search_tmdb_titles(
    q: str = SEARCH_QUERY,
    limit: int = SEARCH_LIMIT,
    admin: Viewer = Depends(require_manage_catalog),
) -> List[ExternalSearchResult]:
    """Searches TMDB so the admin can pick the right title."""
    return run_search(search_tmdb, q, limit, kinds=TMDB_KINDS)


@router.get("/api/movies/tmdb-imdb-id", response_model=TmdbImdbId)
def tmdb_imdb_id(
    ref: str = TMDB_REF,
    admin: Viewer = Depends(require_manage_catalog),
) -> TmdbImdbId:
    """The IMDb id TMDB holds for a picked search result."""
    return run_resolve(resolve_tmdb_imdb_id, ref)


router.include_router(make_media_router(MEDIA_REGISTRY["movie"]))
