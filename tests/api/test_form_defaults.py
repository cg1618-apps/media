"""
API tests for /api/form-defaults — the admin Form Defaults page backend.

Covers the auth matrix, upsert semantics, sparse storage, validation limits,
and the one real risk of reusing system_configs: that the new 'form_defaults:'
keys must not leak into the announcements listing.
"""

import json

import pytest
from pydantic import ValidationError

from app import models
from app.routers.form_defaults import FORM_DEFAULTS_PREFIX
from app.schemas.system import FormDefaultsPayload


def _row(db_session, media_type="anime"):
    return (
        db_session.query(models.SystemConfigs)
        .filter(
            models.SystemConfigs.config_key == f"{FORM_DEFAULTS_PREFIX}{media_type}"
        )
        .first()
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def test_list_requires_admin(client):
    assert client.get("/api/form-defaults/").status_code == 401


def test_get_requires_admin(client):
    assert client.get("/api/form-defaults/anime").status_code == 401


def test_put_requires_admin(client):
    res = client.put("/api/form-defaults/anime", json={"defaults": {}})
    assert res.status_code == 401


def test_delete_requires_admin(client):
    assert client.delete("/api/form-defaults/anime").status_code == 401


# ---------------------------------------------------------------------------
# Reads before anything is configured
# ---------------------------------------------------------------------------

def test_list_empty_when_nothing_configured(owner_client):
    res = owner_client.get("/api/form-defaults/")
    assert res.status_code == 200
    assert res.json() == {}


def test_get_unconfigured_type_returns_empty_payload_not_404(owner_client):
    """'Unconfigured' is a normal state — the client shouldn't branch on 404."""
    res = owner_client.get("/api/form-defaults/anime")
    assert res.status_code == 200
    assert res.json() == {
        "media_type": "anime",
        "version": 1,
        "defaults": {},
        "autofill": None,
        "restricted_prefill": None,
    }


# ---------------------------------------------------------------------------
# Save / round-trip
# ---------------------------------------------------------------------------

def test_put_then_get_round_trips(owner_client):
    payload = {
        "version": 1,
        "defaults": {"watching_status": "Plan to Watch", "ep_total": "12"},
        "autofill": ["anime_name_en", "studio"],
    }
    assert owner_client.put("/api/form-defaults/anime", json=payload).status_code == 200

    body = owner_client.get("/api/form-defaults/anime").json()
    assert body["defaults"] == payload["defaults"]
    assert body["autofill"] == payload["autofill"]
    assert body["media_type"] == "anime"


def test_stored_defaults_stay_sparse(owner_client, db_session):
    """Only overridden fields are persisted — the rest stay built-in."""
    owner_client.put(
        "/api/form-defaults/anime",
        json={"defaults": {"watching_status": "Plan to Watch"}},
    )
    stored = json.loads(_row(db_session).config_value)
    assert list(stored["defaults"]) == ["watching_status"]


def test_put_twice_upserts_a_single_row(owner_client, db_session):
    owner_client.put("/api/form-defaults/anime", json={"defaults": {"ep_total": "1"}})
    owner_client.put("/api/form-defaults/anime", json={"defaults": {"ep_total": "2"}})

    rows = (
        db_session.query(models.SystemConfigs)
        .filter(models.SystemConfigs.config_key.like(f"{FORM_DEFAULTS_PREFIX}%"))
        .all()
    )
    assert len(rows) == 1
    assert json.loads(rows[0].config_value)["defaults"]["ep_total"] == "2"


def test_list_returns_every_configured_type(owner_client):
    owner_client.put("/api/form-defaults/anime", json={"defaults": {"ep_total": "12"}})
    owner_client.put("/api/form-defaults/manga", json={"defaults": {"region": "日漫"}})

    body = owner_client.get("/api/form-defaults/").json()
    assert set(body) == {"anime", "manga"}
    assert body["manga"]["defaults"]["region"] == "日漫"


def test_empty_autofill_list_is_preserved(owner_client):
    """[] means 'copy nothing' and must not collapse to null/built-in."""
    owner_client.put(
        "/api/form-defaults/anime", json={"defaults": {}, "autofill": []}
    )
    assert owner_client.get("/api/form-defaults/anime").json()["autofill"] == []


def test_restricted_prefill_round_trips_per_variant(owner_client):
    """The picked prefill names are stored per variant: h-comic's two regions."""
    picks = {"JP": ["禁漫天堂"], "KR": ["禁漫天堂", "ToonGod"]}
    owner_client.put(
        "/api/form-defaults/h-comic", json={"restricted_prefill": picks}
    )
    assert owner_client.get("/api/form-defaults/h-comic").json()[
        "restricted_prefill"
    ] == picks


def test_restricted_prefill_is_null_until_configured(owner_client):
    """null means 'use the built-in prefill'; an empty pick list is a choice."""
    owner_client.put("/api/form-defaults/anime", json={"defaults": {}})
    assert owner_client.get("/api/form-defaults/anime").json()[
        "restricted_prefill"
    ] is None

    owner_client.put(
        "/api/form-defaults/anime", json={"restricted_prefill": {"all": []}}
    )
    assert owner_client.get("/api/form-defaults/anime").json()[
        "restricted_prefill"
    ] == {"all": []}


@pytest.mark.parametrize(
    "picks",
    [
        {"Bad Key!": ["Gimy"]},
        {"all": [1]},
        {"all": ["x" * 101]},
        {"all": [f"n{i}" for i in range(51)]},
        {f"k{i}": [] for i in range(11)},
    ],
)
def test_malformed_restricted_prefill_rejected(owner_client, picks):
    res = owner_client.put(
        "/api/form-defaults/anime", json={"restricted_prefill": picks}
    )
    assert res.status_code == 422


def test_various_value_types_are_accepted(owner_client):
    payload = {
        "defaults": {
            "watching_status": "Paused",
            "ep_total": 12,
            "watch_next": True,
            "remark": None,
        }
    }
    assert owner_client.put("/api/form-defaults/anime", json=payload).status_code == 200


def test_string_list_value_round_trips(owner_client):
    """Multi-selects stay what they were — a list of plain strings."""
    payload = {"defaults": {"source_other": ["Bilibili", "Netflix"]}}
    assert owner_client.put("/api/form-defaults/anime", json=payload).status_code == 200

    body = owner_client.get("/api/form-defaults/anime").json()
    assert body["defaults"]["source_other"] == ["Bilibili", "Netflix"]


def test_repeater_rows_round_trip(owner_client):
    """Repeater fields (sources, game copies) default to a list of flat rows."""
    sources = [
        {"kind": "access", "bucket": "main", "name": "Steam", "url": "", "available": None}
    ]
    copies = [
        {
            "storefront": "Steam",
            "ownership": "Owned",
            "copy_format": "",
            "acquisition": "",
            "price_paid": "",
            "price_currency": "",
            "acquired_date": "",
            "remark": "",
        }
    ]
    payload = {"defaults": {"sources": sources, "copies": copies}}
    assert owner_client.put("/api/form-defaults/game", json=payload).status_code == 200

    body = owner_client.get("/api/form-defaults/game").json()
    assert body["defaults"]["sources"] == sources
    assert body["defaults"]["copies"] == copies


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("method", ["get", "put", "delete"])
def test_unknown_media_type_rejected(owner_client, method):
    kwargs = {"json": {"defaults": {}}} if method == "put" else {}
    res = getattr(owner_client, method)("/api/form-defaults/bogus-type", **kwargs)
    assert res.status_code == 400


@pytest.mark.parametrize(
    "media_type",
    [
        "anime",
        "anime-movie",
        "movie",
        "tv-show",
        "cartoon",
        "manga",
        "novel",
        "comic",
        "game",
        "collection",
        "franchise",
        "series",
        "studio",
        "person",
        "character",
    ],
)
def test_every_form_tab_is_accepted(owner_client, media_type):
    # Every tab with an Add form must round-trip; a missing slug 400s instead.
    res = owner_client.put(
        f"/api/form-defaults/{media_type}", json={"defaults": {"region": "USA"}}
    )
    assert res.status_code == 200, res.text
    assert owner_client.get(f"/api/form-defaults/{media_type}").status_code == 200


def test_nested_object_value_rejected(owner_client):
    res = owner_client.put(
        "/api/form-defaults/anime", json={"defaults": {"studio": {"nested": 1}}}
    )
    assert res.status_code == 422


def test_mixed_list_value_rejected(owner_client):
    """A list is either all strings (multi-select) or all rows (repeater)."""
    res = owner_client.put(
        "/api/form-defaults/anime", json={"defaults": {"source_other": ["a", {"b": 1}]}}
    )
    assert res.status_code == 422


def test_list_of_rows_with_nested_value_rejected(owner_client):
    """Repeater rows are flat — a nested dict/list is not form state."""
    res = owner_client.put(
        "/api/form-defaults/anime",
        json={"defaults": {"sources": [{"kind": {"deep": 1}}]}},
    )
    assert res.status_code == 422

    res = owner_client.put(
        "/api/form-defaults/anime",
        json={"defaults": {"sources": [{"kind": ["deep"]}]}},
    )
    assert res.status_code == 422


def test_list_of_rows_with_non_string_key_rejected():
    # JSON object keys are always strings, so this can only arrive via the model.
    with pytest.raises(ValidationError):
        FormDefaultsPayload(defaults={"sources": [{1: "x"}]})


def test_over_cap_list_rejected(owner_client):
    res = owner_client.put(
        "/api/form-defaults/anime",
        json={"defaults": {"source_other": [f"v{i}" for i in range(51)]}},
    )
    assert res.status_code == 422

    res = owner_client.put(
        "/api/form-defaults/game",
        json={"defaults": {"copies": [{"storefront": "Steam"} for _ in range(51)]}},
    )
    assert res.status_code == 422


def test_invalid_field_key_rejected(owner_client):
    res = owner_client.put(
        "/api/form-defaults/anime", json={"defaults": {"Bad-Key!": "x"}}
    )
    assert res.status_code == 422


def test_too_many_fields_rejected(owner_client):
    res = owner_client.put(
        "/api/form-defaults/anime",
        json={"defaults": {f"field_{i}": "x" for i in range(300)}},
    )
    assert res.status_code == 422


def test_oversized_payload_rejected(owner_client):
    res = owner_client.put(
        "/api/form-defaults/anime",
        json={"defaults": {"remark": "x" * 40000}},
    )
    assert res.status_code == 400


# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------

def test_delete_removes_the_row(owner_client, db_session):
    owner_client.put("/api/form-defaults/anime", json={"defaults": {"ep_total": "12"}})
    assert _row(db_session) is not None

    assert owner_client.delete("/api/form-defaults/anime").status_code == 200
    assert _row(db_session) is None
    assert owner_client.get("/api/form-defaults/anime").json()["defaults"] == {}


def test_delete_is_idempotent(owner_client):
    """Resetting an already-unconfigured type is the state the caller asked for."""
    assert owner_client.delete("/api/form-defaults/anime").status_code == 200
    assert owner_client.delete("/api/form-defaults/anime").status_code == 200


# ---------------------------------------------------------------------------
# Robustness / shared-table safety
# ---------------------------------------------------------------------------

def test_unreadable_json_is_treated_as_unconfigured(owner_client, db_session):
    db_session.add(
        models.SystemConfigs(
            config_key=f"{FORM_DEFAULTS_PREFIX}anime", config_value="not json"
        )
    )
    db_session.flush()

    res = owner_client.get("/api/form-defaults/anime")
    assert res.status_code == 200
    assert res.json()["defaults"] == {}

    assert owner_client.get("/api/form-defaults/").status_code == 200


def test_form_defaults_do_not_leak_into_announcements(owner_client):
    """Both features share system_configs — their key namespaces must not mix."""
    owner_client.post(
        "/api/announcements/", json={"title": "Notice", "body": "Hello"}
    )
    owner_client.put("/api/form-defaults/anime", json={"defaults": {"ep_total": "12"}})

    announcements = owner_client.get("/api/announcements/").json()
    assert [a["title"] for a in announcements] == ["Notice"]

    assert set(owner_client.get("/api/form-defaults/").json()) == {"anime"}
