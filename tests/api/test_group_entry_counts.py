"""
The franchise and series lists carry `entry_count`, how many entries each
holds, so the admin pickers can offer the busiest first.

The count goes through the same visibility as the entries: a number is a
smaller leak than a name, but a franchise counting an entry the viewer cannot
see still says it exists. So every guest test sets up a hidden entry beside
the visible one - `hidden_anime` carries the nsfw label the guest's mode
lacks - and the admin test reads the same two, so a guest's 1 is the filter
working and not an empty franchise.
"""

import uuid

import pytest

from app import models
from tests.api.conftest import HIDDEN_NAME, hidden_anime, nsfw_label  # noqa: F401


@pytest.fixture
def two_in_series(db_session, sample_series, sample_anime, hidden_anime):
    """sample_anime (visible) and hidden_anime, both in sample_series."""
    for entry in (sample_anime, hidden_anime):
        entry.series_id = sample_series.system_id
    db_session.flush()
    return sample_series


def _row(body, system_id):
    return next(r for r in body if r["system_id"] == str(system_id))


def test_a_guest_counts_only_the_visible_entries_of_a_franchise(
    client, sample_franchise, two_in_series
):
    body = client.get("/api/franchise/").json()
    assert _row(body, sample_franchise.system_id)["entry_count"] == 1


def test_admin_counts_every_entry_of_a_franchise(
    admin_client, sample_franchise, two_in_series
):
    body = admin_client.get("/api/franchise/").json()
    assert _row(body, sample_franchise.system_id)["entry_count"] == 2


def test_a_guest_counts_only_the_visible_entries_of_a_series(client, two_in_series):
    body = client.get("/api/series/").json()
    assert _row(body, two_in_series.system_id)["entry_count"] == 1


def test_admin_counts_every_entry_of_a_series(admin_client, two_in_series):
    body = admin_client.get("/api/series/").json()
    assert _row(body, two_in_series.system_id)["entry_count"] == 2


def test_an_empty_franchise_counts_zero(admin_client, db_session):
    empty = models.Franchise(
        system_id=uuid.uuid4(), franchise_type="ACG", franchise_name_en="Empty"
    )
    db_session.add(empty)
    db_session.flush()

    body = admin_client.get("/api/franchise/").json()
    assert _row(body, empty.system_id)["entry_count"] == 0
