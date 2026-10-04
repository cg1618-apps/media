"""
The review queue's music block: GET /api/data-control/check/music.

An anime is listed when one of its song lists (a `music_status` row) or one
of its songs (an op / ed / insert_songs / ost row) is Need, Pending or No Full
Version. "Not Done" is where every list starts, so it flags nothing, and
neither does Done or All Done.

The music sections are CATALOGUE notes (note_sections.py, scope=catalog):
one shared set of rows per anime, whoever wrote them. So the check is not
filtered by author, unlike the remarks block.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

from app import models


def _anime(db_session, name):
    a = models.Anime(system_id=uuid.uuid4(), anime_name_en=name, anime_name_cn=name + " CN")
    db_session.add(a)
    db_session.flush()
    return a


def _note(db_session, author, anime, section, **fields):
    db_session.add(
        models.Note(author_id=author.id, media_id=anime.system_id, section=section, **fields)
    )
    db_session.flush()


def _fetch(admin_client):
    res = admin_client.get("/api/data-control/check/music")
    assert res.status_code == 200, res.text
    return res.json()


def test_flagged_lists_and_songs_are_reported_per_anime(
    admin_client, db_session, admin_user
):
    anime = _anime(db_session, "Flagged")
    _note(db_session, admin_user, anime, "music_status", kind="op", status="Need")
    _note(db_session, admin_user, anime, "music_status", kind="ed", status="Not Done")
    _note(db_session, admin_user, anime, "ed", title="Ending A", status="No Full Version",
          locator="ep 1")
    _note(db_session, admin_user, anime, "ost", title="Track 1", status="Pending")
    _note(db_session, admin_user, anime, "op", title="Opening A", status="Done")

    (row,) = _fetch(admin_client)
    assert row["system_id"] == str(anime.system_id)
    assert row["public_id"] == anime.public_id
    assert row["anime_name_en"] == "Flagged"
    assert row["lists"] == [{"kind": "op", "status": "Need"}]
    assert row["songs"] == [
        {"section": "ed", "title": "Ending A", "status": "No Full Version", "locator": "ep 1"},
        {"section": "ost", "title": "Track 1", "status": "Pending", "locator": None},
    ]


def test_an_anime_with_nothing_flagged_is_not_listed(admin_client, db_session, admin_user):
    # Mirror case on the same request: `flagged` IS listed, so an absent
    # `settled` is the filter working, not an empty table.
    settled = _anime(db_session, "Settled")
    _note(db_session, admin_user, settled, "music_status", kind="op", status="Not Done")
    _note(db_session, admin_user, settled, "music_status", kind="ed", status="All Done")
    _note(db_session, admin_user, settled, "op", title="Opening", status="Done")
    flagged = _anime(db_session, "Flagged")
    _note(db_session, admin_user, flagged, "insert_songs", title="Insert", status="Need")

    ids = [r["system_id"] for r in _fetch(admin_client)]
    assert ids == [str(flagged.system_id)]


def test_another_authors_rows_count_because_music_is_catalogue(
    admin_client, db_session, plain_user
):
    anime = _anime(db_session, "Written By Someone Else")
    _note(db_session, plain_user, anime, "op", title="Opening", status="Pending")

    assert [r["system_id"] for r in _fetch(admin_client)] == [str(anime.system_id)]


def test_a_non_music_section_with_a_status_is_ignored(admin_client, db_session, admin_user):
    anime = _anime(db_session, "Not Music")
    _note(db_session, admin_user, anime, "remark", content="Need to rewatch")
    assert _fetch(admin_client) == []


def test_needs_manage_pipelines(user_client):
    assert user_client.get("/api/data-control/check/music").status_code in (401, 403)
