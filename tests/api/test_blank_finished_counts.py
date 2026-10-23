"""
A blank "finished" count is stored as NULL and read back as 0 (None for ep_fin).

Every type's finished counters live on the viewer's list row
(user_media_list), where every column is nullable. The Add and Modify forms
send a blank count as null - "not recorded" - so the entry endpoints must
accept null on create and on PATCH, store it, and serve it the way
attach_list_fields serves every untouched counter: as 0
(LIST_FIELD_DEFAULTS in app/services/domain/user_list.py).
"""

import uuid

import pytest

from app import models

# (media type, name key, finished counts, fields the create needs besides a
# name). h-comic's counter follows its region - page_fin is JP's, ch_fin
# KR's, and each region clears the other's - so it runs once per region.
CASES = [
    ("manga", "manga_name_en", ("vol_fin", "vol_fin_page", "ch_fin"), {}),
    ("novel", "novel_name_en", ("vol_fin", "arc_fin", "ch_fin"), {}),
    ("comic", "comic_name_en", ("issue_fin",), {}),
    ("anime", "anime_name_en", ("ep_fin",), {}),
    ("h-comic", "h_comic_name_en", ("page_fin",), {"region": "JP"}),
    ("h-comic", "h_comic_name_en", ("ch_fin",), {"region": "KR"}),
]

# ep_fin was always nullable, so a NULL reads back as None; every other counter
# was NOT NULL DEFAULT 0 and reads back as 0 (data-model.md, "Reading zero").
NULLABLE_READS = {"ep_fin"}


def _read_back(key):
    return None if key in NULLABLE_READS else 0


MODELS = {
    "manga": models.Manga,
    "novel": models.Novel,
    "comic": models.Comic,
    "anime": models.Anime,
    "h-comic": models.HComic,
}


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


@pytest.mark.parametrize("media_type,name_key,counts,extra", CASES)
def test_create_with_null_counts_stores_null_and_reads_back_zero(
    admin_client, admin_user, db_session, media_type, name_key, counts, extra
):
    body = {name_key: f"Blank Count {media_type}", **extra, **{k: None for k in counts}}
    resp = admin_client.post(f"/api/{media_type}/", json=body)
    assert resp.status_code == 201, resp.text
    created = resp.json()
    for key in counts:
        assert created[key] == _read_back(key)

    row = _list_row(db_session, admin_user.id, uuid.UUID(created["system_id"]))
    for key in counts:
        assert getattr(row, key) is None

    one = admin_client.get(f"/api/{media_type}/{created['system_id']}")
    assert one.status_code == 200, one.text
    for key in counts:
        assert one.json()[key] == _read_back(key)


@pytest.mark.parametrize("media_type,name_key,counts,extra", CASES)
def test_patch_with_null_counts_clears_them(
    admin_client, admin_user, db_session, media_type, name_key, counts, extra
):
    """The Modify form's save of a blank count. PATCH takes the body as a raw
    dict, so no schema stands between the null and the list row."""
    created = admin_client.post(
        f"/api/{media_type}/",
        json={name_key: f"Patched Count {media_type}", **extra, **{k: 3 for k in counts}},
    ).json()
    resp = admin_client.patch(
        f"/api/{media_type}/{created['system_id']}",
        json={k: None for k in counts},
    )
    assert resp.status_code == 200, resp.text
    for key in counts:
        assert resp.json()[key] == _read_back(key)

    row = _list_row(db_session, admin_user.id, uuid.UUID(created["system_id"]))
    for key in counts:
        assert getattr(row, key) is None


@pytest.mark.parametrize("media_type,name_key,counts,extra", CASES)
def test_put_with_null_counts_clears_them(
    admin_client, admin_user, db_session, media_type, name_key, counts, extra
):
    """PUT validates against the Update schema, which PATCH (a raw dict) does
    not - so this is the write path the Optional declarations open."""
    name = f"Put Count {media_type}"
    created = admin_client.post(
        f"/api/{media_type}/", json={name_key: name, **extra, **{k: 3 for k in counts}}
    ).json()
    resp = admin_client.put(
        f"/api/{media_type}/{created['system_id']}",
        json={name_key: name, **extra, **{k: None for k in counts}},
    )
    assert resp.status_code == 200, resp.text
    row = _list_row(db_session, admin_user.id, uuid.UUID(created["system_id"]))
    for key in counts:
        assert getattr(row, key) is None


@pytest.mark.parametrize("media_type,name_key,counts,extra", CASES)
def test_a_stored_null_count_reads_back_on_the_list_and_the_entry(
    admin_client, admin_user, db_session, sample_franchise, media_type, name_key, counts, extra
):
    """A list row already holding NULL - as one written outside the API, or by
    a restore, would - serves 0 on both read paths rather than failing
    response validation."""
    model = MODELS[media_type]
    entry = model(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        **extra,
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
        assert one.json()[key] == _read_back(key)

    rows = admin_client.get(f"/api/{media_type}/?limit=2000")
    assert rows.status_code == 200, rows.text
    found = [r for r in rows.json() if r["system_id"] == str(entry.system_id)]
    assert len(found) == 1
    for key in counts:
        assert found[0][key] == _read_back(key)
