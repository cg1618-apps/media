"""
API integration tests for POST /{id}/complete endpoints.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models

# ---------------------------------------------------------------------------
# Additional fixtures (not in conftest — only needed here)
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_anime_movie(db_session, sample_franchise, list_row):
    entry = models.AnimeMovies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_movie_name_en="Test Anime Movie",
        airing_status="Finished Airing",
    )
    db_session.add(entry)
    db_session.flush()
    list_row(entry, status="Watching")
    return entry


@pytest.fixture
def sample_tv_show(db_session, sample_franchise, list_row):
    entry = models.TVShows(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        tv_name_en="Test TV Show",
        airing_status="Finished Airing",
        ep_total=10,
    )
    db_session.add(entry)
    db_session.flush()
    list_row(entry, status="Watching", ep_fin=5)
    return entry


@pytest.fixture
def sample_cartoon(db_session, sample_franchise, list_row):
    entry = models.Cartoon(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        cartoon_name_en="Test Cartoon",
        airing_status="Finished Airing",
        ep_total=8,
    )
    db_session.add(entry)
    db_session.flush()
    list_row(entry, status="Watching", ep_fin=3)
    return entry


@pytest.fixture
def sample_movie(db_session, sample_franchise, list_row):
    entry = models.Movies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        movie_name_en="Test Movie",
        airing_status="Finished Airing",
    )
    db_session.add(entry)
    db_session.flush()
    list_row(entry, status="Watching")
    return entry


@pytest.fixture
def sample_manga(db_session, sample_franchise, list_row):
    entry = models.Manga(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        manga_name_en="Test Manga",
        serialization_status="連載中",
        ch_total=50,
        vol_total=5,
    )
    db_session.add(entry)
    db_session.flush()
    # Part-read: the position /complete must carry to the totals.
    list_row(entry, status="Reading", ch_fin=20, vol_fin=2, vol_fin_page=100)
    return entry


# ---------------------------------------------------------------------------
# Anime /complete
# ---------------------------------------------------------------------------

class TestCompleteAnime:
    def test_admin_can_mark_completed(self, admin_client, sample_anime):
        response = admin_client.post(f"/api/anime/{sample_anime.system_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["watching_status"] == "Completed"
        assert data["airing_status"] == "Finished Airing"

    def test_ep_fin_set_to_ep_total(
        self, admin_client, db_session, sample_franchise, list_row
    ):
        entry = models.Anime(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            anime_name_en="Incomplete Anime",
            airing_type="TV",
            airing_status="Finished Airing",
            ep_total=24,
        )
        db_session.add(entry)
        db_session.flush()
        # Part-watched: the progress the endpoint must carry to ep_total.
        list_row(entry, status="Watching", ep_fin=10)
        response = admin_client.post(f"/api/anime/{entry.system_id}/complete")
        assert response.status_code == 200
        assert response.json()["ep_fin"] == 24

    def test_guest_cannot_mark_completed(self, client, sample_anime):
        response = client.post(f"/api/anime/{sample_anime.system_id}/complete")
        assert response.status_code == 401

    def test_nonexistent_id_returns_404(self, admin_client):
        response = admin_client.post(f"/api/anime/{uuid.uuid4()}/complete")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Anime Movie /complete
# ---------------------------------------------------------------------------

class TestCompleteAnimeMovie:
    def test_admin_can_mark_completed(self, admin_client, sample_anime_movie):
        response = admin_client.post(f"/api/anime-movie/{sample_anime_movie.system_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["watching_status"] == "Completed"
        assert data["airing_status"] == "Finished Airing"

    def test_guest_cannot_mark_completed(self, client, sample_anime_movie):
        response = client.post(f"/api/anime-movie/{sample_anime_movie.system_id}/complete")
        assert response.status_code == 401

    def test_nonexistent_id_returns_404(self, admin_client):
        response = admin_client.post(f"/api/anime-movie/{uuid.uuid4()}/complete")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# TV Show /complete
# ---------------------------------------------------------------------------

class TestCompleteTVShow:
    def test_admin_can_mark_completed(self, admin_client, sample_tv_show):
        response = admin_client.post(f"/api/tv-shows/{sample_tv_show.system_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["watching_status"] == "Completed"
        assert data["airing_status"] == "Finished Airing"

    def test_ep_fin_set_to_ep_total(self, admin_client, sample_tv_show):
        response = admin_client.post(f"/api/tv-shows/{sample_tv_show.system_id}/complete")
        assert response.status_code == 200
        assert response.json()["ep_fin"] == 10

    def test_guest_cannot_mark_completed(self, client, sample_tv_show):
        response = client.post(f"/api/tv-shows/{sample_tv_show.system_id}/complete")
        assert response.status_code == 401

    def test_nonexistent_id_returns_404(self, admin_client):
        response = admin_client.post(f"/api/tv-shows/{uuid.uuid4()}/complete")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Cartoon /complete
# ---------------------------------------------------------------------------

class TestCompleteCartoon:
    def test_admin_can_mark_completed(self, admin_client, sample_cartoon):
        response = admin_client.post(f"/api/cartoon/{sample_cartoon.system_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["watching_status"] == "Completed"
        assert data["airing_status"] == "Finished Airing"

    def test_ep_fin_set_to_ep_total(self, admin_client, sample_cartoon):
        response = admin_client.post(f"/api/cartoon/{sample_cartoon.system_id}/complete")
        assert response.status_code == 200
        assert response.json()["ep_fin"] == 8

    def test_guest_cannot_mark_completed(self, client, sample_cartoon):
        response = client.post(f"/api/cartoon/{sample_cartoon.system_id}/complete")
        assert response.status_code == 401

    def test_nonexistent_id_returns_404(self, admin_client):
        response = admin_client.post(f"/api/cartoon/{uuid.uuid4()}/complete")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Movie /complete
# ---------------------------------------------------------------------------

class TestCompleteMovie:
    def test_admin_can_mark_completed(self, admin_client, sample_movie):
        response = admin_client.post(f"/api/movies/{sample_movie.system_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["watching_status"] == "Completed"
        assert data["airing_status"] == "Finished Airing"

    def test_guest_cannot_mark_completed(self, client, sample_movie):
        response = client.post(f"/api/movies/{sample_movie.system_id}/complete")
        assert response.status_code == 401

    def test_nonexistent_id_returns_404(self, admin_client):
        response = admin_client.post(f"/api/movies/{uuid.uuid4()}/complete")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Manga /complete
# ---------------------------------------------------------------------------

class TestCompleteManga:
    def test_admin_can_mark_completed(self, admin_client, sample_manga):
        response = admin_client.post(f"/api/manga/{sample_manga.system_id}/complete")
        assert response.status_code == 200
        data = response.json()
        assert data["reading_status"] == "Completed"

    def test_ch_fin_set_to_ch_total(self, admin_client, sample_manga):
        response = admin_client.post(f"/api/manga/{sample_manga.system_id}/complete")
        assert response.json()["ch_fin"] == 50

    def test_vol_fin_set_to_vol_total(self, admin_client, sample_manga):
        response = admin_client.post(f"/api/manga/{sample_manga.system_id}/complete")
        assert response.json()["vol_fin"] == 5

    def test_vol_fin_page_set_to_zero(self, admin_client, sample_manga):
        response = admin_client.post(f"/api/manga/{sample_manga.system_id}/complete")
        assert response.json()["vol_fin_page"] == 0

    def test_serialization_status_set_to_completed(self, admin_client, sample_manga):
        response = admin_client.post(f"/api/manga/{sample_manga.system_id}/complete")
        assert response.json()["serialization_status"] == "完結"

    def test_serialization_status_not_changed_for_cancelled(self, admin_client, db_session, sample_franchise):
        cancelled = models.Manga(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            manga_name_en="Cancelled Manga",
            serialization_status="腰斬",
        )
        db_session.add(cancelled)
        db_session.flush()
        response = admin_client.post(f"/api/manga/{cancelled.system_id}/complete")
        assert response.status_code == 200
        assert response.json()["serialization_status"] == "腰斬"

    def test_guest_cannot_mark_completed(self, client, sample_manga):
        response = client.post(f"/api/manga/{sample_manga.system_id}/complete")
        assert response.status_code == 401

    def test_nonexistent_id_returns_404(self, admin_client):
        response = admin_client.post(f"/api/manga/{uuid.uuid4()}/complete")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# PATCH carrying the progress counter to its total finishes the entry
# ---------------------------------------------------------------------------

@pytest.fixture
def airing_anime(db_session, sample_franchise, list_row):
    """Nine of ten watched and still airing, so both halves of Mark completed
    have something to change."""
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Nearly Done Anime",
        airing_type="TV",
        airing_status="Currently Airing",
        ep_total=10,
    )
    db_session.add(entry)
    db_session.flush()
    list_row(entry, status="Watching", ep_fin=9)
    return entry


class TestProgressReachingTotalCompletes:
    def test_stepping_to_the_total_marks_completed(self, admin_client, airing_anime):
        response = admin_client.patch(
            f"/api/anime/{airing_anime.system_id}", json={"ep_fin": 10}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["ep_fin"] == 10
        assert data["watching_status"] == "Completed"
        assert data["airing_status"] == "Finished Airing"

    def test_completion_stamps_completed_at(self, admin_client, db_session, admin_user, airing_anime):
        admin_client.patch(f"/api/anime/{airing_anime.system_id}", json={"ep_fin": 10})
        row = (
            db_session.query(models.UserMediaList)
            .filter_by(user_id=admin_user.id, media_id=airing_anime.system_id)
            .one()
        )
        assert row.completed_at is not None

    def test_stepping_below_the_total_does_not(self, admin_client, airing_anime):
        # The mirror case: the same fixture, one short of the total.
        response = admin_client.patch(
            f"/api/anime/{airing_anime.system_id}", json={"ep_fin": 8}
        )
        data = response.json()
        assert data["watching_status"] == "Watching"
        assert data["airing_status"] == "Currently Airing"

    def test_an_explicit_status_in_the_same_write_wins(self, admin_client, airing_anime):
        response = admin_client.patch(
            f"/api/anime/{airing_anime.system_id}",
            json={"ep_fin": 10, "watching_status": "Dropped"},
        )
        data = response.json()
        assert data["watching_status"] == "Dropped"
        assert data["airing_status"] == "Currently Airing"

    def test_a_counter_already_at_its_total_is_not_refinished(
        self, admin_client, db_session, sample_franchise, list_row
    ):
        # At 10/10 but Watching (a rewatch, say): re-saving 10 is no crossing.
        entry = models.Anime(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            anime_name_en="Rewatching Anime",
            airing_status="Currently Airing",
            ep_total=10,
        )
        db_session.add(entry)
        db_session.flush()
        list_row(entry, status="Watching", ep_fin=10)
        response = admin_client.patch(f"/api/anime/{entry.system_id}", json={"ep_fin": 10})
        assert response.json()["watching_status"] == "Watching"

    def test_an_unknown_total_never_completes(
        self, admin_client, db_session, sample_franchise, list_row
    ):
        entry = models.Anime(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            anime_name_en="Open-ended Anime",
            airing_status="Currently Airing",
            ep_total=None,
        )
        db_session.add(entry)
        db_session.flush()
        list_row(entry, status="Watching", ep_fin=9)
        response = admin_client.patch(f"/api/anime/{entry.system_id}", json={"ep_fin": 10})
        assert response.json()["watching_status"] == "Watching"

    def test_tv_show(self, admin_client, sample_tv_show):
        response = admin_client.patch(
            f"/api/tv-shows/{sample_tv_show.system_id}", json={"ep_fin": 10}
        )
        assert response.json()["watching_status"] == "Completed"

    def test_manga_chapters(self, admin_client, sample_manga):
        response = admin_client.patch(
            f"/api/manga/{sample_manga.system_id}", json={"ch_fin": 50}
        )
        data = response.json()
        assert data["reading_status"] == "Completed"
        # The rest of Mark completed comes with it.
        assert data["vol_fin"] == 5

    def test_comic_issues(self, admin_client, db_session, sample_franchise, list_row):
        entry = models.Comic(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            comic_name_en="Test Comic",
            issue_total=12,
        )
        db_session.add(entry)
        db_session.flush()
        list_row(entry, status="Reading", issue_fin=11)
        response = admin_client.patch(f"/api/comic/{entry.system_id}", json={"issue_fin": 12})
        assert response.json()["reading_status"] == "Completed"
