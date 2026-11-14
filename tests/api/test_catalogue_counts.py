"""
The catalogue versions of Seasonal and Statistics, and the current season.

Seasonal's catalogue version answers any catalogue reader, a guest included.
Statistics' catalogue counts answer `view.statistics` - super, user and shared
- and refuse a guest (tests/api/test_view_statistics.py has the gate itself).
Each count is narrowed to what the viewer may see.

The refusal tests bite on the media-type gate. A viewer whose role lacks
`media_type.anime` is given anime that exist, and must count none of them,
while the same request counts its manga. The mirror is the shared account,
which holds the type and counts the same anime.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import media_type_perm
from app.services.rbac.seed import default_shared_permissions
from tests.api.conftest import make_viewer

CURRENT = "/api/seasonal/current-season"
SEASONS = "/api/seasonal/catalogue"
STATS = "/api/statistics/catalogue"


def _franchise(db, name):
    franchise = models.Franchise(
        system_id=uuid.uuid4(), franchise_name_en=name, franchise_type="ACG"
    )
    db.add(franchise)
    db.flush()
    return franchise


def _anime(db, franchise, name, season, date, mal=None, anilist=None):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        anime_name_en=name,
        airing_type="TV",
        release_season=season,
        release_date=date,
        mal_rating=mal,
        anilist_rating=anilist,
    )
    db.add(entry)
    db.flush()
    return entry


@pytest.fixture
def catalogue(db_session, sample_franchise):
    """
    Four anime over two franchises - three across two seasons, one with no
    season - and one manga. The second franchise holds one anime, so the
    franchise count (2) differs from the entry count (4) and from a count of
    every franchise. MAL scores 9.4, 8.1, 8.9 and a perfect 10; AniList 85,
    100 and one unscored.
    """
    other = _franchise(db_session, "Catalogue Counts Other")
    _anime(db_session, sample_franchise, "Spring One", "SPR", "2024-04-05", 9.4, 85)
    _anime(db_session, sample_franchise, "Spring Two", "SPR", "2024-04-12", 8.1, 100)
    _anime(db_session, other, "Winter One", "WIN", "2025-01-10", 8.9, None)
    _anime(db_session, sample_franchise, "No Season", None, None, 10.0, None)
    manga = models.Manga(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        manga_name_en="Some Manga",
        mal_rating=7.5,
    )
    db_session.add(manga)
    db_session.flush()
    return {"other": other}


def _as_shared(db_session, client, grants=None):
    return make_viewer(
        db_session, client, "statsviewer", grants or default_shared_permissions()
    )


def _without_anime(db_session, client):
    """A shared account's grants minus media_type.anime."""
    return _as_shared(
        db_session, client, default_shared_permissions() - {media_type_perm("anime")}
    )


def _type_row(body, media_type):
    return next((r for r in body["by_type"] if r["media_type"] == media_type), None)


def _buckets(body, score, media_type):
    return {
        r["bucket"]: r["entry_count"]
        for r in body["scores"][score]
        if r["media_type"] == media_type
    }


# ---------------------------------------------------------------------------
# The current season
# ---------------------------------------------------------------------------


def test_the_current_season_answers_a_guest(client, db_session):
    db_session.add(models.SystemConfigs(config_key="current_season", config_value="FAL 2026"))
    db_session.flush()
    r = client.get(CURRENT)
    assert r.status_code == 200
    assert r.json() == {"current_season": "FAL 2026"}
    # Mirror: the pipelines copy of the same value still refuses a guest, so
    # the open read is this route, not a widened gate.
    assert client.get("/api/system/config/current_season").status_code == 401


# ---------------------------------------------------------------------------
# Seasons
# ---------------------------------------------------------------------------


def test_the_catalogue_seasons_count_visible_anime_newest_first(client, catalogue):
    rows = client.get(SEASONS).json()
    assert rows == [
        {"season": "WIN 2025", "entry_count": 1},
        {"season": "SPR 2024", "entry_count": 2},
    ]


def test_a_viewer_without_the_anime_type_counts_no_season(
    client, db_session, catalogue
):
    assert client.get(SEASONS).json() != []
    viewer = _without_anime(db_session, client)
    assert viewer.get(SEASONS).json() == []


def test_the_catalogue_seasons_need_no_list(client, catalogue):
    """The seasonal router's own reads stay behind self.list; this one is
    answered on the same prefix without it."""
    assert client.get("/api/seasonal/").status_code == 401
    assert client.get(SEASONS).status_code == 200


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------


def test_the_statistics_count_entries_and_franchises_per_type(
    client, db_session, catalogue
):
    body = _as_shared(db_session, client).get(STATS).json()
    assert _type_row(body, "anime") == {
        "media_type": "anime",
        "entry_count": 4,
        "franchise_count": 2,
    }
    assert _type_row(body, "manga") == {
        "media_type": "manga",
        "entry_count": 1,
        "franchise_count": 1,
    }
    assert body["by_season"][0] == {"season": "WIN 2025", "entry_count": 1}


def test_the_franchise_count_follows_entry_visibility(client, db_session, catalogue):
    """The franchise holding only anime is counted for anime and not for
    manga, so the count is of franchises holding a visible entry of the type,
    not of franchises - and it goes with the entries when the type is hidden."""
    body = _as_shared(db_session, client).get(STATS).json()
    assert _type_row(body, "anime")["franchise_count"] == 2
    assert _type_row(body, "manga")["franchise_count"] == 1


def test_the_score_distributions_bucket_each_type(client, db_session, catalogue):
    body = _as_shared(db_session, client).get(STATS).json()
    # 9.4 and a perfect 10 share the top bucket; 8.1 and 8.9 the one below.
    assert _buckets(body, "mal", "anime") == {9: 2, 8: 2}
    assert _buckets(body, "mal", "manga") == {7: 1}
    # 85 and 100: the perfect score folds into 90. Unscored entries are in
    # no bucket.
    assert _buckets(body, "anilist", "anime") == {90: 1, 80: 1}
    assert _buckets(body, "anilist", "manga") == {}


def test_the_genre_counts_are_gone(client, db_session, catalogue):
    body = _as_shared(db_session, client).get(STATS).json()
    assert "by_genre" not in body


def test_a_type_the_viewer_lacks_is_absent_from_every_count(
    client, db_session, catalogue
):
    body = _without_anime(db_session, client).get(STATS).json()
    assert _type_row(body, "anime") is None
    # The refusal is the type gate, not an empty database: the manga counts.
    assert _type_row(body, "manga")["entry_count"] == 1
    assert body["by_season"] == []
    assert _buckets(body, "mal", "anime") == {}
    assert _buckets(body, "anilist", "anime") == {}
    assert _buckets(body, "mal", "manga") == {7: 1}
