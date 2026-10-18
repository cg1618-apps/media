"""
time_fin - "Paused at" - through every write path that reaches a list row.

The clearing rules themselves are pinned without a database in
tests/unit/test_time_fin_clearing.py. What is here is that each route a
client can write through actually runs them: POST, PUT and PATCH on the entry
endpoints, POST /complete, a PATCH that carries ep_fin to its total, and the
caller's own PUT /api/me/list. Every clearing test seeds a row that HOLDS a
paused position, and the mirror writes prove the clear is the rule's doing.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models


@pytest.fixture
def db(db_session):
    return db_session


def _row_for(db, media_id, user_id=None):
    q = db.query(models.UserMediaList).filter(
        models.UserMediaList.media_id == media_id
    )
    if user_id is not None:
        q = q.filter(models.UserMediaList.user_id == user_id)
    row = q.one()
    db.refresh(row)
    return row


# The six watching types: route, model, and the name column a create needs.
WATCHING = [
    ("anime", models.Anime, "anime_name_en"),
    ("anime-movie", models.AnimeMovies, "anime_movie_name_en"),
    ("movies", models.Movies, "movie_name_en"),
    ("tv-shows", models.TVShows, "tv_name_en"),
    ("cartoon", models.Cartoon, "cartoon_name_en"),
    ("hentai", models.Hentai, "hentai_name_en"),
]


@pytest.fixture
def episodic(db, sample_franchise, list_row):
    """An anime part-way through episode 4 of 10, paused at 14:35."""
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Paused Sentinel",
        airing_type="TV",
        airing_status="Finished Airing",
        ep_total=10,
    )
    db.add(entry)
    db.flush()
    list_row(entry, status="Active Watching", ep_fin=3, time_fin="14:35")
    return entry


@pytest.fixture
def paused_movie(db, sample_franchise, list_row):
    entry = models.Movies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        movie_name_en="Paused Movie Sentinel",
    )
    db.add(entry)
    db.flush()
    list_row(entry, status="Active Watching", time_fin="1:10:00")
    return entry


# ---------------------------------------------------------------------------
# Write-through, every watching type
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("route, model, name_col", WATCHING)
def test_create_writes_time_fin_to_the_list_row_stripped(
    admin_client, db, admin_user, route, model, name_col
):
    response = admin_client.post(
        f"/api/{route}/", json={name_col: f"{route} time", "time_fin": "  14:35 "}
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["time_fin"] == "14:35"
    row = _row_for(db, uuid.UUID(body["system_id"]), admin_user.id)
    assert row.time_fin == "14:35"


@pytest.mark.parametrize("route, model, name_col", WATCHING)
def test_patch_writes_time_fin_and_get_reads_it_back(
    admin_client, db, route, model, name_col
):
    created = admin_client.post(
        f"/api/{route}/", json={name_col: f"{route} patched"}
    ).json()
    response = admin_client.patch(
        f"/api/{route}/{created['system_id']}", json={"time_fin": "1:10:00"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["time_fin"] == "1:10:00"
    fetched = admin_client.get(f"/api/{route}/{created['public_id']}").json()
    assert fetched["time_fin"] == "1:10:00"


def test_a_blank_patch_stores_null(admin_client, db, paused_movie):
    response = admin_client.patch(
        f"/api/movies/{paused_movie.system_id}", json={"time_fin": "  "}
    )
    assert response.status_code == 200, response.text
    assert response.json()["time_fin"] is None
    assert _row_for(db, paused_movie.system_id).time_fin is None


def test_a_type_without_a_paused_position_refuses_it_on_me_list(
    db, user_client, plain_user, sample_franchise
):
    manga = models.Manga(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        manga_name_en="No Pause Manga",
    )
    db.add(manga)
    db.flush()
    response = user_client.put(
        f"/api/me/list/{manga.system_id}", json={"time_fin": "12:00"}
    )
    assert response.status_code == 422, response.text


# ---------------------------------------------------------------------------
# Rule 1 - ep_fin going up clears it
# ---------------------------------------------------------------------------


def test_patching_ep_fin_up_clears_it(admin_client, db, episodic):
    response = admin_client.patch(
        f"/api/anime/{episodic.system_id}", json={"ep_fin": 4}
    )
    assert response.status_code == 200, response.text
    assert response.json()["time_fin"] is None
    assert _row_for(db, episodic.system_id).time_fin is None


def test_a_new_position_in_the_same_patch_wins(admin_client, db, episodic):
    response = admin_client.patch(
        f"/api/anime/{episodic.system_id}", json={"ep_fin": 4, "time_fin": "02:10"}
    )
    assert response.status_code == 200, response.text
    row = _row_for(db, episodic.system_id)
    assert row.ep_fin == 4
    assert row.time_fin == "02:10"


def test_a_patch_that_does_not_move_ep_fin_leaves_it(admin_client, db, episodic):
    """The mirror of the clear: same fixture, a write that is not progress."""
    response = admin_client.patch(
        f"/api/anime/{episodic.system_id}", json={"my_rating": "A"}
    )
    assert response.status_code == 200, response.text
    assert _row_for(db, episodic.system_id).time_fin == "14:35"


def test_the_modify_forms_put_clears_an_echoed_position(admin_client, db, episodic):
    """The Modify form PUTs every field, time_fin included as it was loaded.
    Bumping the episode there is progress, and the echo is not a new value."""
    response = admin_client.put(
        f"/api/anime/{episodic.system_id}",
        json={
            "anime_name_en": "Paused Sentinel",
            "airing_type": "TV",
            "ep_total": 10,
            "watching_status": "Active Watching",
            "ep_fin": 5,
            "time_fin": "14:35",
        },
    )
    assert response.status_code == 200, response.text
    assert _row_for(db, episodic.system_id).time_fin is None


def test_a_put_that_keeps_ep_fin_keeps_it(admin_client, db, episodic):
    response = admin_client.put(
        f"/api/anime/{episodic.system_id}",
        json={
            "anime_name_en": "Paused Sentinel",
            "airing_type": "TV",
            "ep_total": 10,
            "watching_status": "Active Watching",
            "ep_fin": 3,
            "time_fin": "14:35",
        },
    )
    assert response.status_code == 200, response.text
    assert _row_for(db, episodic.system_id).time_fin == "14:35"


def test_patching_ep_fin_to_the_total_finishes_and_clears(admin_client, db, episodic):
    response = admin_client.patch(
        f"/api/anime/{episodic.system_id}", json={"ep_fin": 10, "time_fin": "20:00"}
    )
    assert response.status_code == 200, response.text
    row = _row_for(db, episodic.system_id)
    assert row.status == "Completed"
    assert row.time_fin is None


# ---------------------------------------------------------------------------
# Rule 2 - becoming Completed clears it
# ---------------------------------------------------------------------------


def test_patching_status_to_completed_clears_it(admin_client, db, paused_movie):
    response = admin_client.patch(
        f"/api/movies/{paused_movie.system_id}",
        json={"watching_status": "Completed"},
    )
    assert response.status_code == 200, response.text
    assert _row_for(db, paused_movie.system_id).time_fin is None


def test_patching_another_status_leaves_it(admin_client, db, paused_movie):
    response = admin_client.patch(
        f"/api/movies/{paused_movie.system_id}", json={"watching_status": "Paused"}
    )
    assert response.status_code == 200, response.text
    assert _row_for(db, paused_movie.system_id).time_fin == "1:10:00"


def test_complete_endpoint_clears_it_for_a_movie(admin_client, db, paused_movie):
    response = admin_client.post(f"/api/movies/{paused_movie.system_id}/complete")
    assert response.status_code == 200, response.text
    assert response.json()["time_fin"] is None
    assert _row_for(db, paused_movie.system_id).time_fin is None


def test_complete_endpoint_clears_it_for_an_anime(admin_client, db, episodic):
    response = admin_client.post(f"/api/anime/{episodic.system_id}/complete")
    assert response.status_code == 200, response.text
    assert _row_for(db, episodic.system_id).time_fin is None


# ---------------------------------------------------------------------------
# The caller's own list - PUT /api/me/list
# ---------------------------------------------------------------------------


@pytest.fixture
def members_anime(db, plain_user, sample_franchise):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Member Paused Sentinel",
        airing_type="TV",
        ep_total=10,
    )
    db.add(entry)
    db.flush()
    db.add(
        models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=plain_user.id,
            media_id=entry.system_id,
            status="Active Watching",
            ep_fin=3,
            time_fin="14:35",
        )
    )
    db.flush()
    return entry


def test_me_list_reads_and_writes_time_fin(db, user_client, plain_user, members_anime):
    read = user_client.get(f"/api/me/list/{members_anime.system_id}")
    assert read.status_code == 200, read.text
    assert read.json()["time_fin"] == "14:35"

    response = user_client.put(
        f"/api/me/list/{members_anime.system_id}", json={"time_fin": " 18:00 "}
    )
    assert response.status_code == 200, response.text
    assert response.json()["time_fin"] == "18:00"


def test_me_list_ep_fin_up_clears_it(db, user_client, plain_user, members_anime):
    response = user_client.put(
        f"/api/me/list/{members_anime.system_id}", json={"ep_fin": 4}
    )
    assert response.status_code == 200, response.text
    assert response.json()["time_fin"] is None
    assert _row_for(db, members_anime.system_id, plain_user.id).time_fin is None


def test_me_list_rating_write_leaves_it(db, user_client, plain_user, members_anime):
    response = user_client.put(
        f"/api/me/list/{members_anime.system_id}", json={"my_rating": "A"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["time_fin"] == "14:35"


def test_me_list_completed_clears_it(db, user_client, plain_user, members_anime):
    response = user_client.put(
        f"/api/me/list/{members_anime.system_id}",
        json={"watching_status": "Completed"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["time_fin"] is None
