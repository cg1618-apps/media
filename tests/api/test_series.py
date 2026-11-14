"""
API integration tests for /api/series endpoints.

Tests public reads and admin-protected writes, plus the franchise-style
fields added alongside the Series hub page.
Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

from app import models


class TestGetAllSeries:
    def test_returns_200_and_list(self, client, sample_series):
        response = client.get("/api/series/")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_created_series_appears_in_list(self, client, sample_series):
        response = client.get("/api/series/")
        ids = [s["system_id"] for s in response.json()]
        assert str(sample_series.system_id) in ids


class TestGetSeriesById:
    def test_existing_id_returns_200(self, client, sample_series):
        response = client.get(f"/api/series/{sample_series.system_id}")
        assert response.status_code == 200
        assert response.json()["series_name_en"] == "Test Series"

    def test_nonexistent_id_returns_404(self, client):
        response = client.get(f"/api/series/{uuid.uuid4()}")
        assert response.status_code == 404

    def test_response_carries_timestamps(self, client, sample_series):
        data = client.get(f"/api/series/{sample_series.system_id}").json()
        assert data["created_at"] is not None
        assert data["updated_at"] is not None


class TestCreateSeries:
    def test_admin_can_create_with_new_fields(self, owner_client, sample_franchise):
        payload = {
            "franchise_id": str(sample_franchise.system_id),
            "series_name_en": "New Series",
            "series_name_cn": "新系列",
            "series_name_roman": "Shin Series",
            "series_name_jp": "新シリーズ",
            "series_name_alt": "NS",
            "remark": "a remark",
        }
        response = owner_client.post("/api/series/", json=payload)
        assert response.status_code in (200, 201)
        data = response.json()
        assert data["series_name_roman"] == "Shin Series"
        assert data["series_name_jp"] == "新シリーズ"
        assert data["remark"] == "a remark"

    def test_a_rating_and_expectation_in_the_payload_are_ignored(
        self, owner_client, sample_franchise
    ):
        """They are the writer's own (user_rating), written through
        PUT /api/me/ratings - a catalogue create does not carry them."""
        payload = {
            "franchise_id": str(sample_franchise.system_id),
            "series_name_en": "Defaulted",
            "my_rating": "A",
            "series_expectation": "High",
        }
        response = owner_client.post("/api/series/", json=payload)
        assert response.status_code == 201
        assert response.json()["my_rating"] is None
        assert response.json()["series_expectation"] is None

    def test_cover_entry_id_round_trips(self, owner_client, sample_franchise, sample_anime):
        payload = {
            "franchise_id": str(sample_franchise.system_id),
            "series_name_en": "Covered",
            "cover_entry_id": str(sample_anime.system_id),
        }
        response = owner_client.post("/api/series/", json=payload)
        assert response.json()["cover_entry_id"] == str(sample_anime.system_id)

    def test_guest_cannot_create(self, client, sample_franchise):
        payload = {
            "franchise_id": str(sample_franchise.system_id),
            "series_name_en": "Unauthorized",
        }
        response = client.post("/api/series/", json=payload)
        assert response.status_code == 401


class TestPatchSeries:
    def test_admin_can_patch_single_field(self, owner_client, sample_series):
        response = owner_client.patch(
            f"/api/series/{sample_series.system_id}", json={"series_name_jp": "S"}
        )
        assert response.status_code == 200
        assert response.json()["series_name_jp"] == "S"

    def test_patch_leaves_other_fields_intact(self, owner_client, sample_series):
        owner_client.patch(
            f"/api/series/{sample_series.system_id}", json={"series_name_jp": "S"}
        )
        data = owner_client.get(f"/api/series/{sample_series.system_id}").json()
        assert data["series_name_en"] == "Test Series"

    def test_guest_cannot_patch(self, client, sample_series):
        response = client.patch(
            f"/api/series/{sample_series.system_id}", json={"my_rating": "S"}
        )
        assert response.status_code == 401


class TestSeriesEntryFiltering:
    """The Series hub page loads its entries with ?series_id=.

    These tests seed one matching row and one series_id=NULL row per entry
    type and assert the filtered response contains the former and excludes
    the latter, so a broken or missing series_id filter would fail them.
    """

    def test_anime_list_filters_by_series_id(self, client, db_session, sample_series, sample_anime):
        sample_anime.series_id = sample_series.system_id
        db_session.flush()
        response = client.get(f"/api/anime/?series_id={sample_series.system_id}")
        assert response.status_code == 200
        ids = [a["system_id"] for a in response.json()]
        assert str(sample_anime.system_id) in ids

    def test_anime_list_excludes_other_series(self, client, sample_series, sample_anime):
        """sample_anime has no series_id, so it must not appear."""
        response = client.get(f"/api/anime/?series_id={sample_series.system_id}")
        ids = [a["system_id"] for a in response.json()]
        assert str(sample_anime.system_id) not in ids

    def test_movies_list_filters_by_series_id(self, client, db_session, sample_series, sample_franchise):
        matching = models.Movies(franchise_id=sample_franchise.system_id, series_id=sample_series.system_id, movie_name_en="In Series")
        other = models.Movies(franchise_id=sample_franchise.system_id, series_id=None, movie_name_en="No Series")
        db_session.add_all([matching, other])
        db_session.flush()
        response = client.get(f"/api/movies/?series_id={sample_series.system_id}")
        assert response.status_code == 200
        ids = [m["system_id"] for m in response.json()]
        assert str(matching.system_id) in ids
        assert str(other.system_id) not in ids

    def test_tv_shows_list_filters_by_series_id(self, client, db_session, sample_series, sample_franchise):
        matching = models.TVShows(franchise_id=sample_franchise.system_id, series_id=sample_series.system_id, tv_name_en="In Series")
        other = models.TVShows(franchise_id=sample_franchise.system_id, series_id=None, tv_name_en="No Series")
        db_session.add_all([matching, other])
        db_session.flush()
        response = client.get(f"/api/tv-shows/?series_id={sample_series.system_id}")
        assert response.status_code == 200
        ids = [t["system_id"] for t in response.json()]
        assert str(matching.system_id) in ids
        assert str(other.system_id) not in ids

    def test_cartoon_list_filters_by_series_id(self, client, db_session, sample_series, sample_franchise):
        matching = models.Cartoon(franchise_id=sample_franchise.system_id, series_id=sample_series.system_id, cartoon_name_en="In Series")
        other = models.Cartoon(franchise_id=sample_franchise.system_id, series_id=None, cartoon_name_en="No Series")
        db_session.add_all([matching, other])
        db_session.flush()
        response = client.get(f"/api/cartoon/?series_id={sample_series.system_id}")
        assert response.status_code == 200
        ids = [c["system_id"] for c in response.json()]
        assert str(matching.system_id) in ids
        assert str(other.system_id) not in ids

    def test_manga_list_filters_by_series_id(self, client, db_session, sample_series, sample_franchise):
        matching = models.Manga(franchise_id=sample_franchise.system_id, series_id=sample_series.system_id, manga_name_en="In Series")
        other = models.Manga(franchise_id=sample_franchise.system_id, series_id=None, manga_name_en="No Series")
        db_session.add_all([matching, other])
        db_session.flush()
        response = client.get(f"/api/manga/?series_id={sample_series.system_id}")
        assert response.status_code == 200
        ids = [m["system_id"] for m in response.json()]
        assert str(matching.system_id) in ids
        assert str(other.system_id) not in ids

    def test_novel_list_filters_by_series_id(self, client, db_session, sample_series, sample_franchise):
        matching = models.Novel(franchise_id=sample_franchise.system_id, series_id=sample_series.system_id, novel_name_en="In Series")
        other = models.Novel(franchise_id=sample_franchise.system_id, series_id=None, novel_name_en="No Series")
        db_session.add_all([matching, other])
        db_session.flush()
        response = client.get(f"/api/novel/?series_id={sample_series.system_id}")
        assert response.status_code == 200
        ids = [n["system_id"] for n in response.json()]
        assert str(matching.system_id) in ids
        assert str(other.system_id) not in ids
