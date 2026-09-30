"""
A person's MAL link, and the Seiyuu Fill that enriches a voice actor from
MAL's people record through Tenrai.

Tenrai and the photo download are patched at the autofill module's own names,
so these exercise the real router -> autofill and pipeline -> autofill wiring
without a network call.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.main import app
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_person_from_mal
from app.services.domain.derivation import apply_extract_mal_id_person
from app.services.pipelines import runner as runner_module
from app.services.pipelines.specs import FILL_ALL, PIPELINES, REPLACE_ALL
from app.utils.formatter import parse_person_from_sheet
from app.utils.tenrai_utils import map_tenrai_to_person_data
from app.utils.utils import extract_mal_id_person

KANA_LINK = "https://myanimelist.net/people/185/Kana_Hanazawa"

KANA = {
    "mal_id": 185,
    "url": KANA_LINK,
    "website_url": "https://hanazawa-kana.com/",
    "images": {
        "jpg": {"image_url": "https://cdn.myanimelist.net/images/voiceactors/3/69318.jpg"}
    },
    "name": "Hanazawa, Kana",
    "given_name": "香菜",
    "family_name": "花澤",
    "alternate_names": ["HanaKana", "KanaHana"],
    "birthday": "1989-02-25T00:00:00+00:00",
}


@pytest.fixture
def tenrai_calls(monkeypatch):
    """Records every people id fetched, and stubs the photo download."""
    calls = []

    def fake_fetch(mal_id):
        calls.append(mal_id)
        return KANA

    monkeypatch.setattr(autofill_module, "fetch_tenrai_person_data", fake_fetch)
    monkeypatch.setattr(
        autofill_module,
        "download_cover_image",
        lambda url, owner_type, system_id: f"{owner_type}/{system_id}.jpg",
    )

    async def no_pause(seconds):
        return None

    monkeypatch.setattr(runner_module.asyncio, "sleep", no_pause)
    return calls


def _seiyuu(db_session, **columns):
    person = models.Person(system_id=uuid.uuid4(), **columns)
    db_session.add(person)
    db_session.flush()
    db_session.add(
        models.PersonRole(person_id=person.system_id, role="seiyuu", scope="anime")
    )
    db_session.flush()
    return person


def _director(db_session, **columns):
    person = models.Person(system_id=uuid.uuid4(), **columns)
    db_session.add(person)
    db_session.flush()
    db_session.add(
        models.PersonRole(person_id=person.system_id, role="director", scope="anime")
    )
    db_session.flush()
    return person


# ---------------------------------------------------------------------------
# The id, from the link
# ---------------------------------------------------------------------------


def test_the_people_id_is_extracted_from_a_link():
    assert extract_mal_id_person(KANA_LINK) == 185
    assert extract_mal_id_person("https://myanimelist.net/people/185") == 185


@pytest.mark.parametrize(
    "value",
    [
        None,
        "",
        "https://myanimelist.net/anime/producer/569/MAPPA",
        "https://myanimelist.net/character/40881/Mikasa",
        "https://hanazawa-kana.com/",
    ],
)
def test_anything_else_extracts_nothing(value):
    assert extract_mal_id_person(value) is None


def test_apply_writes_the_id_onto_the_person():
    person = models.Person(name_en="Kana", mal_link=KANA_LINK)
    assert apply_extract_mal_id_person(person) is True
    assert person.mal_id == 185


def test_the_sheet_carries_the_mal_columns():
    parsed = parse_person_from_sheet({"mal_id": "185", "mal_link": KANA_LINK})
    assert parsed["mal_id"] == 185
    assert parsed["mal_link"] == KANA_LINK


# ---------------------------------------------------------------------------
# The router
# ---------------------------------------------------------------------------


def test_create_derives_the_mal_id_from_the_link(admin_client, tenrai_calls):
    body = admin_client.post(
        "/api/person/", json={"name_en": "Kana Hanazawa", "mal_link": KANA_LINK}
    ).json()
    assert body["mal_id"] == 185
    assert body["mal_link"] == KANA_LINK


def test_update_derives_the_mal_id_from_the_link(admin_client, tenrai_calls):
    created = admin_client.post("/api/person/", json={"name_en": "Kana Hanazawa"}).json()
    body = admin_client.put(
        f"/api/person/{created['system_id']}",
        json={"name_en": "Kana Hanazawa", "mal_link": KANA_LINK},
    ).json()
    assert body["mal_id"] == 185


def test_patch_derives_the_mal_id_from_the_link(admin_client, tenrai_calls):
    created = admin_client.post("/api/person/", json={"name_en": "Kana Hanazawa"}).json()
    r = admin_client.patch(
        f"/api/person/{created['system_id']}", json={"mal_link": KANA_LINK}
    )
    assert r.status_code == 200, r.text
    assert r.json()["mal_id"] == 185


def test_saving_a_seiyuu_with_a_mal_id_fills_it(admin_client, tenrai_calls):
    body = admin_client.post(
        "/api/person/",
        json={
            "name_en": "Kana Hanazawa",
            "mal_link": KANA_LINK,
            "roles": [{"role": "seiyuu", "scope": "anime"}],
        },
    ).json()
    assert tenrai_calls == [185]
    assert body["name_jp"] == "花澤香菜"
    assert body["name_alt"] == "HanaKana, KanaHana"
    assert body["photo_file"] == f"staff/{body['system_id']}.jpg"
    # Typed by the admin, so the fill leaves it alone.
    assert body["name_en"] == "Kana Hanazawa"


def test_saving_a_non_seiyuu_with_a_mal_id_fetches_nothing(admin_client, tenrai_calls):
    body = admin_client.post(
        "/api/person/",
        json={
            "name_en": "Some Director",
            "mal_link": KANA_LINK,
            "roles": [{"role": "director", "scope": "anime"}],
        },
    ).json()
    assert body["mal_id"] == 185
    assert tenrai_calls == []
    assert body["name_jp"] is None


def test_put_fills_a_seiyuu_when_the_link_is_added(admin_client, tenrai_calls):
    roles = [{"role": "seiyuu", "scope": "anime"}]
    created = admin_client.post(
        "/api/person/", json={"name_en": "Kana Hanazawa", "roles": roles}
    ).json()
    assert tenrai_calls == []
    body = admin_client.put(
        f"/api/person/{created['system_id']}",
        json={"name_en": "Kana Hanazawa", "mal_link": KANA_LINK, "roles": roles},
    ).json()
    assert tenrai_calls == [185]
    assert body["name_jp"] == "花澤香菜"


# ---------------------------------------------------------------------------
# Mapping - pure, no network
# ---------------------------------------------------------------------------


def test_mapping_the_people_record():
    data = map_tenrai_to_person_data(KANA)
    assert data["mal_link"] == KANA_LINK
    assert data["name_en"] == "Kana Hanazawa"
    assert data["name_jp"] == "花澤香菜"
    assert data["name_alt"] == "HanaKana, KanaHana"
    assert data["photo_url"] == KANA["images"]["jpg"]["image_url"]


def test_mapping_keeps_a_name_without_one_comma_as_it_is():
    assert map_tenrai_to_person_data({"name": "LiSA"})["name_en"] == "LiSA"
    assert map_tenrai_to_person_data({"name": "A, B, C"})["name_en"] == "A, B, C"


def test_mapping_takes_whichever_half_of_the_japanese_name_exists():
    assert map_tenrai_to_person_data({"family_name": "花澤"})["name_jp"] == "花澤"
    assert map_tenrai_to_person_data({"given_name": "香菜"})["name_jp"] == "香菜"
    assert map_tenrai_to_person_data({})["name_jp"] is None


def test_mapping_drops_an_empty_alternate_list_and_the_placeholder_photo():
    data = map_tenrai_to_person_data(
        {
            "alternate_names": [],
            "images": {
                "jpg": {"image_url": "https://cdn.myanimelist.net/images/questionmark_23.gif"}
            },
        }
    )
    assert data["name_alt"] is None
    assert data["photo_url"] is None


# ---------------------------------------------------------------------------
# The autofill - fill-only, and the name tuple's uniqueness
# ---------------------------------------------------------------------------


def test_autofill_fills_only_empty_columns(db_session, tenrai_calls):
    person = _seiyuu(
        db_session,
        name_en="Mine",
        name_jp="手入力",
        photo_file="uploaded.png",
        mal_link="https://myanimelist.net/people/185",
        mal_id=185,
    )
    autofill_person_from_mal(person, db_session)
    assert person.name_en == "Mine"
    assert person.name_jp == "手入力"
    assert person.photo_file == "uploaded.png"
    assert person.mal_link == "https://myanimelist.net/people/185"
    # The one column that was empty.
    assert person.name_alt == "HanaKana, KanaHana"


def test_autofill_skips_the_names_when_they_would_collide(db_session, tenrai_calls, caplog):
    """
    The filled tuple (Kana Hanazawa, -, 花澤香菜, HanaKana, KanaHana) already
    belongs to another row, so the names are skipped - uq_person_name would
    refuse the commit - but the photo and the link still land.
    """
    db_session.add(
        models.Person(
            name_en="Kana Hanazawa", name_jp="花澤香菜", name_alt="HanaKana, KanaHana"
        )
    )
    person = _seiyuu(db_session, name_en="Kana Hanazawa", mal_id=185)
    autofill_person_from_mal(person, db_session)
    assert person.name_jp is None
    assert person.name_alt is None
    assert person.mal_link == KANA_LINK
    assert person.photo_file == f"staff/{person.system_id}.jpg"
    assert "collide" in caplog.text
    db_session.flush()  # and the row is still writable


def test_autofill_swallows_a_failing_fetch(db_session, monkeypatch):
    def boom(mal_id):
        raise RuntimeError("tenrai down")

    monkeypatch.setattr(autofill_module, "fetch_tenrai_person_data", boom)
    person = _seiyuu(db_session, name_en="Kana", mal_id=185)
    autofill_person_from_mal(person, db_session)
    assert person.name_jp is None


# ---------------------------------------------------------------------------
# The pipeline
# ---------------------------------------------------------------------------


def _routes():
    return {(m, r.path) for r in app.routes for m in getattr(r, "methods", ())}


def test_the_fill_route_exists_and_replace_does_not():
    r = _routes()
    assert ("POST", "/api/data-control/fill/seiyuu") in r
    assert ("POST", "/api/data-control/replace/seiyuu") not in r


def test_seiyuu_joins_fill_all_but_not_replace_all():
    assert PIPELINES["seiyuu"] in FILL_ALL
    assert PIPELINES["seiyuu"] not in REPLACE_ALL


def test_a_seiyuu_with_a_mal_id_and_gaps_is_eligible(db_session):
    person = _seiyuu(db_session, name_en="Kana", mal_id=185)
    assert PIPELINES["seiyuu"].fill_eligible(db_session, person) is True


def test_a_non_seiyuu_is_refused_even_with_a_mal_id_and_gaps(db_session):
    """
    Everything but the role is what the seiyuu above has - a mal_id and empty
    fillable columns - so only the role can be what refuses. The mirror
    assertion proves has_missing_values_person says yes for this very row.
    """
    from app.services.domain.checking import has_missing_values_person

    director = _director(db_session, name_en="Director", mal_id=185)
    assert has_missing_values_person(director) is True
    assert PIPELINES["seiyuu"].fill_eligible(db_session, director) is False


def test_a_seiyuu_without_a_mal_id_is_refused(db_session):
    person = _seiyuu(db_session, name_en="Kana")
    assert PIPELINES["seiyuu"].fill_eligible(db_session, person) is False


def test_a_filled_seiyuu_is_no_longer_eligible(db_session):
    person = _seiyuu(
        db_session,
        name_en="Kana Hanazawa",
        name_jp="花澤香菜",
        name_alt="HanaKana",
        photo_file="p.jpg",
        mal_link=KANA_LINK,
        mal_id=185,
    )
    assert PIPELINES["seiyuu"].fill_eligible(db_session, person) is False


def test_the_pipeline_fills_seiyuu_only(admin_client, db_session, tenrai_calls):
    seiyuu = _seiyuu(db_session, name_en="Kana Hanazawa", mal_link=KANA_LINK)
    director = _director(db_session, name_en="Director", mal_link=KANA_LINK)
    db_session.commit()
    seiyuu_id, director_id = seiyuu.system_id, director.system_id

    response = admin_client.post("/api/data-control/fill/seiyuu")
    assert response.status_code == 200
    assert "success" in response.text

    db_session.expire_all()
    filled = db_session.get(models.Person, seiyuu_id)
    assert filled.mal_id == 185
    assert filled.name_jp == "花澤香菜"
    untouched = db_session.get(models.Person, director_id)
    assert untouched.name_jp is None
    assert tenrai_calls == [185]
