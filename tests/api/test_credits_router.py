"""Reading and replacing an entry's credits and tags in one call."""

from app import models


def _anime(db_session):
    a = models.Anime(anime_name_cn="測試")
    db_session.add(a)
    db_session.commit()
    return a


def test_read_returns_empty_maps_for_a_bare_entry(client, db_session):
    a = _anime(db_session)
    body = client.get(f"/api/credits/anime/{a.system_id}").json()
    assert body == {"credits": {}, "tags": {}}


def test_replace_then_read_round_trips(admin_client, client, db_session):
    a = _anime(db_session)
    admin_client.put(
        f"/api/credits/anime/{a.system_id}",
        json={
            "credits": {"studio": ["MAPPA"], "director": ["新海誠"]},
            "tags": {"genre_main": ["Action"]},
        },
    )
    body = client.get(f"/api/credits/anime/{a.system_id}").json()
    assert body["credits"]["studio"] == ["MAPPA"]
    assert body["tags"]["genre_main"] == ["Action"]


def test_replace_only_touches_the_roles_named(admin_client, client, db_session):
    a = _anime(db_session)
    admin_client.put(
        f"/api/credits/anime/{a.system_id}",
        json={"credits": {"studio": ["MAPPA"], "director": ["新海誠"]}, "tags": {}},
    )
    admin_client.put(
        f"/api/credits/anime/{a.system_id}",
        json={"credits": {"director": []}, "tags": {}},
    )
    body = client.get(f"/api/credits/anime/{a.system_id}").json()
    assert body["credits"]["studio"] == ["MAPPA"]
    assert "director" not in body["credits"]


def test_a_role_the_media_type_does_not_have_is_rejected(admin_client, db_session):
    a = _anime(db_session)
    r = admin_client.put(
        f"/api/credits/anime/{a.system_id}",
        json={"credits": {"author": ["X"]}, "tags": {}},
    )
    assert r.status_code == 400


def test_an_unknown_media_type_is_rejected(client):
    import uuid

    assert client.get(f"/api/credits/nope/{uuid.uuid4()}").status_code == 400


def test_a_missing_entry_is_a_404(client):
    import uuid

    assert client.get(f"/api/credits/anime/{uuid.uuid4()}").status_code == 404


def test_writes_require_admin(client, db_session):
    a = _anime(db_session)
    r = client.put(
        f"/api/credits/anime/{a.system_id}", json={"credits": {}, "tags": {}}
    )
    assert r.status_code in (401, 403)


def test_exclusive_source_rejects_a_second_value(admin_client, sample_anime):
    r = admin_client.put(
        f"/api/credits/anime/{sample_anime.system_id}",
        json={"tags": {"exclusive_source": ["Netflix", "Crunchyroll"]}},
    )
    assert r.status_code == 400


def test_anime_payload_carries_linkable_studio_refs(
    admin_client, db_session, sample_anime
):
    studio = models.Studio(name_en="MAPPA")
    db_session.add(studio)
    db_session.flush()
    db_session.add(
        models.MediaCredit(
            media_id=sample_anime.system_id,
            role="studio",
            studio_id=studio.system_id,
            position=0,
        )
    )
    db_session.commit()

    body = admin_client.get(f"/api/anime/{sample_anime.system_id}").json()
    assert body["studio"] == "MAPPA"          # legacy string, unchanged
    # public_id rides along so the page can build /studio/<id>/<slug> without
    # a second fetch; the UUID stays for every other call.
    assert body["studio_refs"] == [
        {
            "system_id": str(studio.system_id),
            "public_id": studio.public_id,
            "display_name": "MAPPA",
        }
    ]


def test_manga_genre_and_label_round_trip_onto_its_detail(
    admin_client, client, manga_entry
):
    """
    Genre Main, Genre Sub and Label serve every mainstream type, not only
    anime. A write through /api/credits lands on the manga's own detail
    response under the field key.
    """
    r = admin_client.put(
        f"/api/credits/manga/{manga_entry.system_id}",
        json={
            "tags": {
                "genre_main": ["奇幻", "冒險"],
                "genre_sub": ["異世界"],
                "label": ["神作"],
            }
        },
    )
    assert r.status_code == 200, r.text

    tags = client.get(f"/api/credits/manga/{manga_entry.system_id}").json()["tags"]
    assert tags["genre_main"] == ["奇幻", "冒險"]

    body = client.get(f"/api/manga/{manga_entry.system_id}").json()
    assert body["genre_main"] == "奇幻, 冒險"
    assert body["genre_sub"] == "異世界"
    assert body["label"] == "神作"


def test_genre_main_is_still_refused_on_a_game(admin_client, db_session):
    """Game keeps its own Game Genre vocabulary; Label is the mirror case."""
    g = models.Game(game_name_en="Hades")
    db_session.add(g)
    db_session.commit()

    refused = admin_client.put(
        f"/api/credits/game/{g.system_id}", json={"tags": {"genre_main": ["奇幻"]}}
    )
    assert refused.status_code == 400

    accepted = admin_client.put(
        f"/api/credits/game/{g.system_id}", json={"tags": {"label": ["神作"]}}
    )
    assert accepted.status_code == 200, accepted.text
