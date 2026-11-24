"""
Database-level tests for the media_relation table.

Lives under tests/api/ rather than tests/unit/ because it needs a real
PostgreSQL session to exercise the constraints. Requires the run's own
test database — see tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


@pytest.fixture
def entries(db_session, sample_franchise):
    """
    Two anime and an anime movie. Both ends of a relation are foreign keys
    onto media, so the rows below need entries that exist.
    """

    def make(model, **names):
        entry = model(
            system_id=uuid.uuid4(), franchise_id=sample_franchise.system_id, **names
        )
        db_session.add(entry)
        db_session.flush()
        return entry.system_id

    return {
        "anime": make(models.Anime, anime_name_en="First"),
        "anime_2": make(models.Anime, anime_name_en="Second"),
        "anime-movie": make(models.AnimeMovies, anime_movie_name_en="Film"),
    }


def _relation(from_id, to_id, relation_type="sequel"):
    return models.MediaRelation(
        system_id=uuid.uuid4(),
        from_type="anime",
        from_id=from_id,
        relation_type=relation_type,
        to_type="anime-movie",
        to_id=to_id,
    )


def test_can_store_a_cross_media_type_relation(db_session, entries):
    a, b = entries["anime"], entries["anime-movie"]
    row = _relation(a, b)
    db_session.add(row)
    db_session.flush()

    stored = db_session.query(models.MediaRelation).one()
    assert stored.from_type == "anime"
    assert stored.to_type == "anime-movie"
    assert stored.relation_type == "sequel"
    # Timestamps default like every other model in the project.
    assert stored.created_at is not None


def test_self_relation_is_rejected(db_session, entries):
    # A real entry, so the foreign keys are satisfied and only the CHECK
    # constraint is left to refuse the row.
    same = entries["anime"]
    row = models.MediaRelation(
        system_id=uuid.uuid4(),
        from_type="anime",
        from_id=same,
        relation_type="alternative",
        to_type="anime",
        to_id=same,
    )
    db_session.add(row)
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_a_different_entry_of_the_same_type_is_allowed(db_session, entries):
    row = models.MediaRelation(
        system_id=uuid.uuid4(),
        from_type="anime",
        from_id=entries["anime"],
        relation_type="alternative",
        to_type="anime",
        to_id=entries["anime_2"],
    )
    db_session.add(row)
    db_session.flush()
    assert db_session.query(models.MediaRelation).count() == 1


def test_the_identical_pair_and_kind_cannot_be_stored_twice(db_session, entries):
    a, b = entries["anime"], entries["anime-movie"]
    db_session.add(_relation(a, b))
    db_session.flush()
    db_session.add(_relation(a, b))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_the_same_pair_under_a_different_kind_is_allowed(db_session, entries):
    a, b = entries["anime"], entries["anime-movie"]
    db_session.add(_relation(a, b, "sequel"))
    db_session.add(_relation(a, b, "side_story"))
    db_session.flush()
    assert db_session.query(models.MediaRelation).count() == 2
