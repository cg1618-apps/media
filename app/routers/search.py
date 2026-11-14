"""
routers/search.py
The cross-type search endpoint backing the nav dropdown and the /search page.

One request, one bucket per searchable type. The frontend used to fetch up to 2000
rows from each of twelve tables and filter them in the browser; the filtering
now happens in Postgres, so the response carries matches instead of the whole
collection. Matching rules live in services/domain/search.py.
"""

from enum import Enum
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field, model_serializer
from sqlalchemy.orm import Session

from app import schemas
from app.dependencies import get_db
from app.services.domain.search import SCOPES, search
from app.services.rbac.resolver import Viewer, require_view_search

router = APIRouter(prefix="/api/search", tags=["Search"])

# Built from the service's own list so a new searchable type is accepted by the
# endpoint the moment it is registered, and an unknown scope is a 422 rather
# than a silently empty result.
Scope = Enum("Scope", {value.replace("-", "_"): value for value in SCOPES}, type=str)


class SearchBuckets(BaseModel):
    """One list per searchable type. Keys are the `scope` values.

    The three groups and seasonal are always present. Every other bucket
    defaults to None, and _drop_absent leaves a None bucket out of the
    response: search() gives no key for a type the viewer cannot see - a
    gated type its mode hides, a media type its role does not hold, an
    entity kind whose view.* key it lacks - and the response must not put
    one back.
    """

    collection: List[schemas.CollectionResponse] = []
    franchise: List[schemas.FranchiseResponse] = []
    series: List[schemas.SeriesResponse] = []
    seasonal: List[schemas.SeasonalResponse] = []
    anime: Optional[List[schemas.AnimeResponse]] = None
    anime_movie: Optional[List[schemas.AnimeMovieResponse]] = Field(
        default=None, alias="anime-movie"
    )
    movie: Optional[List[schemas.MovieResponse]] = None
    tv_show: Optional[List[schemas.TVShowResponse]] = Field(default=None, alias="tv-show")
    cartoon: Optional[List[schemas.CartoonResponse]] = None
    manga: Optional[List[schemas.MangaResponse]] = None
    novel: Optional[List[schemas.NovelResponse]] = None
    comic: Optional[List[schemas.ComicResponse]] = None
    game: Optional[List[schemas.GameResponse]] = None
    h_comic: Optional[List[schemas.HComicResponse]] = Field(
        default=None, alias="h-comic"
    )
    hentai: Optional[List[schemas.HentaiResponse]] = None
    h_game: Optional[List[schemas.HGameResponse]] = Field(
        default=None, alias="h-game"
    )
    # Staff. Shown on their own tab by the search page, after the media tab.
    person: Optional[List[schemas.PersonResponse]] = None
    studio: Optional[List[schemas.StudioResponse]] = None
    publisher: Optional[List[schemas.PublisherResponse]] = None
    # Only when the request asks for it (`characters=true`) and the viewer
    # holds view.character.
    character: Optional[List[schemas.CharacterResponse]] = None

    # The bucket keys the frontend uses are hyphenated media-type keys, but
    # "anime-movie" is not a Python identifier. The aliases keep the wire format
    # equal to the media type, so the client can index buckets by type with no
    # translation table; populate_by_name lets this side build it by field name.
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    @model_serializer(mode="wrap")
    def _drop_absent(self, handler):
        """Leave out a bucket that is None - a type the viewer cannot see. Top
        level only: a null field on an entry inside a bucket is still sent."""
        return {key: rows for key, rows in handler(self).items() if rows is not None}


class SearchResponse(BaseModel):
    query: str
    scope: str
    results: SearchBuckets
    # Franchises the anime results belong to — the filter pills on the search
    # page. Not the same as results.franchise, which is franchises whose own
    # name matched the query.
    related_franchises: List[schemas.FranchiseResponse] = []


@router.get("/", response_model=SearchResponse, summary="Search Across All Types")
def search_everything(
    q: Optional[str] = Query(default="", description="Search text."),
    scope: Scope = Query(default=Scope("all"), description="A media type, or 'all'."),
    limit: int = Query(default=500, ge=1, le=2000, description="Cap per bucket."),
    characters: bool = Query(
        default=False,
        description="Add a `character` bucket, searched at scope 'all' only.",
    ),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_view_search),
):
    """
    Every entry, group, season, and staff record whose name matches `q` -
    and every character too, when `characters` is true.

    Query and column are both stripped of case, whitespace, and punctuation
    before matching, so "re zero" finds "Re:Zero". An empty or all-punctuation
    query returns empty buckets rather than the whole collection.
    """
    buckets, related = search(
        db, viewer, q or "", scope.value, limit, include_characters=characters
    )
    return SearchResponse(
        query=q or "",
        scope=scope.value,
        results=SearchBuckets(
            **{key.replace("-", "_"): rows for key, rows in buckets.items()}
        ),
        related_franchises=related,
    )
