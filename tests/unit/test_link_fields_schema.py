"""
The read-only link fields on the *Response schemas must stay in step with
credit_roles, and must never leak onto the Create/Update bases.

Dropping a column does not break Python that references it - the whole class of
bug this redesign kept re-hitting. The same is true in reverse: adding a credit
role or tag field without adding its payload key would silently blank a public
page again. This test is the tripwire.
"""

import pytest

from app import schemas
from app.schemas.link_fields import LINK_FIELD_MIXINS
from app.services.domain.credits import legacy_link_fields

RESPONSE_SCHEMAS = {
    "anime": schemas.AnimeResponse,
    "anime-movie": schemas.AnimeMovieResponse,
    "movie": schemas.MovieResponse,
    "tv-show": schemas.TVShowResponse,
    "cartoon": schemas.CartoonResponse,
    "manga": schemas.MangaResponse,
    "book": schemas.BookResponse,
    "comic": schemas.ComicResponse,
    "game": schemas.GameResponse,
    "h-comic": schemas.HComicResponse,
    "hentai": schemas.HentaiResponse,
    "h-game": schemas.HGameResponse,
}

CREATE_SCHEMAS = {
    "anime": schemas.AnimeCreate,
    "anime-movie": schemas.AnimeMovieCreate,
    "movie": schemas.MovieCreate,
    "tv-show": schemas.TVShowCreate,
    "cartoon": schemas.CartoonCreate,
    "manga": schemas.MangaCreate,
    "book": schemas.BookCreate,
    "comic": schemas.ComicCreate,
    "game": schemas.GameCreate,
    "h-comic": schemas.HComicCreate,
    "hentai": schemas.HentaiCreate,
    "h-game": schemas.HGameCreate,
}


# Fields carried on a mixin beside its legacy sheet columns, with no
# credit_roles/tag_fields entry of their own - so the drift test below must
# not expect them from `legacy_link_fields`. `studio_refs` and `credit_refs`
# repeat credits the sheet columns already carry, as linkable objects rather
# than joined strings; `sources` and `content_labels` are unrelated to
# credits/tags entirely - both are attached at read time from another table,
# see AttachedFields in app/schemas/link_fields.py.
NON_SHEET_FIELDS = {
    "studio_refs",
    "publisher_refs",
    "credit_refs",
    "sources",
    "content_labels",
}


@pytest.mark.parametrize("media_type", sorted(LINK_FIELD_MIXINS))
def test_mixin_matches_the_credit_role_vocabulary(media_type):
    expected = {attr for attr, _kind, _key in legacy_link_fields(media_type)}
    actual = set(LINK_FIELD_MIXINS[media_type].model_fields) - NON_SHEET_FIELDS
    assert actual == expected


@pytest.mark.parametrize("media_type", sorted(LINK_FIELD_MIXINS))
def test_response_schema_carries_every_link_field(media_type):
    fields = RESPONSE_SCHEMAS[media_type].model_fields
    for attr, _kind, _key in legacy_link_fields(media_type):
        assert attr in fields, f"{media_type}.{attr} missing from the response"


@pytest.mark.parametrize("media_type", sorted(LINK_FIELD_MIXINS))
def test_create_schema_does_not_accept_link_fields(media_type):
    """A write naming one of these must not be silently stored on the entry."""
    fields = CREATE_SCHEMAS[media_type].model_fields
    allowed = WRITE_THROUGH_FIELDS.get(media_type, set())
    for attr, _kind, _key in legacy_link_fields(media_type):
        if attr in allowed:
            continue
        assert attr not in fields, f"{media_type}.{attr} leaked onto the write schema"


# The link fields an entry write deliberately carries: each is a nested
# collection, popped off the payload and written to its own table, never set
# on the entry. exclusive_source rides with `sources` so the rule tying the two
# is checked on one write (app/services/domain/sources.py).
WRITE_THROUGH_FIELDS = {
    "anime": {"exclusive_source"},
    "anime-movie": {"exclusive_source"},
}


@pytest.mark.parametrize("media_type", sorted(WRITE_THROUGH_FIELDS))
def test_a_write_through_field_is_popped_before_the_entry_is_built(media_type):
    from app.registry import MEDIA_REGISTRY

    spec = next(s for s in MEDIA_REGISTRY.values() if s.owner_type == media_type)
    for attr in WRITE_THROUGH_FIELDS[media_type]:
        assert attr in spec.nested_collections, f"{media_type}.{attr} is not popped"
        assert attr not in spec.model.__table__.columns
