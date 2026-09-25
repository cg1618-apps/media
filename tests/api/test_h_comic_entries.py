"""
The h-comic media type: CRUD, the region variant rule, the required label,
and who may see an entry.

Every refusal test here reads an entry that CARRIES the `h-comic` label - the
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

ROUTE = "/api/h-comic"
LABEL = "h-comic"
TITLE = "Zvornik Hidden H-Comic"


def _create(admin_client, **fields):
    payload = {"h_comic_name_cn": TITLE, "region": "JP", **fields}
    response = admin_client.post(f"{ROUTE}/", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _db_entry(db_session, body) -> models.HComic:
    return db_session.get(models.HComic, uuid.UUID(body["system_id"]))


@pytest.fixture
def plain_member(db_session):
    """A signed-in account with no mode yet; mode_client gives it one."""
    user = models.User(
        id=uuid.uuid4(),
        username="hcomic_member",
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db_session, "user"),
    )
    db_session.add(user)
    db_session.flush()
    return user


# ---------------------------------------------------------------------------
# CRUD, per region
# ---------------------------------------------------------------------------


def test_a_jp_entry_round_trips(admin_client):
    body = _create(
        admin_client,
        h_comic_name_jp="日本語タイトル",
        originality="同人",
        animation_status="Announced",
        series_number=3,
        page_total=28,
        serialization_status="完結",
        release_date="2024-05",
    )
    fetched = admin_client.get(f"{ROUTE}/{body['public_id']}").json()
    assert fetched["region"] == "JP"
    assert fetched["originality"] == "同人"
    assert fetched["animation_status"] == "Announced"
    assert fetched["series_number"] == 3
    assert fetched["page_total"] == 28
    assert fetched["display_name"] == TITLE
    assert fetched["reading_status"] == "Might Read"
    assert fetched["page_fin"] == 0


def test_a_kr_entry_round_trips(admin_client):
    body = _create(
        admin_client,
        region="KR",
        h_comic_name_kr="한국어 제목",
        ch_total=40,
        ch_behind=5,
        highlight_group_order=["Ana", "Bea", "Ana", " "],
    )
    fetched = admin_client.get(f"{ROUTE}/{body['public_id']}").json()
    assert fetched["region"] == "KR"
    assert fetched["ch_total"] == 40
    assert fetched["ch_behind"] == 5
    # Deduplicated, blanks dropped, order kept.
    assert fetched["highlight_group_order"] == ["Ana", "Bea"]


def test_display_name_falls_back_to_the_kr_name(admin_client):
    body = admin_client.post(
        f"{ROUTE}/", json={"region": "KR", "h_comic_name_kr": "한국어만"}
    ).json()
    assert body["display_name"] == "한국어만"


def test_region_is_required_on_create(admin_client):
    response = admin_client.post(f"{ROUTE}/", json={"h_comic_name_cn": TITLE})
    assert response.status_code == 422


def test_an_unknown_region_is_refused(admin_client):
    response = admin_client.post(
        f"{ROUTE}/", json={"h_comic_name_cn": TITLE, "region": "CN"}
    )
    assert response.status_code == 422


def test_a_put_cannot_null_the_region(admin_client):
    body = _create(admin_client)
    response = admin_client.put(f"{ROUTE}/{body['system_id']}", json={"region": None})
    assert response.status_code == 422


@pytest.mark.parametrize(
    "field,value",
    [
        ("originality", "fan work"),
        ("animation_status", "Airing"),
        ("usefulness", "very"),
    ],
)
def test_the_vocabularies_are_checked_on_create(admin_client, field, value):
    response = admin_client.post(
        f"{ROUTE}/", json={"h_comic_name_cn": TITLE, "region": "JP", field: value}
    )
    assert response.status_code == 422


def test_the_vocabularies_are_checked_on_the_tracker_patch(admin_client):
    body = _create(admin_client)
    response = admin_client.patch(
        f"{ROUTE}/{body['system_id']}", json={"animation_status": "Airing"}
    )
    assert response.status_code == 422
    response = admin_client.patch(
        f"{ROUTE}/{body['system_id']}", json={"usefulness": "very"}
    )
    assert response.status_code == 422


def test_delete_removes_the_entry(admin_client, db_session):
    body = _create(admin_client)
    response = admin_client.delete(f"{ROUTE}/{body['system_id']}")
    assert response.status_code == 200
    assert _db_entry(db_session, body) is None
    assert db_session.get(models.Media, uuid.UUID(body["system_id"])) is None
    assert db_session.query(models.DeletedRecord).filter_by(type="H-Comic").count() == 1


# ---------------------------------------------------------------------------
# The variant rule, on every write path through the router
# ---------------------------------------------------------------------------

JP_ONLY = {
    "originality": "原創",
    "animation_status": "Animated",
    "series_number": 2,
    "page_total": 30,
}
KR_ONLY = {"ch_total": 50, "ch_behind": 3, "highlight_group_order": ["Ana"]}


def test_create_kr_clears_the_jp_only_columns(admin_client):
    body = _create(admin_client, region="KR", **JP_ONLY, **KR_ONLY)
    for column in JP_ONLY:
        assert body[column] is None, column
    assert body["ch_total"] == 50


def test_create_jp_clears_the_kr_only_columns(admin_client):
    body = _create(admin_client, region="JP", **JP_ONLY, **KR_ONLY)
    for column in KR_ONLY:
        assert body[column] is None, column
    assert body["page_total"] == 30


def test_put_switching_to_kr_clears_the_jp_only_columns(admin_client, db_session):
    body = _create(admin_client, region="JP", **JP_ONLY)
    response = admin_client.put(
        f"{ROUTE}/{body['system_id']}", json={"region": "KR", "ch_total": 9}
    )
    assert response.status_code == 200, response.text
    entry = _db_entry(db_session, body)
    db_session.refresh(entry)
    for column in JP_ONLY:
        assert getattr(entry, column) is None, column
    assert entry.ch_total == 9


def test_patch_cannot_set_a_column_the_region_does_not_use(admin_client, db_session):
    body = _create(admin_client, region="JP")
    response = admin_client.patch(
        f"{ROUTE}/{body['system_id']}", json={"ch_behind": 4, "page_total": 12}
    )
    assert response.status_code == 200, response.text
    assert response.json()["ch_behind"] is None
    assert response.json()["page_total"] == 12


def test_the_personal_counters_follow_the_region(admin_client, db_session, admin_user):
    body = _create(admin_client, region="JP", page_total=20)
    response = admin_client.patch(
        f"{ROUTE}/{body['system_id']}",
        json={"page_fin": 7, "ch_fin": 3, "usefulness": "實用"},
    )
    assert response.status_code == 200, response.text
    row = (
        db_session.query(models.UserMediaList)
        .filter_by(user_id=admin_user.id, media_id=uuid.UUID(body["system_id"]))
        .one()
    )
    assert row.page_fin == 7
    assert row.ch_fin is None
    assert row.usefulness == "實用"
    assert response.json()["usefulness"] == "實用"

    # Switching to KR clears the JP counter on the next write of the row.
    response = admin_client.put(
        f"{ROUTE}/{body['system_id']}", json={"region": "KR", "ch_fin": 4}
    )
    assert response.status_code == 200, response.text
    db_session.refresh(row)
    assert row.page_fin is None
    assert row.ch_fin == 4


def test_my_list_put_checks_usefulness(admin_client, mode_client, plain_member):
    """/api/me/list writes the same row the tracker does, so it runs the same
    per-type list hook. A member, not the admin: root holds no list rows."""
    body = _create(admin_client, region="JP")
    member = mode_client("unrestricted", user=plain_member)
    url = f"/api/me/list/{body['system_id']}"
    response = member.put(url, json={"usefulness": "bogus"})
    assert response.status_code == 422, response.text
    # The mirror: a value from the vocabulary is accepted on the same path.
    response = member.put(url, json={"usefulness": "實用"})
    assert response.status_code == 200, response.text
    assert response.json()["usefulness"] == "實用"


def test_my_list_put_clears_the_counter_the_region_does_not_use(
    admin_client, mode_client, plain_member, db_session
):
    body = _create(admin_client, region="JP")
    member = mode_client("unrestricted", user=plain_member)
    response = member.put(
        f"/api/me/list/{body['system_id']}", json={"page_fin": 7, "ch_fin": 3}
    )
    assert response.status_code == 200, response.text
    # The stored row, not the response: _serialize reads a cleared counter
    # back as the list default, 0.
    row = (
        db_session.query(models.UserMediaList)
        .filter_by(user_id=plain_member.id, media_id=uuid.UUID(body["system_id"]))
        .one()
    )
    assert row.page_fin == 7
    assert row.ch_fin is None


def test_complete_fills_the_region_counter(admin_client, db_session, admin_user):
    body = _create(admin_client, region="KR", ch_total=12)
    response = admin_client.post(f"{ROUTE}/{body['system_id']}/complete")
    assert response.status_code == 200
    assert response.json()["reading_status"] == "Completed"
    assert response.json()["ch_fin"] == 12


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
    for method, payload in (("put", {"h_comic_name_en": "x"}), ("patch", {"ch_total": 1})):
        db_session.query(models.MediaContentLabel).filter_by(media_id=entry_id).delete()
        db_session.flush()
        assert label_keys_for_entry(db_session, entry_id) == []
        response = getattr(admin_client, method)(f"{ROUTE}/{entry_id}", json=payload)
        assert response.status_code == 200, response.text
        assert label_keys_for_entry(db_session, entry_id) == [LABEL], method


def test_the_label_endpoint_refuses_to_remove_it(admin_client, db_session):
    body = _create(admin_client)
    response = admin_client.put(
        f"/api/content-labels/entry/h-comic/{body['system_id']}",
        json={"label_keys": []},
    )
    assert response.status_code == 422
    assert label_keys_for_entry(db_session, uuid.UUID(body["system_id"])) == [LABEL]


def test_the_label_endpoint_accepts_a_set_that_keeps_it(
    admin_client, db_session, nsfw_label
):
    body = _create(admin_client)
    response = admin_client.put(
        f"/api/content-labels/entry/h-comic/{body['system_id']}",
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
def labelled_h_comic(admin_client, db_session):
    body = _create(admin_client)
    # The set the gate computes over is not empty: the entry carries the label.
    assert label_keys_for_entry(db_session, uuid.UUID(body["system_id"])) == [LABEL]
    return body


def test_a_guest_gets_404_on_the_detail(client, labelled_h_comic):
    assert client.get(f"{ROUTE}/{labelled_h_comic['public_id']}").status_code == 404


def test_a_guest_does_not_find_it_in_the_list(client, labelled_h_comic):
    listed = client.get(f"{ROUTE}/").json()
    assert all(e["system_id"] != labelled_h_comic["system_id"] for e in listed)


def test_a_guest_does_not_find_it_in_search(client, labelled_h_comic):
    """Not an empty bucket but no bucket: an empty key would still say the
    type exists."""
    body = client.get("/api/search/", params={"q": "Zvornik"}).json()
    assert "h-comic" not in body["results"]
    assert "manga" in body["results"]


def test_unrestricted_sees_it_everywhere(admin_client, labelled_h_comic):
    """The mirror of the three refusals above."""
    assert admin_client.get(f"{ROUTE}/{labelled_h_comic['public_id']}").status_code == 200
    listed = admin_client.get(f"{ROUTE}/").json()
    assert any(e["system_id"] == labelled_h_comic["system_id"] for e in listed)
    body = admin_client.get("/api/search/", params={"q": "Zvornik"}).json()
    assert [e["system_id"] for e in body["results"]["h-comic"]] == [
        labelled_h_comic["system_id"]
    ]


@pytest.mark.parametrize("mode_key", ["safe", "normal", "borderline"])
def test_the_narrower_modes_get_404(mode_client, plain_member, labelled_h_comic, mode_key):
    viewer = mode_client(mode_key, user=plain_member)
    assert viewer.get(f"{ROUTE}/{labelled_h_comic['public_id']}").status_code == 404
    listed = viewer.get(f"{ROUTE}/").json()
    assert all(e["system_id"] != labelled_h_comic["system_id"] for e in listed)


def test_the_unrestricted_mode_sees_it(mode_client, plain_member, labelled_h_comic):
    """The mirror, through the same mode-client path as the refusals."""
    viewer = mode_client("unrestricted", user=plain_member)
    assert viewer.get(f"{ROUTE}/{labelled_h_comic['public_id']}").status_code == 200


@pytest.mark.parametrize("q", ["Zvornik", ""])
def test_a_narrow_mode_gets_no_search_bucket_for_the_type(
    mode_client, plain_member, labelled_h_comic, q
):
    """With a match and without one: an empty query returns early, and must
    not bring the key back."""
    viewer = mode_client("borderline", user=plain_member)
    results = viewer.get("/api/search/", params={"q": q}).json()["results"]
    assert "h-comic" not in results
    assert "manga" in results


def test_the_unrestricted_mode_gets_the_search_bucket(
    mode_client, plain_member, labelled_h_comic
):
    """The mirror of the narrow-mode refusal, through the same path."""
    viewer = mode_client("unrestricted", user=plain_member)
    results = viewer.get("/api/search/", params={"q": "Zvornik"}).json()["results"]
    assert [e["system_id"] for e in results["h-comic"]] == [
        labelled_h_comic["system_id"]
    ]


# ---------------------------------------------------------------------------
# Only `unrestricted` carries the label
# ---------------------------------------------------------------------------


def test_only_unrestricted_carries_the_h_comic_label(db_session):
    """
    `borderline` carries "all labels" as of its seed. The seed tops up a mode
    holding no labels at all - which borderline is, on a database whose
    labels were minted after the modes - and it must not hand it `h-comic`.
    Running the seed again here is exactly that boot.
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

    rows = {
        mode.key
        for mode, _row in db_session.query(models.AccessMode, models.AccessModeLabel)
        .join(models.AccessModeLabel, models.AccessModeLabel.mode_id == models.AccessMode.system_id)
        .filter(models.AccessModeLabel.label_id == label.system_id)
    }
    assert rows <= {"unrestricted"}


def test_the_seed_still_tops_borderline_up_with_ordinary_labels(db_session, nsfw_label):
    """The mirror: the exclusion is for the required label only."""
    borderline = db_session.query(models.AccessMode).filter_by(key="borderline").one()
    db_session.query(models.AccessModeLabel).filter_by(mode_id=borderline.system_id).delete()
    db_session.flush()
    ensure_access_mode_seed(db_session)
    rbac_cache.bump()
    labels = rbac_cache.mode_sets(db_session, borderline.system_id).label_ids
    assert nsfw_label.system_id in labels
    h_comic = db_session.query(models.ContentLabel).filter_by(key=LABEL).one()
    assert h_comic.system_id not in labels


# ---------------------------------------------------------------------------
# /api/auth/me tells the SPA which gated types it may offer
# ---------------------------------------------------------------------------


def test_me_names_h_comic_for_unrestricted(admin_client):
    assert admin_client.get("/api/auth/me").json()["visible_gated_types"] == [
        "h-comic",
        "h-game",
    ]


def test_me_names_nothing_for_a_guest(client):
    assert client.get("/api/auth/me").json()["visible_gated_types"] == []


def test_me_names_nothing_for_borderline(mode_client, plain_member):
    viewer = mode_client("borderline", user=plain_member)
    assert viewer.get("/api/auth/me").json()["visible_gated_types"] == []


# ---------------------------------------------------------------------------
# Franchises
# ---------------------------------------------------------------------------


def test_an_auto_created_franchise_is_typed_and_labelled(admin_client, db_session):
    body = _create(admin_client)
    franchise = db_session.get(models.Franchise, uuid.UUID(body["franchise_id"]))
    assert franchise.franchise_type == "H-Comic"
    assert label_keys_for_franchise(db_session, franchise.system_id) == [LABEL]


def test_an_h_comic_never_attaches_to_a_mainstream_franchise(admin_client, db_session):
    mainstream = models.Franchise(
        system_id=uuid.uuid4(), franchise_type="ACG", franchise_name_en="Fate"
    )
    db_session.add(mainstream)
    db_session.flush()

    body = _create(admin_client, h_comic_name_cn=None, h_comic_name_en="Fate")
    assert body["franchise_id"] != str(mainstream.system_id)
    created = db_session.get(models.Franchise, uuid.UUID(body["franchise_id"]))
    assert created.franchise_type == "H-Comic"


def test_an_h_comic_attaches_to_an_h_comic_franchise_of_that_name(admin_client, db_session):
    """The mirror: the resolver does match, within its own type."""
    own = models.Franchise(
        system_id=uuid.uuid4(), franchise_type="H-Comic", franchise_name_en="Fate"
    )
    db_session.add(own)
    db_session.flush()
    body = _create(admin_client, h_comic_name_cn=None, h_comic_name_en="Fate")
    assert body["franchise_id"] == str(own.system_id)


def test_a_mainstream_entry_never_attaches_to_an_h_comic_franchise(admin_client, db_session):
    own = models.Franchise(
        system_id=uuid.uuid4(), franchise_type="H-Comic", franchise_name_en="Fate"
    )
    db_session.add(own)
    db_session.flush()
    body = admin_client.post("/api/manga/", json={"manga_name_en": "Fate"}).json()
    assert body["franchise_id"] != str(own.system_id)


def test_a_mainstream_franchise_named_by_id_is_refused(admin_client, db_session):
    mainstream = models.Franchise(
        system_id=uuid.uuid4(), franchise_type="ACG", franchise_name_en="Fate"
    )
    db_session.add(mainstream)
    db_session.flush()
    response = admin_client.post(
        f"{ROUTE}/",
        json={"h_comic_name_cn": TITLE, "region": "JP", "franchise_id": str(mainstream.system_id)},
    )
    assert response.status_code == 422


def test_an_h_comic_franchise_hides_from_a_guest(client, admin_client, db_session):
    body = _create(admin_client)
    franchise_id = body["franchise_id"]
    assert label_keys_for_franchise(db_session, uuid.UUID(franchise_id)) == [LABEL]
    assert client.get(f"/api/franchise/{franchise_id}").status_code == 404
    assert admin_client.get(f"/api/franchise/{franchise_id}").status_code == 200


def test_a_franchise_gaining_the_type_gains_the_label(admin_client, db_session):
    created = admin_client.post(
        "/api/franchise/", json={"franchise_name_en": "Zvornik F", "franchise_type": "ACG"}
    ).json()
    franchise_id = uuid.UUID(created["system_id"])
    assert label_keys_for_franchise(db_session, franchise_id) == []

    # To H-Comic alone: "ACG, H-Comic" spans two families and is refused
    # (test_franchise_family.py).
    response = admin_client.patch(
        f"/api/franchise/{franchise_id}", json={"franchise_type": "H-Comic"}
    )
    assert response.status_code == 200
    assert label_keys_for_franchise(db_session, franchise_id) == [LABEL]


def test_a_franchise_created_with_the_type_carries_the_label(admin_client, db_session):
    created = admin_client.post(
        "/api/franchise/", json={"franchise_name_en": "Zvornik G", "franchise_type": "H-Comic"}
    ).json()
    assert label_keys_for_franchise(db_session, uuid.UUID(created["system_id"])) == [LABEL]


def test_the_franchise_label_cannot_be_removed(admin_client, db_session):
    body = _create(admin_client)
    response = admin_client.put(
        f"/api/content-labels/franchise/{body['franchise_id']}", json={"label_keys": []}
    )
    assert response.status_code == 422
    assert label_keys_for_franchise(db_session, uuid.UUID(body["franchise_id"])) == [LABEL]


# ---------------------------------------------------------------------------
# Duplicates, plan-next
# ---------------------------------------------------------------------------


def test_duplicates_key_on_region_and_series_number(db_session, sample_franchise):
    from app.services.domain.duplicates import find_duplicate_h_comic

    def add(region, number, name):
        entry = models.HComic(
            franchise_id=sample_franchise.system_id,
            region=region,
            series_number=number,
            h_comic_name_cn=name,
        )
        db_session.add(entry)
        return entry

    a = add("JP", 1, "Same")
    b = add("JP", 1, "same")
    add("KR", 1, "Same")  # another region: not a duplicate
    add("JP", 2, "Same")  # another number in the series: not a duplicate
    db_session.flush()

    clusters = find_duplicate_h_comic(db_session)
    assert len(clusters) == 1
    assert {row["system_id"] for row in clusters[0]} == {str(a.system_id), str(b.system_id)}


def test_find_all_duplicates_reports_h_comic(db_session):
    from app.services.domain.duplicates import find_all_duplicates

    assert "h_comic" in find_all_duplicates(db_session)


def test_plan_next_flags_read_next_and_to_reread(admin_client):
    body = _create(admin_client)
    response = admin_client.put(
        f"{ROUTE}/{body['system_id']}", json={"read_next": True, "to_reread": True}
    )
    assert response.status_code == 200, response.text
    assert response.json()["read_next"] is True
    assert response.json()["to_reread"] is True


def test_plan_next_kinds_are_entry_only():
    from app.utils.plan_next_kinds import ALLOWED_SCOPES, SIZE_THRESHOLDS

    assert ALLOWED_SCOPES["next"]["h-comic"] == frozenset({"entry"})
    assert ALLOWED_SCOPES["rewatch"]["h-comic"] == frozenset({"entry"})
    assert "h-comic" not in SIZE_THRESHOLDS
