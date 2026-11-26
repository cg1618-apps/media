"""Turns a picked TMDB search result into the IMDb id a movie, TV show or
cartoon row is keyed by, or the IMDb name id a person's imdb_link names.

A TMDB search result carries no IMDb id, so the picker asks for it only for
the result the admin picks: ``GET /api/<type>/tmdb-imdb-id?ref=movie/603``,
and ``GET /api/person/tmdb-imdb-id?ref=person/6384`` for a person.
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
# A person's page, which the person write reads its imdb_id back out of.
IMDB_NAME_LINK_TEMPLATE = "https://www.imdb.com/name/{imdb_id}/"


class TmdbImdbId(BaseModel):
    imdb_id: str
    imdb_link: str


def run_resolve(
    resolve: Callable[[str], Optional[str]],
    ref: str,
    link_template: str = IMDB_LINK_TEMPLATE,
) -> TmdbImdbId:
    """Calls ``resolve(ref)``: malformed ref 422, no IMDb id 404, upstream
    failure 502. ``link_template`` builds the link from the id: a title's
    page by default, IMDB_NAME_LINK_TEMPLATE for a person."""
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
    return TmdbImdbId(imdb_id=imdb_id, imdb_link=link_template.format(imdb_id=imdb_id))
