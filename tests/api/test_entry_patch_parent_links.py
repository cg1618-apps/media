"""
PATCH on a media entry writes its parent links.

`franchise_id` and `series_id` live on the `media` supertable and reach an
entry through association proxies, so apply_column_patch - which writes only
the detail table's own columns - would drop them. The Modify page saves
entries by PATCH, so a series picked there has to survive the round trip.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

from app import models


def _franchise(db_session, name="Zvornik Franchise"):
    franchise = models.Franchise(
        system_id=uuid.uuid4(), franchise_type="ACG", franchise_name_en=name
    )
    db_session.add(franchise)
    db_session.flush()
    return franchise


def _series(db_session, franchise, name="Zvornik Series"):
    series = models.Series(
        system_id=uuid.uuid4(), franchise_id=franchise.system_id, series_name_en=name
    )
    db_session.add(series)
    db_session.flush()
    return series


def _anime(admin_client, franchise, **fields):
    created = admin_client.post(
        "/api/anime/",
        json={
            "anime_name_en": "Zvornik Anime",
            "franchise_id": str(franchise.system_id),
            **fields,
        },
    )
    assert created.status_code == 201, created.text
    return created.json()


def test_patch_sets_an_entrys_series(admin_client, db_session):
    franchise = _franchise(db_session)
    series = _series(db_session, franchise)
    entry = _anime(admin_client, franchise)
    assert entry["series_id"] is None

    response = admin_client.patch(
        f"/api/anime/{entry['system_id']}", json={"series_id": str(series.system_id)}
    )

    assert response.status_code == 200, response.text
    assert response.json()["series_id"] == str(series.system_id)
    db_session.expire_all()
    stored = db_session.get(models.Anime, uuid.UUID(entry["system_id"]))
    assert stored.series_id == series.system_id


def test_patch_clears_an_entrys_series(admin_client, db_session):
    franchise = _franchise(db_session)
    series = _series(db_session, franchise)
    entry = _anime(admin_client, franchise, series_id=str(series.system_id))
    assert entry["series_id"] == str(series.system_id)

    response = admin_client.patch(
        f"/api/anime/{entry['system_id']}", json={"series_id": None}
    )

    assert response.status_code == 200, response.text
    assert response.json()["series_id"] is None


def test_patch_without_a_series_key_keeps_the_series(admin_client, db_session):
    franchise = _franchise(db_session)
    series = _series(db_session, franchise)
    entry = _anime(admin_client, franchise, series_id=str(series.system_id))

    response = admin_client.patch(
        f"/api/anime/{entry['system_id']}", json={"anime_name_cn": "茲沃爾尼克"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["series_id"] == str(series.system_id)


def test_patch_moves_an_entry_to_another_franchise(admin_client, db_session):
    franchise = _franchise(db_session)
    other = _franchise(db_session, name="Zvornik Other")
    entry = _anime(admin_client, franchise)

    response = admin_client.patch(
        f"/api/anime/{entry['system_id']}", json={"franchise_id": str(other.system_id)}
    )

    assert response.status_code == 200, response.text
    assert response.json()["franchise_id"] == str(other.system_id)


def test_patch_ignores_a_series_on_a_type_without_series(admin_client, db_session):
    """anime_movies has no series: the key stays a harmless extra, not a write."""
    franchise = _franchise(db_session)
    series = _series(db_session, franchise)
    created = admin_client.post(
        "/api/anime-movie/",
        json={"anime_movie_name_en": "Zvornik Movie", "franchise_id": str(franchise.system_id)},
    )
    assert created.status_code == 201, created.text
    entry_id = created.json()["system_id"]

    response = admin_client.patch(
        f"/api/anime-movie/{entry_id}", json={"series_id": str(series.system_id)}
    )

    assert response.status_code == 200, response.text
    db_session.expire_all()
    media = db_session.get(models.Media, uuid.UUID(entry_id))
    assert media.series_id is None
