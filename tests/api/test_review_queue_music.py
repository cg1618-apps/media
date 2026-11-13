"""
The review queue's music block: GET /api/data-control/check/music.

An anime is listed when the CALLER's own status on one of its song lists (a
`music_status` row) or one of its songs (an op / ed / insert_songs / ost row)
is Need, Pending or No Full Version. "Not Done" is where every list starts,
so it flags nothing, and neither does Done or All Done.

The rows are catalogue, but every status on them is a viewer's own note mark
(note_sections.py: personal_status, granted by the music_status feature). So
the queue is per caller: another account's statuses never list an anime, and
a caller without the feature is listed nothing.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import PERM_MANAGE_PIPELINES
from app.services.rbac.seed import default_user_permissions
from tests.api.conftest import make_viewer


@pytest.fixture
def reviewer(db_session, client):
    """A member who runs pipelines - and so holds the music status feature."""
    make_viewer(
        db_session, client, "reviewer", default_user_permissions() | {PERM_MANAGE_PIPELINES}
    )
    user = db_session.query(models.User).filter(models.User.username == "reviewer").one()
    return client, user


def _anime(db_session, name):
    a = models.Anime(system_id=uuid.uuid4(), anime_name_en=name, anime_name_cn=name + " CN")
    db_session.add(a)
    db_session.flush()
    return a


def _note(db_session, author, anime, section, mark_by=None, mark_status=None, **fields):
    """A catalogue row, and `mark_by`'s own status on it."""
    note = models.Note(
        system_id=uuid.uuid4(),
        author_id=author.id,
        media_id=anime.system_id,
        section=section,
        **fields,
    )
    db_session.add(note)
    db_session.flush()
    if mark_by is not None and mark_status is not None:
        db_session.add(
            models.NoteMark(user_id=mark_by.id, note_id=note.system_id,
                            values={"status": mark_status})
        )
        db_session.flush()
    return note


def _fetch(c):
    res = c.get("/api/data-control/check/music")
    assert res.status_code == 200, res.text
    return res.json()


def test_flagged_lists_and_songs_are_reported_per_anime(db_session, admin_user, reviewer):
    c, me = reviewer
    anime = _anime(db_session, "Flagged")
    _note(db_session, admin_user, anime, "music_status", me, "Need", kind="op")
    _note(db_session, admin_user, anime, "music_status", me, "Not Done", kind="ed")
    _note(db_session, admin_user, anime, "ed", me, "No Full Version",
          title="Ending A", locator="ep 1")
    _note(db_session, admin_user, anime, "ost", me, "Pending", title="Track 1")
    _note(db_session, admin_user, anime, "op", me, "Done", title="Opening A")

    (row,) = _fetch(c)
    assert row["system_id"] == str(anime.system_id)
    assert row["public_id"] == anime.public_id
    assert row["anime_name_en"] == "Flagged"
    assert row["lists"] == [{"kind": "op", "status": "Need"}]
    assert row["songs"] == [
        {"section": "ed", "title": "Ending A", "status": "No Full Version", "locator": "ep 1"},
        {"section": "ost", "title": "Track 1", "status": "Pending", "locator": None},
    ]


def test_an_anime_with_nothing_flagged_is_not_listed(db_session, admin_user, reviewer):
    # Mirror case on the same request: `flagged` IS listed, so an absent
    # `settled` is the filter working, not an empty table.
    c, me = reviewer
    settled = _anime(db_session, "Settled")
    _note(db_session, admin_user, settled, "music_status", me, "Not Done", kind="op")
    _note(db_session, admin_user, settled, "music_status", me, "All Done", kind="ed")
    _note(db_session, admin_user, settled, "op", me, "Done", title="Opening")
    flagged = _anime(db_session, "Flagged")
    _note(db_session, admin_user, flagged, "insert_songs", me, "Need", title="Insert")

    assert [r["system_id"] for r in _fetch(c)] == [str(flagged.system_id)]


def test_another_accounts_status_does_not_count(db_session, admin_user, plain_user, reviewer):
    c, me = reviewer
    theirs = _anime(db_session, "Flagged By Someone Else")
    _note(db_session, admin_user, theirs, "op", plain_user, "Pending", title="Opening")
    mine = _anime(db_session, "Flagged By Me")
    _note(db_session, admin_user, mine, "op", me, "Pending", title="Opening")

    assert [r["system_id"] for r in _fetch(c)] == [str(mine.system_id)]


def test_a_status_left_on_the_row_itself_is_not_read(db_session, admin_user, reviewer):
    """A catalogue row's own status column is never anyone's status."""
    c, me = reviewer
    stale = _anime(db_session, "Stale")
    _note(db_session, admin_user, stale, "op", title="Opening", status="Need")
    mine = _anime(db_session, "Mine")
    _note(db_session, admin_user, mine, "op", me, "Need", title="Opening")

    assert [r["system_id"] for r in _fetch(c)] == [str(mine.system_id)]


def test_the_admin_has_no_music_status(admin_client, db_session, admin_user, plain_user):
    """Root never passes self.*, so it holds no feature and no status."""
    anime = _anime(db_session, "Flagged")
    _note(db_session, admin_user, anime, "op", plain_user, "Need", title="Opening")
    assert _fetch(admin_client) == []


def test_a_non_music_section_is_ignored(db_session, admin_user, reviewer):
    c, me = reviewer
    anime = _anime(db_session, "Not Music")
    _note(db_session, admin_user, anime, "remark", content="Need to rewatch")
    assert _fetch(c) == []


def test_needs_manage_pipelines(user_client):
    assert user_client.get("/api/data-control/check/music").status_code in (401, 403)
