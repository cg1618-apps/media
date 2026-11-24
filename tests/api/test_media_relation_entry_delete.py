"""
Deleting an entry takes every media relation touching it, from both ends.

Both endpoints of a media_relation row are composite foreign keys onto
media(system_id, media_type), ON DELETE CASCADE, and an entry's own AFTER
DELETE trigger removes its media row - so whichever path deletes the entry
(the entry router, a raw SQL delete, a group cascade), its relations go with
it and no relation can name an entry that is not there.

Every test that expects a row to be REMOVED also keeps one that must survive:
a relation between two other entries. Without it, "no relations left" would
pass just as well if the delete wiped the whole table.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models


def _anime(db_session, franchise, name):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        anime_name_en=name,
    )
    db_session.add(entry)
    db_session.flush()
    return entry


def _manga(db_session, franchise, name):
    entry = models.Manga(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        manga_name_en=name,
    )
    db_session.add(entry)
    db_session.flush()
    return entry


def _relate(db_session, from_type, from_entry, kind, to_type, to_entry):
    row = models.MediaRelation(
        system_id=uuid.uuid4(),
        from_type=from_type,
        from_id=from_entry.system_id,
        relation_type=kind,
        to_type=to_type,
        to_id=to_entry.system_id,
    )
    db_session.add(row)
    db_session.flush()
    return row.system_id


@pytest.fixture
def related_cast(db_session, sample_franchise):
    """
    The entry to delete, related in both directions, plus a pair that is
    not related to it at all.
    """
    doomed = _anime(db_session, sample_franchise, "Season Two")
    prequel = _anime(db_session, sample_franchise, "Season One")
    source = _manga(db_session, sample_franchise, "Source Manga")
    bystander_a = _anime(db_session, sample_franchise, "Other Show")
    bystander_b = _manga(db_session, sample_franchise, "Other Manga")

    # doomed is the FROM end of one row and the TO end of the other.
    as_from = _relate(db_session, "anime", doomed, "sequel", "anime", prequel)
    as_to = _relate(db_session, "anime", prequel, "adaptation", "anime", doomed)
    also_from = _relate(db_session, "anime", doomed, "adaptation", "manga", source)
    survivor = _relate(
        db_session, "anime", bystander_a, "adaptation", "manga", bystander_b
    )
    return {
        "doomed": doomed,
        "touching": {as_from, as_to, also_from},
        "survivor": survivor,
    }


def _relation_ids(db_session):
    db_session.expire_all()
    return {row.system_id for row in db_session.query(models.MediaRelation).all()}


def test_deleting_an_entry_through_the_api_removes_its_relations_both_ways(
    owner_client, db_session, related_cast
):
    before = _relation_ids(db_session)
    assert related_cast["touching"] <= before
    assert related_cast["survivor"] in before

    res = owner_client.delete(f"/api/anime/{related_cast['doomed'].system_id}")
    assert res.status_code == 200, res.text

    after = _relation_ids(db_session)
    assert after.isdisjoint(related_cast["touching"])
    # The mirror case: a relation between two other entries is untouched.
    assert after == {related_cast["survivor"]}


def test_the_deleted_entry_leaves_no_missing_link_on_its_neighbour(
    owner_client, db_session, related_cast
):
    prequel_rows = (
        db_session.query(models.MediaRelation)
        .filter(models.MediaRelation.relation_type == "sequel")
        .all()
    )
    prequel_id = prequel_rows[0].to_id

    owner_client.delete(f"/api/anime/{related_cast['doomed'].system_id}")

    res = owner_client.get(
        "/api/media-relation/for-entry",
        params={"media_type": "anime", "entry_id": str(prequel_id)},
    )
    assert res.status_code == 200, res.text
    assert res.json() == []


def test_deleting_an_entry_outside_the_orm_still_removes_its_relations(
    db_session, related_cast
):
    # A raw delete fires no ORM event: only the database can clean this up.
    db_session.execute(
        text("DELETE FROM anime WHERE system_id = :id"),
        {"id": related_cast["doomed"].system_id},
    )
    db_session.flush()

    assert _relation_ids(db_session) == {related_cast["survivor"]}


def test_a_relation_cannot_name_an_entry_that_does_not_exist(
    db_session, sample_anime
):
    db_session.add(
        models.MediaRelation(
            system_id=uuid.uuid4(),
            from_type="anime",
            from_id=sample_anime.system_id,
            relation_type="adaptation",
            to_type="manga",
            to_id=uuid.uuid4(),  # never existed
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_a_relation_cannot_file_an_entry_under_another_media_type(
    db_session, sample_anime, sample_franchise
):
    other = _anime(db_session, sample_franchise, "Real Anime")
    db_session.add(
        models.MediaRelation(
            system_id=uuid.uuid4(),
            from_type="anime",
            from_id=sample_anime.system_id,
            relation_type="sequel",
            # The id exists, but as an anime, not a manga.
            to_type="manga",
            to_id=other.system_id,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()
