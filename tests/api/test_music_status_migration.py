"""
API integration tests for revision m1s2ongstat3: a music_status row per
(anime, song list), OST rows folded into it and deleted, song links rewritten
as text-URL pairs, and the Song Type / Song Source options seeded.

Runs the shipped revision's own data steps against the test session - the
suite has no Alembic harness, and the schema here is create_all's, which
already carries the new index rather than the old one.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest

from app import models

ROOT = Path(__file__).resolve().parents[2]
REVISION = (
    ROOT / "alembic" / "versions" / "m1s2ongstat3_music_status_and_song_rows.py"
)


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_music_status", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _note(db, anime, author_id, section, **columns):
    row = models.Note(
        system_id=uuid.uuid4(),
        media_id=anime.system_id,
        author_id=author_id,
        section=section,
        **columns,
    )
    db.add(row)
    db.flush()
    return row


def _statuses(db, anime):
    rows = (
        db.query(models.Note)
        .filter(
            models.Note.media_id == anime.system_id,
            models.Note.section == "music_status",
        )
        .order_by(models.Note.sort_index)
        .all()
    )
    return [(r.kind, r.status) for r in rows]


def _second_anime(db, franchise):
    a = models.Anime(
        system_id=uuid.uuid4(), franchise_id=franchise.system_id, anime_name_en="Two"
    )
    db.add(a)
    db.flush()
    return a


def test_every_anime_gets_a_status_per_list_and_ost_keeps_its_own(
    db_session, sample_anime, sample_franchise, admin_user, revision
):
    other = _second_anime(db_session, sample_franchise)
    _note(db_session, sample_anime, admin_user.id, "ost", kind="normal", status="Pending")

    conn = db_session.connection()
    revision.refuse_ost_extras(conn)
    revision.backfill_music_status(conn)
    revision.delete_ost_singletons(conn)
    db_session.expire_all()

    assert _statuses(db_session, sample_anime) == [
        ("op", "Not Done"),
        ("ed", "Not Done"),
        ("insert_songs", "Not Done"),
        ("ost", "Pending"),
    ]
    # No OST row to copy from: every list starts Not Done.
    assert _statuses(db_session, other) == [
        (kind, "Not Done") for kind in ("op", "ed", "insert_songs", "ost")
    ]
    assert (
        db_session.query(models.Note).filter(models.Note.section == "ost").count()
        == 0
    )


def test_the_backfill_is_idempotent(db_session, sample_anime, revision):
    conn = db_session.connection()
    revision.backfill_music_status(conn)
    revision.backfill_music_status(conn)
    assert len(_statuses(db_session, sample_anime)) == 4


def test_the_backfill_is_authored_by_the_installation_owner(
    db_session, sample_anime, admin_user, super_user, revision
):
    db_session.query(models.User).update({"is_installation_owner": False})
    super_user.is_installation_owner = True
    db_session.flush()

    revision.backfill_music_status(db_session.connection())

    authors = {
        n.author_id
        for n in db_session.query(models.Note).filter(
            models.Note.section == "music_status"
        )
    }
    assert authors == {super_user.id}


def test_an_ost_row_carrying_a_song_is_refused(
    db_session, sample_anime, admin_user, revision
):
    # Non-empty set: the row exists and carries something, so the refusal has
    # a row to refuse. The mirror is the first test, whose plain OST passes.
    _note(db_session, sample_anime, admin_user.id, "ost", kind="normal",
          status="Done", title="Battle Theme")
    with pytest.raises(RuntimeError, match="Move them by hand"):
        revision.refuse_ost_extras(db_session.connection())


def test_an_ost_row_of_another_type_is_refused(
    db_session, sample_anime, admin_user, revision
):
    _note(db_session, sample_anime, admin_user.id, "ost",
          kind="different version", status="Done")
    with pytest.raises(RuntimeError, match="Move them by hand"):
        revision.refuse_ost_extras(db_session.connection())


def test_song_links_become_pairs_and_back(
    db_session, sample_anime, admin_user, revision
):
    op_row = _note(db_session, sample_anime, admin_user.id, "op", kind="normal",
                   links=["https://youtu.be/a", "https://b.example"])
    empty = _note(db_session, sample_anime, admin_user.id, "ed", kind="normal",
                  status="Done", links=[])
    # links=None on a JSONB column stores JSON null, not SQL NULL - the shape
    # most migrated OP and ED rows carry, and a scalar no array function takes.
    json_null = _note(db_session, sample_anime, admin_user.id, "op",
                      kind="normal", status="Need", links=None)
    other = _note(db_session, sample_anime, admin_user.id, "analysis",
                  content="x", links=["https://c.example"])

    conn = db_session.connection()
    revision.links_to_pairs(conn)
    db_session.expire_all()

    assert db_session.get(models.Note, op_row.system_id).links == [
        {"text": None, "url": "https://youtu.be/a"},
        {"text": None, "url": "https://b.example"},
    ]
    assert db_session.get(models.Note, empty.system_id).links == []
    assert db_session.get(models.Note, json_null.system_id).links is None
    # Outside the song lists links stay URL strings.
    assert db_session.get(models.Note, other.system_id).links == ["https://c.example"]

    revision.links_to_urls(conn)
    db_session.expire_all()
    assert db_session.get(models.Note, op_row.system_id).links == [
        "https://youtu.be/a",
        "https://b.example",
    ]


def test_downgrade_restores_the_one_row_ost(
    db_session, sample_anime, sample_franchise, admin_user, revision
):
    other = _second_anime(db_session, sample_franchise)
    _note(db_session, sample_anime, admin_user.id, "ost", kind="normal", status="Need")

    conn = db_session.connection()
    revision.backfill_music_status(conn)
    revision.delete_ost_singletons(conn)
    # A song written after the upgrade has no place in the old shape.
    _note(db_session, sample_anime, admin_user.id, "ost", title="Battle Theme")

    revision.restore_ost_singletons(conn)
    db_session.expire_all()

    osts = db_session.query(models.Note).filter(models.Note.section == "ost").all()
    assert [(o.media_id, o.kind, o.status, o.title) for o in osts] == [
        (sample_anime.system_id, "normal", "Need", None)
    ]
    # "Not Done" is the absence of a row, as it was before.
    assert other.system_id not in {o.media_id for o in osts}
    assert (
        db_session.query(models.Note)
        .filter(models.Note.section == "music_status")
        .count()
        == 0
    )


def test_song_options_are_seeded_once_and_scoped_to_anime(db_session, revision):
    existing = models.SystemOption(category="Song Source", value="Spotify", sort_order=9)
    db_session.add(existing)
    db_session.flush()

    conn = db_session.connection()
    revision.seed_song_options(conn)
    revision.seed_song_options(conn)
    db_session.expire_all()

    def values(category):
        return [
            o.value
            for o in db_session.query(models.SystemOption)
            .filter(models.SystemOption.category == category)
            .order_by(models.SystemOption.sort_order, models.SystemOption.value)
        ]

    assert values("Song Type") == ["normal", "different version", "all inclusive version"]
    assert sorted(values("Song Source")) == sorted(
        ["YouTube", "YouTube Music", "Spotify", "Apple Music", "Bilibili"]
    )
    seeded = (
        db_session.query(models.SystemOption)
        .filter(models.SystemOption.category == "Song Type")
        .all()
    )
    assert all([s.scope for s in o.scopes] == ["anime"] for o in seeded)
    # A value that already existed keeps what it had.
    kept = db_session.get(models.SystemOption, existing.system_id)
    assert kept.sort_order == 9 and kept.scopes == []
