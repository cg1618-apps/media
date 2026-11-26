"""
The favourite 3x3 grids read a row's slot out of its `type_slots` map, and
the admin editor writes that map with a PATCH. Four tables carry one now -
franchise, series, movies and games - and each needs the column to be
writable through its own router AND to come back on the read, because the
editor builds its draft from the list response.

A grid's key is only ever read alongside its tier, so "Movie" on a franchise
and "Movie" on a movie entry are different slots. That is asserted here
rather than left to the reader: it is the thing that would break if the key
ever moved to a shared table.
"""

import uuid

import pytest

from app import models


@pytest.fixture
def sample_movie(db_session, sample_franchise):
    entry = models.Movies(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        movie_name_en="Test Movie",
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def sample_game(db_session, sample_franchise):
    entry = models.Game(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        game_name_en="Test Game",
    )
    db_session.add(entry)
    db_session.flush()
    return entry


def _patch_slots(client, endpoint, row, slots):
    return client.patch(f"{endpoint}/{row.system_id}", json={"type_slots": slots})


class TestEveryTierAcceptsASlot:
    """One test per tier: the editor PATCHes all four through their own router."""

    def test_franchise(self, owner_client, sample_franchise):
        response = _patch_slots(
            owner_client, "/api/franchise", sample_franchise, {"ACG": 1}
        )
        assert response.status_code == 200
        assert response.json()["type_slots"] == {"ACG": 1}

    def test_series(self, owner_client, sample_series):
        response = _patch_slots(
            owner_client, "/api/series", sample_series, {"Comic": 4}
        )
        assert response.status_code == 200
        assert response.json()["type_slots"] == {"Comic": 4}

    def test_movie_entry(self, owner_client, sample_movie):
        response = _patch_slots(
            owner_client, "/api/movies", sample_movie, {"Movie": 2}
        )
        assert response.status_code == 200
        assert response.json()["type_slots"] == {"Movie": 2}

    def test_game_entry(self, owner_client, sample_game):
        response = _patch_slots(owner_client, "/api/game", sample_game, {"Game": 9})
        assert response.status_code == 200
        assert response.json()["type_slots"] == {"Game": 9}


class TestSlotsSurviveTheRoundTrip:
    def test_a_saved_slot_comes_back_on_the_list(
        self, owner_client, sample_movie, sample_game
    ):
        """
        The editor and the statistics page both build their grids from the
        list response, so a slot that is stored but not serialised is a grid
        that silently reads as empty.
        """
        _patch_slots(owner_client, "/api/movies", sample_movie, {"Movie": 3})
        _patch_slots(owner_client, "/api/game", sample_game, {"Game": 3})

        movies = owner_client.get("/api/movies/").json()
        games = owner_client.get("/api/game/").json()

        assert [m["type_slots"] for m in movies if m["movie_name_en"] == "Test Movie"] == [
            {"Movie": 3}
        ]
        assert [g["type_slots"] for g in games if g["game_name_en"] == "Test Game"] == [
            {"Game": 3}
        ]

    def test_clearing_a_grid_writes_null_rather_than_an_empty_map(
        self, owner_client, sample_movie
    ):
        _patch_slots(owner_client, "/api/movies", sample_movie, {"Movie": 3})
        response = _patch_slots(owner_client, "/api/movies", sample_movie, None)
        assert response.status_code == 200
        assert response.json()["type_slots"] is None

    def test_one_grid_does_not_disturb_another_on_the_same_row(
        self, owner_client, sample_franchise
    ):
        """
        `type_slots` is a single column holding every grid the row appears in,
        so the editor patches the whole map. A franchise can sit in the AniManga
        grid (stored under its key, `ACG`) and the Game grid at once, and
        saving one must not clear the other.
        """
        _patch_slots(
            owner_client, "/api/franchise", sample_franchise, {"ACG": 1, "Game": 5}
        )
        response = _patch_slots(
            owner_client, "/api/franchise", sample_franchise, {"ACG": 2, "Game": 5}
        )
        assert response.json()["type_slots"] == {"ACG": 2, "Game": 5}

    def test_a_franchise_slot_and_an_entry_slot_are_independent(
        self, owner_client, sample_franchise, sample_movie
    ):
        """
        Both grids key on "Movie". They are different slots because they are
        on different tables, and a movie holding slot 1 says nothing about
        which franchise holds slot 1.
        """
        _patch_slots(owner_client, "/api/franchise", sample_franchise, {"Movie": 1})
        _patch_slots(owner_client, "/api/movies", sample_movie, {"Movie": 7})

        franchise = owner_client.get(
            f"/api/franchise/{sample_franchise.public_id}"
        ).json()
        movie = owner_client.get(f"/api/movies/{sample_movie.public_id}").json()
        assert franchise["type_slots"] == {"Movie": 1}
        assert movie["type_slots"] == {"Movie": 7}


@pytest.fixture
def sample_studio(db_session):
    studio = models.Studio(system_id=uuid.uuid4(), name_en="Test Studio")
    db_session.add(studio)
    db_session.flush()
    return studio


class TestTheEntityTiers:
    """The favourite-entity grids store their slots on studio and person,
    written by the same whole-map PATCH as the media tiers."""

    def test_studio(self, owner_client, sample_studio):
        response = _patch_slots(
            owner_client, "/api/studio", sample_studio, {"Anime Studio": 1}
        )
        assert response.status_code == 200
        assert response.json()["type_slots"] == {"Anime Studio": 1}
        studios = owner_client.get("/api/studio/").json()
        assert [s["type_slots"] for s in studios if s["name_en"] == "Test Studio"] == [
            {"Anime Studio": 1}
        ]

    def test_person(self, owner_client, person):
        response = _patch_slots(
            owner_client, "/api/person", person, {"Female Seiyuu": 4}
        )
        assert response.status_code == 200
        assert response.json()["type_slots"] == {"Female Seiyuu": 4}
        people = owner_client.get("/api/person/").json()
        assert [p["type_slots"] for p in people if p["system_id"] == str(person.system_id)] == [
            {"Female Seiyuu": 4}
        ]

    def test_a_form_save_keeps_the_slots(self, owner_client, sample_studio):
        """The studio edit form PUTs the whole studio and carries no
        type_slots; the grid's slot must survive it."""
        _patch_slots(owner_client, "/api/studio", sample_studio, {"Game Studio": 2})
        current = owner_client.get(f"/api/studio/{sample_studio.public_id}").json()
        body = {k: current[k] for k in ("name_en", "name_cn", "name_jp", "name_alt")}
        response = owner_client.put(f"/api/studio/{sample_studio.system_id}", json=body)
        assert response.status_code == 200, response.text
        assert response.json()["type_slots"] == {"Game Studio": 2}
