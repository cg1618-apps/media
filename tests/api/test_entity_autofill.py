"""
POST /api/{studio|person|character}/{system_id}/autofill - the detail page's
Autofill & update button.

It runs the fill a save already runs (blank columns only, from MAL through
Tenrai - and for a person, then from TMDB through its IMDb link), commits, and
answers the same body as GET. With nothing to fetch - no MAL link, or for a
person neither a MAL nor an IMDb link - it is a 422 saying why.

Tenrai and the picture download are patched at the autofill module's own
names, so these exercise the real router -> autofill wiring without a network
call.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.rbac.permissions import ENTITY_VIEW_PERMISSIONS
from app.services.rbac.seed import default_user_permissions
from tests.api.conftest import make_viewer

MAPPA_LINK = "https://myanimelist.net/anime/producer/569/MAPPA"
MAPPA = {
    "mal_id": 569,
    "url": MAPPA_LINK,
    "titles": [
        {"type": "Default", "title": "MAPPA"},
        {"type": "Japanese", "title": "マッパ"},
    ],
    "images": {"jpg": {"image_url": "https://cdn.example/mappa.jpg"}},
    "established": "2011-06-14T00:00:00+00:00",
    "external": [{"name": "mappa.co.jp", "url": "http://www.mappa.co.jp/"}],
}

KANA_LINK = "https://myanimelist.net/people/185/Kana_Hanazawa"
KANA = {
    "mal_id": 185,
    "url": KANA_LINK,
    "images": {"jpg": {"image_url": "https://cdn.example/kana.jpg"}},
    "name": "Hanazawa, Kana",
    "given_name": "香菜",
    "family_name": "花澤",
    "alternate_names": ["HanaKana"],
}

EDWARD_LINK = "https://myanimelist.net/character/11/Edward_Elric"
EDWARD = {
    "mal_id": 11,
    "url": EDWARD_LINK,
    "images": {"jpg": {"image_url": "https://cdn.example/ed.jpg"}},
    "name": "Elric, Edward",
    "name_kanji": "エドワード・エルリック",
    "nicknames": ["Ed"],
}


@pytest.fixture
def fetched(monkeypatch):
    """Records every MAL id fetched per kind, and stubs the picture download."""
    calls = {"studio": [], "person": [], "character": []}

    def recorder(kind, payload):
        def fake_fetch(mal_id):
            calls[kind].append(mal_id)
            return payload

        return fake_fetch

    monkeypatch.setattr(
        autofill_module, "fetch_tenrai_producer_data", recorder("studio", MAPPA)
    )
    monkeypatch.setattr(
        autofill_module, "fetch_tenrai_person_data", recorder("person", KANA)
    )
    monkeypatch.setattr(
        autofill_module, "fetch_tenrai_character_data", recorder("character", EDWARD)
    )
    monkeypatch.setattr(
        autofill_module,
        "download_cover_image",
        lambda url, owner_type, system_id: f"{owner_type}/{system_id}.jpg",
    )
    return calls


def _studio(db_session, **columns):
    studio = models.Studio(system_id=uuid.uuid4(), **columns)
    db_session.add(studio)
    db_session.flush()
    return studio


def _person(db_session, role="seiyuu", **columns):
    person = models.Person(system_id=uuid.uuid4(), **columns)
    db_session.add(person)
    db_session.flush()
    db_session.add(
        models.PersonRole(person_id=person.system_id, role=role, scope="anime")
    )
    db_session.flush()
    return person


def _character(db_session, **columns):
    character = models.Character(system_id=uuid.uuid4(), **columns)
    db_session.add(character)
    db_session.flush()
    return character


# ---------------------------------------------------------------------------
# Studio
# ---------------------------------------------------------------------------


def test_studio_autofill_fills_the_blank_columns(owner_client, db_session, fetched):
    studio = _studio(db_session, name_en="MAPPA", mal_link=MAPPA_LINK)

    res = owner_client.post(f"/api/studio/{studio.system_id}/autofill")

    assert res.status_code == 200
    assert fetched["studio"] == [569]
    body = res.json()
    assert body["mal_id"] == 569
    assert body["name_jp"] == "マッパ"
    assert body["founded_date"] == "2011-06-14"
    assert body["logo_file"] == f"studio/{studio.system_id}.jpg"
    db_session.expire_all()
    assert db_session.get(models.Studio, studio.system_id).name_jp == "マッパ"


def test_studio_autofill_keeps_what_is_already_there(owner_client, db_session, fetched):
    studio = _studio(
        db_session, name_en="MAPPA", name_jp="まっぱ", mal_link=MAPPA_LINK
    )

    body = owner_client.post(f"/api/studio/{studio.system_id}/autofill").json()

    assert body["name_jp"] == "まっぱ"
    assert body["website_url"] == "http://www.mappa.co.jp/"


def test_studio_autofill_without_a_mal_link_is_a_422(owner_client, db_session, fetched):
    studio = _studio(db_session, name_en="Bones")

    res = owner_client.post(f"/api/studio/{studio.system_id}/autofill")

    assert res.status_code == 422
    assert "MAL link" in res.json()["detail"]
    assert fetched["studio"] == []


def test_studio_autofill_survives_a_mal_failure(
    owner_client, db_session, fetched, monkeypatch
):
    def broken(mal_id):
        raise RuntimeError("Tenrai is down")

    monkeypatch.setattr(autofill_module, "fetch_tenrai_producer_data", broken)
    studio = _studio(db_session, name_en="MAPPA", mal_link=MAPPA_LINK)

    res = owner_client.post(f"/api/studio/{studio.system_id}/autofill")

    assert res.status_code == 200
    assert res.json()["name_jp"] is None


def test_studio_autofill_of_an_unknown_studio_is_a_404(owner_client, fetched):
    assert owner_client.post(f"/api/studio/{uuid.uuid4()}/autofill").status_code == 404


# ---------------------------------------------------------------------------
# Person
# ---------------------------------------------------------------------------


def test_person_autofill_fills_a_seiyuu(owner_client, db_session, fetched):
    person = _person(db_session, name_alt="Kana", mal_link=KANA_LINK)

    res = owner_client.post(f"/api/person/{person.system_id}/autofill")

    assert res.status_code == 200
    assert fetched["person"] == [185]
    body = res.json()
    assert body["mal_id"] == 185
    assert body["name_en"] == "Kana Hanazawa"
    assert body["name_alt"] == "Kana"
    assert body["photo_file"] == f"staff/{person.system_id}.jpg"


def test_person_autofill_fills_a_non_seiyuu_too(owner_client, db_session, fetched):
    person = _person(db_session, role="director", name_en="Someone", mal_link=KANA_LINK)

    res = owner_client.post(f"/api/person/{person.system_id}/autofill")

    assert res.status_code == 200
    assert fetched["person"] == [185]
    assert res.json()["name_jp"] == "花澤香菜"


def test_person_autofill_without_either_link_is_a_422(owner_client, db_session, fetched):
    person = _person(db_session, name_en="Kana Hanazawa")

    res = owner_client.post(f"/api/person/{person.system_id}/autofill")

    assert res.status_code == 422
    assert "MAL or IMDb link" in res.json()["detail"]
    assert fetched["person"] == []


# ---------------------------------------------------------------------------
# Character
# ---------------------------------------------------------------------------


def test_character_autofill_fills_the_blank_columns(owner_client, db_session, fetched):
    character = _character(db_session, name_cn="愛德華", mal_link=EDWARD_LINK)

    res = owner_client.post(f"/api/character/{character.system_id}/autofill")

    assert res.status_code == 200
    assert fetched["character"] == [11]
    body = res.json()
    assert body["name_en"] == "Edward Elric"
    assert body["name_jp"] == "エドワード・エルリック"
    assert body["name_cn"] == "愛德華"
    assert body["photo_file"] == f"character/{character.system_id}.jpg"


def test_character_autofill_without_a_mal_link_is_a_422(
    owner_client, db_session, fetched
):
    character = _character(db_session, name_en="Edward Elric")

    res = owner_client.post(f"/api/character/{character.system_id}/autofill")

    assert res.status_code == 422
    assert "MAL link" in res.json()["detail"]
    assert fetched["character"] == []


# ---------------------------------------------------------------------------
# The gate: manage.catalog, exactly as PUT
# ---------------------------------------------------------------------------
# Every entity below HAS a MAL link (and the person is a seiyuu), so the
# endpoint would fetch if the gate let it: a 401 with nothing fetched proves
# the gate refused, and the mirror test with the same rows proves the rows
# were fillable.


@pytest.fixture
def fillable(db_session):
    return {
        "studio": _studio(db_session, name_en="MAPPA", mal_link=MAPPA_LINK).system_id,
        "person": _person(db_session, name_alt="Kana", mal_link=KANA_LINK).system_id,
        "character": _character(
            db_session, name_cn="愛德華", mal_link=EDWARD_LINK
        ).system_id,
    }


@pytest.mark.parametrize("kind", ["studio", "person", "character"])
def test_autofill_refuses_a_reader_without_manage_catalog(
    db_session, client, fillable, fetched, kind
):
    reader = make_viewer(
        db_session,
        client,
        "entityreader",
        default_user_permissions() | ENTITY_VIEW_PERMISSIONS,
    )
    # The reader can see the entity, so the refusal is the capability's.
    assert reader.get(f"/api/{kind}/{fillable[kind]}").status_code == 200

    res = reader.post(f"/api/{kind}/{fillable[kind]}/autofill")

    # require_manage_catalog answers 401 to a signed-in member without the
    # capability, as on every catalogue write (test_catalog_router_gates.py).
    assert res.status_code == 401
    assert fetched[kind] == []


@pytest.mark.parametrize("kind", ["studio", "person", "character"])
def test_autofill_admits_a_catalogue_editor(catalog_writer, fillable, fetched, kind):
    writer = catalog_writer()

    res = writer.post(f"/api/{kind}/{fillable[kind]}/autofill")

    assert res.status_code == 200
    assert fetched[kind] != []


def test_autofill_refuses_a_guest(client, fillable, fetched):
    assert client.post(f"/api/studio/{fillable['studio']}/autofill").status_code in (
        401,
        403,
    )
    assert fetched["studio"] == []
