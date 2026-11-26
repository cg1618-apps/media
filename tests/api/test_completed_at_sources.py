"""
Which writes stamp a list row's completed_at, one test per surface.

completed_at dates a finish, so only the tracker stamps it: Mark completed,
a progress write that reaches the total, and a status change through
PUT /api/me/list (the detail page's and the dashboard's controls). The admin
edit form - the catalogue entry PUT and PATCH, and the create behind Add -
sends the personal fields beside the catalogue write, and its status never
moves the stamp, whether the row held one or not.

Every row starts NOT completed, so each refusal test bites: under a rule
that stamped every move into Completed, the null stays null only if the
route refused, and the stale stamp survives only if it did.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid
from datetime import datetime

import pytest

from app import models

STALE = datetime(2020, 1, 1)


def _row(db_session, owner_user, media_id):
    db_session.expire_all()
    return (
        db_session.query(models.UserMediaList)
        .filter_by(user_id=owner_user.id, media_id=media_id)
        .one()
    )


@pytest.fixture
def watching_anime(db_session, sample_franchise, list_row):
    """Nine of ten watched, never finished: no stamp yet."""
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Unstamped Anime",
        airing_type="TV",
        airing_status="Currently Airing",
        ep_total=10,
    )
    db_session.add(entry)
    db_session.flush()
    list_row(entry, status="Watching", ep_fin=9)
    return entry


@pytest.fixture
def rewatching_movie(db_session, sample_franchise, list_row):
    """Finished once, then moved back to an unfinished status: the row still
    carries the old stamp, which an edit-form save must leave alone."""
    entry = models.Movies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        movie_name_en="Stamped Movie",
        release_status="Released",
    )
    db_session.add(entry)
    db_session.flush()
    list_row(entry, status="Passive Watching", completed_at=STALE)
    return entry


class TestTheEditFormNeverStamps:
    def test_a_patch_save_to_completed_leaves_completed_at_null(
        self, owner_client, db_session, owner_user, watching_anime
    ):
        # Modify's anime save is the catalogue PATCH, carrying the status.
        response = owner_client.patch(
            f"/api/anime/{watching_anime.system_id}",
            json={"anime_name_en": "Unstamped Anime", "watching_status": "Completed"},
        )
        assert response.status_code == 200, response.text
        row = _row(db_session, owner_user, watching_anime.system_id)
        assert row.status == "Completed"
        assert row.completed_at is None

    def test_a_put_save_to_completed_leaves_an_existing_stamp_unchanged(
        self, owner_client, db_session, owner_user, rewatching_movie
    ):
        # Modify's movie save is the catalogue PUT.
        response = owner_client.put(
            f"/api/movies/{rewatching_movie.system_id}?replace=false",
            json={
                "movie_name_en": "Stamped Movie",
                "release_status": "Released",
                "watching_status": "Completed",
            },
        )
        assert response.status_code == 200, response.text
        row = _row(db_session, owner_user, rewatching_movie.system_id)
        assert row.status == "Completed"
        assert row.completed_at == STALE

    def test_adding_an_entry_as_completed_leaves_completed_at_null(
        self, owner_client, db_session, owner_user
    ):
        response = owner_client.post(
            "/api/anime/",
            json={
                "anime_name_en": "Added Finished",
                "airing_type": "TV",
                "watching_status": "Completed",
            },
        )
        assert response.status_code == 201, response.text
        row = _row(db_session, owner_user, uuid.UUID(response.json()["system_id"]))
        assert row.status == "Completed"
        assert row.completed_at is None


class TestTheTrackerStamps:
    def test_a_status_change_through_me_list_stamps(
        self, owner_client, db_session, owner_user, watching_anime
    ):
        response = owner_client.put(
            f"/api/me/list/{watching_anime.system_id}",
            json={"watching_status": "Completed"},
        )
        assert response.status_code == 200, response.text
        assert _row(db_session, owner_user, watching_anime.system_id).completed_at is not None

    def test_mark_completed_stamps(
        self, owner_client, db_session, owner_user, watching_anime
    ):
        response = owner_client.post(f"/api/anime/{watching_anime.system_id}/complete")
        assert response.status_code == 200, response.text
        assert _row(db_session, owner_user, watching_anime.system_id).completed_at is not None

    def test_a_step_reaching_the_total_stamps(
        self, owner_client, db_session, owner_user, watching_anime
    ):
        # The detail page's and the dashboard's + stepper: 9 / 10 -> 10.
        response = owner_client.put(
            f"/api/me/list/{watching_anime.system_id}", json={"ep_fin": 10}
        )
        assert response.status_code == 200, response.text
        row = _row(db_session, owner_user, watching_anime.system_id)
        assert row.status == "Completed"
        assert row.completed_at is not None
