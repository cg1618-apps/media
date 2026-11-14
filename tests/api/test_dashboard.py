"""
The dashboard's own reads: the handler's summary and recently added entries.

The summary is behind manage.requests. Its refusal test puts an open request
in the database first, so a 401 is the gate refusing and not an empty answer.
Recently added is narrowed like every catalogue read; its refusal test gives
the viewer a type it does not hold, with an entry of that type present, and
the mirror is the guest, which holds the type and sees the same entry.
"""

import uuid
from datetime import timedelta

import pytest

from app import models
from app.database import get_taipei_now
from app.models.system import USER_STATUS_PENDING
from app.services.rbac.permissions import media_type_perm
from app.services.rbac.seed import default_guest_permissions
from tests.api.conftest import make_viewer
from tests.api.test_account_lifecycle import make_account

SUMMARY = "/api/dashboard/summary"
RECENT = "/api/dashboard/recent"


@pytest.fixture
def waiting(db_session, plain_user):
    make_account(db_session, "newcomer", status=USER_STATUS_PENDING)
    db_session.add(
        models.UserRequest(
            system_id=uuid.uuid4(),
            author_id=plain_user.id,
            kind="other",
            description="Please add this.",
        )
    )
    db_session.flush()


def test_a_member_cannot_read_the_summary(user_client, waiting):
    assert user_client.get(SUMMARY).status_code == 401


def test_super_reads_what_waits(super_client, waiting):
    r = super_client.get(SUMMARY)
    assert r.status_code == 200
    assert r.json() == {"pending_registrations": 1, "open_requests": 1}


def test_a_guest_cannot_read_the_summary(client, waiting):
    assert client.get(SUMMARY).status_code == 401


@pytest.fixture
def two_entries(db_session, sample_franchise):
    now = get_taipei_now()
    older = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Older Anime",
        airing_type="TV",
    )
    newer = models.Manga(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        manga_name_en="Newer Manga",
    )
    db_session.add_all([older, newer])
    db_session.flush()
    for entry, when in ((older, now - timedelta(days=2)), (newer, now)):
        db_session.query(models.Media).filter(
            models.Media.system_id == entry.system_id
        ).update({models.Media.created_at: when})
    db_session.flush()
    return older, newer


def test_recently_added_is_newest_first(client, two_entries):
    older, newer = two_entries
    rows = client.get(RECENT).json()
    ids = [row["system_id"] for row in rows]
    assert ids.index(str(newer.system_id)) < ids.index(str(older.system_id))
    first = rows[ids.index(str(newer.system_id))]
    assert first["media_type"] == "manga"
    assert first["display_name"]


def test_recently_added_leaves_out_a_type_the_viewer_lacks(
    client, db_session, two_entries
):
    older, newer = two_entries
    assert str(older.system_id) in {r["system_id"] for r in client.get(RECENT).json()}

    grants = default_guest_permissions() - {media_type_perm("anime")}
    viewer = make_viewer(db_session, client, "noanime", grants)
    ids = {r["system_id"] for r in viewer.get(RECENT).json()}
    assert str(older.system_id) not in ids
    assert str(newer.system_id) in ids


@pytest.fixture
def busy_anime(db_session, sample_franchise, two_entries):
    """Three anime all newer than the one manga: newest overall, the manga
    would be crowded out by any cut below four. The per-type cut must keep it."""
    now = get_taipei_now()
    made = []
    for i in range(3):
        anime = models.Anime(
            system_id=uuid.uuid4(),
            franchise_id=sample_franchise.system_id,
            anime_name_en=f"Busy Anime {i}",
            airing_type="TV",
        )
        db_session.add(anime)
        db_session.flush()
        db_session.query(models.Media).filter(
            models.Media.system_id == anime.system_id
        ).update({models.Media.created_at: now + timedelta(hours=i + 1)})
        made.append(anime)
    db_session.flush()
    return made


def test_recently_added_is_the_newest_of_each_type(client, two_entries, busy_anime):
    _older, newer_manga = two_entries
    rows = client.get(RECENT, params={"per_type": 2}).json()
    by_type = {}
    for row in rows:
        by_type.setdefault(row["media_type"], []).append(row["system_id"])
    # Each type is cut on its own: two anime, the newest two, and the manga
    # survives although every anime is newer than it.
    assert by_type["anime"] == [str(busy_anime[2].system_id), str(busy_anime[1].system_id)]
    assert by_type["manga"] == [str(newer_manga.system_id)]


def test_recently_added_skips_a_type_with_nothing(client, two_entries):
    types = {row["media_type"] for row in client.get(RECENT).json()}
    assert types == {"anime", "manga"}


def test_recently_added_bounds_per_type(client, two_entries):
    assert len(client.get(RECENT, params={"per_type": 1}).json()) == 2
    assert client.get(RECENT, params={"per_type": 0}).status_code == 422
    assert client.get(RECENT, params={"per_type": 25}).status_code == 422
