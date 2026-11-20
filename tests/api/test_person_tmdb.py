"""
A person's IMDb link, and the Person (TMDB) Fill that resolves it through
TMDB's /find and fills what MAL left blank: the English name, the photo, and
the gender when TMDB says male or female.

TMDB, Tenrai and the photo download are patched at the autofill module's own
names, so these exercise the real router -> autofill and pipeline -> autofill
wiring without a network call.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.main import app
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_person_from_tmdb
from app.services.domain.checking import has_missing_values_person_tmdb
from app.services.pipelines import runner as runner_module
from app.services.pipelines.specs import FILL_ALL, PIPELINES, REPLACE_ALL
from app.services.pipelines.tabs import SHEET_TABS
from app.utils.formatter import parse_person_from_sheet

KANA_IMDB = "https://www.imdb.com/name/nm2017929/"
KANA_MAL = "https://myanimelist.net/people/185/Kana_Hanazawa"

KANA_TMDB = {
    "id": 1245,
    "name": "Kana Hanazawa (TMDB)",
    "gender": 1,
    "profile_path": "/kana.jpg",
}

KANA_MAL_RECORD = {
    "mal_id": 185,
    "url": KANA_MAL,
    "images": {"jpg": {"image_url": "https://cdn.myanimelist.net/images/voiceactors/3/1.jpg"}},
    "name": "Hanazawa, Kana",
    "given_name": "香菜",
    "family_name": "花澤",
    "alternate_names": [],
}


@pytest.fixture
def calls(monkeypatch):
    """Records every fetch, in order, as (source, id); stubs the download and
    records which URL each photo came from."""
    record = {"fetches": [], "downloads": [], "tmdb": KANA_TMDB}

    def fake_tmdb(imdb_id):
        record["fetches"].append(("tmdb", imdb_id))
        return record["tmdb"]

    def fake_mal(mal_id):
        record["fetches"].append(("mal", mal_id))
        return KANA_MAL_RECORD

    def fake_download(url, owner_type, system_id):
        record["downloads"].append(url)
        return f"{owner_type}/{system_id}.jpg"

    monkeypatch.setattr(autofill_module, "fetch_tmdb_person_data", fake_tmdb)
    monkeypatch.setattr(autofill_module, "fetch_tenrai_person_data", fake_mal)
    monkeypatch.setattr(autofill_module, "download_cover_image", fake_download)
    # The stub writes no file, so the real check would call the first photo
    # missing and fetch a second one.
    monkeypatch.setattr(
        autofill_module, "cover_needs_download", lambda key, owner_type, system_id: not key
    )

    async def no_pause(seconds):
        return None

    monkeypatch.setattr(runner_module.asyncio, "sleep", no_pause)
    return record


def _person(db_session, role="director", **columns):
    person = models.Person(system_id=uuid.uuid4(), **columns)
    db_session.add(person)
    db_session.flush()
    db_session.add(models.PersonRole(person_id=person.system_id, role=role, scope="anime"))
    db_session.flush()
    return person


# ---------------------------------------------------------------------------
# The columns, and the sheet
# ---------------------------------------------------------------------------


def test_the_sheet_carries_the_imdb_columns():
    parsed = parse_person_from_sheet({"imdb_id": "nm2017929", "imdb_link": KANA_IMDB})
    assert parsed["imdb_id"] == "nm2017929"
    assert parsed["imdb_link"] == KANA_IMDB


def test_the_person_parser_reads_back_every_column_the_person_tab_writes():
    """
    Pull keeps only the keys a parser emits, so a column Backup writes and the
    parser does not name is silently dropped on every Pull. Walked over the
    model rather than listed, so a new person column cannot land on the
    Backup side only.
    """
    tab = next(t for t in SHEET_TABS if t.name == "Person")
    written = {
        c.name for c in tab.model.__table__.columns if c.name not in tab.drop_columns
    }
    # Every header with a value: public_id is emitted only when its cell
    # holds an integer (_public_id_from_sheet).
    parsed = set(tab.parser({name: "1" for name in written}))
    assert written - parsed == set()


# ---------------------------------------------------------------------------
# Eligibility
# ---------------------------------------------------------------------------


def test_a_person_with_an_imdb_id_and_gaps_is_eligible(db_session):
    person = _person(db_session, name_en="Kana", imdb_id="nm2017929")
    assert PIPELINES["person-tmdb"].fill_eligible(db_session, person) is True


def test_a_person_without_an_imdb_id_is_refused(db_session):
    """The same gaps as the person above, so only the missing id refuses."""
    person = _person(db_session, name_en="Kana")
    assert has_missing_values_person_tmdb(person) is True
    assert PIPELINES["person-tmdb"].fill_eligible(db_session, person) is False


@pytest.mark.parametrize("blank", ["name_en", "photo_file", "gender"])
def test_each_tmdb_column_alone_is_a_gap(db_session, blank):
    columns = {"name_en": "Kana", "photo_file": "p.jpg", "gender": "女"}
    columns[blank] = None
    person = _person(db_session, name_jp="花澤香菜", imdb_id="nm2017929", **columns)
    assert PIPELINES["person-tmdb"].fill_eligible(db_session, person) is True


def test_a_person_with_every_tmdb_column_set_is_not_eligible(db_session):
    """name_jp, mal_link and the rest are MAL's columns; their being blank is
    no gap for TMDB. The mirror is test_each_tmdb_column_alone_is_a_gap."""
    person = _person(
        db_session, name_en="Kana", photo_file="p.jpg", gender="女", imdb_id="nm2017929"
    )
    assert has_missing_values_person_tmdb(person) is False
    assert PIPELINES["person-tmdb"].fill_eligible(db_session, person) is False


# ---------------------------------------------------------------------------
# The autofill - fill-only, the gender rule, the name tuple's uniqueness
# ---------------------------------------------------------------------------


def test_autofill_fills_the_blank_columns(db_session, calls):
    person = _person(db_session, name_jp="花澤香菜", imdb_id="nm2017929")
    autofill_person_from_tmdb(person, db_session)
    assert calls["fetches"] == [("tmdb", "nm2017929")]
    assert person.name_en == "Kana Hanazawa (TMDB)"
    assert person.gender == "女"
    assert person.photo_file == f"staff/{person.system_id}.jpg"
    assert calls["downloads"] == ["https://image.tmdb.org/t/p/w500/kana.jpg"]


def test_autofill_overwrites_nothing(db_session, calls):
    person = _person(
        db_session, name_en="Mine", gender="男", photo_file="uploaded.png", imdb_id="nm1"
    )
    autofill_person_from_tmdb(person, db_session)
    assert person.name_en == "Mine"
    assert person.gender == "男"
    assert person.photo_file == "uploaded.png"
    assert calls["downloads"] == []


@pytest.mark.parametrize("gender", [0, 3, None])
def test_an_unknown_or_non_binary_gender_is_left_null(db_session, calls, gender):
    calls["tmdb"] = {**KANA_TMDB, "gender": gender}
    person = _person(db_session, name_jp="花澤香菜", imdb_id="nm2017929")
    autofill_person_from_tmdb(person, db_session)
    assert person.gender is None
    # The rest still lands.
    assert person.name_en == "Kana Hanazawa (TMDB)"


def test_a_male_person_is_written_as_male(db_session, calls):
    calls["tmdb"] = {**KANA_TMDB, "gender": 2}
    person = _person(db_session, name_jp="宮崎駿", imdb_id="nm0594503")
    autofill_person_from_tmdb(person, db_session)
    assert person.gender == "男"


def test_autofill_skips_the_name_when_it_would_collide(db_session, calls, caplog):
    """The filled tuple (Kana Hanazawa (TMDB), -, 花澤香菜, -) already belongs
    to another row, so the name is skipped - uq_person_name would refuse the
    commit - but the gender and the photo still land."""
    db_session.add(models.Person(name_en="Kana Hanazawa (TMDB)", name_jp="花澤香菜"))
    person = _person(db_session, name_jp="花澤香菜", imdb_id="nm2017929")
    autofill_person_from_tmdb(person, db_session)
    assert person.name_en is None
    assert person.gender == "女"
    assert person.photo_file == f"staff/{person.system_id}.jpg"
    assert "collide" in caplog.text
    db_session.flush()  # and the row is still writable


def test_autofill_without_an_imdb_id_fetches_nothing(db_session, calls):
    person = _person(db_session, name_en="Kana")
    autofill_person_from_tmdb(person, db_session)
    assert calls["fetches"] == []


def test_autofill_swallows_a_failing_fetch(db_session, monkeypatch):
    def boom(imdb_id):
        raise RuntimeError("tmdb down")

    monkeypatch.setattr(autofill_module, "fetch_tmdb_person_data", boom)
    person = _person(db_session, name_jp="花澤香菜", imdb_id="nm2017929")
    autofill_person_from_tmdb(person, db_session)
    assert person.name_en is None


# ---------------------------------------------------------------------------
# The router: the id on every write, and MAL then TMDB
# ---------------------------------------------------------------------------


def test_create_derives_the_imdb_id_and_fills_from_tmdb(owner_client, calls):
    body = owner_client.post(
        "/api/person/", json={"name_jp": "花澤香菜", "imdb_link": KANA_IMDB}
    ).json()
    assert body["imdb_id"] == "nm2017929"
    assert body["imdb_link"] == KANA_IMDB
    assert calls["fetches"] == [("tmdb", "nm2017929")]
    assert body["name_en"] == "Kana Hanazawa (TMDB)"
    assert body["gender"] == "女"


def test_patch_derives_the_imdb_id(owner_client, calls):
    created = owner_client.post("/api/person/", json={"name_en": "Kana"}).json()
    r = owner_client.patch(f"/api/person/{created['system_id']}", json={"imdb_link": KANA_IMDB})
    assert r.status_code == 200, r.text
    assert r.json()["imdb_id"] == "nm2017929"
    # PATCH derives the id and fetches nothing, as for the MAL link.
    assert calls["fetches"] == []


def test_save_runs_mal_first_and_tmdb_fills_only_what_is_left(owner_client, calls):
    body = owner_client.post(
        "/api/person/", json={"name_cn": "花澤香菜", "mal_link": KANA_MAL, "imdb_link": KANA_IMDB}
    ).json()
    assert calls["fetches"] == [("mal", 185), ("tmdb", "nm2017929")]
    # MAL's name and photo, never TMDB's.
    assert body["name_en"] == "Kana Hanazawa"
    assert calls["downloads"] == [KANA_MAL_RECORD["images"]["jpg"]["image_url"]]
    # MAL has no gender, so that is TMDB's.
    assert body["gender"] == "女"


def test_put_asks_tmdb_nothing_when_its_columns_are_set(owner_client, calls):
    created = owner_client.post("/api/person/", json={"name_en": "Kana"}).json()
    calls["fetches"].clear()
    r = owner_client.put(
        f"/api/person/{created['system_id']}",
        json={
            "name_en": "Kana",
            "gender": "女",
            "photo_file": "staff/mine.jpg",
            "imdb_link": KANA_IMDB,
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["imdb_id"] == "nm2017929"
    assert calls["fetches"] == []


def test_put_fills_from_tmdb_while_a_column_is_blank(owner_client, calls):
    """The mirror of the test above: gender cleared, so TMDB is asked."""
    created = owner_client.post("/api/person/", json={"name_en": "Kana"}).json()
    calls["fetches"].clear()
    body = owner_client.put(
        f"/api/person/{created['system_id']}",
        json={"name_en": "Kana", "photo_file": "staff/mine.jpg", "imdb_link": KANA_IMDB},
    ).json()
    assert calls["fetches"] == [("tmdb", "nm2017929")]
    assert body["gender"] == "女"
    assert body["name_en"] == "Kana"


def test_the_autofill_button_runs_tmdb_for_a_person_with_only_an_imdb_link(
    owner_client, db_session, calls
):
    person = _person(db_session, name_jp="花澤香菜", imdb_link=KANA_IMDB)
    db_session.commit()
    r = owner_client.post(f"/api/person/{person.system_id}/autofill")
    assert r.status_code == 200, r.text
    assert calls["fetches"] == [("tmdb", "nm2017929")]
    assert r.json()["gender"] == "女"


def test_the_autofill_button_runs_mal_then_tmdb(owner_client, db_session, calls):
    person = _person(db_session, name_cn="花澤香菜", mal_link=KANA_MAL, imdb_link=KANA_IMDB)
    db_session.commit()
    r = owner_client.post(f"/api/person/{person.system_id}/autofill")
    assert r.status_code == 200, r.text
    assert calls["fetches"] == [("mal", 185), ("tmdb", "nm2017929")]
    assert r.json()["name_en"] == "Kana Hanazawa"


# ---------------------------------------------------------------------------
# The pipeline
# ---------------------------------------------------------------------------


def _routes():
    return {(m, r.path) for r in app.routes for m in getattr(r, "methods", ())}


def test_the_fill_route_exists_and_replace_does_not():
    r = _routes()
    assert ("POST", "/api/data-control/fill/person-tmdb") in r
    assert ("POST", "/api/data-control/replace/person-tmdb") not in r


def test_person_tmdb_runs_after_person_mal_in_fill_all_and_not_in_replace_all():
    keys = [s.key for s in FILL_ALL]
    assert keys.index("person-mal") < keys.index("person-tmdb")
    assert PIPELINES["person-tmdb"] not in REPLACE_ALL
    assert PIPELINES["person-tmdb"].fill_only is True
    assert PIPELINES["person-tmdb"].label == "Person (TMDB)"
    assert PIPELINES["person-mal"].label == "Person (MAL)"


def test_the_pipeline_derives_the_id_and_fills(owner_client, db_session, calls):
    person = _person(db_session, name_jp="花澤香菜", imdb_link=KANA_IMDB)
    db_session.commit()
    person_id = person.system_id

    response = owner_client.post("/api/data-control/fill/person-tmdb")
    assert response.status_code == 200
    assert "success" in response.text

    db_session.expire_all()
    filled = db_session.get(models.Person, person_id)
    assert filled.imdb_id == "nm2017929"
    assert filled.name_en == "Kana Hanazawa (TMDB)"
    assert filled.gender == "女"
    assert calls["fetches"] == [("tmdb", "nm2017929")]
