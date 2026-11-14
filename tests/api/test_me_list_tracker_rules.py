"""
PUT /api/me/list keeps the tracker's rules, so the SPA's status button and
progress steppers can move onto it from the catalogue PATCH.

The catalogue PATCH finishes an entry when a write carries the progress counter
up to its total, and stamps completed_at the first time a row reaches a
Completed status. The list route did neither. It now does both, for the
caller's own row only: finishing the work's catalogue half (airing status,
serialization status) is a catalogue edit and stays behind manage.catalog.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import PERM_SELF_LIST
from app.services.rbac.seed import default_guest_permissions
from tests.api.conftest import make_viewer


@pytest.fixture
def twelve_episodes(db_session, sample_franchise):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Tracker Rules Anime",
        airing_type="TV",
        airing_status="Currently Airing",
        ep_total=12,
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@pytest.fixture
def member(db_session, client):
    return make_viewer(
        db_session, client, "tracker-member", default_guest_permissions() | {PERM_SELF_LIST}
    )


def _row(db_session, username, entry):
    user = db_session.query(models.User).filter_by(username=username).one()
    db_session.expire_all()
    return (
        db_session.query(models.UserMediaList)
        .filter_by(user_id=user.id, media_id=entry.system_id)
        .one_or_none()
    )


def _put(client, entry, **payload):
    response = client.put(f"/api/me/list/{entry.system_id}", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_reaching_the_total_finishes_the_callers_row(
    db_session, client, member, twelve_episodes
):
    _put(client, twelve_episodes, watching_status="Watching", ep_fin=11)
    body = _put(client, twelve_episodes, ep_fin=12)
    assert body["watching_status"] == "Completed"
    row = _row(db_session, "tracker-member", twelve_episodes)
    assert row.status == "Completed"
    assert row.completed_at is not None


def test_below_the_total_nothing_finishes(db_session, client, member, twelve_episodes):
    """Mirror of the above: the same row, one episode short."""
    body = _put(client, twelve_episodes, watching_status="Watching", ep_fin=11)
    assert body["watching_status"] == "Watching"
    assert _row(db_session, "tracker-member", twelve_episodes).completed_at is None


def test_a_status_in_the_payload_wins_over_the_total(
    client, member, twelve_episodes
):
    _put(client, twelve_episodes, watching_status="Watching", ep_fin=11)
    body = _put(client, twelve_episodes, watching_status="Dropped", ep_fin=12)
    assert body["watching_status"] == "Dropped"


def test_the_catalogue_half_is_untouched(db_session, client, member, twelve_episodes):
    _put(client, twelve_episodes, watching_status="Watching", ep_fin=12 - 1)
    _put(client, twelve_episodes, ep_fin=12)
    db_session.expire_all()
    assert db_session.get(models.Anime, twelve_episodes.system_id).airing_status == (
        "Currently Airing"
    )


def test_setting_completed_stamps_completed_at(
    db_session, client, member, twelve_episodes
):
    _put(client, twelve_episodes, watching_status="Completed")
    assert _row(db_session, "tracker-member", twelve_episodes).completed_at is not None


def test_another_accounts_row_is_untouched(
    db_session, client, user_client, plain_user, member, twelve_episodes
):
    other = user_client.put(
        f"/api/me/list/{twelve_episodes.system_id}",
        json={"watching_status": "Watching", "ep_fin": 3},
    )
    assert other.status_code == 200, other.text
    _put(client, twelve_episodes, watching_status="Watching", ep_fin=12)
    theirs = _row(db_session, plain_user.username, twelve_episodes)
    assert theirs.status == "Watching"
    assert theirs.ep_fin == 3
