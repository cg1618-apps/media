"""Turns a picked TMDB search result into the IMDb id a movie, TV show or
cartoon row is keyed by.

A TMDB search result carries no IMDb id, so the picker asks for it only for
the result the admin picks: ``GET /api/<type>/tmdb-imdb-id?ref=movie/603``.
"""

from typing import Callable, Optional

from fastapi import HTTPException, Query
from pydantic import BaseModel

from app.services.integrations.external_search import ExternalSearchError

TMDB_REF = Query(
    ..., min_length=1, description="A TMDB search result's external_id, e.g. movie/603"
)
# The form app.utils.utils.extract_imdb_id parses back into imdb_id.
IMDB_LINK_TEMPLATE = "https://www.imdb.com/title/{imdb_id}/"


class TmdbImdbId(BaseModel):
    imdb_id: str
    imdb_link: str


def run_resolve(resolve: Callable[[str], Optional[str]], ref: str) -> TmdbImdbId:
    """Calls ``resolve(ref)``: malformed ref 422, no IMDb id 404, upstream failure 502."""
    try:
        imdb_id = resolve(ref)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except ExternalSearchError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    if not imdb_id:
        raise HTTPException(
            status_code=404,
            detail=f"TMDB has no IMDb id for {ref}. Enter the IMDb link by hand.",
        )
    return TmdbImdbId(imdb_id=imdb_id, imdb_link=IMDB_LINK_TEMPLATE.format(imdb_id=imdb_id))
