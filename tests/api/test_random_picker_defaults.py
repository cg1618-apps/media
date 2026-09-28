"""
API tests for /api/random-picker-defaults — the random picker's default
filters and the admin page that edits them.

Reads are open to everyone (the picker is); writes need manage.catalog. A
gated type's mode is refused to a session that may not see the type: that
refusal is tested with the hentai label EXISTING (an entry carries it), since
a label nobody has created gates nothing and the refusal would pass vacuously.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.routers.random_picker_defaults import PICKER_DEFAULTS_PREFIX
from app.services.domain.content_labels import label_keys_for_entry

ROUTE = "/api/random-picker-defaults"


def _row(db_session, mode):
    return (
        db_session.query(models.SystemConfigs)
        .filter(models.SystemConfigs.config_key == f"{PICKER_DEFAULTS_PREFIX}{mode}")
        .first()
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


def test_a_guest_reads_an_unconfigured_mode_as_no_filters(client):
    res = client.get(f"{ROUTE}/all")
    assert res.status_code == 200
    assert res.json() == {"mode": "all", "version": 1, "filters": {}, "weighted": True}


def test_a_guest_cannot_save(client):
    assert client.put(f"{ROUTE}/all", json={"filters": {}}).status_code == 401


def test_a_guest_cannot_reset(client):
    assert client.delete(f"{ROUTE}/all").status_code == 401


def test_a_member_without_manage_catalog_cannot_save(user_client):
    res = user_client.put(f"{ROUTE}/anime", json={"filters": {"airingType": ["TV"]}})
    assert res.status_code == 401


# ---------------------------------------------------------------------------
# Save / round-trip
# ---------------------------------------------------------------------------


def test_save_then_everyone_reads_it(admin_client, client, db_session):
    filters = {"airingType": ["TV", "OVA"], "bahaOnly": True}
    res = admin_client.put(f"{ROUTE}/anime", json={"filters": filters})
    assert res.status_code == 200, res.text
    assert _row(db_session, "anime") is not None

    # The picker is public, so a guest opens with the saved defaults too.
    assert client.get(f"{ROUTE}/anime").json()["filters"] == filters


def test_save_replaces_wholesale(admin_client):
    admin_client.put(f"{ROUTE}/all", json={"filters": {"myRating": ["S"], "decade": ["2010s"]}})
    admin_client.put(f"{ROUTE}/all", json={"filters": {"myRating": ["A"]}})
    assert admin_client.get(f"{ROUTE}/all").json()["filters"] == {"myRating": ["A"]}


def test_weighting_is_on_unless_saved_off(admin_client, client, db_session):
    # A row saved before the flag existed carries no "weighted" key, and
    # reads as weighted, like a mode with nothing saved.
    db_session.add(
        models.SystemConfigs(
            config_key="random_picker_defaults:novel", config_value='{"filters": {}}'
        )
    )
    db_session.commit()
    assert client.get(f"{ROUTE}/novel").json()["weighted"] is True

    admin_client.put(f"{ROUTE}/anime", json={"filters": {}, "weighted": False})
    assert client.get(f"{ROUTE}/anime").json()["weighted"] is False
    assert client.get(f"{ROUTE}/all").json()["weighted"] is True


def test_reset_deletes_the_row_and_is_idempotent(admin_client, db_session):
    admin_client.put(f"{ROUTE}/manga", json={"filters": {"region": ["JP"]}})
    assert admin_client.delete(f"{ROUTE}/manga").status_code == 200
    assert _row(db_session, "manga") is None
    assert admin_client.get(f"{ROUTE}/manga").json()["filters"] == {}
    assert admin_client.delete(f"{ROUTE}/manga").status_code == 200


def test_modes_are_stored_apart(admin_client):
    admin_client.put(f"{ROUTE}/anime", json={"filters": {"airingType": ["TV"]}})
    assert admin_client.get(f"{ROUTE}/all").json()["filters"] == {}


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def test_an_unknown_mode_is_400(admin_client):
    assert admin_client.get(f"{ROUTE}/hologram").status_code == 400
    assert admin_client.put(f"{ROUTE}/hologram", json={"filters": {}}).status_code == 400


@pytest.mark.parametrize(
    "filters",
    [
        {"bad key!": ["x"]},
        {"airingType": "TV"},
        {"airingType": ["x" * 101]},
        {"airingType": [str(i) for i in range(101)]},
        {f"k{i}": True for i in range(51)},
    ],
)
def test_malformed_filters_are_422(admin_client, filters):
    assert admin_client.put(f"{ROUTE}/anime", json={"filters": filters}).status_code == 422


def test_unreadable_stored_json_reads_as_no_filters(admin_client, db_session):
    db_session.add(
        models.SystemConfigs(config_key=f"{PICKER_DEFAULTS_PREFIX}game", config_value="{nope")
    )
    db_session.flush()
    assert admin_client.get(f"{ROUTE}/game").json()["filters"] == {}


def test_picker_defaults_do_not_leak_into_announcements(admin_client):
    """Both features share system_configs; their key namespaces must not mix."""
    admin_client.post("/api/announcements/", json={"title": "Notice", "body": "Hello"})
    admin_client.put(f"{ROUTE}/all", json={"filters": {"myRating": ["S"]}})
    announcements = admin_client.get("/api/announcements/").json()
    assert [a["title"] for a in announcements] == ["Notice"]


# ---------------------------------------------------------------------------
# Gated modes
# ---------------------------------------------------------------------------


@pytest.fixture
def hentai_label_exists(admin_client, db_session):
    """An entry carrying the hentai label, so the gate has a label to hide."""
    res = admin_client.post("/api/hentai/", json={"hentai_name_cn": "Picker Gate"})
    assert res.status_code == 201, res.text
    assert label_keys_for_entry(db_session, uuid.UUID(res.json()["system_id"])) == ["hentai"]


def test_a_guest_is_not_told_a_gated_mode_exists(client, hentai_label_exists):
    assert client.get(f"{ROUTE}/hentai").status_code == 404


def test_an_unrestricted_session_reads_the_gated_mode(admin_client, hentai_label_exists):
    """The mirror, with the same label in place."""
    admin_client.put(f"{ROUTE}/hentai", json={"filters": {"watchingStatus": ["Planned"]}})
    res = admin_client.get(f"{ROUTE}/hentai")
    assert res.status_code == 200
    assert res.json()["filters"] == {"watchingStatus": ["Planned"]}
