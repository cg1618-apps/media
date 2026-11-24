"""
is_pinged - the viewer's pin to the dashboard's Pinged division.

A pin is personal: it lives on the caller's own user_media_list row, so it is
written through the entry endpoints (the Add and Modify forms) and through
PUT /api/me/list (the detail page's tracker), and read back on the entry. It
belongs to the nine ordinary types only; a gated type refuses it.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models


@pytest.fixture
def db(db_session):
    return db_session


# The nine ordinary types: route, and the name column a create needs.
PINNABLE = [
    ("anime", "anime_name_en"),
    ("anime-movie", "anime_movie_name_en"),
    ("movies", "movie_name_en"),
    ("tv-shows", "tv_name_en"),
    ("cartoon", "cartoon_name_en"),
    ("manga", "manga_name_en"),
    ("book", "book_name_en"),
    ("comic", "comic_name_en"),
    ("game", "game_name_en"),
]


def _row_for(db, media_id, user_id):
    row = (
        db.query(models.UserMediaList)
        .filter(
            models.UserMediaList.media_id == media_id,
            models.UserMediaList.user_id == user_id,
        )
        .one()
    )
    db.refresh(row)
    return row


@pytest.mark.parametrize("route, name_col", PINNABLE)
def test_create_pins_and_get_reads_it_back(
    owner_client, db, owner_user, route, name_col
):
    response = owner_client.post(
        f"/api/{route}/", json={name_col: f"{route} pinned", "is_pinged": True}
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["is_pinged"] is True
    assert _row_for(db, uuid.UUID(body["system_id"]), owner_user.id).is_pinged is True
    fetched = owner_client.get(f"/api/{route}/{body['public_id']}").json()
    assert fetched["is_pinged"] is True


@pytest.mark.parametrize("route, name_col", PINNABLE)
def test_an_untouched_entry_reads_unpinned(owner_client, route, name_col):
    created = owner_client.post(f"/api/{route}/", json={name_col: f"{route} plain"})
    assert created.status_code == 201, created.text
    assert created.json()["is_pinged"] is False


def test_put_without_the_key_leaves_the_pin(owner_client, db, owner_user):
    created = owner_client.post(
        "/api/anime/", json={"anime_name_en": "Kept Pin", "is_pinged": True}
    ).json()
    response = owner_client.put(
        f"/api/anime/{created['system_id']}?replace=false",
        json={"anime_name_en": "Kept Pin renamed"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["is_pinged"] is True


def test_put_unpins(owner_client, db, owner_user):
    created = owner_client.post(
        "/api/manga/", json={"manga_name_en": "Unpin Me", "is_pinged": True}
    ).json()
    response = owner_client.put(
        f"/api/manga/{created['system_id']}?replace=false",
        json={"manga_name_en": "Unpin Me", "is_pinged": False},
    )
    assert response.status_code == 200, response.text
    assert response.json()["is_pinged"] is False
    row = _row_for(db, uuid.UUID(created["system_id"]), owner_user.id)
    assert row.is_pinged is False


def test_me_list_pins_the_callers_own_row_only(
    db, user_client, plain_user, owner_user, sample_franchise, list_row
):
    """The owner holds a pinned row on the same entry, so the plain user
    reading unpinned before its own write proves the pin is per account."""
    game = models.Game(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        game_name_en="Shared Game",
    )
    db.add(game)
    db.flush()
    list_row(game, status="Active Playing", is_pinged=True)

    before = user_client.get(f"/api/me/list/{game.system_id}")
    assert before.status_code == 200, before.text
    assert before.json()["is_pinged"] is False

    response = user_client.put(
        f"/api/me/list/{game.system_id}", json={"is_pinged": True}
    )
    assert response.status_code == 200, response.text
    assert response.json()["is_pinged"] is True
    assert _row_for(db, game.system_id, plain_user.id).is_pinged is True

    unpinned = user_client.put(
        f"/api/me/list/{game.system_id}", json={"is_pinged": None}
    )
    assert unpinned.json()["is_pinged"] is False
    assert _row_for(db, game.system_id, owner_user.id).is_pinged is True


def test_a_gated_type_refuses_a_pin_on_me_list(owner_client, db, sample_franchise):
    entry = models.Hentai(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        hentai_name_en="No Pin Hentai",
    )
    db.add(entry)
    db.flush()
    response = owner_client.put(
        f"/api/me/list/{entry.system_id}", json={"is_pinged": True}
    )
    assert response.status_code == 422, response.text
