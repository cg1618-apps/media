"""A person's IMDb link, TMDB's person lookup and its mapping.

HTTP is mocked with ``responses`` — the suite makes no live calls.
"""

import pytest
import responses

from app import models
from app.services.domain.derivation import apply_extract_imdb_id_person
from app.services.integrations import tmdb
from app.utils.tmdb_utils import map_tmdb_to_person_data
from app.utils.utils import extract_imdb_id_person

BASE = tmdb.TMDB_BASE_URL

KANA_IMDB = "https://www.imdb.com/name/nm2017929/?ref_=nv_sr_srsg_0"

KANA_TMDB = {
    "id": 1245,
    "name": "Kana Hanazawa",
    "gender": 1,
    "profile_path": "/kana.jpg",
    "imdb_id": "nm2017929",
}


# ---------------------------------------------------------------------------
# The id, from the link
# ---------------------------------------------------------------------------


def test_the_name_id_is_extracted_from_a_link():
    assert extract_imdb_id_person(KANA_IMDB) == "nm2017929"
    assert extract_imdb_id_person("https://m.imdb.com/name/nm0000123") == "nm0000123"


@pytest.mark.parametrize(
    "value",
    [
        None,
        "",
        "https://www.imdb.com/title/tt0133093/",
        "https://myanimelist.net/people/185/Kana_Hanazawa",
        "https://www.imdb.com/name/",
    ],
)
def test_anything_else_extracts_nothing(value):
    assert extract_imdb_id_person(value) is None


def test_apply_writes_the_id_onto_the_person():
    person = models.Person(name_en="Kana", imdb_link=KANA_IMDB)
    assert apply_extract_imdb_id_person(person) is True
    assert person.imdb_id == "nm2017929"


def test_apply_leaves_an_existing_id_alone_when_the_link_has_none():
    person = models.Person(name_en="Kana", imdb_link="not a link", imdb_id="nm1")
    assert apply_extract_imdb_id_person(person) is False
    assert person.imdb_id == "nm1"


# ---------------------------------------------------------------------------
# Mapping - pure
# ---------------------------------------------------------------------------


def test_mapping_the_person_record():
    data = map_tmdb_to_person_data(KANA_TMDB)
    assert data == {
        "name_en": "Kana Hanazawa",
        "photo_url": "https://image.tmdb.org/t/p/w500/kana.jpg",
        "gender": "女",
    }


@pytest.mark.parametrize("gender, expected", [(2, "男"), (1, "女")])
def test_male_and_female_map_onto_the_person_vocabulary(gender, expected):
    assert map_tmdb_to_person_data({"gender": gender})["gender"] == expected


@pytest.mark.parametrize("gender", [0, 3, None, "2", 7])
def test_every_other_gender_is_left_unknown(gender):
    """0 is unknown and 3 non-binary; the person vocabulary is 男 / 女 / NULL,
    so neither has a value to write."""
    assert map_tmdb_to_person_data({"gender": gender})["gender"] is None


def test_mapping_without_a_name_or_photo():
    data = map_tmdb_to_person_data({"name": "  ", "profile_path": None})
    assert data["name_en"] is None
    assert data["photo_url"] is None


# ---------------------------------------------------------------------------
# The lookup: /find by the nm id, then /person
# ---------------------------------------------------------------------------


@pytest.fixture
def _key(monkeypatch):
    monkeypatch.setattr(tmdb.settings, "tmdb_api_key", "test-key")
    monkeypatch.setattr(tmdb.tmdb_rate_limiter, "wait_if_needed", lambda: None)


@responses.activate
def test_the_person_is_found_through_imdb_then_fetched(_key):
    responses.get(
        f"{BASE}/find/nm2017929",
        json={"person_results": [{"id": 1245}], "movie_results": []},
    )
    responses.get(f"{BASE}/person/1245", json=KANA_TMDB)

    assert tmdb.fetch_tmdb_person_data("nm2017929") == KANA_TMDB
    find_params = responses.calls[0].request.params
    assert find_params["external_source"] == "imdb_id"


@responses.activate
def test_no_person_result_is_none_and_fetches_nothing_more(_key):
    responses.get(f"{BASE}/find/nm9", json={"person_results": [], "movie_results": [{"id": 1}]})

    assert tmdb.fetch_tmdb_person_data("nm9") is None
    assert len(responses.calls) == 1


@responses.activate
def test_an_unknown_person_is_none(_key):
    responses.get(f"{BASE}/find/nm9", json={"person_results": [{"id": 5}]})
    responses.get(f"{BASE}/person/5", status=404)

    assert tmdb.fetch_tmdb_person_data("nm9") is None


@responses.activate
def test_no_api_key_is_none_without_a_request(monkeypatch):
    monkeypatch.setattr(tmdb.settings, "tmdb_api_key", None)
    assert tmdb.fetch_tmdb_person_data("nm2017929") is None
    assert len(responses.calls) == 0


def test_no_id_is_none():
    assert tmdb.fetch_tmdb_person_data(None) is None
