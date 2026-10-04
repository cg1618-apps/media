"""The one result shape every Add-tab external search returns.

Each source (MAL via Tenrai, TMDB, Open Library, Comic Vine, IGDB) maps its own
payload onto this, so the SPA renders every picker with one component and a
pick only has to know which id and link columns the tab writes.
"""

from typing import Optional

from pydantic import BaseModel


class ExternalSearchResult(BaseModel):
    # The source's own id, as a string: MAL and IGDB ids are integers, IMDb
    # ("tt…") and Open Library ("OL…W") ids are not. The SPA casts on write.
    external_id: str
    # The public page for the record — the value the tab's *_link column holds.
    link: Optional[str] = None
    title: str
    # A second name worth showing to tell two results apart (native, English).
    title_alt: Optional[str] = None
    year: Optional[int] = None
    # One short disambiguating line: "TV · 28 eps", a publisher, an author.
    detail: Optional[str] = None
    cover_url: Optional[str] = None
