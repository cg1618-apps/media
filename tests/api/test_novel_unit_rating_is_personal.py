"""A unit rating belongs to the reader, not to the unit.

A unit's rating and remark are one reader's opinion of one volume or arc, so
they live on that reader's user_novel_unit_rating row, never on the novel_unit
row everybody shares. They cannot move to user_media_list, which is keyed by
media_id, because a unit is a part of an entry rather than an entry.

The catalogue write of a novel's units carries none of it: a units item that
names my_rating or remark has those keys ignored, the way every catalogue
write ignores a personal field. The only write is
PUT /api/me/novel-units/{unit_id}, behind self.list.
"""

import pytest

from app import models
from app.services.rbac.permissions import (
    PERM_MANAGE_CATALOG,
    PERM_SELF_LIST,
    media_type_perm,
)
from tests.api.conftest import ALL_VIEW_PERMISSIONS, make_viewer


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def novel_with_arcs(owner_client):
    response = owner_client.post(
        "/api/novel/",
        json={
            "novel_name_en": "Unit Rating Sentinel",
            "type": "Web",
            "units": [
                {"unit_kind": "arc", "position": 1, "name_en": "Arc One",
                 "ch_count": 10},
                {"unit_kind": "arc", "position": 2, "name_en": "Arc Two",
                 "ch_count": 12},
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _unit(db, name):
    return db.query(models.NovelUnit).filter(models.NovelUnit.name_en == name).one()


def _ratings_for(db, unit_id):
    return db.query(models.UserNovelUnitRating).filter(
        models.UserNovelUnitRating.unit_id == unit_id
    ).all()


def test_the_unit_row_carries_no_rating_column(db, novel_with_arcs):
    unit = _unit(db, "Arc One")
    assert not hasattr(unit, "my_rating")
    assert "remark" not in models.NovelUnit.__table__.c


def test_the_rating_lands_in_the_readers_own_row(
    db, novel_with_arcs, user_client, plain_user
):
    unit = _unit(db, "Arc One")
    r = user_client.put(f"/api/me/novel-units/{unit.system_id}", json={"my_rating": "A"})
    assert r.status_code == 200, r.text
    (rating,) = _ratings_for(db, unit.system_id)
    assert rating.my_rating == "A"
    assert rating.user_id == plain_user.id


def test_the_response_carries_the_readers_my_rating_on_each_unit(
    db, novel_with_arcs, user_client
):
    unit = _unit(db, "Arc One")
    user_client.put(f"/api/me/novel-units/{unit.system_id}", json={"my_rating": "A"})
    units = user_client.get(f"/api/novel/{novel_with_arcs['system_id']}").json()["units"]
    by_name = {u["name_en"]: u for u in units}
    assert by_name["Arc One"]["my_rating"] == "A"
    assert by_name["Arc Two"]["my_rating"] is None


def test_an_unrated_unit_stores_no_row(db, novel_with_arcs):
    """A null rating is nothing to record; only a real grade earns a row."""
    assert _ratings_for(db, _unit(db, "Arc Two").system_id) == []


def test_deleting_the_unit_removes_the_rating(db, novel_with_arcs, user_client):
    unit = _unit(db, "Arc One")
    unit_id = unit.system_id
    user_client.put(f"/api/me/novel-units/{unit_id}", json={"my_rating": "A"})
    assert len(_ratings_for(db, unit_id)) == 1
    db.delete(unit)
    db.commit()
    assert _ratings_for(db, unit_id) == []


# --- The catalogue units write carries no personal values ---------------------


@pytest.mark.parametrize("method", ["post", "put", "patch"])
def test_a_catalogue_units_save_creates_no_rating_row(db, owner_client, method):
    """my_rating and remark on a units item are ignored, by every write
    verb. The owner holds self.list, so it could keep a rating - and still
    gets no row through the catalogue."""
    units = [{"unit_kind": "arc", "position": 1, "name_en": "Arc One",
              "ch_count": 10, "my_rating": "S", "remark": "admin note"}]
    if method == "post":
        r = owner_client.post(
            "/api/novel/",
            json={"novel_name_en": "Admin Units", "type": "Web", "units": units},
        )
        assert r.status_code == 201, r.text
    else:
        novel = owner_client.post(
            "/api/novel/", json={"novel_name_en": "Admin Units", "type": "Web"}
        ).json()
        body = {"units": units}
        if method == "put":
            body.update(novel_name_en="Admin Units", type="Web")
        r = getattr(owner_client, method)(f"/api/novel/{novel['system_id']}", json=body)
        assert r.status_code == 200, r.text

    # The unit itself was written, so the save did run.
    unit = _unit(db, "Arc One")
    assert _ratings_for(db, unit.system_id) == []
    assert db.query(models.UserNovelUnitRating).count() == 0
    assert (r.json()["units"][0]["my_rating"], r.json()["units"][0]["remark"]) == (
        None, None
    )


@pytest.mark.parametrize("method", ["put", "patch"])
def test_a_readers_unit_rating_survives_a_catalogue_units_save(
    db, novel_with_arcs, owner_client, user_client, plain_user, method
):
    """The row exists first, so a save that cleared it would be seen."""
    unit = _unit(db, "Arc One")
    r = user_client.put(
        f"/api/me/novel-units/{unit.system_id}",
        json={"my_rating": "A", "remark": "mine"},
    )
    assert r.status_code == 200, r.text

    body = {"units": [
        {"system_id": str(unit.system_id), "unit_kind": "arc", "position": 1,
         "name_en": "Arc One renamed", "ch_count": 10},
        {"system_id": str(_unit(db, "Arc Two").system_id), "unit_kind": "arc",
         "position": 2, "name_en": "Arc Two", "ch_count": 12},
    ]}
    if method == "put":
        body.update(novel_name_en="Unit Rating Sentinel", type="Web")
    r = getattr(owner_client, method)(
        f"/api/novel/{novel_with_arcs['system_id']}", json=body
    )
    assert r.status_code == 200, r.text
    db.expire_all()
    assert _unit(db, "Arc One renamed").system_id == unit.system_id

    (row,) = _ratings_for(db, unit.system_id)
    assert (row.user_id, row.my_rating, row.remark) == (plain_user.id, "A", "mine")
    mine = user_client.get(f"/api/novel/{novel_with_arcs['system_id']}").json()
    by_id = {u["system_id"]: u for u in mine["units"]}
    assert (by_id[str(unit.system_id)]["my_rating"],
            by_id[str(unit.system_id)]["remark"]) == ("A", "mine")


@pytest.mark.parametrize("method", ["put", "patch"])
def test_an_editors_own_unit_rating_survives_their_units_save(
    db, novel_with_arcs, client, method
):
    """An account holding both manage.catalog and self.list rates a unit,
    then saves the novel's units with items that name no rating. The save is
    about the catalogue, so the editor's own rating and remark stay."""
    editor = make_viewer(
        db, client, "uniteditor",
        {PERM_MANAGE_CATALOG, PERM_SELF_LIST, media_type_perm("novel"),
         *ALL_VIEW_PERMISSIONS},
    )
    unit = _unit(db, "Arc One")
    r = editor.put(
        f"/api/me/novel-units/{unit.system_id}",
        json={"my_rating": "B", "remark": "editor's own"},
    )
    assert r.status_code == 200, r.text

    body = {"units": [
        {"system_id": str(unit.system_id), "unit_kind": "arc", "position": 1,
         "name_en": "Arc One", "ch_count": 10},
    ]}
    if method == "put":
        body.update(novel_name_en="Unit Rating Sentinel", type="Web")
    r = getattr(editor, method)(f"/api/novel/{novel_with_arcs['system_id']}", json=body)
    assert r.status_code == 200, r.text

    saved = r.json()["units"][0]
    assert (saved["my_rating"], saved["remark"]) == ("B", "editor's own")
    db.expire_all()
    (row,) = _ratings_for(db, unit.system_id)
    assert (row.my_rating, row.remark) == ("B", "editor's own")
