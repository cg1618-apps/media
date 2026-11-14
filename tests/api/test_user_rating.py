"""
Ratings and expectations belong to an account (user_rating), and a novel
unit's rating and remark to a reader (user_novel_unit_rating).

Every read keeps the old field names - my_rating, collection_expectation,
franchise_expectation, series_expectation, a unit's remark - filled with the
VIEWER'S own value, null with nobody asking. Every write goes through
PUT /api/me/ratings/... and /api/me/novel-units/..., behind self.list.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app import models
from app.main import app
from app.services.domain.gated_labels import ensure_label
from app.services.rbac.permissions import PERM_SELF_LIST
from app.services.security import create_access_token, get_password_hash
from app.utils.constants import FRANCHISE_EXPECTATIONS, MY_RATINGS
from tests.api.conftest import (
    make_guest_reader,
    make_viewer,
    role_id_for,
    seed_modes_and_grant,
)

OWNER_TYPES = (
    "collection",
    "franchise",
    "series",
    "character",
    "person",
    "studio",
    "publisher",
)


@pytest.fixture(autouse=True)
def _members_open_entity_pages(db_session):
    """The seeded `user` role holds no entity-page key (an admin turns each
    on); these tests are about whose rating a viewer reads and writes, so
    `user` holds all four here and an entity's GET answers it."""
    from app.services.rbac import cache as rbac_cache
    from app.services.rbac.permissions import ENTITY_VIEW_KEYS, view_perm

    role = db_session.query(models.Role).filter(models.Role.name == "user").one()
    held = {
        r.permission
        for r in db_session.query(models.RolePermission).filter(
            models.RolePermission.role_id == role.system_id
        )
    }
    for key in ENTITY_VIEW_KEYS:
        if view_perm(key) not in held:
            db_session.add(
                models.RolePermission(role_id=role.system_id, permission=view_perm(key))
            )
    db_session.flush()
    rbac_cache.bump()


def _account(db, username, role="user"):
    user = models.User(
        id=uuid.uuid4(),
        username=username,
        hashed_password=get_password_hash("x"),
        role_id=role_id_for(db, role),
    )
    db.add(user)
    db.flush()
    return user


def _login(db, user, role="user"):
    """A second signed-in client. The `client` fixture must be requested too:
    it installs the database override every TestClient here shares."""
    mode_id = seed_modes_and_grant(db, user)
    token = create_access_token(
        {"sub": user.username, "role": role, "mode": str(mode_id or "")}
    )
    c = TestClient(app)
    c.cookies.set("access_token", f"Bearer {token}")
    return c


@pytest.fixture
def kana(db_session):
    return _account(db_session, "kana_rater")


@pytest.fixture
def kana_client(db_session, client, kana):
    return _login(db_session, kana)


@pytest.fixture
def owners(db_session):
    """One of every owner type, each with a name its search can find."""
    collection = models.Collection(
        system_id=uuid.uuid4(), collection_name_en="Ratable Collection"
    )
    franchise = models.Franchise(
        system_id=uuid.uuid4(),
        franchise_type="ACG",
        franchise_name_en="Ratable Franchise",
    )
    db_session.add_all([collection, franchise])
    db_session.flush()
    series = models.Series(
        system_id=uuid.uuid4(),
        franchise_id=franchise.system_id,
        series_name_en="Ratable Series",
    )
    character = models.Character(system_id=uuid.uuid4(), name_en="Ratable Character")
    person = models.Person(system_id=uuid.uuid4(), name_en="Ratable Person")
    studio = models.Studio(system_id=uuid.uuid4(), name_en="Ratable Studio")
    publisher = models.Publisher(system_id=uuid.uuid4(), name_en="Ratable Publisher")
    db_session.add_all([series, character, person, studio, publisher])
    db_session.flush()
    return {
        "collection": collection,
        "franchise": franchise,
        "series": series,
        "character": character,
        "person": person,
        "studio": studio,
        "publisher": publisher,
    }


def _put(c, owner_type, owner_id, body):
    return c.put(f"/api/me/ratings/{owner_type}/{owner_id}", json=body)


def _row(db, user, owner_type, owner_id):
    column = getattr(models.UserRating, f"{owner_type}_id")
    return (
        db.query(models.UserRating)
        .filter(models.UserRating.user_id == user.id, column == owner_id)
        .first()
    )


# --- Each account reads its own --------------------------------------------


def test_two_accounts_rate_one_franchise_and_each_reads_its_own(
    db_session, user_client, plain_user, kana_client, kana, owners
):
    fid = owners["franchise"].system_id
    assert _put(user_client, "franchise", fid,
                {"my_rating": "S", "expectation": "Highest"}).status_code == 200
    assert _put(kana_client, "franchise", fid,
                {"my_rating": "C", "expectation": "Low"}).status_code == 200

    for c, rating, expectation in (
        (user_client, "S", "Highest"),
        (kana_client, "C", "Low"),
    ):
        detail = c.get(f"/api/franchise/{fid}").json()
        assert (detail["my_rating"], detail["franchise_expectation"]) == (
            rating, expectation
        )
        listed = {
            f["system_id"]: f for f in c.get("/api/franchise/").json()
        }[str(fid)]
        assert (listed["my_rating"], listed["franchise_expectation"]) == (
            rating, expectation
        )
        found = c.get("/api/search/", params={"q": "Ratable Franchise"}).json()
        bucket = {f["system_id"]: f for f in found["results"]["franchise"]}
        assert bucket[str(fid)]["my_rating"] == rating
        assert bucket[str(fid)]["franchise_expectation"] == expectation


@pytest.mark.parametrize("owner_type", OWNER_TYPES)
def test_every_owner_type_reads_back_the_viewers_own_rating(
    db_session, user_client, kana_client, owner_type, owners
):
    owner_id = owners[owner_type].system_id
    path = {"series": "series", "person": "person"}.get(owner_type, owner_type)
    assert _put(kana_client, owner_type, owner_id, {"my_rating": "E"}).status_code == 200
    assert _put(user_client, owner_type, owner_id, {"my_rating": "A+"}).status_code == 200

    detail = user_client.get(f"/api/{path}/{owner_id}").json()
    assert detail["my_rating"] == "A+"
    listed = {r["system_id"]: r for r in user_client.get(f"/api/{path}/").json()}
    assert listed[str(owner_id)]["my_rating"] == "A+"


def test_a_guest_reads_null(db_session, client, user_client, owners):
    """Load-bearing: a row EXISTS, so the null is the guest being told nothing,
    not an owner nobody rated."""
    fid = owners["franchise"].system_id
    _put(user_client, "franchise", fid, {"my_rating": "S", "expectation": "High"})

    detail = client.get(f"/api/franchise/{fid}").json()
    assert detail["my_rating"] is None
    assert detail["franchise_expectation"] is None
    listed = {f["system_id"]: f for f in client.get("/api/franchise/").json()}
    assert listed[str(fid)]["my_rating"] is None


def test_search_related_franchises_carry_the_viewers_own_rating(
    db_session, user_client, owners
):
    franchise = owners["franchise"]
    db_session.add(
        models.Anime(
            system_id=uuid.uuid4(),
            franchise_id=franchise.system_id,
            anime_name_en="Ratable Anime",
        )
    )
    db_session.flush()
    _put(user_client, "franchise", franchise.system_id, {"my_rating": "B"})

    found = user_client.get("/api/search/", params={"q": "Ratable Anime"}).json()
    related = {f["system_id"]: f for f in found["related_franchises"]}
    assert related[str(franchise.system_id)]["my_rating"] == "B"


def test_search_entity_buckets_carry_the_viewers_own_rating(
    db_session, user_client, owners
):
    for owner_type in ("person", "studio", "publisher", "character"):
        _put(user_client, owner_type, owners[owner_type].system_id, {"my_rating": "D"})

    found = user_client.get(
        "/api/search/", params={"q": "Ratable", "characters": True}
    ).json()
    for owner_type in ("person", "studio", "publisher", "character"):
        bucket = {r["system_id"]: r for r in found["results"][owner_type]}
        assert bucket[str(owners[owner_type].system_id)]["my_rating"] == "D"


# --- The write gate ---------------------------------------------------------


def test_a_write_without_self_list_is_401_and_changes_nothing(
    db_session, client, user_client, plain_user, owners
):
    """The row EXISTS before the refused write, so a 401 that still wrote -
    or wrote over the other account's row - would show."""
    fid = owners["franchise"].system_id
    _put(user_client, "franchise", fid, {"my_rating": "S"})
    reader = make_guest_reader(db_session, client, username="norating")

    r = _put(reader, "franchise", fid, {"my_rating": "F"})

    assert r.status_code == 401
    assert _row(db_session, plain_user, "franchise", fid).my_rating == "S"
    assert db_session.query(models.UserRating).count() == 1


def test_the_mirror_a_self_list_holder_writes(db_session, user_client, plain_user, owners):
    fid = owners["franchise"].system_id
    r = _put(user_client, "franchise", fid, {"my_rating": "S"})
    assert r.status_code == 200
    assert r.json() == {
        "owner_type": "franchise",
        "owner_id": str(fid),
        "my_rating": "S",
        "expectation": None,
    }
    assert _row(db_session, plain_user, "franchise", fid).my_rating == "S"


def test_a_logged_out_write_is_401(client, owners):
    assert _put(client, "franchise", owners["franchise"].system_id,
                {"my_rating": "S"}).status_code == 401


def test_the_admin_holds_no_self_list_and_is_refused(
    db_session, admin_client, user_client, owners
):
    """
    The admin holds no self.* permission: an administrative account keeps
    no list, no plan queue and no ratings of its own. So it is refused here
    as it is on /api/me/list.
    """
    fid = owners["franchise"].system_id
    _put(user_client, "franchise", fid, {"my_rating": "S"})
    assert _put(admin_client, "franchise", fid, {"my_rating": "A"}).status_code == 401
    assert db_session.query(models.UserRating).count() == 1


def test_super_holds_self_list_and_rates(db_session, super_client, super_user, owners):
    fid = owners["franchise"].system_id
    assert _put(super_client, "franchise", fid, {"my_rating": "A"}).status_code == 200
    assert _row(db_session, super_user, "franchise", fid).my_rating == "A"


# --- Vocabulary and shape ----------------------------------------------------


@pytest.mark.parametrize("owner_type", OWNER_TYPES)
def test_a_rating_outside_the_vocabulary_is_422(user_client, owners, owner_type):
    r = _put(user_client, owner_type, owners[owner_type].system_id, {"my_rating": "Z"})
    assert r.status_code == 422


@pytest.mark.parametrize("owner_type", OWNER_TYPES)
def test_every_rating_in_the_vocabulary_is_accepted(user_client, owners, owner_type):
    for rating in MY_RATINGS:
        r = _put(user_client, owner_type, owners[owner_type].system_id,
                 {"my_rating": rating})
        assert r.status_code == 200, rating


@pytest.mark.parametrize("owner_type", ("character", "person", "studio", "publisher"))
def test_an_expectation_on_an_entity_is_422(db_session, user_client, owners, owner_type):
    r = _put(user_client, owner_type, owners[owner_type].system_id,
             {"expectation": "High"})
    assert r.status_code == 422
    assert db_session.query(models.UserRating).count() == 0


@pytest.mark.parametrize("owner_type", ("collection", "franchise", "series"))
def test_an_expectation_on_a_tier_is_accepted(
    db_session, user_client, plain_user, owners, owner_type
):
    owner_id = owners[owner_type].system_id
    for expectation in FRANCHISE_EXPECTATIONS:
        assert _put(user_client, owner_type, owner_id,
                    {"expectation": expectation}).status_code == 200
    assert _row(db_session, plain_user, owner_type, owner_id).expectation == "Low"
    assert _put(user_client, owner_type, owner_id,
                {"expectation": "Enormous"}).status_code == 422


def test_an_unknown_key_is_422(user_client, owners):
    r = _put(user_client, "franchise", owners["franchise"].system_id, {"rating": "S"})
    assert r.status_code == 422


def test_an_unknown_owner_type_or_id_is_404(user_client, owners):
    assert _put(user_client, "anime", owners["franchise"].system_id,
                {"my_rating": "S"}).status_code == 404
    assert _put(user_client, "franchise", uuid.uuid4(),
                {"my_rating": "S"}).status_code == 404


def test_a_partial_write_leaves_the_other_value(db_session, user_client, plain_user, owners):
    sid = owners["series"].system_id
    _put(user_client, "series", sid, {"my_rating": "A", "expectation": "High"})

    r = _put(user_client, "series", sid, {"my_rating": "B"})
    assert r.json()["expectation"] == "High"
    r = _put(user_client, "series", sid, {"expectation": "Medium"})
    assert r.json()["my_rating"] == "B"

    row = _row(db_session, plain_user, "series", sid)
    assert (row.my_rating, row.expectation) == ("B", "Medium")


def test_clearing_both_values_deletes_the_row(db_session, user_client, plain_user, owners):
    sid = owners["series"].system_id
    _put(user_client, "series", sid, {"my_rating": "A", "expectation": "High"})
    _put(user_client, "series", sid, {"my_rating": None})
    assert _row(db_session, plain_user, "series", sid) is not None

    r = _put(user_client, "series", sid, {"expectation": ""})

    assert r.status_code == 200
    assert r.json()["my_rating"] is None and r.json()["expectation"] is None
    assert _row(db_session, plain_user, "series", sid) is None


def test_a_hidden_franchise_is_404_on_write(db_session, client):
    """Writes follow reads: the franchise GET 404s for this viewer, so does
    the rating. The viewer holds self.list but a mode without the label, and
    the mirror - a labelled franchise it CAN see - is the tier test above.
    `erotica`, not `nsfw`: a member's `normal` mode shows nsfw."""
    erotica = ensure_label(db_session, "erotica")
    hidden = models.Franchise(
        system_id=uuid.uuid4(), franchise_type="ACG", franchise_name_en="Hidden"
    )
    db_session.add(hidden)
    db_session.flush()
    db_session.add(
        models.FranchiseContentLabel(
            franchise_id=hidden.system_id, label_id=erotica.system_id
        )
    )
    db_session.flush()
    narrow = make_viewer(
        db_session, client, "narrowrater", {PERM_SELF_LIST}, label_keys=[]
    )
    assert narrow.get(f"/api/franchise/{hidden.system_id}").status_code == 404

    r = _put(narrow, "franchise", hidden.system_id, {"my_rating": "S"})

    assert r.status_code == 404
    assert db_session.query(models.UserRating).count() == 0


# --- Catalogue writes no longer carry them ----------------------------------


def test_a_catalogue_write_ignores_a_rating(db_session, owner_client, owners):
    fid = owners["franchise"].system_id
    r = owner_client.patch(f"/api/franchise/{fid}", json={"my_rating": "S"})
    assert r.status_code == 200
    r = owner_client.put(
        f"/api/franchise/{fid}",
        json={"franchise_name_en": "Ratable Franchise", "franchise_type": "ACG",
              "my_rating": "S", "franchise_expectation": "High"},
    )
    assert r.status_code == 200
    r = owner_client.patch(
        f"/api/person/{owners['person'].system_id}", json={"my_rating": "not one"}
    )
    assert r.status_code == 200
    assert db_session.query(models.UserRating).count() == 0


# --- Plan Next ----------------------------------------------------------------


def test_plan_next_carries_the_callers_own_expectation(
    db_session, user_client, kana_client, owners
):
    franchise = owners["franchise"]
    _put(user_client, "franchise", franchise.system_id, {"expectation": "Highest"})
    _put(kana_client, "franchise", franchise.system_id, {"expectation": "Low"})
    for c in (user_client, kana_client):
        r = c.post(
            "/api/plan-next/",
            json={"scope": "franchise", "media_type": "anime",
                  "target_id": str(franchise.system_id), "kind": "next"},
        )
        assert r.status_code == 201, r.text

    mine = user_client.get("/api/plan-next/").json()
    theirs = kana_client.get("/api/plan-next/").json()
    assert [p["expectation"] for p in mine] == ["Highest"]
    assert [p["expectation"] for p in theirs] == ["Low"]


# --- Merges -------------------------------------------------------------------


def test_a_merge_moves_the_losers_ratings_where_the_survivor_has_none(
    db_session, owner_client, user_client, plain_user, kana_client, kana
):
    keep = models.Studio(system_id=uuid.uuid4(), name_en="Keep Studio")
    drop = models.Studio(system_id=uuid.uuid4(), name_en="Drop Studio")
    db_session.add_all([keep, drop])
    db_session.flush()
    # plainuser rated both: the survivor's rating wins. kana rated only the
    # loser: it moves.
    _put(user_client, "studio", keep.system_id, {"my_rating": "S"})
    _put(user_client, "studio", drop.system_id, {"my_rating": "F"})
    _put(kana_client, "studio", drop.system_id, {"my_rating": "B"})

    r = owner_client.post(
        f"/api/studio/{keep.system_id}/merge", json={"source_id": str(drop.system_id)}
    )
    assert r.status_code == 200, r.text

    db_session.expire_all()
    assert _row(db_session, plain_user, "studio", keep.system_id).my_rating == "S"
    assert _row(db_session, kana, "studio", keep.system_id).my_rating == "B"
    assert db_session.query(models.UserRating).count() == 2


def test_a_character_merge_moves_ratings_too(
    db_session, owner_client, kana_client, kana, character, second_character
):
    _put(kana_client, "character", second_character.system_id, {"my_rating": "A"})

    r = owner_client.post(
        f"/api/character/{character.system_id}/merge",
        json={"source_id": str(second_character.system_id)},
    )
    assert r.status_code == 200, r.text

    db_session.expire_all()
    assert _row(db_session, kana, "character", character.system_id).my_rating == "A"


# --- Novel units --------------------------------------------------------------


@pytest.fixture
def novel_unit(db_session, sample_franchise):
    novel = models.Novel(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        novel_name_en="Ratable Novel",
    )
    db_session.add(novel)
    db_session.flush()
    unit = models.NovelUnit(
        system_id=uuid.uuid4(), novel_id=novel.system_id, unit_kind="volume", position=1
    )
    db_session.add(unit)
    db_session.flush()
    return novel, unit


def _unit_row(db, user, unit):
    return (
        db.query(models.UserNovelUnitRating)
        .filter_by(user_id=user.id, unit_id=unit.system_id)
        .first()
    )


def test_two_readers_keep_their_own_unit_rating_and_remark(
    db_session, client, user_client, kana_client, novel_unit
):
    novel, unit = novel_unit
    r = user_client.put(f"/api/me/novel-units/{unit.system_id}",
                        json={"my_rating": "A", "remark": "mine"})
    assert r.status_code == 200
    assert r.json() == {"unit_id": str(unit.system_id), "my_rating": "A", "remark": "mine"}
    kana_client.put(f"/api/me/novel-units/{unit.system_id}", json={"remark": "kana's"})

    def unit_of(c):
        return c.get(f"/api/novel/{novel.system_id}").json()["units"][0]

    assert (unit_of(user_client)["my_rating"], unit_of(user_client)["remark"]) == ("A", "mine")
    assert (unit_of(kana_client)["my_rating"], unit_of(kana_client)["remark"]) == (None, "kana's")
    assert (unit_of(client)["my_rating"], unit_of(client)["remark"]) == (None, None)


def test_a_unit_write_is_partial_and_clearing_both_deletes_the_row(
    db_session, user_client, plain_user, novel_unit
):
    _novel, unit = novel_unit
    path = f"/api/me/novel-units/{unit.system_id}"
    user_client.put(path, json={"my_rating": "A", "remark": "x"})
    assert user_client.put(path, json={"my_rating": None}).json()["remark"] == "x"
    assert _unit_row(db_session, plain_user, unit) is not None

    user_client.put(path, json={"remark": ""})

    assert _unit_row(db_session, plain_user, unit) is None


def test_a_unit_write_needs_self_list_and_a_known_rating(
    db_session, client, user_client, plain_user, novel_unit
):
    _novel, unit = novel_unit
    path = f"/api/me/novel-units/{unit.system_id}"
    user_client.put(path, json={"my_rating": "A"})
    reader = make_guest_reader(db_session, client, username="nounitrating")

    assert reader.put(path, json={"my_rating": "F"}).status_code == 401
    assert _unit_row(db_session, plain_user, unit).my_rating == "A"
    assert user_client.put(path, json={"my_rating": "Z"}).status_code == 422
    assert user_client.put(f"/api/me/novel-units/{uuid.uuid4()}",
                           json={"my_rating": "A"}).status_code == 404


def test_the_novel_write_carries_no_unit_rating_or_remark(
    db_session, owner_client, novel_unit
):
    """The catalogue write's units payload ignores a rating and a remark -
    they belong to a reader and are written only through /api/me."""
    novel, unit = novel_unit
    r = owner_client.patch(
        f"/api/novel/{novel.system_id}",
        json={"units": [{"system_id": str(unit.system_id), "unit_kind": "volume",
                         "position": 1, "my_rating": "S", "remark": "admin note"}]},
    )
    assert r.status_code == 200, r.text
    assert (r.json()["units"][0]["my_rating"], r.json()["units"][0]["remark"]) == (
        None, None
    )
    assert db_session.query(models.UserNovelUnitRating).count() == 0
    assert "remark" not in models.NovelUnit.__table__.c
