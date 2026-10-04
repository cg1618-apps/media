"""
API integration tests for the music group: the per-list status rows
(`music_status`), the one song-row shape every list shares, and 彩蛋's URL
links.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models

SONG_SECTIONS = ("op", "ed", "insert_songs", "ost")


def _owner(sample_anime):
    return {"owner_type": "anime", "owner_id": str(sample_anime.system_id)}


def _status_row(sample_anime, kind="op", status="Not Done"):
    return {**_owner(sample_anime), "section": "music_status", "kind": kind, "status": status}


def _rows(db_session, anime, section):
    return (
        db_session.query(models.Note)
        .filter(models.Note.media_id == anime.system_id, models.Note.section == section)
        .order_by(models.Note.sort_index)
        .all()
    )


# --- /sections --------------------------------------------------------------


def test_sections_describe_the_status_bar_and_the_song_rows(client):
    r = client.get("/api/notes/sections", params={"owner_type": "anime"})
    assert r.status_code == 200
    by_key = {s["key"]: s for s in r.json()}

    status = by_key["music_status"]
    assert status["hidden"] is True
    assert status["one_per_kind"] is True
    assert status["kinds"] == list(SONG_SECTIONS)
    assert status["default_status"] == "Not Done"

    for key in SONG_SECTIONS:
        song = by_key[key]
        assert song["shape"] == "music_track"
        assert song["hidden"] is False
        assert song["link_pairs"] is True
        assert song["link_text_category"] == "Song Source"
        assert song["type_status_section"] == "music_status"
        assert song["type_statuses"] == [
            "All Done", "Done", "Need", "Pending", "Not Done",
        ]
        assert song["type_status_default"] == "Not Done"
        assert song["singleton"] is False
    assert by_key["op"]["kind_category"] == "Song Type"
    assert by_key["ost"]["kind_category"] is None

    egg = by_key["easter_eggs"]
    assert egg["group"] == "analysis_group"
    assert egg["shape"] == "text_links"
    assert egg["link_pairs"] is False
    assert egg["fields"] == []


# --- music_status -----------------------------------------------------------


def test_admin_writes_and_changes_a_list_status(admin_client, sample_anime, admin_user):
    r = admin_client.post("/api/notes", json=_status_row(sample_anime))
    assert r.status_code == 201, r.text
    assert r.json()["author_id"] == str(admin_user.id)

    r = admin_client.patch(
        f"/api/notes/{r.json()['system_id']}", json={"status": "All Done"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "All Done"


def test_a_second_status_for_the_same_list_is_refused(admin_client, sample_anime):
    assert admin_client.post("/api/notes", json=_status_row(sample_anime)).status_code == 201
    r = admin_client.post(
        "/api/notes", json=_status_row(sample_anime, status="Done")
    )
    assert r.status_code == 422
    assert "already has" in r.text


def test_each_list_holds_its_own_status(admin_client, db_session, sample_anime):
    # The mirror of the refusal above, over the same owner: a status per list
    # is four rows, so only a SECOND row for one list is refused.
    for kind in SONG_SECTIONS:
        r = admin_client.post("/api/notes", json=_status_row(sample_anime, kind=kind))
        assert r.status_code == 201, r.text
    assert {n.kind for n in _rows(db_session, sample_anime, "music_status")} == set(
        SONG_SECTIONS
    )


def test_moving_a_status_onto_a_taken_list_is_refused(admin_client, sample_anime):
    admin_client.post("/api/notes", json=_status_row(sample_anime, kind="op"))
    ed = admin_client.post(
        "/api/notes", json=_status_row(sample_anime, kind="ed")
    ).json()
    r = admin_client.patch(f"/api/notes/{ed['system_id']}", json={"kind": "op"})
    assert r.status_code == 422
    # Patching a row onto its own kind is not a conflict with itself.
    r = admin_client.patch(
        f"/api/notes/{ed['system_id']}", json={"kind": "ed", "status": "Need"}
    )
    assert r.status_code == 200, r.text


def test_a_list_status_outside_the_vocabulary_is_refused(admin_client, sample_anime):
    r = admin_client.post(
        "/api/notes", json=_status_row(sample_anime, status="Someday")
    )
    assert r.status_code == 422


def test_a_logged_out_visitor_cannot_write_a_list_status(client, sample_anime):
    r = client.post("/api/notes", json=_status_row(sample_anime))
    assert r.status_code == 401


def test_the_database_refuses_a_second_status_for_one_list(
    db_session, sample_anime, admin_user
):
    from sqlalchemy.exc import IntegrityError

    for status in ("Need", "Done"):
        db_session.add(
            models.Note(
                author_id=admin_user.id,
                media_id=sample_anime.system_id,
                section="music_status",
                kind="ost",
                status=status,
            )
        )
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


# --- seeded on create ---------------------------------------------------------


def test_creating_an_anime_seeds_a_status_per_list(admin_client, db_session, admin_user):
    r = admin_client.post("/api/anime/", json={"anime_name_en": "Frieren"})
    assert r.status_code == 201, r.text
    anime_id = uuid.UUID(r.json()["system_id"])

    rows = (
        db_session.query(models.Note)
        .filter(models.Note.media_id == anime_id, models.Note.section == "music_status")
        .order_by(models.Note.sort_index)
        .all()
    )
    assert [(n.kind, n.status) for n in rows] == [
        (kind, "Not Done") for kind in SONG_SECTIONS
    ]
    assert {n.author_id for n in rows} == {admin_user.id}


def test_updating_an_anime_does_not_seed_again(admin_client, db_session):
    created = admin_client.post("/api/anime/", json={"anime_name_en": "Frieren"}).json()
    r = admin_client.put(
        f"/api/anime/{created['system_id']}",
        json={"anime_name_en": "Frieren", "franchise_id": created["franchise_id"]},
    )
    assert r.status_code == 200, r.text
    count = (
        db_session.query(models.Note)
        .filter(
            models.Note.media_id == uuid.UUID(created["system_id"]),
            models.Note.section == "music_status",
        )
        .count()
    )
    assert count == len(SONG_SECTIONS)


def test_creating_another_type_seeds_nothing(admin_client, db_session):
    r = admin_client.post("/api/anime-movie/", json={"anime_movie_name_en": "Your Name"})
    assert r.status_code == 201, r.text
    assert (
        db_session.query(models.Note)
        .filter(models.Note.media_id == uuid.UUID(r.json()["system_id"]))
        .count()
        == 0
    )


# --- song rows ----------------------------------------------------------------


@pytest.mark.parametrize("section", SONG_SECTIONS)
def test_a_song_round_trips_its_link_pairs_and_episode(admin_client, sample_anime, section):
    body = {
        **_owner(sample_anime),
        "section": section,
        "title": "紅蓮華",
        "status": "Need",
        "locator": "ep 1",
        "links": [
            {"text": "YouTube", "url": "https://youtu.be/a"},
            {"text": None, "url": "https://b.example"},
        ],
    }
    r = admin_client.post("/api/notes", json=body)
    assert r.status_code == 201, r.text
    assert r.json()["links"] == body["links"]
    assert r.json()["locator"] == "ep 1"

    r = admin_client.patch(
        f"/api/notes/{r.json()['system_id']}", json={"status": "Done"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["links"] == body["links"]


def test_an_op_takes_a_song_type_outside_the_suggestions(admin_client, sample_anime):
    r = admin_client.post(
        "/api/notes",
        json={**_owner(sample_anime), "section": "op", "kind": "TV size", "title": "x"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["kind"] == "TV size"


def test_a_song_refuses_bare_url_links(admin_client, sample_anime):
    r = admin_client.post(
        "/api/notes",
        json={**_owner(sample_anime), "section": "op", "links": ["https://a.example"]},
    )
    assert r.status_code == 422


def test_an_anime_holds_several_ost_songs(admin_client, db_session, sample_anime):
    # OST was a singleton; now it is a list like OP and ED.
    for title in ("Opening Theme", "Battle Theme"):
        r = admin_client.post(
            "/api/notes",
            json={**_owner(sample_anime), "section": "ost", "title": title},
        )
        assert r.status_code == 201, r.text
    assert [n.title for n in _rows(db_session, sample_anime, "ost")] == [
        "Opening Theme",
        "Battle Theme",
    ]


def test_an_easter_egg_round_trips(admin_client, sample_anime):
    body = {
        **_owner(sample_anime),
        "section": "easter_eggs",
        "locator": "ep 3",
        "content": "The poster is the ep 12 villain.",
        "links": ["https://b23.tv/x", "https://youtu.be/y"],
    }
    r = admin_client.post("/api/notes", json=body)
    assert r.status_code == 201, r.text
    assert r.json()["links"] == body["links"]
    assert r.json()["locator"] == "ep 3"

    # Its links are URL strings, like the rest of 解析: a pair is refused.
    r = admin_client.post(
        "/api/notes",
        json={**body, "links": [{"text": "Bilibili", "url": "https://b23.tv/x"}]},
    )
    assert r.status_code == 422
