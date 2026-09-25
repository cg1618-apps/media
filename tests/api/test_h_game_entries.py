"""
The h-game media type: CRUD, its vocabularies, the DLC chain, purchase
records, the required label, the franchise family, and who may see an entry.

Every refusal test here reads an entry that CARRIES the `h-game` label - the
label is attached by the server on every write, and each refusal asserts it is
there first - so the hidden set is never empty and the gate has something to
refuse. Each refusal is paired with its mirror: `admin_client` sits in
`unrestricted`, which carries every label, and reads the same entry back.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models
from app.services.domain.content_labels import (
    label_keys_for_entry,
    label_keys_for_franchise,
)
from app.services.rbac import cache as rbac_cache
from app.services.rbac.seed_modes import ensure_access_mode_seed
from app.services.security import get_password_hash
from tests.api.conftest import role_id_for

ROUTE = "/api/h-game"
LABEL = "h-game"
TITLE = "Zvornik Hidden H-Game"


def _create(admin_client, **fields):
    payload = {"h_game_name_cn": TITLE, **fields}
    response = admin_client.post(f"{ROUTE}/", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _db_entry(db_session, body) -> models.HGame:
    return db_session.get(models.HGame, uuid.UUID(body["system_id"]))


@pytest.fixture
def plain_member(db_session):
    """A signed-in account with no mode yet; mode_client gives it one."""
    user = models.User(
        id=uuid.uuid4(),
        username="hgame_member",
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
        h_game_name_jp="日本語タイトル",
        h_game_name_roman="Nihongo",
        series_number=2,
        playstyle="RPG",
        game_type="Base Game",
        release_status="Released",
        release_date="2024-05",
        current_patch="1.2",
        completion_level="Main Story",
        all_endings="No",
        all_cg="Yes",
        steam_progress_sync=True,
        achievements_earned=3,
        achievements_total=10,
        hltb_main=12.5,
        price_original_jp="2200.00",
        language_availability="官方中文",
        audio_availability=["H場景", "一般對話"],
        animation_availability=True,
        h_presentation=["互動", "靜圖"],
        platform=["DLsite", "Steam"],
        igdb_link="https://www.igdb.com/games/x",
        dlsite_link_jp="https://www.dlsite.com/maniax/work/=/product_id/RJ1.html",
        dlsite_link_tw="https://www.dlsite.com/home-tw/work/=/product_id/RJ1.html",
    )
    fetched = admin_client.get(f"{ROUTE}/{body['public_id']}").json()
    assert fetched["display_name"] == TITLE
    assert fetched["playstyle"] == "RPG"
    assert fetched["series_number"] == 2
    assert fetched["all_cg"] == "Yes"
    assert fetched["language_availability"] == "官方中文"
    assert fetched["animation_availability"] is True
    # Kept in vocabulary order, whatever order they were ticked in.
    assert fetched["audio_availability"] == ["一般對話", "H場景"]
    assert fetched["h_presentation"] == ["靜圖", "互動"]
    assert fetched["platform"] == ["Steam", "DLsite"]
    assert fetched["dlsite_link_tw"].endswith("RJ1.html")
    assert fetched["playing_status"] == "Might Play"
    # Game's dropped columns are not part of the type.
    for dropped in ("hours_played", "metacritic_score", "all_achievements", "all_collected"):
        assert dropped not in fetched


def test_display_name_falls_back_as_game_does(admin_client):
    body = admin_client.post(f"{ROUTE}/", json={"h_game_name_roman": "Romaji"}).json()
    assert body["display_name"] == "Romaji"


def test_a_list_is_deduplicated_and_empty_is_an_answer(admin_client):
    body = _create(admin_client, platform=["Steam", "Steam"], h_presentation=[])
    assert body["platform"] == ["Steam"]
    assert body["h_presentation"] == []
    assert body["audio_availability"] is None


@pytest.mark.parametrize(
    "field,value",
    [
        ("playstyle", "FPS"),
        ("language_availability", "English"),
        ("audio_availability", ["Moaning"]),
        ("h_presentation", ["VR"]),
        ("platform", ["PlayStation"]),
        ("platform", "Steam"),
        ("usefulness", "very"),
    ],
)
def test_the_vocabularies_are_checked_on_create(admin_client, field, value):
    response = admin_client.post(f"{ROUTE}/", json={"h_game_name_cn": TITLE, field: value})
    assert response.status_code == 422


def test_the_vocabularies_are_checked_on_update(admin_client):
    body = _create(admin_client)
    response = admin_client.put(f"{ROUTE}/{body['system_id']}", json={"platform": ["Xbox"]})
    assert response.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [{"playstyle": "FPS"}, {"platform": ["Xbox"]}, {"usefulness": "very"}],
)
def test_the_vocabularies_are_checked_on_the_tracker_patch(admin_client, payload):
    body = _create(admin_client)
    response = admin_client.patch(f"{ROUTE}/{body['system_id']}", json=payload)
    assert response.status_code == 422


def test_the_tracker_patch_orders_a_list(admin_client):
    body = _create(admin_client)
    response = admin_client.patch(
        f"{ROUTE}/{body['system_id']}", json={"platform": ["Other", "Nintendo"]}
    )
    assert response.status_code == 200, response.text
    assert response.json()["platform"] == ["Nintendo", "Other"]


def test_the_personal_fields_land_on_the_list_row(admin_client, db_session, admin_user):
    body = _create(admin_client)
    response = admin_client.patch(
        f"{ROUTE}/{body['system_id']}",
        json={"playing_status": "Active Playing", "my_rating": "A", "usefulness": "實用"},
    )
    assert response.status_code == 200, response.text
    row = (
        db_session.query(models.UserMediaList)
        .filter_by(user_id=admin_user.id, media_id=uuid.UUID(body["system_id"]))
        .one()
    )
    assert (row.status, row.my_rating, row.usefulness) == ("Active Playing", "A", "實用")
    assert response.json()["usefulness"] == "實用"


def test_my_list_put_checks_usefulness(admin_client, mode_client, plain_member):
    """/api/me/list runs the same per-type list hook as the entry routes."""
    body = _create(admin_client)
    member = mode_client("unrestricted", user=plain_member)
    url = f"/api/me/list/{body['system_id']}"
    response = member.put(url, json={"usefulness": "bogus"})
    assert response.status_code == 422, response.text
    # The mirror: a value from the vocabulary is accepted on the same path.
    response = member.put(url, json={"usefulness": "實用"})
    assert response.status_code == 200, response.text
    assert response.json()["usefulness"] == "實用"


def test_complete_marks_the_list_row(admin_client):
    body = _create(admin_client)
    response = admin_client.post(f"{ROUTE}/{body['system_id']}/complete")
    assert response.status_code == 200
    assert response.json()["playing_status"] == "Completed"


def test_delete_removes_the_entry(admin_client, db_session):
    body = _create(admin_client)
    response = admin_client.delete(f"{ROUTE}/{body['system_id']}")
    assert response.status_code == 200
    assert _db_entry(db_session, body) is None
    assert db_session.get(models.Media, uuid.UUID(body["system_id"])) is None
    assert db_session.query(models.DeletedRecord).filter_by(type="H-Game").count() == 1


# ---------------------------------------------------------------------------
# DLC chain
# ---------------------------------------------------------------------------


def test_a_dlc_names_its_base_game(admin_client):
    base = _create(admin_client, game_type="Base Game")
    dlc = _create(
        admin_client,
        h_game_name_cn="Zvornik DLC",
        game_type="DLC",
        base_game_id=base["system_id"],
    )
    fetched = admin_client.get(f"{ROUTE}/{dlc['public_id']}").json()
    assert fetched["base_game"]["system_id"] == base["system_id"]
    assert fetched["base_game"]["public_id"] == base["public_id"]
    assert fetched["base_game"]["display_name"] == TITLE


def test_deleting_the_base_game_keeps_the_dlc(admin_client, db_session):
    base = _create(admin_client, game_type="Base Game")
    dlc = _create(
        admin_client, h_game_name_cn="Zvornik DLC", game_type="DLC", base_game_id=base["system_id"]
    )
    assert admin_client.delete(f"{ROUTE}/{base['system_id']}").status_code == 200
    entry = _db_entry(db_session, dlc)
    db_session.refresh(entry)
    assert entry.base_game_id is None


def test_a_base_game_cannot_have_a_parent(db_session):
    parent = models.HGame(h_game_name_cn="p")
    db_session.add(parent)
    db_session.flush()
    child = models.HGame(h_game_name_cn="c", game_type="Base Game", base_game_id=parent.system_id)
    db_session.add(child)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


# ---------------------------------------------------------------------------
# Purchase records, shared with Game
# ---------------------------------------------------------------------------
# Written through `super_client`: a copy is a personal-ownership row, so the
# writer needs `self.list`, which the root admin never holds implicitly.

COPY = {
    "storefront": "Other",
    "ownership": "Owned",
    "copy_format": "Digital",
    "price_paid": "12.00",
    "price_currency": "JPY",
}


def test_copies_are_written_and_read_on_an_h_game(super_client, db_session):
    body = _create(super_client, copies=[COPY])
    assert [c["storefront"] for c in body["copies"]] == ["Other"]
    assert body["ownership"] == "Owned"
    rows = db_session.query(models.GameCopy).filter_by(game_id=uuid.UUID(body["system_id"])).all()
    assert len(rows) == 1


def test_the_ownership_filter_works_on_h_game(super_client):
    owned = _create(super_client, copies=[COPY])
    _create(super_client, h_game_name_cn="Zvornik Unowned")
    listed = super_client.get(f"{ROUTE}/", params={"ownership": "Owned"}).json()
    assert [e["system_id"] for e in listed] == [owned["system_id"]]


def test_copies_still_work_on_a_game(super_client):
    """The mirror: moving the FK to `media` keeps Game's copies intact."""
    response = super_client.post(
        "/api/game/", json={"game_name_en": "Zvornik Game", "copies": [COPY]}
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert [c["storefront"] for c in body["copies"]] == ["Other"]
    listed = super_client.get("/api/game/", params={"ownership": "Owned"}).json()
    assert body["system_id"] in [e["system_id"] for e in listed]


def test_deleting_an_h_game_deletes_its_copies(super_client, db_session):
    body = _create(super_client, copies=[COPY])
    entry_id = uuid.UUID(body["system_id"])
    assert db_session.query(models.GameCopy).filter_by(game_id=entry_id).count() == 1
    assert super_client.delete(f"{ROUTE}/{entry_id}").status_code == 200
    db_session.expire_all()
    assert db_session.query(models.GameCopy).filter_by(game_id=entry_id).count() == 0


# ---------------------------------------------------------------------------
# The label: stamped on every write path, never removable
# ---------------------------------------------------------------------------


def test_create_stamps_the_label(admin_client, db_session):
    body = _create(admin_client)
    assert label_keys_for_entry(db_session, uuid.UUID(body["system_id"])) == [LABEL]
    assert [label["key"] for label in body["content_labels"]] == [LABEL]


def test_update_and_patch_restore_a_label_removed_behind_the_api(admin_client, db_session):
    body = _create(admin_client)
    entry_id = uuid.UUID(body["system_id"])
    for method, payload in (("put", {"h_game_name_en": "x"}), ("patch", {"current_patch": "2"})):
        db_session.query(models.MediaContentLabel).filter_by(media_id=entry_id).delete()
        db_session.flush()
        assert label_keys_for_entry(db_session, entry_id) == []
        response = getattr(admin_client, method)(f"{ROUTE}/{entry_id}", json=payload)
        assert response.status_code == 200, response.text
        assert label_keys_for_entry(db_session, entry_id) == [LABEL], method


def test_the_label_endpoint_refuses_to_remove_it(admin_client, db_session):
    body = _create(admin_client)
    response = admin_client.put(
        f"/api/content-labels/entry/h-game/{body['system_id']}", json={"label_keys": []}
    )
    assert response.status_code == 422
    assert label_keys_for_entry(db_session, uuid.UUID(body["system_id"])) == [LABEL]


def test_the_label_endpoint_accepts_a_set_that_keeps_it(admin_client, db_session, nsfw_label):
    body = _create(admin_client)
    response = admin_client.put(
        f"/api/content-labels/entry/h-game/{body['system_id']}",
        json={"label_keys": [LABEL, "nsfw"]},
    )
    assert response.status_code == 200, response.text
    assert label_keys_for_entry(db_session, uuid.UUID(body["system_id"])) == [LABEL, "nsfw"]


def test_an_h_comic_label_does_not_stand_in_for_the_h_game_one(admin_client):
    """Each gated type requires its own label, not any gated label."""
    body = _create(admin_client)
    response = admin_client.put(
        f"/api/content-labels/entry/h-game/{body['system_id']}",
        json={"label_keys": ["h-comic"]},
    )
    assert response.status_code == 422


def test_the_required_label_cannot_be_deleted(admin_client, db_session):
    label = db_session.query(models.ContentLabel).filter_by(key=LABEL).one()
    response = admin_client.delete(f"/api/content-labels/{label.system_id}")
    assert response.status_code == 409
    assert db_session.query(models.ContentLabel).filter_by(key=LABEL).count() == 1


# ---------------------------------------------------------------------------
# Who sees it
# ---------------------------------------------------------------------------


@pytest.fixture
def labelled_h_game(admin_client, db_session):
    body = _create(admin_client)
    # The set the gate computes over is not empty: the entry carries the label.
    assert label_keys_for_entry(db_session, uuid.UUID(body["system_id"])) == [LABEL]
    return body


def test_a_guest_gets_404_on_the_detail(client, labelled_h_game):
    assert client.get(f"{ROUTE}/{labelled_h_game['public_id']}").status_code == 404


def test_a_guest_does_not_find_it_in_the_list(client, labelled_h_game):
    listed = client.get(f"{ROUTE}/").json()
    assert all(e["system_id"] != labelled_h_game["system_id"] for e in listed)


def test_a_guest_does_not_find_it_in_search(client, labelled_h_game):
    body = client.get("/api/search/", params={"q": "Zvornik"}).json()
    # Not even an empty bucket: that would say the type exists.
    assert "h-game" not in body["results"]


def test_unrestricted_sees_it_everywhere(admin_client, labelled_h_game):
    """The mirror of the three refusals above."""
    assert admin_client.get(f"{ROUTE}/{labelled_h_game['public_id']}").status_code == 200
    listed = admin_client.get(f"{ROUTE}/").json()
    assert any(e["system_id"] == labelled_h_game["system_id"] for e in listed)
    body = admin_client.get("/api/search/", params={"q": "Zvornik"}).json()
    assert [e["system_id"] for e in body["results"]["h-game"]] == [labelled_h_game["system_id"]]


@pytest.mark.parametrize("mode_key", ["safe", "normal", "borderline"])
def test_the_narrower_modes_get_404(mode_client, plain_member, labelled_h_game, mode_key):
    viewer = mode_client(mode_key, user=plain_member)
    assert viewer.get(f"{ROUTE}/{labelled_h_game['public_id']}").status_code == 404
    listed = viewer.get(f"{ROUTE}/").json()
    assert all(e["system_id"] != labelled_h_game["system_id"] for e in listed)


def test_the_unrestricted_mode_sees_it(mode_client, plain_member, labelled_h_game):
    """The mirror, through the same mode-client path as the refusals."""
    viewer = mode_client("unrestricted", user=plain_member)
    assert viewer.get(f"{ROUTE}/{labelled_h_game['public_id']}").status_code == 200


def test_only_unrestricted_carries_the_h_game_label(db_session):
    """Re-running the seed - a boot - must not hand `borderline` the label."""
    label = db_session.query(models.ContentLabel).filter_by(key=LABEL).one()
    ensure_access_mode_seed(db_session)
    rbac_cache.bump()
    carrying = {
        mode.key
        for mode in db_session.query(models.AccessMode)
        if label.system_id in rbac_cache.mode_sets(db_session, mode.system_id).label_ids
    }
    assert carrying == {"unrestricted"}


def test_me_names_h_game_for_unrestricted(admin_client):
    assert "h-game" in admin_client.get("/api/auth/me").json()["visible_gated_types"]


def test_me_names_nothing_for_borderline(mode_client, plain_member):
    viewer = mode_client("borderline", user=plain_member)
    assert viewer.get("/api/auth/me").json()["visible_gated_types"] == []


# ---------------------------------------------------------------------------
# Franchises: the h-game family
# ---------------------------------------------------------------------------


def _franchise(db_session, franchise_type, name="Fate"):
    franchise = models.Franchise(
        system_id=uuid.uuid4(), franchise_type=franchise_type, franchise_name_en=name
    )
    db_session.add(franchise)
    db_session.flush()
    return franchise


def test_an_auto_created_franchise_is_typed_and_labelled(admin_client, db_session):
    body = _create(admin_client)
    franchise = db_session.get(models.Franchise, uuid.UUID(body["franchise_id"]))
    assert franchise.franchise_type == "H-Game"
    assert label_keys_for_franchise(db_session, franchise.system_id) == [LABEL]


@pytest.mark.parametrize("other_type", ["Game", "H-Comic"])
def test_an_h_game_never_attaches_by_name_to_another_family(admin_client, db_session, other_type):
    other = _franchise(db_session, other_type)
    body = _create(admin_client, h_game_name_cn=None, h_game_name_en="Fate")
    assert body["franchise_id"] != str(other.system_id)
    created = db_session.get(models.Franchise, uuid.UUID(body["franchise_id"]))
    assert created.franchise_type == "H-Game"


def test_an_h_game_attaches_to_an_h_game_franchise_of_that_name(admin_client, db_session):
    """The mirror: the resolver does match, within its own family."""
    own = _franchise(db_session, "H-Game")
    body = _create(admin_client, h_game_name_cn=None, h_game_name_en="Fate")
    assert body["franchise_id"] == str(own.system_id)


@pytest.mark.parametrize(
    "route,payload",
    [
        ("/api/game/", {"game_name_en": "Fate"}),
        ("/api/h-comic/", {"h_comic_name_en": "Fate", "region": "JP"}),
    ],
)
def test_another_family_never_attaches_by_name_to_an_h_game_franchise(
    admin_client, db_session, route, payload
):
    own = _franchise(db_session, "H-Game")
    body = admin_client.post(route, json=payload).json()
    assert body["franchise_id"] != str(own.system_id)


@pytest.mark.parametrize("other_type", ["Game", "H-Comic"])
def test_another_familys_franchise_named_by_id_is_refused(admin_client, db_session, other_type):
    other = _franchise(db_session, other_type)
    response = admin_client.post(
        f"{ROUTE}/", json={"h_game_name_cn": TITLE, "franchise_id": str(other.system_id)}
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "route,payload",
    [
        ("/api/game/", {"game_name_en": "Fate"}),
        ("/api/h-comic/", {"h_comic_name_en": "Fate", "region": "JP"}),
    ],
)
def test_an_h_game_franchise_named_by_id_from_another_family_is_refused(
    admin_client, db_session, route, payload
):
    own = _franchise(db_session, "H-Game")
    response = admin_client.post(route, json={**payload, "franchise_id": str(own.system_id)})
    assert response.status_code == 422


def test_an_h_game_franchise_named_by_id_is_accepted(admin_client, db_session):
    """The mirror of the by-id refusals."""
    own = _franchise(db_session, "H-Game")
    body = _create(admin_client, franchise_id=str(own.system_id))
    assert body["franchise_id"] == str(own.system_id)


@pytest.mark.parametrize("franchise_type", ["Game, H-Game", "H-Comic, H-Game"])
def test_a_franchise_mixing_h_game_with_another_family_is_refused(admin_client, franchise_type):
    response = admin_client.post(
        "/api/franchise/",
        json={"franchise_name_en": "Zvornik Mixed", "franchise_type": franchise_type},
    )
    assert response.status_code == 422


@pytest.mark.parametrize("method", ["put", "patch"])
def test_a_franchise_holding_an_h_game_cannot_be_retyped_out_of_its_family(
    admin_client, method
):
    body = _create(admin_client)
    for other in ("Game", "H-Comic"):
        response = getattr(admin_client, method)(
            f"/api/franchise/{body['franchise_id']}", json={"franchise_type": other}
        )
        assert response.status_code == 422, other


@pytest.mark.parametrize("method", ["put", "patch"])
def test_a_franchise_holding_a_game_cannot_be_retyped_into_h_game(admin_client, method):
    game = admin_client.post("/api/game/", json={"game_name_en": "Zvornik Retype"}).json()
    response = getattr(admin_client, method)(
        f"/api/franchise/{game['franchise_id']}", json={"franchise_type": "H-Game"}
    )
    assert response.status_code == 422


@pytest.mark.parametrize("method", ["put", "patch"])
def test_an_empty_franchise_can_become_h_game(admin_client, db_session, method):
    """The mirror: the refusals above are about the entries held."""
    empty = _franchise(db_session, "Game", name="Zvornik Empty")
    response = getattr(admin_client, method)(
        f"/api/franchise/{empty.system_id}", json={"franchise_type": "H-Game"}
    )
    assert response.status_code == 200, response.text
    assert label_keys_for_franchise(db_session, empty.system_id) == [LABEL]


def test_a_franchise_created_with_the_type_carries_the_label(admin_client, db_session):
    created = admin_client.post(
        "/api/franchise/", json={"franchise_name_en": "Zvornik G", "franchise_type": "H-Game"}
    ).json()
    assert label_keys_for_franchise(db_session, uuid.UUID(created["system_id"])) == [LABEL]


def test_an_h_game_franchise_hides_from_a_guest(client, admin_client, db_session):
    body = _create(admin_client)
    franchise_id = body["franchise_id"]
    assert label_keys_for_franchise(db_session, uuid.UUID(franchise_id)) == [LABEL]
    assert client.get(f"/api/franchise/{franchise_id}").status_code == 404
    assert admin_client.get(f"/api/franchise/{franchise_id}").status_code == 200


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


def test_duplicates_key_on_series_number(db_session, sample_franchise):
    from app.services.domain.duplicates import find_all_duplicates, find_duplicate_h_game

    def add(number, name):
        entry = models.HGame(
            franchise_id=sample_franchise.system_id, series_number=number, h_game_name_cn=name
        )
        db_session.add(entry)
        return entry

    a = add(1, "Same")
    b = add(1, "same")
    add(2, "Same")  # another number in the series: not a duplicate
    db_session.flush()

    clusters = find_duplicate_h_game(db_session)
    assert len(clusters) == 1
    assert {row["system_id"] for row in clusters[0]} == {str(a.system_id), str(b.system_id)}
    assert "h_game" in find_all_duplicates(db_session)


def test_plan_next_flags_play_next_and_to_replay(admin_client):
    body = _create(admin_client)
    response = admin_client.put(
        f"{ROUTE}/{body['system_id']}", json={"play_next": True, "to_replay": True}
    )
    assert response.status_code == 200, response.text
    assert response.json()["play_next"] is True
    assert response.json()["to_replay"] is True


def test_the_igdb_search_is_catalogue_editors_only(client, admin_client, monkeypatch):
    from app.routers import h_game as h_game_router

    monkeypatch.setattr(h_game_router, "search_igdb_games", lambda q, limit: [{"id": 1, "name": q}])
    assert client.get(f"{ROUTE}/search-igdb", params={"q": "x"}).status_code in (401, 403)
    response = admin_client.get(f"{ROUTE}/search-igdb", params={"q": "x"})
    assert response.status_code == 200
    assert response.json() == [{"id": 1, "name": "x"}]
