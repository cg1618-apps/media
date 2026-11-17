"""Book units round-trip through the media router factory."""

import uuid


def _book_payload(**overrides):
    payload = {
        "book_name_cn": "測試小說",
        "type": "網路小說",
        "units": [
            {"unit_kind": "arc", "position": 1, "unit_key": "arc 1", "ch_count": 100},
            {"unit_kind": "arc", "position": 2, "unit_key": "arc 2", "ch_count": 112},
        ],
    }
    payload.update(overrides)
    return payload


def test_create_persists_units_and_derives_totals(owner_client):
    resp = owner_client.post("/api/book/", json=_book_payload(arc_fin=1, ch_fin_in_arc=101))
    assert resp.status_code == 201
    body = resp.json()

    assert len(body["units"]) == 2
    assert body["arc_total"] == 2
    assert body["ch_total"] == 212
    assert body["ch_fin"] == 201
    assert body["units"][0]["display_key"] == "arc 1"


def test_update_inserts_updates_and_deletes_in_one_request(owner_client):
    created = owner_client.post("/api/book/", json=_book_payload()).json()
    keep, drop = created["units"][0], created["units"][1]

    resp = owner_client.put(
        f"/api/book/{created['system_id']}",
        json={
            "book_name_cn": "測試小說",
            "type": "網路小說",
            "units": [
                # updated in place
                {
                    "system_id": keep["system_id"],
                    "unit_kind": "arc",
                    "position": 1,
                    "unit_key": "arc 1",
                    "ch_count": 105,
                },
                # inserted
                {"unit_kind": "arc", "position": 2, "unit_key": "arc 2b", "ch_count": 50},
            ],
        },
    )
    assert resp.status_code == 200
    body = resp.json()

    ids = {u["system_id"] for u in body["units"]}
    assert keep["system_id"] in ids       # kept and updated
    assert drop["system_id"] not in ids   # omitted, therefore deleted
    assert len(body["units"]) == 2
    assert body["ch_total"] == 155


def test_patching_the_cursor_rolls_over(owner_client):
    created = owner_client.post(
        "/api/book/", json=_book_payload(arc_fin=1, ch_fin_in_arc=0)
    ).json()

    resp = owner_client.patch(
        f"/api/book/{created['system_id']}", json={"ch_fin_in_arc": 112}
    )
    assert resp.status_code == 200
    body = resp.json()

    assert body["arc_fin"] == 2
    assert body["ch_fin_in_arc"] == 0
    assert body["ch_fin"] == 212


def test_patch_saves_units_not_just_the_cursor(owner_client):
    """PATCH /api/book/{id} carrying `units` must actually write the rows and
    re-derive progress from them, not silently discard the key.

    Regression coverage for the detail-page Units editor, which patches the
    whole book (including `units`) rather than PUTting it."""
    created = owner_client.post("/api/book/", json=_book_payload()).json()
    keep, drop = created["units"][0], created["units"][1]

    resp = owner_client.patch(
        f"/api/book/{created['system_id']}",
        json={
            "units": [
                {
                    "system_id": keep["system_id"],
                    "unit_kind": "arc",
                    "position": 1,
                    "unit_key": "arc 1",
                    "ch_count": 150,
                },
                {"unit_kind": "arc", "position": 2, "unit_key": "arc 2b", "ch_count": 60},
            ]
        },
    )
    assert resp.status_code == 200
    body = resp.json()

    ids = {u["system_id"] for u in body["units"]}
    assert keep["system_id"] in ids       # kept and updated
    assert drop["system_id"] not in ids   # omitted, therefore deleted
    assert len(body["units"]) == 2
    # ch_count changed on the kept row and the inserted row's count is new;
    # ch_total must be re-derived from the new rows, not left stale.
    assert body["ch_total"] == 210


def test_deleting_a_book_removes_its_units(owner_client, db_session):
    from app import models

    created = owner_client.post("/api/book/", json=_book_payload()).json()
    book_id = uuid.UUID(created["system_id"])

    assert owner_client.delete(f"/api/book/{book_id}").status_code == 200

    remaining = (
        db_session.query(models.BookUnit)
        .filter(models.BookUnit.book_id == book_id)
        .count()
    )
    assert remaining == 0


def test_volume_units_do_not_touch_volume_counters(owner_client):
    resp = owner_client.post(
        "/api/book/",
        json={
            "book_name_cn": "輕小說",
            "type": "輕小說",
            "vol_fin": 9,
            "vol_total_original": 12,
            "units": [
                {"unit_kind": "volume", "position": 1, "name_cn": "第一卷"},
                {"unit_kind": "volume", "position": 2, "name_cn": "第二卷"},
            ],
        },
    )
    body = resp.json()
    # Decision B: naming two volumes must not redefine the denominator.
    assert body["vol_fin"] == 9
    assert body["vol_total_original"] == 12
    assert len(body["units"]) == 2


def test_listing_books_does_not_n_plus_one(owner_client, test_engine):
    from sqlalchemy import event

    for _ in range(3):
        owner_client.post("/api/book/", json=_book_payload())

    units, ratings = [], []

    def record(conn, cursor, statement, params, context, executemany):
        # user_book_unit_rating contains "book_unit" as a substring, so the
        # two have to be told apart rather than counted together.
        if "user_book_unit_rating" in statement:
            ratings.append(statement)
        elif "book_unit" in statement:
            units.append(statement)

    event.listen(test_engine, "before_cursor_execute", record)
    try:
        resp = owner_client.get("/api/book/")
    finally:
        event.remove(test_engine, "before_cursor_execute", record)

    assert resp.status_code == 200
    # selectinload issues exactly one query for all books' units, not one
    # query per book; three books would give three if it were N+1.
    assert len(units) == 1
    # attach_unit_ratings adds exactly one more for every unit on the page,
    # not one per unit and not one per book.
    assert len(ratings) == 1


# --- per-unit rating --------------------------------------------------------
# A unit's rating is the reader's own (user_book_unit_rating), written by
# PUT /api/me/book-units/{unit_id}; the catalogue units write ignores it.
# tests/api/test_book_unit_rating_is_personal.py holds the rest.


def test_a_units_save_ignores_a_unit_rating(owner_client):
    resp = owner_client.post(
        "/api/book/",
        json=_book_payload(
            units=[
                {"unit_kind": "arc", "position": 1, "unit_key": "arc 1", "ch_count": 100, "my_rating": "S"},
                {"unit_kind": "arc", "position": 2, "unit_key": "arc 2", "ch_count": 112},
            ]
        ),
    )
    assert resp.status_code == 201
    units = resp.json()["units"]
    assert [u["my_rating"] for u in units] == [None, None]


def test_a_readers_unit_rating_does_not_touch_the_books_own_rating(
    owner_client, user_client
):
    created = owner_client.post("/api/book/", json=_book_payload()).json()
    unit_id = created["units"][0]["system_id"]
    r = user_client.put(f"/api/me/book-units/{unit_id}", json={"my_rating": "S"})
    assert r.status_code == 200, r.text

    body = user_client.get(f"/api/book/{created['system_id']}").json()
    assert body["units"][0]["my_rating"] == "S"
    assert body["my_rating"] is None


def test_a_volume_row_can_be_rated_too(owner_client, user_client):
    created = owner_client.post(
        "/api/book/",
        json=_book_payload(
            type="輕小說",
            units=[{"unit_kind": "volume", "position": 1, "name_cn": "第一卷"}],
        ),
    ).json()
    unit_id = created["units"][0]["system_id"]
    user_client.put(f"/api/me/book-units/{unit_id}", json={"my_rating": "A+"})

    body = user_client.get(f"/api/book/{created['system_id']}").json()
    assert body["units"][0]["my_rating"] == "A+"
    assert body["units"][0]["display_key"] == "Vol 1"
