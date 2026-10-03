"""
Pulling the Note tab with music rows.

`music_status` is one row per (anime, song list), enforced by
ix_note_one_music_status_per_kind. The migration that introduced it minted the
rows once per database, so the same row carries a different system_id on every
machine; a blind INSERT of the sheet's copy would raise IntegrityError at
commit and roll back the ENTIRE tab. Pull retargets such a row at the one the
anime already holds for that list, as it does for the `remark` singleton.

`ost` is a song list now, so two OST rows are two songs and both survive. A
backup taken while OST was one row per anime still carries that row - a type
and a status, no song - and Pull folds it into the anime's OST status.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import json
import uuid

import pytest

from app import models
from app.services.pipelines import pull

NOTE_HEADERS = [
    "system_id",
    "owner_type",
    "owner_id",
    "section",
    "kind",
    "status",
    "title",
    "links",
    "sort_index",
]


def _row(system_id, owner_id, section, kind=None, status=None, title=None, links=None):
    return [
        str(system_id),
        "anime",
        str(owner_id),
        section,
        kind or "",
        status or "",
        title or "",
        json.dumps(links) if links is not None else "",
        "0",
    ]


@pytest.fixture
def sheet(monkeypatch):
    """Feed execute_pull_specific a fake Note tab instead of Google Sheets."""

    def _install(rows):
        monkeypatch.setattr(
            pull, "get_all_raw_rows", lambda tab: [NOTE_HEADERS] + rows
        )

    return _install


def _rows(db_session, owner_id, section):
    return (
        db_session.query(models.Note)
        .filter(models.Note.media_id == owner_id, models.Note.section == section)
        .order_by(models.Note.kind, models.Note.title)
        .all()
    )


@pytest.fixture
def local_statuses(db_session, sample_anime, admin_user):
    """The four rows the migration minted here, under this database's uuids."""
    rows = []
    for i, kind in enumerate(("op", "ed", "insert_songs", "ost")):
        row = models.Note(
            author_id=admin_user.id,
            media_id=sample_anime.system_id,
            section="music_status",
            kind=kind,
            status="Not Done",
            sort_index=float(i),
        )
        db_session.add(row)
        rows.append(row)
    db_session.flush()
    return {r.kind: r.system_id for r in rows}


def test_a_status_minted_on_another_machine_folds_onto_the_local_row(
    db_session, sample_anime, sheet, local_statuses
):
    owner_id = sample_anime.system_id
    sheet([_row(uuid.uuid4(), owner_id, "music_status", "op", "All Done")])

    result = pull.execute_pull_specific(db_session, "Note", log_action=False)

    assert result["status"] == "success", result
    rows = {r.kind: r for r in _rows(db_session, owner_id, "music_status")}
    assert len(rows) == 4
    assert rows["op"].system_id == local_statuses["op"]
    assert rows["op"].status == "All Done"
    # Only the list the sheet named moved.
    assert rows["ed"].status == "Not Done"


def test_each_list_folds_onto_its_own_row(
    db_session, sample_anime, sheet, local_statuses
):
    # The mirror: matching is by list, not by owner alone, so four sheet rows
    # land on four local rows rather than all on the first.
    owner_id = sample_anime.system_id
    sheet(
        [
            _row(uuid.uuid4(), owner_id, "music_status", kind, status)
            for kind, status in (
                ("op", "Done"),
                ("ed", "Need"),
                ("insert_songs", "Pending"),
                ("ost", "All Done"),
            )
        ]
    )

    result = pull.execute_pull_specific(db_session, "Note", log_action=False)

    assert result["status"] == "success", result
    rows = {r.kind: r for r in _rows(db_session, owner_id, "music_status")}
    assert {k: (r.system_id, r.status) for k, r in rows.items()} == {
        "op": (local_statuses["op"], "Done"),
        "ed": (local_statuses["ed"], "Need"),
        "insert_songs": (local_statuses["insert_songs"], "Pending"),
        "ost": (local_statuses["ost"], "All Done"),
    }


def test_a_status_with_no_local_twin_is_inserted(db_session, sample_anime, sheet):
    owner_id = sample_anime.system_id
    sheet_id = uuid.uuid4()
    sheet([_row(sheet_id, owner_id, "music_status", "ed", "Done")])

    result = pull.execute_pull_specific(db_session, "Note", log_action=False)

    assert result["status"] == "success", result
    rows = _rows(db_session, owner_id, "music_status")
    assert [(r.system_id, r.kind, r.status) for r in rows] == [(sheet_id, "ed", "Done")]


def test_two_ost_songs_stay_two(db_session, sample_anime, sheet):
    # OST stopped being a singleton, so the retargeting that folded a second
    # OST row onto the first must not apply to it any more.
    owner_id = sample_anime.system_id
    sheet(
        [
            _row(uuid.uuid4(), owner_id, "ost", status="Done", title="Battle Theme"),
            _row(uuid.uuid4(), owner_id, "ost", status="Need", title="Ending Theme"),
        ]
    )

    result = pull.execute_pull_specific(db_session, "Note", log_action=False)

    assert result["status"] == "success", result
    assert [r.title for r in _rows(db_session, owner_id, "ost")] == [
        "Battle Theme",
        "Ending Theme",
    ]


def test_a_one_row_ost_from_an_old_backup_becomes_the_ost_status(
    db_session, sample_anime, sheet, local_statuses
):
    # A backup from before OST became a list holds one row per anime: the
    # default type and a status, no song. It is the OST's status, not a song.
    owner_id = sample_anime.system_id
    sheet([_row(uuid.uuid4(), owner_id, "ost", kind="normal", status="Pending")])

    result = pull.execute_pull_specific(db_session, "Note", log_action=False)

    assert result["status"] == "success", result
    assert _rows(db_session, owner_id, "ost") == []
    rows = {r.kind: r for r in _rows(db_session, owner_id, "music_status")}
    assert rows["ost"].system_id == local_statuses["ost"]
    assert rows["ost"].status == "Pending"


def test_url_string_links_from_an_old_backup_become_pairs(
    db_session, sample_anime, sheet
):
    owner_id = sample_anime.system_id
    sheet(
        [
            _row(
                uuid.uuid4(), owner_id, "op", kind="normal", status="Done",
                links=["https://youtu.be/a"],
            ),
            _row(
                uuid.uuid4(), owner_id, "op", kind="normal", title="Already paired",
                links=[{"text": "Spotify", "url": "https://open.spotify.com/x"}],
            ),
        ]
    )

    result = pull.execute_pull_specific(db_session, "Note", log_action=False)

    assert result["status"] == "success", result
    by_title = {r.title: r.links for r in _rows(db_session, owner_id, "op")}
    assert by_title == {
        None: [{"text": None, "url": "https://youtu.be/a"}],
        "Already paired": [{"text": "Spotify", "url": "https://open.spotify.com/x"}],
    }
