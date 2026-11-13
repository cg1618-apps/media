"""
The catalogue versions of Seasonal and Statistics, and the current season.

A viewer without a list of its own - a guest, a shared account - reads counts
of the catalogue instead of its own numbers (docs/viewers.md, "Seasonal and
Statistics"). Each count is narrowed to what the viewer may see.

The refusal tests bite on the media-type gate. A viewer whose role lacks
`media_type.anime` is given anime that exist, and must count none of them,
while the same request counts its manga. The mirror is the anonymous guest,
which holds the type and counts the same anime.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import media_type_perm
from app.services.rbac.seed import default_guest_permissions
from app.utils.credit_roles import TAG_FIELDS
from tests.api.conftest import make_viewer

CURRENT = "/api/seasonal/current-season"
SEASONS = "/api/seasonal/catalogue"
STATS = "/api/statistics/catalogue"


def _anime(db, franchise, name, season, date):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        anime_name_en=name,
        airing_type="TV",
        release_season=season,
        release_date=date,
    )
    db.add(entry)
    db.flush()
    return entry


def _genre(db, entry, value):
    option = (
        db.query(models.SystemOption)
        .filter_by(category=TAG_FIELDS["genre_main"].category, value=value)
        .one_or_none()
    )
    if option is None:
        option = models.SystemOption(
            system_id=uuid.uuid4(),
            category=TAG_FIELDS["genre_main"].category,
            value=value,
        )
        db.add(option)
        db.flush()
    db.add(
        models.MediaTag(
            system_id=uuid.uuid4(),
            media_id=entry.system_id,
            field="genre_main",
            option_id=option.system_id,
        )
    )
    db.flush()


@pytest.fixture
def catalogue(db_session, sample_franchise):
    """Three anime over two seasons, one with no season, and one manga."""
    a = _anime(db_session, sample_franchise, "Spring One", "SPR", "2024-04-05")
    b = _anime(db_session, sample_franchise, "Spring Two", "SPR", "2024-04-12")
    c = _anime(db_session, sample_franchise, "Winter One", "WIN", "2025-01-10")
    _anime(db_session, sample_franchise, "No Season", None, None)
    _genre(db_session, a, "Catalogue Genre Alpha")
    _genre(db_session, b, "Catalogue Genre Alpha")
    _genre(db_session, c, "Catalogue Genre Beta")
    manga = models.Manga(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        manga_name_en="Some Manga",
    )
    db_session.add(manga)
    db_session.flush()
    return {"anime": [a, b, c]}


def _without_anime(db_session, client):
    """A guest's grants minus media_type.anime."""
    grants = default_guest_permissions() - {media_type_perm("anime")}
    return make_viewer(db_session, client, "noanime", grants)


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


def test_the_statistics_count_types_seasons_and_genres(client, catalogue):
    body = client.get(STATS).json()
    assert body["by_type"]["anime"] == 4
    assert body["by_type"]["manga"] == 1
    assert body["by_season"][0] == {"season": "WIN 2025", "entry_count": 1}
    genres = {row["genre"]: row["entry_count"] for row in body["by_genre"]}
    assert genres["Catalogue Genre Alpha"] == 2
    assert genres["Catalogue Genre Beta"] == 1


def test_a_type_the_viewer_lacks_is_absent_from_every_count(
    client, db_session, catalogue
):
    body = _without_anime(db_session, client).get(STATS).json()
    assert "anime" not in body["by_type"]
    # The refusal is the type gate, not an empty database: the manga counts.
    assert body["by_type"]["manga"] == 1
    assert body["by_season"] == []
    genres = {row["genre"] for row in body["by_genre"]}
    assert "Catalogue Genre Alpha" not in genres
