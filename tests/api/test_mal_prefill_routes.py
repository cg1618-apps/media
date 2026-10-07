"""
GET /api/<type>/mal-prefill/{mal_id}: what a MAL pick on the Add page fills.

Read-only by contract: the answer names studios and people the form will
resolve on save, and it never creates or links a row itself.
"""

import re

import pytest

from app import models
from app.routers import anime, anime_movie, manga, novel
from app.services.domain import mal_prefill as prefill_module
from app.services.integrations.external_search import ExternalSearchError

ANIME_RAW = {
    "type": "TV",
    "status": "Finished Airing",
    "season": "fall",
    "aired": {
        "prop": {"from": {"day": 29, "month": 9, "year": 2023}},
        "string": "Sep 29, 2023 to Mar 22, 2024",
    },
    "score": 9.3,
    "rank": 1,
    "episodes": 28,
    "title": "Sousou no Frieren",
    "title_english": "Frieren: Beyond Journey's End",
    "title_japanese": "葬送のフリーレン",
    "external": [{"name": "Official Site", "url": "https://frieren.test"}],
    "images": {"jpg": {"large_image_url": "https://cdn.test/frieren.jpg"}},
    "studios": [
        {
            "mal_id": 11,
            "type": "anime",
            "name": "Madhouse",
            "url": "https://myanimelist.net/anime/producer/11/Madhouse",
        }
    ],
}

MANGA_RAW = {
    "status": "Finished",
    "published": {
        "prop": {
            "from": {"day": 1, "month": 12, "year": 2003},
            "to": {"day": 15, "month": 5, "year": 2006},
        }
    },
    "score": 8.6,
    "rank": 50,
    "volumes": 12,
    "chapters": 108,
    "title": "Death Note",
    "title_english": "Death Note",
    "title_japanese": "デスノート",
    "images": {"jpg": {"large_image_url": "https://cdn.test/dn.jpg"}},
    "authors": [
        {
            "mal_id": 2619,
            "name": "Ohba, Tsugumi",
            "url": "https://myanimelist.net/people/2619/Tsugumi_Ohba",
            "role": "Story",
        },
        {
            "mal_id": 1893,
            "name": "Obata, Takeshi",
            "url": "https://myanimelist.net/people/1893/Takeshi_Obata",
            "role": "Art",
        },
    ],
}

PATHS = {
    "anime": "/api/anime/mal-prefill",
    "anime-movie": "/api/anime-movie/mal-prefill",
    "manga": "/api/manga/mal-prefill",
    "novel": "/api/novel/mal-prefill",
}
MODULES = {"anime": anime, "anime-movie": anime_movie, "manga": manga, "novel": novel}
ID_ROUTE = re.compile(r"/\{\w+\}$")


@pytest.fixture
def tenrai(monkeypatch):
    """Both lookups answer the fixtures above; records the ids asked for."""
    calls = []

    def anime_lookup(mal_id):
        calls.append(("anime", mal_id))
        return ANIME_RAW

    def manga_lookup(mal_id):
        calls.append(("manga", mal_id))
        return MANGA_RAW

    monkeypatch.setattr(prefill_module, "lookup_mal_anime", anime_lookup)
    monkeypatch.setattr(prefill_module, "lookup_mal_manga", manga_lookup)
    return calls


def _counts(db):
    return (db.query(models.Studio).count(), db.query(models.Person).count())


def test_anime(admin_client, tenrai):
    response = admin_client.get(f"{PATHS['anime']}/52991")
    assert response.status_code == 200
    assert response.json() == {
        "anime_name_en": "Frieren: Beyond Journey's End",
        "anime_name_jp": "葬送のフリーレン",
        "airing_type": "TV",
        "airing_status": "Finished Airing",
        "release_season": "FAL",
        "release_date": "2023-09-29",
        "ep_total": 28,
        "mal_rating": 9.3,
        "mal_rank": "1",
        "studio": "Madhouse",
    }
    assert tenrai == [("anime", 52991)]


def test_anime_movie_takes_only_what_its_autofill_writes(admin_client, tenrai):
    response = admin_client.get(f"{PATHS['anime-movie']}/52991")
    assert response.status_code == 200
    assert response.json() == {
        "anime_movie_name_en": "Frieren: Beyond Journey's End",
        "anime_movie_name_jp": "葬送のフリーレン",
        "airing_status": "Finished Airing",
        "release_date_jp": "2023-09-29",
        "mal_rating": 9.3,
        "mal_rank": "1",
        "studio": "Madhouse",
    }


def test_manga(admin_client, tenrai):
    response = admin_client.get(f"{PATHS['manga']}/21")
    assert response.status_code == 200
    assert response.json() == {
        "manga_name_en": "Death Note",
        "manga_name_jp": "デスノート",
        "serialization_status": "完結",
        "release_date": "2003-12-01",
        "end_date": "2006-05-15",
        "vol_total": 12,
        "ch_total": 108,
        "mal_rating": 8.6,
        "mal_rank": "50",
        "author_plot": "Tsugumi Ohba",
        "author_draw": "Takeshi Obata",
    }
    assert tenrai == [("manga", 21)]


def test_novel(admin_client, tenrai):
    response = admin_client.get(f"{PATHS['novel']}/21")
    assert response.status_code == 200
    assert response.json() == {
        "novel_name_en": "Death Note",
        "novel_name_jp": "デスノート",
        "serialization_status": "完結",
        "release_date": "2003-12-01",
        "end_date": "2006-05-15",
        "vol_total_original": 12.0,
        "ch_total": 108.0,
        "mal_rating": 8.6,
        "mal_rank": "50",
        "author": "Tsugumi Ohba",
        "illustrator": "Takeshi Obata",
    }


def test_totals_only_once_the_serialization_is_finished(admin_client, monkeypatch):
    publishing = {**MANGA_RAW, "status": "Publishing"}
    monkeypatch.setattr(prefill_module, "lookup_mal_manga", lambda mal_id: publishing)
    for media_type, totals in (("manga", ("vol_total", "ch_total")),
                               ("novel", ("vol_total_original", "ch_total"))):
        body = admin_client.get(f"{PATHS[media_type]}/21").json()
        assert body["serialization_status"] == "連載中"
        for field in totals:
            assert field not in body


def test_nulls_are_omitted(admin_client, monkeypatch):
    bare = {"title": "Bare", "studios": []}
    monkeypatch.setattr(prefill_module, "lookup_mal_anime", lambda mal_id: bare)
    assert admin_client.get(f"{PATHS['anime']}/1").json() == {}


def test_a_matched_studio_is_named_as_the_row_knows_itself(admin_client, db_session, tenrai):
    # `impostor` holds MAL's name; the MAL id is what decides, so the form
    # gets `linked`'s own name - which resolves back to `linked` on save.
    db_session.add(models.Studio(name_en="Madhouse", name_jp="ニセ"))
    db_session.add(models.Studio(name_en="Madhouse Inc.", mal_id=11))
    db_session.flush()

    assert admin_client.get(f"{PATHS['anime']}/52991").json()["studio"] == "Madhouse Inc."


def test_a_matched_name_that_would_resolve_elsewhere_is_not_used(admin_client, db_session, tenrai):
    # `linked` shows "MH", but "MH" is also another studio's name, so saving
    # "MH" would be ambiguous. Its other name resolves back to it alone.
    db_session.add(models.Studio(name_en="MH"))
    db_session.add(
        models.Studio(name_en="Madhouse Ltd", name_cn="MH", display_name_field="cn", mal_id=11)
    )
    db_session.flush()

    assert admin_client.get(f"{PATHS['anime']}/52991").json()["studio"] == "Madhouse Ltd"


def test_a_matched_person_is_named_as_the_row_knows_itself(admin_client, db_session, tenrai):
    db_session.add(models.Person(name_jp="大場つぐみ", mal_id=2619))
    db_session.add(models.Person(name_en="Tsugumi Ohba", name_cn="同名"))
    db_session.flush()

    body = admin_client.get(f"{PATHS['manga']}/21").json()
    assert body["author_plot"] == "大場つぐみ"
    assert body["author_draw"] == "Takeshi Obata"


def test_an_ambiguous_name_falls_back_to_mals_name(admin_client, db_session, tenrai):
    db_session.add(models.Studio(name_en="Madhouse"))
    db_session.add(models.Studio(name_jp="Madhouse"))
    db_session.flush()

    response = admin_client.get(f"{PATHS['anime']}/52991")
    assert response.status_code == 200
    assert response.json()["studio"] == "Madhouse"


def test_the_prefill_writes_nothing(admin_client, db_session, tenrai):
    # Rows that WOULD be linked or created by the save path, so a prefill
    # that wrote would show here.
    studio = models.Studio(name_en="Madhouse")
    person = models.Person(name_en="Tsugumi Ohba")
    db_session.add_all([studio, person])
    db_session.flush()
    before = _counts(db_session)

    for media_type in PATHS:
        assert admin_client.get(f"{PATHS[media_type]}/21").status_code == 200

    # No expire_all: it would discard an unflushed write, which is exactly
    # what this has to see. The request shares this session.
    assert _counts(db_session) == before
    assert studio.mal_id is None
    assert person.mal_id is None
    assert db_session.query(models.PersonRole).count() == 0


@pytest.mark.parametrize("media_type", list(PATHS))
def test_an_unknown_id_is_a_404(admin_client, monkeypatch, media_type):
    monkeypatch.setattr(prefill_module, "lookup_mal_anime", lambda mal_id: None)
    monkeypatch.setattr(prefill_module, "lookup_mal_manga", lambda mal_id: None)
    assert admin_client.get(f"{PATHS[media_type]}/999999").status_code == 404


@pytest.mark.parametrize("media_type", list(PATHS))
def test_tenrai_unreachable_is_a_502(admin_client, monkeypatch, media_type):
    def failing(mal_id):
        raise ExternalSearchError("MyAnimeList (Tenrai) is unreachable.")

    monkeypatch.setattr(prefill_module, "lookup_mal_anime", failing)
    monkeypatch.setattr(prefill_module, "lookup_mal_manga", failing)
    response = admin_client.get(f"{PATHS[media_type]}/1")
    assert response.status_code == 502
    assert response.json()["detail"] == "MyAnimeList (Tenrai) is unreachable."


@pytest.mark.parametrize("media_type", list(PATHS))
def test_a_user_without_manage_catalog_is_refused(user_client, tenrai, media_type):
    # Mirror of the admin cases: the same stub would answer.
    assert user_client.get(f"{PATHS[media_type]}/1").status_code == 401
    assert tenrai == []


@pytest.mark.parametrize("media_type", list(PATHS))
def test_the_path_is_not_swallowed_by_the_id_route(admin_client, tenrai, media_type):
    assert admin_client.get(f"{PATHS[media_type]}/1").status_code == 200
    module = MODULES[media_type]
    path = f"{PATHS[media_type]}/{{mal_id}}"
    literal = next(
        i for i, route in enumerate(module.router.routes) if getattr(route, "path", None) == path
    )
    catch_all = [
        i
        for i, route in enumerate(module.router.routes)
        if "GET" in getattr(route, "methods", set()) and ID_ROUTE.search(getattr(route, "path", ""))
        and getattr(route, "path", "") != path
    ]
    assert catch_all
    assert literal < min(catch_all)
