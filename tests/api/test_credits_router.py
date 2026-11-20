"""Reading and replacing an entry's credits and tags in one call."""

import pytest

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


def test_replace_then_read_round_trips(owner_client, client, db_session):
    a = _anime(db_session)
    owner_client.put(
        f"/api/credits/anime/{a.system_id}",
        json={
            "credits": {"studio": ["MAPPA"], "director": ["新海誠"]},
            "tags": {"genre_main": ["Action"]},
        },
    )
    body = client.get(f"/api/credits/anime/{a.system_id}").json()
    assert body["credits"]["studio"] == ["MAPPA"]
    assert body["tags"]["genre_main"] == ["Action"]


def test_replace_only_touches_the_roles_named(owner_client, client, db_session):
    a = _anime(db_session)
    owner_client.put(
        f"/api/credits/anime/{a.system_id}",
        json={"credits": {"studio": ["MAPPA"], "director": ["新海誠"]}, "tags": {}},
    )
    owner_client.put(
        f"/api/credits/anime/{a.system_id}",
        json={"credits": {"director": []}, "tags": {}},
    )
    body = client.get(f"/api/credits/anime/{a.system_id}").json()
    assert body["credits"]["studio"] == ["MAPPA"]
    assert "director" not in body["credits"]


def test_a_role_the_media_type_does_not_have_is_rejected(owner_client, db_session):
    a = _anime(db_session)
    r = owner_client.put(
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


def test_exclusive_source_rejects_a_second_value(owner_client, sample_anime):
    r = owner_client.put(
        f"/api/credits/anime/{sample_anime.system_id}",
        json={"tags": {"exclusive_source": ["Netflix", "Crunchyroll"]}},
    )
    assert r.status_code == 400


def test_anime_payload_carries_linkable_studio_refs(
    owner_client, db_session, sample_anime
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

    body = owner_client.get(f"/api/anime/{sample_anime.system_id}").json()
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
    owner_client, client, manga_entry
):
    """
    Genre Main, Genre Sub and Label serve every mainstream type, not only
    anime. A write through /api/credits lands on the manga's own detail
    response under the field key.
    """
    r = owner_client.put(
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


def test_genre_main_is_still_refused_on_a_game(owner_client, db_session):
    """Game keeps its own Game Genre vocabulary; Label is the mirror case."""
    g = models.Game(game_name_en="Hades")
    db_session.add(g)
    db_session.commit()

    refused = owner_client.put(
        f"/api/credits/game/{g.system_id}", json={"tags": {"genre_main": ["奇幻"]}}
    )
    assert refused.status_code == 400

    accepted = owner_client.put(
        f"/api/credits/game/{g.system_id}", json={"tags": {"label": ["神作"]}}
    )
    assert accepted.status_code == 200, accepted.text


@pytest.mark.parametrize(
    "media_type, route, name_field",
    [
        ("game", "game", "game_name_en"),
        ("h-game", "h-game", "h_game_name_en"),
        ("hentai", "hentai", "hentai_name_cn"),
    ],
)
def test_every_type_with_a_studio_role_carries_linkable_studio_refs(
    owner_client, db_session, media_type, route, name_field
):
    """A game's developer links to its studio page the way its 發行商 links
    to the publisher's: studio_refs is offered to every type whose roles
    include studio, not to anime and anime-movie alone. The studio exists
    and is credited, so an empty list means the refs were never built. It is
    made first because a game's developer is picked, never created."""
    db_session.add(models.Studio(name_en="Zvornik Dev Studio"))
    db_session.commit()
    body = owner_client.post(f"/api/{route}/", json={name_field: "Zvornik Developer Entry"})
    assert body.status_code in (200, 201), body.text
    entry_id = body.json()["system_id"]
    r = owner_client.put(
        f"/api/credits/{media_type}/{entry_id}",
        json={"credits": {"studio": ["Zvornik Dev Studio"]}},
    )
    assert r.status_code == 200, r.text
    studio = db_session.query(models.Studio).filter_by(name_en="Zvornik Dev Studio").one()

    payload = owner_client.get(f"/api/{route}/{entry_id}").json()
    assert payload["studio"] == "Zvornik Dev Studio"
    assert payload["studio_refs"] == [
        {
            "system_id": str(studio.system_id),
            "public_id": studio.public_id,
            "display_name": "Zvornik Dev Studio",
        }
    ]


# ---------------------------------------------------------------------------
# A game's developer and publisher are picked, never created by the credit.
# Each test seeds an existing studio and publisher beside the unknown name, so
# a refusal proves the names were checked one by one, not that the table was
# empty.
# ---------------------------------------------------------------------------


def _game_with_companies(db_session):
    g = models.Game(game_name_en="Zvornik Pick Game")
    studio = models.Studio(name_en="Zvornik Known Studio")
    publisher = models.Publisher(name_en="Zvornik Known Publisher")
    db_session.add_all([g, studio, publisher])
    db_session.commit()
    return g, studio, publisher


@pytest.mark.parametrize(
    "role, model, known",
    [
        ("studio", models.Studio, "Zvornik Known Studio"),
        ("publisher", models.Publisher, "Zvornik Known Publisher"),
    ],
)
def test_a_game_credit_naming_an_unknown_company_is_refused(
    owner_client, db_session, role, model, known
):
    g, _, _ = _game_with_companies(db_session)
    before = db_session.query(model).count()

    r = owner_client.put(
        f"/api/credits/game/{g.system_id}",
        json={"credits": {role: [known, "Zvornik Nobody"]}},
    )

    assert r.status_code == 422, r.text
    assert "Zvornik Nobody" in r.json()["detail"]
    assert known not in r.json()["detail"]
    db_session.expire_all()
    assert db_session.query(model).count() == before
    assert db_session.query(model).filter_by(name_en="Zvornik Nobody").count() == 0
    # Nothing was written, not even the half that matched.
    assert owner_client.get(f"/api/credits/game/{g.system_id}").json()["credits"] == {}


def test_a_refused_game_credit_writes_no_other_role_or_tag(owner_client, db_session):
    g, _, _ = _game_with_companies(db_session)
    r = owner_client.put(
        f"/api/credits/game/{g.system_id}",
        json={
            "credits": {"studio": ["Zvornik Nobody"], "director": ["Zvornik Director"]},
            "tags": {"label": ["神作"]},
        },
    )
    assert r.status_code == 422, r.text
    body = owner_client.get(f"/api/credits/game/{g.system_id}").json()
    assert body == {"credits": {}, "tags": {}}
    assert db_session.query(models.Person).filter_by(name_en="Zvornik Director").count() == 0


def test_a_game_credits_existing_companies_and_offers_the_publisher_on_game(
    owner_client, db_session
):
    """The mirror: existing names are credited, and a publisher scoped only to
    manga is widened to game - widening creates no company."""
    g, studio, publisher = _game_with_companies(db_session)
    db_session.add(models.PublisherScope(publisher_id=publisher.system_id, scope="manga"))
    db_session.commit()
    studios_before = db_session.query(models.Studio).count()
    publishers_before = db_session.query(models.Publisher).count()

    r = owner_client.put(
        f"/api/credits/game/{g.system_id}",
        json={
            "credits": {
                "studio": ["zvornik known studio"],
                "publisher": ["Zvornik Known Publisher"],
            }
        },
    )

    assert r.status_code == 200, r.text
    credits = owner_client.get(f"/api/credits/game/{g.system_id}").json()["credits"]
    assert credits == {
        "studio": ["Zvornik Known Studio"],
        "publisher": ["Zvornik Known Publisher"],
    }
    db_session.expire_all()
    assert db_session.query(models.Studio).count() == studios_before
    assert db_session.query(models.Publisher).count() == publishers_before
    scopes = {s.scope for s in db_session.get(models.Publisher, publisher.system_id).scopes}
    assert scopes == {"manga", "game"}


def test_an_ambiguous_game_developer_is_refused(owner_client, db_session):
    g, _, _ = _game_with_companies(db_session)
    db_session.add_all(
        [models.Studio(name_en="Zvornik Twin"), models.Studio(name_jp="Zvornik Twin")]
    )
    db_session.commit()
    r = owner_client.put(
        f"/api/credits/game/{g.system_id}",
        json={"credits": {"studio": ["Zvornik Twin"]}},
    )
    assert r.status_code == 422, r.text
    assert "Zvornik Twin" in r.json()["detail"]


def test_another_type_still_creates_its_studio(owner_client, db_session):
    """Pick-only is the game's rule alone: anime's studio stays find-or-create."""
    a = _anime(db_session)
    r = owner_client.put(
        f"/api/credits/anime/{a.system_id}",
        json={"credits": {"studio": ["Zvornik New Anime Studio"]}},
    )
    assert r.status_code == 200, r.text
    assert (
        db_session.query(models.Studio).filter_by(name_en="Zvornik New Anime Studio").count()
        == 1
    )
