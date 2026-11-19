"""
API integration tests for revision d1i2rnocred3: every person holding a
`director` role with no `director` credit is deleted - whole, whatever else
they hold - and nobody else is.

Runs the shipped revision's own statements against the test session. A
revision's own test, deleted once the revision has deployed (docs/testing.md,
"Migration tests").

Requires PostgreSQL. See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = (
    ROOT / "alembic" / "versions" / "d1i2rnocred3_remove_uncredited_directors.py"
)


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location(
        "_remove_uncredited_directors", REVISION
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _entry(db, model, **names):
    row = model(system_id=uuid.uuid4(), **names)
    db.add(row)
    db.flush()
    return row


def _person(db, name, *roles):
    person = models.Person(system_id=uuid.uuid4(), name_en=name)
    db.add(person)
    db.flush()
    for role, scope in roles:
        db.add(models.PersonRole(person_id=person.system_id, role=role, scope=scope))
    db.flush()
    return person


def _credit(db, person, entry, role):
    db.add(
        models.MediaCredit(
            system_id=uuid.uuid4(),
            media_id=entry.system_id,
            person_id=person.system_id,
            role=role,
        )
    )
    db.flush()


def _count(db, sql, **params) -> int:
    return db.execute(text(sql), params).scalar()


def _exists(db, person) -> bool:
    return (
        _count(db, "SELECT count(*) FROM person WHERE system_id = :id", id=person.system_id)
        > 0
    )


def test_directors_without_a_director_credit_go_and_everyone_else_stays(
    db_session, revision
):
    """Both deleted cases are mirrored by kept ones, so a green says the
    predicate did the sparing rather than finding nobody to delete."""
    game = _entry(db_session, models.Game, game_name_en="Sekiro")
    manga = _entry(db_session, models.Manga, manga_name_en="Vagabond")

    # (a) a director with no credits at all.
    bare = _person(db_session, "Bare Director", ("director", "game"))
    # (b) a director with no director credit, but another role and a credit
    # in it: still deleted, the whole person, as the owner chose.
    also_author = _person(
        db_session,
        "Director Who Writes",
        ("director", "anime"),
        ("author", "manga"),
    )
    _credit(db_session, also_author, manga, "author")
    # (c) a director with director roles in two scopes and a director credit
    # in only one: a director credit anywhere keeps them.
    credited = _person(
        db_session, "Credited Director", ("director", "game"), ("director", "anime")
    )
    _credit(db_session, credited, game, "director")
    # (d) a non-director with no credits at all.
    plain_author = _person(db_session, "Uncredited Author", ("author", "manga"))

    # Dependents of a doomed person: a club membership naming a kept person,
    # and the photo's library attachment, which has no foreign key.
    db_session.add(
        models.PersonMembership(
            system_id=uuid.uuid4(),
            member_id=bare.system_id,
            club_id=plain_author.system_id,
        )
    )
    image = models.Image(
        system_id=uuid.uuid4(),
        storage_key=f"covers/staff/{bare.system_id}.jpg",
        checksum=uuid.uuid4().hex,
    )
    db_session.add(image)
    db_session.flush()
    for owner in (bare, credited):
        db_session.add(
            models.ImageAttachment(
                system_id=uuid.uuid4(),
                image_id=image.system_id,
                owner_type="staff",
                owner_id=owner.system_id,
                role="portrait",
            )
        )
    db_session.flush()

    assert revision.remove_uncredited_directors(db_session.connection()) == 2

    assert not _exists(db_session, bare)
    assert not _exists(db_session, also_author)
    assert _exists(db_session, credited)
    assert _exists(db_session, plain_author)

    gone = [bare.system_id, also_author.system_id]
    for table, column in (
        ("person_role", "person_id"),
        ("media_credit", "person_id"),
        ("person_membership", "member_id"),
    ):
        assert (
            _count(
                db_session,
                f"SELECT count(*) FROM {table} WHERE {column} = ANY(:ids)",
                ids=gone,
            )
            == 0
        ), table
    assert (
        _count(
            db_session,
            "SELECT count(*) FROM image_attachment WHERE owner_id = ANY(:ids)",
            ids=gone,
        )
        == 0
    )
    # The kept director's attachment, roles and credit are untouched; the
    # image itself stays in the library.
    assert (
        _count(
            db_session,
            "SELECT count(*) FROM image_attachment WHERE owner_id = :id",
            id=credited.system_id,
        )
        == 1
    )
    assert (
        _count(
            db_session,
            "SELECT count(*) FROM person_role WHERE person_id = :id",
            id=credited.system_id,
        )
        == 2
    )
    assert (
        _count(
            db_session,
            "SELECT count(*) FROM media_credit WHERE person_id = :id",
            id=credited.system_id,
        )
        == 1
    )
    assert (
        _count(db_session, "SELECT count(*) FROM image WHERE system_id = :id", id=image.system_id)
        == 1
    )


def test_the_revision_declares_itself_irreversible(revision):
    assert revision.irreversible is True
