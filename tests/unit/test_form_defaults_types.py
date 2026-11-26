"""The tabs /api/form-defaults accepts, checked without a database.

The media-type half of the set is built from app/registry.py; this pins the
whole set to the nineteen FORM_TABS keys the /defaults page offers
(frontend/src/config/adminTabs.js), so building it changes nothing.
"""

from app.routers.form_defaults import VALID_MEDIA_TYPES


def test_valid_types_are_the_nineteen_form_tabs():
    assert VALID_MEDIA_TYPES == {
        "anime",
        "anime-movie",
        "movie",
        "tv-show",
        "cartoon",
        "manga",
        "book",
        "comic",
        "game",
        "h-comic",
        "hentai",
        "h-game",
        "collection",
        "franchise",
        "series",
        "studio",
        "publisher",
        "person",
        "character",
    }
