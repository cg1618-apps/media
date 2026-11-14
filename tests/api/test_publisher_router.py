"""The publisher router. Shaped after app/routers/studio.py."""

import uuid

from app import models


def _game_id(db_session, name="Elden Ring"):
    """media_credit.media_id is a real FK, so the entry has to exist."""
    g = models.Game(game_name_en=name)
    db_session.add(g)
    db_session.flush()
    return g.system_id


def test_create_and_list(owner_client, guest_reader):
    owner_client.post("/api/publisher/", json={"name_en": "Bandai Namco"})
    assert [p["name_en"] for p in guest_reader.get("/api/publisher/").json()] == [
        "Bandai Namco"
    ]


def test_creating_an_existing_publisher_returns_the_existing_row(owner_client):
    first = owner_client.post("/api/publisher/", json={"name_en": "Kadokawa"}).json()
    second = owner_client.post("/api/publisher/", json={"name_en": "Kadokawa"}).json()
    assert first["system_id"] == second["system_id"]


def test_a_nameless_publisher_is_rejected(owner_client):
    assert owner_client.post("/api/publisher/", json={}).status_code == 422


def test_a_reader_may_list_but_not_write(guest_reader):
    assert guest_reader.get("/api/publisher/").status_code == 200
    assert guest_reader.post("/api/publisher/", json={"name_en": "X"}).status_code == 401


def test_detail_404s_for_an_unknown_id(guest_reader):
    assert guest_reader.get(f"/api/publisher/{uuid.uuid4()}").status_code == 404


def test_list_is_sorted_by_display_name(owner_client, guest_reader):
    for name in ("Zen Studios", "Annapurna", "Merge Games"):
        owner_client.post("/api/publisher/", json={"name_en": name})
    names = [p["display_name"] for p in guest_reader.get("/api/publisher/").json()]
    assert names == sorted(names, key=str.casefold)


def test_credit_count_reflects_credits(owner_client, db_session):
    created = owner_client.post("/api/publisher/", json={"name_en": "Devolver"}).json()
    db_session.add(
        models.MediaCredit(
            media_id=_game_id(db_session),
            role="publisher",
            publisher_id=created["system_id"],
        )
    )
    db_session.commit()
    detail = owner_client.get(f"/api/publisher/{created['system_id']}").json()
    assert detail["credit_count"] == 1


def test_delete_removes_the_publisher_and_its_logo(owner_client, monkeypatch):
    """
    Studio's delete path never calls delete_cover_image, so a deleted studio
    leaks its logo. Publisher must not inherit that gap.
    """
    from app.routers import publisher as publisher_router

    deleted = []
    monkeypatch.setattr(
        publisher_router,
        "delete_cover_image",
        lambda owner_type, sid: deleted.append((owner_type, sid)),
    )
    created = owner_client.post(
        "/api/publisher/", json={"name_en": "Doomed", "logo_file": "publisher/x.jpg"}
    ).json()
    assert (
        owner_client.delete(f"/api/publisher/{created['system_id']}").status_code == 200
    )
    assert deleted == [("publisher", created["system_id"])]


def test_merge_moves_credits_and_deletes_the_loser(owner_client, db_session):
    keep = owner_client.post("/api/publisher/", json={"name_en": "Keep"}).json()
    lose = owner_client.post("/api/publisher/", json={"name_en": "Lose"}).json()
    db_session.add(
        models.MediaCredit(
            media_id=_game_id(db_session),
            role="publisher",
            publisher_id=lose["system_id"],
        )
    )
    db_session.commit()

    result = owner_client.post(
        f"/api/publisher/{keep['system_id']}/merge",
        json={"source_id": lose["system_id"]},
    ).json()
    assert result["credits_moved"] == 1
    assert db_session.get(models.Publisher, uuid.UUID(lose["system_id"])) is None


def test_merging_a_publisher_into_itself_is_a_400(owner_client):
    created = owner_client.post("/api/publisher/", json={"name_en": "Solo"}).json()
    assert (
        owner_client.post(
            f"/api/publisher/{created['system_id']}/merge",
            json={"source_id": created["system_id"]},
        ).status_code
        == 400
    )


def test_creating_with_only_an_alt_list_finds_the_publisher_holding_it(owner_client):
    first = owner_client.post(
        "/api/publisher/", json={"name_en": "Kadokawa", "name_alt": "KADOKAWA Corp, 角川"}
    ).json()
    second = owner_client.post(
        "/api/publisher/", json={"name_alt": "KADOKAWA Corp, 角川"}
    ).json()
    assert first["system_id"] == second["system_id"]
    # Mirror: a list none of whose names it holds is a new publisher.
    third = owner_client.post("/api/publisher/", json={"name_alt": "Shueisha, 集英社"}).json()
    assert third["system_id"] != first["system_id"]
