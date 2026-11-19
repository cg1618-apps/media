"""
待補充 Needs Work: an entry or group marked as not complete yet, with an
optional note the review page groups by.

Every route needs manage.requests, which only the `super` and `admin` roles
hold. The admin account reads no catalogue, and still reads this page: it
names its rows the way the request inbox names its targets.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models
from app.utils.media_resolver import MEDIA_TABLES, OWNER_TABLES

URL = "/api/needs-work"


@pytest.fixture
def db(db_session):
    return db_session


def _mark(db, note=None, **owner_column):
    row = models.NeedsWork(system_id=uuid.uuid4(), note=note, **owner_column)
    db.add(row)
    db.flush()
    return row


@pytest.fixture
def marked(db, sample_anime, sample_franchise):
    """
    Two marks, one on an entry and one on a group, under one note.

    Load-bearing for every refusal test below: the table is NOT empty, so a
    401 is the gate's doing rather than an empty answer, and the mirror tests
    read the same rows back for super and the admin.
    """
    return [
        _mark(db, note="續集未補", media_id=sample_anime.system_id),
        _mark(db, note="續集未補", franchise_id=sample_franchise.system_id
        ),
    ]


def _owner_of(db, owner_type):
    """One fresh row of any OWNER_TABLES type, named so it can be found."""
    ref = OWNER_TABLES[owner_type]
    row = ref.model(system_id=uuid.uuid4())
    if owner_type == "series":
        franchise = models.Franchise(system_id=uuid.uuid4(), franchise_type="Anime")
        db.add(franchise)
        db.flush()
        row.franchise_id = franchise.system_id
    db.add(row)
    db.flush()
    return row


# --- Set, read, clear --------------------------------------------------------


def test_an_entry_is_marked_with_a_note_and_read_back(owner_client, sample_anime):
    path = f"{URL}/anime/{sample_anime.system_id}"
    assert owner_client.get(path).json()["flagged"] is False

    r = owner_client.put(path, json={"note": "  官方名稱未公布  "})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["flagged"] is True
    assert body["owner_type"] == "anime"
    assert body["owner_id"] == str(sample_anime.system_id)
    # Stored trimmed: the note is also a grouping key.
    assert body["note"] == "官方名稱未公布"

    again = owner_client.get(path).json()
    assert again["flagged"] is True
    assert again["note"] == "官方名稱未公布"


@pytest.mark.parametrize("owner_type", list(OWNER_TABLES))
def test_every_owner_type_can_be_marked(db, owner_client, owner_type):
    owner = _owner_of(db, owner_type)
    r = owner_client.put(f"{URL}/{owner_type}/{owner.system_id}", json={})
    assert r.status_code == 200, r.text
    assert r.json()["owner_type"] == owner_type
    assert r.json()["note"] is None
    assert db.query(models.NeedsWork).count() == 1


def test_marking_again_changes_the_note_rather_than_adding_a_row(
    db, owner_client, sample_series
):
    path = f"{URL}/series/{sample_series.system_id}"
    owner_client.put(path, json={"note": "名字缺"})
    r = owner_client.put(path, json={"note": "   "})
    assert r.status_code == 200
    # A blank note is no note.
    assert r.json()["note"] is None
    assert db.query(models.NeedsWork).count() == 1


def test_clearing_deletes_the_mark(db, owner_client, marked, sample_anime):
    path = f"{URL}/anime/{sample_anime.system_id}"
    r = owner_client.delete(path)
    assert r.status_code == 204
    assert owner_client.get(path).json()["flagged"] is False
    # Only that owner's mark went.
    assert db.query(models.NeedsWork).count() == 1
    # Clearing what is not marked changes nothing.
    assert owner_client.delete(path).status_code == 204


def test_an_unknown_owner_type_is_404(owner_client, sample_anime):
    r = owner_client.put(f"{URL}/studio/{sample_anime.system_id}", json={})
    assert r.status_code == 404


def test_an_owner_that_does_not_exist_is_404(owner_client):
    r = owner_client.put(f"{URL}/franchise/{uuid.uuid4()}", json={})
    assert r.status_code == 404
    assert owner_client.get(f"{URL}/franchise/{uuid.uuid4()}").status_code == 404


def test_an_entry_under_the_wrong_media_type_is_404(owner_client, sample_anime):
    """The media row exists, but it is an anime, not a manga."""
    r = owner_client.put(f"{URL}/manga/{sample_anime.system_id}", json={})
    assert r.status_code == 404


def test_any_other_key_is_422(owner_client, sample_anime):
    r = owner_client.put(
        f"{URL}/anime/{sample_anime.system_id}", json={"note": "x", "flag": True}
    )
    assert r.status_code == 422


# --- The page ----------------------------------------------------------------


def test_the_page_groups_marks_by_note(db, owner_client, marked, sample_series):
    _mark(db, note=None, series_id=sample_series.system_id)
    r = owner_client.get(URL)
    assert r.status_code == 200
    groups = r.json()
    # Noted groups first, the unnoted group last.
    assert [g["note"] for g in groups] == ["續集未補", None]
    items = groups[0]["items"]
    assert {(i["owner_type"], i["display_name"]) for i in items} == {
        ("anime", "Test Anime"),
        ("franchise", "測試系列"),
    }
    anime = next(i for i in items if i["owner_type"] == "anime")
    assert anime["type_label"] == "Anime"
    assert anime["is_tier"] is False
    assert anime["nav_path"] == f"/anime/{marked[0].media_id}"
    assert set(anime) == {
        "owner_type", "owner_id", "type_label", "is_tier", "display_name",
        "nav_path", "note", "created_at", "updated_at",
    }
    series = groups[1]["items"][0]
    assert series["owner_type"] == "series"
    assert series["is_tier"] is True
    assert series["nav_path"] == f"/series/{sample_series.system_id}"


def test_an_empty_page_is_an_empty_list(owner_client):
    assert owner_client.get(URL).json() == []


def test_the_notes_in_use_are_not_served(owner_client, marked):
    """The note field suggests from the curated "Needs Work Note" category
    only, so nothing serves the notes the marks happen to carry."""
    assert owner_client.get(f"{URL}/notes").status_code in (404, 405)


def test_the_admin_reads_the_page_and_its_names(admin_client, marked):
    """The admin resolves the empty object set and reads no catalogue - and
    still reads this page, names and all, as it reads the request inbox."""
    r = admin_client.get(URL)
    assert r.status_code == 200
    names = {i["display_name"] for g in r.json() for i in g["items"]}
    assert names == {"Test Anime", "測試系列"}


def test_the_admin_can_clear_a_mark(db, admin_client, marked, sample_anime):
    assert admin_client.delete(f"{URL}/anime/{sample_anime.system_id}").status_code == 204
    assert db.query(models.NeedsWork).count() == 1


# --- Refusals ------------------------------------------------------------------


def _every_route(sample_anime):
    path = f"{URL}/anime/{sample_anime.system_id}"
    return [
        ("GET", URL, None),
        ("GET", path, None),
        ("PUT", path, {"note": "改掉"}),
        ("DELETE", path, None),
    ]


def test_a_guest_is_refused_every_route(db, client, marked, sample_anime):
    # `marked` is load-bearing: there are rows to read and a mark to change.
    for method, path, body in _every_route(sample_anime):
        r = client.request(method, path, json=body)
        assert r.status_code == 401, (method, path, r.status_code)
    assert db.query(models.NeedsWork).count() == 2
    assert db.query(models.NeedsWork).filter_by(note="改掉").count() == 0


def test_a_member_is_refused_every_route(db, user_client, owner_client, marked, sample_anime):
    for method, path, body in _every_route(sample_anime):
        r = user_client.request(method, path, json=body)
        assert r.status_code == 401, (method, path, r.status_code)
    assert db.query(models.NeedsWork).count() == 2
    # The mirror, on the same rows: super reads both.
    names = {i["display_name"] for g in owner_client.get(URL).json() for i in g["items"]}
    assert names == {"Test Anime", "測試系列"}


# --- The table -------------------------------------------------------------------


def test_exactly_one_owner_column_may_be_set(db, sample_anime, sample_franchise):
    db.add(
        models.NeedsWork(
            system_id=uuid.uuid4(),
            media_id=sample_anime.system_id,
            franchise_id=sample_franchise.system_id,
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_a_mark_with_no_owner_is_rejected(db):
    db.add(models.NeedsWork(system_id=uuid.uuid4()))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_an_owner_holds_one_mark(db, sample_anime):
    _mark(db, media_id=sample_anime.system_id)
    db.add(models.NeedsWork(system_id=uuid.uuid4(), media_id=sample_anime.system_id))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


@pytest.mark.parametrize(
    "table,fixture,column",
    [
        ("media", "sample_anime", "media_id"),
        ("collection", "sample_collection", "collection_id"),
        ("franchise", "sample_franchise", "franchise_id"),
        ("series", "sample_series", "series_id"),
    ],
)
def test_deleting_the_owner_cascades_its_mark(db, request, table, fixture, column):
    owner = request.getfixturevalue(fixture)
    mark = _mark(db, **{column: owner.system_id})
    db.commit()
    mark_id = mark.system_id

    db.execute(text(f"DELETE FROM {table} WHERE system_id = :s"), {"s": owner.system_id})
    db.commit()

    assert db.query(models.NeedsWork).filter_by(system_id=mark_id).first() is None


def test_every_media_type_is_an_owner_type():
    assert set(MEDIA_TABLES) | {"collection", "franchise", "series"} == set(OWNER_TABLES)
