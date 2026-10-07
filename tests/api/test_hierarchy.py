"""
Parent-hierarchy resolution: one rule for every media type.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain import hierarchy as h
from app.utils.constants import FranchiseType

ENTRY_RESOLVERS = {
    "anime": (h.resolve_anime_parent_hierarchy, FranchiseType.ACG),
    "movie": (h.resolve_movie_parent_hierarchy, FranchiseType.MOVIE),
    "tv-show": (h.resolve_tv_show_parent_hierarchy, FranchiseType.TV),
    "cartoon": (h.resolve_cartoon_parent_hierarchy, FranchiseType.CARTOON),
    "manga": (h.resolve_manga_parent_hierarchy, FranchiseType.ACG),
    "novel": (h.resolve_novel_parent_hierarchy, FranchiseType.NOVEL),
    "comic": (h.resolve_comic_parent_hierarchy, FranchiseType.COMIC),
}


@pytest.fixture
def existing(db_session):
    f = models.Franchise(system_id=uuid.uuid4(), franchise_name_en="Cowboy Bebop", franchise_type="ACG")
    s = models.Series(system_id=uuid.uuid4(), franchise_id=f.system_id, series_name_en="Bebop Movies")
    db_session.add_all([f, s])
    db_session.flush()
    return f, s


@pytest.mark.parametrize("key", ENTRY_RESOLVERS)
def test_a_uuid_passes_through_untouched(db_session, existing, key):
    resolve, _ = ENTRY_RESOLVERS[key]
    f, s = existing
    assert resolve(db_session, f.system_id, s.system_id, {}) == (f.system_id, s.system_id)


@pytest.mark.parametrize("key", ENTRY_RESOLVERS)
def test_a_name_in_the_franchise_cell_resolves_case_insensitively(db_session, existing, key):
    resolve, _ = ENTRY_RESOLVERS[key]
    f, _ = existing
    fid, _ = resolve(db_session, "cowboy BEBOP", None, {"en": "Something Else"})
    assert fid == f.system_id


@pytest.mark.parametrize("key", ENTRY_RESOLVERS)
def test_a_blank_franchise_falls_back_to_the_entry_names(db_session, existing, key):
    resolve, _ = ENTRY_RESOLVERS[key]
    f, _ = existing
    fid, _ = resolve(db_session, None, None, {"en": None, "cn": "cowboy bebop"})
    assert fid == f.system_id


@pytest.mark.parametrize("key", ENTRY_RESOLVERS)
def test_an_unknown_franchise_is_created_with_the_type_for_that_media(db_session, key):
    resolve, expected_type = ENTRY_RESOLVERS[key]
    fid, _ = resolve(db_session, None, None, {"en": "Brand New", "cn": "全新"})
    created = db_session.get(models.Franchise, fid)
    assert created.franchise_name_en == "Brand New"
    assert created.franchise_name_cn == "全新"
    assert created.franchise_type == expected_type


@pytest.mark.parametrize("key", ENTRY_RESOLVERS)
def test_a_series_name_resolves_or_becomes_null_never_a_new_row(db_session, existing, key):
    resolve, _ = ENTRY_RESOLVERS[key]
    f, s = existing
    assert resolve(db_session, f.system_id, "bebop movies", {})[1] == s.system_id
    assert resolve(db_session, f.system_id, "No Such Series", {})[1] is None
    assert db_session.query(models.Series).count() == 1


def test_anime_movie_resolver_has_no_series(db_session, existing):
    f, _ = existing
    assert h.resolve_anime_movie_parent_hierarchy(db_session, "COWBOY bebop", {}) == f.system_id


def test_series_entries_resolve_their_franchise_by_the_series_names(db_session, existing):
    f, _ = existing
    assert h.resolve_series_parent_hierarchy(db_session, None, {"en": "cowboy bebop"}) == f.system_id


def test_an_anime_movie_creates_an_acg_franchise(db_session):
    fid = h.resolve_anime_movie_parent_hierarchy(db_session, None, {"en": "Brand New Film"})
    assert db_session.get(models.Franchise, fid).franchise_type == "ACG"


def test_a_series_creates_an_acg_franchise(db_session):
    fid = h.resolve_series_parent_hierarchy(db_session, None, {"en": "Brand New Series"})
    assert db_session.get(models.Franchise, fid).franchise_type == "ACG"


def test_anime_is_not_a_franchise_type():
    """One type for anime and manga franchises: "Anime" is not a member."""
    assert "Anime" not in {t.value for t in FranchiseType}
    for media_type in ("anime", "anime-movie", "series", "manga"):
        assert h.FRANCHISE_TYPE_FOR[media_type] is FranchiseType.ACG


def test_every_auto_created_type_is_one_the_dropdown_offers():
    """A stamped type outside FRANCHISE_TYPES hides the franchise from the type filter."""
    from app.utils.constants import FRANCHISE_TYPES

    assert {t.value for t in h.FRANCHISE_TYPE_FOR.values()} <= set(FRANCHISE_TYPES)


# ---------------------------------------------------------------------------
# franchise_name_alt / series_name_alt are comma-separated lists
# ---------------------------------------------------------------------------


@pytest.fixture
def listed(db_session):
    f = models.Franchise(
        system_id=uuid.uuid4(),
        franchise_name_en="Cowboy Bebop",
        franchise_name_alt="CB, Space Cowboys",
        franchise_type="ACG",
    )
    s = models.Series(
        system_id=uuid.uuid4(),
        franchise_id=f.system_id,
        series_name_en="Bebop Movies",
        series_name_alt="BM, Bebop Films",
    )
    db_session.add_all([f, s])
    db_session.flush()
    return f, s


@pytest.mark.parametrize("key", ENTRY_RESOLVERS)
def test_a_franchise_name_matching_one_alt_fragment_resolves(db_session, listed, key):
    resolve, _ = ENTRY_RESOLVERS[key]
    f, _ = listed
    assert resolve(db_session, "space COWBOYS", None, {})[0] == f.system_id
    assert resolve(db_session, None, None, {"en": "cb"})[0] == f.system_id


@pytest.mark.parametrize("key", ENTRY_RESOLVERS)
def test_a_name_no_alt_fragment_holds_still_creates_a_franchise(db_session, listed, key):
    # Mirror. "Space" is inside a fragment and "CB, Space Cowboys" is the
    # whole stored value; neither is one of its names.
    resolve, _ = ENTRY_RESOLVERS[key]
    f, _ = listed
    for name in ("Space", "CB, Space Cowboys"):
        fid, _ = resolve(db_session, name, None, {})
        assert fid != f.system_id
    assert db_session.query(models.Franchise).count() == 3


def test_a_like_wildcard_in_a_name_is_literal(db_session, listed):
    f, _ = listed
    fid = h.resolve_anime_parent_hierarchy(db_session, "Cowboy%", None, {})[0]
    assert fid != f.system_id


@pytest.mark.parametrize("key", ENTRY_RESOLVERS)
def test_a_series_name_matching_one_alt_fragment_resolves(db_session, listed, key):
    resolve, _ = ENTRY_RESOLVERS[key]
    f, s = listed
    assert resolve(db_session, f.system_id, "bebop films", {})[1] == s.system_id
    # Mirror: a fragment of the franchise's list is not one of the series'.
    assert resolve(db_session, f.system_id, "Space Cowboys", {})[1] is None


def test_an_anime_saved_under_an_alt_fragment_joins_that_franchise(admin_client, listed):
    """The write path the Add form takes, end to end: no franchise picked, so
    the entry's own names are looked up - and its alt list is split too."""
    f, _ = listed
    response = admin_client.post(
        "/api/anime/", json={"anime_name_en": "Bebop TV", "anime_name_alt": "Bebop 1998, CB"}
    )
    assert response.status_code == 201, response.text
    assert response.json()["franchise_id"] == str(f.system_id)


def test_an_anime_whose_names_hold_no_fragment_gets_a_new_franchise(
    admin_client, db_session, listed
):
    # Mirror: "Space" sits inside one of the franchise's fragments, and the
    # entry's one alt name is two of the franchise's run together.
    f, _ = listed
    response = admin_client.post(
        "/api/anime/", json={"anime_name_en": "Space", "anime_name_alt": "Space Cowboys CB"}
    )
    assert response.status_code == 201, response.text
    assert response.json()["franchise_id"] != str(f.system_id)
    assert db_session.query(models.Franchise).count() == 2
