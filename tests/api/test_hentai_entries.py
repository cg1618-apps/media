"""
The hentai media type: CRUD, the vocabularies, the required label, who may
see an entry, and its franchises.

Every refusal test here reads an entry that CARRIES the `hentai` label - the
label is attached by the server on every write, and each refusal asserts it is
there first - so the hidden set is never empty and the gate has something to
refuse. Each refusal is paired with its mirror: `admin_client` sits in
`unrestricted`, which carries every label, and reads the same entry back.

The narrow viewers:
  client              anonymous, resolves to `safe`
  mode_client(...)    a signed-in account sitting in `normal` or `borderline`

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain.content_labels import (
    label_keys_for_entry,
    label_keys_for_franchise,
)
from app.services.rbac import cache as rbac_cache
from app.services.rbac.seed_modes import ensure_access_mode_seed
from app.services.security import get_password_hash
from tests.api.conftest import role_id_for

ROUTE = "/api/hentai"
LABEL = "hentai"
TITLE = "Zvornik Hidden Hentai"


def _create(admin_client, **fields):
    payload = {"hentai_name_cn": TITLE, **fields}
    response = admin_client.post(f"{ROUTE}/", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _db_entry(db_session, body) -> models.Hentai:
    return db_session.get(models.Hentai, uuid.UUID(body["system_id"]))


@pytest.fixture
def plain_member(db_session):
    """A signed-in account with no mode yet; mode_client gives it one."""
    user = models.User(
        id=uuid.uuid4(),
        username="hentai_member",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db_session, "user"),
    )
    db_session.add(user)
    db_session.flush()
    return user


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


def test_an_entry_round_trips(admin_client):
    body = _create(
        admin_client,
        hentai_name_jp="日本語タイトル",
        hentai_name_roman="Nihongo",
        source_material="Manga",
        originality="同人",
        series_number=2,
        airing_status="Finished Airing",
        release_date="2024-05",
    )
    fetched = admin_client.get(f"{ROUTE}/{body['public_id']}").json()
    assert fetched["source_material"] == "Manga"
    assert fetched["originality"] == "同人"
    assert fetched["series_number"] == 2
    assert fetched["airing_status"] == "Finished Airing"
    assert fetched["release_date"] == "2024-05"
    assert fetched["display_name"] == TITLE
    assert fetched["watching_status"] == "Might Watch"


def test_display_name_falls_back_through_the_names(admin_client):
    body = admin_client.post(f"{ROUTE}/", json={"hentai_name_roman": "Romaji Only"}).json()
    assert body["display_name"] == "Romaji Only"


@pytest.mark.parametrize(
    "field,value",
    [
        ("source_material", "Game"),
        ("originality", "fan work"),
        ("airing_status", "Animated"),
        ("usefulness", "very"),
    ],
)
def test_the_vocabularies_are_checked_on_create(admin_client, field, value):
    response = admin_client.post(
        f"{ROUTE}/", json={"hentai_name_cn": TITLE, field: value}
    )
    assert response.status_code == 422


def test_the_vocabularies_are_checked_on_the_tracker_patch(admin_client):
    body = _create(admin_client)
    for payload in (
        {"source_material": "Game"},
        {"airing_status": "Animated"},
        {"usefulness": "very"},
    ):
        response = admin_client.patch(f"{ROUTE}/{body['system_id']}", json=payload)
        assert response.status_code == 422, payload


def test_the_personal_fields_land_on_the_list_row(admin_client, db_session, admin_user):
    body = _create(admin_client)
    response = admin_client.patch(
        f"{ROUTE}/{body['system_id']}",
        json={"watching_status": "Active Watching", "my_rating": "A", "usefulness": "實用"},
    )
    assert response.status_code == 200, response.text
    row = (
        db_session.query(models.UserMediaList)
        .filter_by(user_id=admin_user.id, media_id=uuid.UUID(body["system_id"]))
        .one()
    )
    assert (row.status, row.my_rating, row.usefulness) == ("Active Watching", "A", "實用")
    assert response.json()["usefulness"] == "實用"


def test_complete_marks_it_watched_and_aired(admin_client):
    body = _create(admin_client, airing_status="Airing")
    response = admin_client.post(f"{ROUTE}/{body['system_id']}/complete")
    assert response.status_code == 200
    assert response.json()["watching_status"] == "Completed"
    assert response.json()["airing_status"] == "Finished Airing"


def test_delete_removes_the_entry(admin_client, db_session):
    body = _create(admin_client)
    response = admin_client.delete(f"{ROUTE}/{body['system_id']}")
    assert response.status_code == 200
    assert _db_entry(db_session, body) is None
    assert db_session.get(models.Media, uuid.UUID(body["system_id"])) is None
    assert db_session.query(models.DeletedRecord).filter_by(type="Hentai").count() == 1


# ---------------------------------------------------------------------------
# The label: stamped on every write path, never removable
# ---------------------------------------------------------------------------


def test_create_stamps_the_label(admin_client, db_session):
    body = _create(admin_client)
    assert label_keys_for_entry(db_session, uuid.UUID(body["system_id"])) == [LABEL]
    assert [label["key"] for label in body["content_labels"]] == [LABEL]


def test_update_and_patch_restore_a_label_removed_behind_the_api(
    admin_client, db_session
):
    body = _create(admin_client)
    entry_id = uuid.UUID(body["system_id"])
    for method, payload in (("put", {"hentai_name_en": "x"}), ("patch", {"series_number": 1})):
        db_session.query(models.MediaContentLabel).filter_by(media_id=entry_id).delete()
        db_session.flush()
        assert label_keys_for_entry(db_session, entry_id) == []
        response = getattr(admin_client, method)(f"{ROUTE}/{entry_id}", json=payload)
        assert response.status_code == 200, response.text
        assert label_keys_for_entry(db_session, entry_id) == [LABEL], method


def test_the_label_endpoint_refuses_to_remove_it(admin_client, db_session):
    body = _create(admin_client)
    response = admin_client.put(
        f"/api/content-labels/entry/hentai/{body['system_id']}",
        json={"label_keys": []},
    )
    assert response.status_code == 422
    assert label_keys_for_entry(db_session, uuid.UUID(body["system_id"])) == [LABEL]


def test_the_label_endpoint_accepts_a_set_that_keeps_it(
    admin_client, db_session, nsfw_label
):
    body = _create(admin_client)
    response = admin_client.put(
        f"/api/content-labels/entry/hentai/{body['system_id']}",
        json={"label_keys": [LABEL, "nsfw"]},
    )
    assert response.status_code == 200, response.text
    assert label_keys_for_entry(db_session, uuid.UUID(body["system_id"])) == [
        LABEL,
        "nsfw",
    ]


def test_the_required_label_cannot_be_deleted(admin_client, db_session):
    label = db_session.query(models.ContentLabel).filter_by(key=LABEL).one()
    response = admin_client.delete(f"/api/content-labels/{label.system_id}")
    assert response.status_code == 409
    assert db_session.query(models.ContentLabel).filter_by(key=LABEL).count() == 1


# ---------------------------------------------------------------------------
# Who sees it
# ---------------------------------------------------------------------------


@pytest.fixture
def labelled_hentai(admin_client, db_session):
    body = _create(admin_client)
    # The set the gate computes over is not empty: the entry carries the label.
    assert label_keys_for_entry(db_session, uuid.UUID(body["system_id"])) == [LABEL]
    return body


def test_a_guest_gets_404_on_the_detail(client, labelled_hentai):
    assert client.get(f"{ROUTE}/{labelled_hentai['public_id']}").status_code == 404


def test_a_guest_does_not_find_it_in_the_list(client, labelled_hentai):
    listed = client.get(f"{ROUTE}/").json()
    assert all(e["system_id"] != labelled_hentai["system_id"] for e in listed)


def test_a_guest_does_not_find_it_in_search(client, labelled_hentai):
    """Not an empty bucket but no bucket: an empty key would still say the
    type exists."""
    body = client.get("/api/search/", params={"q": "Zvornik"}).json()
    assert "hentai" not in body["results"]
    assert "manga" in body["results"]


def test_unrestricted_sees_it_everywhere(admin_client, labelled_hentai):
    """The mirror of the three refusals above."""
    assert admin_client.get(f"{ROUTE}/{labelled_hentai['public_id']}").status_code == 200
    listed = admin_client.get(f"{ROUTE}/").json()
    assert any(e["system_id"] == labelled_hentai["system_id"] for e in listed)
    body = admin_client.get("/api/search/", params={"q": "Zvornik"}).json()
    assert [e["system_id"] for e in body["results"]["hentai"]] == [
        labelled_hentai["system_id"]
    ]


@pytest.mark.parametrize("mode_key", ["safe", "normal", "borderline"])
def test_the_narrower_modes_get_404(mode_client, plain_member, labelled_hentai, mode_key):
    viewer = mode_client(mode_key, user=plain_member)
    assert viewer.get(f"{ROUTE}/{labelled_hentai['public_id']}").status_code == 404
    listed = viewer.get(f"{ROUTE}/").json()
    assert all(e["system_id"] != labelled_hentai["system_id"] for e in listed)


def test_the_unrestricted_mode_sees_it(mode_client, plain_member, labelled_hentai):
    """The mirror, through the same mode-client path as the refusals."""
    viewer = mode_client("unrestricted", user=plain_member)
    assert viewer.get(f"{ROUTE}/{labelled_hentai['public_id']}").status_code == 200


def test_only_unrestricted_carries_the_hentai_label(db_session, labelled_hentai):
    """
    The label exists and an entry carries it, so a mode that reached it would
    show here. Running the seed again is the boot that could hand it to
    `borderline`, which carries "all labels" as of its seed.
    """
    label = db_session.query(models.ContentLabel).filter_by(key=LABEL).one()
    ensure_access_mode_seed(db_session)
    rbac_cache.bump()

    carrying = {
        mode.key
        for mode in db_session.query(models.AccessMode)
        if label.system_id in rbac_cache.mode_sets(db_session, mode.system_id).label_ids
    }
    assert carrying == {"unrestricted"}


def test_me_names_both_gated_types_for_unrestricted(admin_client):
    assert admin_client.get("/api/auth/me").json()["visible_gated_types"] == [
        "h-comic",
        "hentai",
    ]


def test_me_names_nothing_for_borderline(mode_client, plain_member):
    viewer = mode_client("borderline", user=plain_member)
    assert viewer.get("/api/auth/me").json()["visible_gated_types"] == []


# ---------------------------------------------------------------------------
# Franchises
# ---------------------------------------------------------------------------


def _franchise(db_session, franchise_type, name="Fate"):
    row = models.Franchise(
        system_id=uuid.uuid4(), franchise_type=franchise_type, franchise_name_en=name
    )
    db_session.add(row)
    db_session.flush()
    return row


def test_an_auto_created_franchise_is_typed_and_labelled(admin_client, db_session):
    body = _create(admin_client)
    franchise = db_session.get(models.Franchise, uuid.UUID(body["franchise_id"]))
    assert franchise.franchise_type == "Hentai"
    assert label_keys_for_franchise(db_session, franchise.system_id) == [LABEL]


def test_a_hentai_attaches_to_the_h_comic_franchise_of_its_name(admin_client, db_session):
    """D5: an h-comic and its adaptation share a franchise."""
    own = _franchise(db_session, "H-Comic")
    body = _create(admin_client, hentai_name_cn=None, hentai_name_en="Fate")
    assert body["franchise_id"] == str(own.system_id)


def test_a_hentai_never_attaches_to_a_mainstream_franchise(admin_client, db_session):
    mainstream = _franchise(db_session, "ACG")
    body = _create(admin_client, hentai_name_cn=None, hentai_name_en="Fate")
    assert body["franchise_id"] != str(mainstream.system_id)
    created = db_session.get(models.Franchise, uuid.UUID(body["franchise_id"]))
    assert created.franchise_type == "Hentai"


def test_a_mainstream_entry_never_attaches_to_a_hentai_franchise(admin_client, db_session):
    own = _franchise(db_session, "Hentai")
    body = admin_client.post("/api/anime/", json={"anime_name_en": "Fate"}).json()
    assert body["franchise_id"] != str(own.system_id)


def test_a_mainstream_franchise_named_by_id_is_refused(admin_client, db_session):
    mainstream = _franchise(db_session, "Anime")
    response = admin_client.post(
        f"{ROUTE}/",
        json={"hentai_name_cn": TITLE, "franchise_id": str(mainstream.system_id)},
    )
    assert response.status_code == 422


def test_a_mainstream_franchise_named_by_id_is_refused_on_the_update(
    admin_client, db_session
):
    body = _create(admin_client)
    mainstream = _franchise(db_session, "Anime")
    response = admin_client.put(
        f"{ROUTE}/{body['system_id']}", json={"franchise_id": str(mainstream.system_id)}
    )
    assert response.status_code == 422


def test_an_h_comic_franchise_named_by_id_is_accepted(admin_client, db_session):
    """The mirror: the same family is allowed."""
    own = _franchise(db_session, "H-Comic")
    body = _create(admin_client, franchise_id=str(own.system_id))
    assert body["franchise_id"] == str(own.system_id)


def test_the_franchise_label_cannot_be_removed(admin_client, db_session):
    body = _create(admin_client)
    response = admin_client.put(
        f"/api/content-labels/franchise/{body['franchise_id']}", json={"label_keys": []}
    )
    assert response.status_code == 422
    assert label_keys_for_franchise(db_session, uuid.UUID(body["franchise_id"])) == [LABEL]


def test_a_hentai_franchise_hides_from_a_guest(client, admin_client, db_session):
    body = _create(admin_client)
    franchise_id = body["franchise_id"]
    assert label_keys_for_franchise(db_session, uuid.UUID(franchise_id)) == [LABEL]
    assert client.get(f"/api/franchise/{franchise_id}").status_code == 404
    assert admin_client.get(f"/api/franchise/{franchise_id}").status_code == 200


# ---------------------------------------------------------------------------
# Duplicates, plan-next, watch orders
# ---------------------------------------------------------------------------


def test_duplicates_key_on_series_number(db_session, sample_franchise):
    from app.services.domain.duplicates import find_duplicate_hentai

    def add(number, name):
        entry = models.Hentai(
            franchise_id=sample_franchise.system_id,
            series_number=number,
            hentai_name_cn=name,
        )
        db_session.add(entry)
        return entry

    a = add(1, "Same")
    b = add(1, "same")
    add(2, "Same")  # another episode of the series: not a duplicate
    db_session.flush()

    clusters = find_duplicate_hentai(db_session)
    assert len(clusters) == 1
    assert {row["system_id"] for row in clusters[0]} == {str(a.system_id), str(b.system_id)}


def test_find_all_duplicates_reports_hentai(db_session):
    from app.services.domain.duplicates import find_all_duplicates

    assert "hentai" in find_all_duplicates(db_session)


def test_plan_next_flags_watch_next_and_to_rewatch(admin_client):
    body = _create(admin_client)
    response = admin_client.put(
        f"{ROUTE}/{body['system_id']}", json={"watch_next": True, "to_rewatch": True}
    )
    assert response.status_code == 200, response.text
    assert response.json()["watch_next"] is True
    assert response.json()["to_rewatch"] is True


def test_plan_next_kinds_are_entry_only():
    from app.utils.plan_next_kinds import ALLOWED_SCOPES, SIZE_THRESHOLDS

    assert ALLOWED_SCOPES["next"]["hentai"] == frozenset({"entry"})
    assert ALLOWED_SCOPES["rewatch"]["hentai"] == frozenset({"entry"})
    assert "hentai" not in SIZE_THRESHOLDS


def test_watch_orders_treat_it_as_whole():
    from app.services.domain.watch_order import _TOTAL_FIELDS, MEDIA_TYPE_MODELS

    assert MEDIA_TYPE_MODELS["hentai"] is models.Hentai
    assert "hentai" not in _TOTAL_FIELDS
