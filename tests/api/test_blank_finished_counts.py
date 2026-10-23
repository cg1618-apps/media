"""
A blank "finished" count is stored as NULL and read back as 0.

The reading types' finished counters live on the viewer's list row
(user_media_list), where every column is nullable. The Add and Modify forms
send a blank count as null - "not recorded" - so the entry endpoints must
accept null on create and on PATCH, store it, and serve it the way
attach_list_fields serves every untouched counter: as 0
(LIST_FIELD_DEFAULTS in app/services/domain/user_list.py).
"""

import uuid

import pytest

from app import models

COUNTS = {
    "manga": ("manga_name_en", ("vol_fin", "vol_fin_page", "ch_fin")),
    "novel": ("novel_name_en", ("vol_fin", "arc_fin", "ch_fin")),
    "comic": ("comic_name_en", ("issue_fin",)),
}

CASES = [(t, name, counts) for t, (name, counts) in COUNTS.items()]


def _list_row(db, user_id, media_id):
    db.expire_all()
    return (
        db.query(models.UserMediaList)
        .filter(
            models.UserMediaList.user_id == user_id,
            models.UserMediaList.media_id == media_id,
        )
        .one()
    )


@pytest.mark.parametrize("media_type,name_key,counts", CASES)
def test_create_with_null_counts_stores_null_and_reads_back_zero(
    admin_client, admin_user, db_session, media_type, name_key, counts
):
    body = {name_key: f"Blank Count {media_type}", **{k: None for k in counts}}
    resp = admin_client.post(f"/api/{media_type}/", json=body)
    assert resp.status_code == 201, resp.text
    created = resp.json()
    for key in counts:
        assert created[key] == 0

    row = _list_row(db_session, admin_user.id, uuid.UUID(created["system_id"]))
    for key in counts:
        assert getattr(row, key) is None

    one = admin_client.get(f"/api/{media_type}/{created['system_id']}")
    assert one.status_code == 200, one.text
    for key in counts:
        assert one.json()[key] == 0


@pytest.mark.parametrize("media_type,name_key,counts", CASES)
def test_patch_with_null_counts_clears_them(
    admin_client, admin_user, db_session, media_type, name_key, counts
):
    """The Modify form's save of a blank count. PATCH takes the body as a raw
    dict, so no schema stands between the null and the list row."""
    created = admin_client.post(
        f"/api/{media_type}/",
        json={name_key: f"Patched Count {media_type}", **{k: 3 for k in counts}},
    ).json()
    resp = admin_client.patch(
        f"/api/{media_type}/{created['system_id']}",
        json={k: None for k in counts},
    )
    assert resp.status_code == 200, resp.text
    for key in counts:
        assert resp.json()[key] == 0

    row = _list_row(db_session, admin_user.id, uuid.UUID(created["system_id"]))
    for key in counts:
        assert getattr(row, key) is None


@pytest.mark.parametrize("media_type,name_key,counts", CASES)
def test_put_with_null_counts_clears_them(
    admin_client, admin_user, db_session, media_type, name_key, counts
):
    """PUT validates against the Update schema, which PATCH (a raw dict) does
    not - so this is the write path the Optional declarations open."""
    name = f"Put Count {media_type}"
    created = admin_client.post(
        f"/api/{media_type}/", json={name_key: name, **{k: 3 for k in counts}}
    ).json()
    resp = admin_client.put(
        f"/api/{media_type}/{created['system_id']}",
        json={name_key: name, **{k: None for k in counts}},
    )
    assert resp.status_code == 200, resp.text
    row = _list_row(db_session, admin_user.id, uuid.UUID(created["system_id"]))
    for key in counts:
        assert getattr(row, key) is None


@pytest.mark.parametrize("media_type,name_key,counts", CASES)
def test_a_stored_null_count_reads_back_on_the_list_and_the_entry(
    admin_client, admin_user, db_session, sample_franchise, media_type, name_key, counts
):
    """A list row already holding NULL - as one written outside the API, or by
    a restore, would - serves 0 on both read paths rather than failing
    response validation."""
    model = {
        "manga": models.Manga,
        "novel": models.Novel,
        "comic": models.Comic,
    }[media_type]
    entry = model(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        **{name_key: f"Stored Null {media_type}"},
    )
    db_session.add(entry)
    db_session.flush()
    db_session.add(
        models.UserMediaList(
            system_id=uuid.uuid4(),
            user_id=admin_user.id,
            media_id=entry.system_id,
            status="Reading",
            **{k: None for k in counts},
        )
    )
    db_session.flush()

    one = admin_client.get(f"/api/{media_type}/{entry.system_id}")
    assert one.status_code == 200, one.text
    for key in counts:
        assert one.json()[key] == 0

    rows = admin_client.get(f"/api/{media_type}/?limit=2000")
    assert rows.status_code == 200, rows.text
    found = [r for r in rows.json() if r["system_id"] == str(entry.system_id)]
    assert len(found) == 1
    for key in counts:
        assert found[0][key] == 0
