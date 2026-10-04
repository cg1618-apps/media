"""The Open Library picker search.

HTTP is mocked with ``responses`` — the suite makes no live calls. The doc
shape mirrors a live search.json answer for the fields requested.
"""

import pytest
import responses

from app.services.integrations import openlibrary as ol
from app.services.integrations.external_search import ExternalSearchError
from app.utils.openlibrary_utils import extract_openlibrary_id

SEARCH_URL = f"{ol.OPENLIBRARY_BASE_URL}/search.json"

SAPIENS = {
    "author_name": ["Yuval Noah Harari"],
    "cover_i": 8634250,
    "first_publish_year": 2011,
    "key": "/works/OL17075811W",
    "subtitle": "A Brief History of Humankind",
    "title": "Sapiens",
}


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.setattr(ol.openlibrary_rate_limiter, "wait_if_needed", lambda: None)
    ol.search_openlibrary_works.cache_clear()
    yield
    ol.search_openlibrary_works.cache_clear()


@responses.activate
def test_a_doc_maps_onto_the_result_shape():
    responses.get(SEARCH_URL, json={"docs": [SAPIENS]})

    rows = ol.search_openlibrary_works("sapiens", 10)

    assert rows == [
        {
            "external_id": "OL17075811W",
            "link": "https://openlibrary.org/works/OL17075811W",
            "title": "Sapiens",
            "title_alt": "A Brief History of Humankind",
            "year": 2011,
            "detail": "Yuval Noah Harari",
            "cover_url": "https://covers.openlibrary.org/b/id/8634250-M.jpg",
        }
    ]
    request = responses.calls[0].request
    assert request.params["q"] == "sapiens"
    assert request.params["limit"] == "10"
    assert set(request.params["fields"].split(",")) >= {
        "key",
        "title",
        "subtitle",
        "first_publish_year",
        "author_name",
        "cover_i",
    }
    assert request.headers["User-Agent"] == ol.OPENLIBRARY_USER_AGENT


def test_the_link_round_trips_through_the_id_extractor():
    row = ol._map_search_doc(SAPIENS)
    assert extract_openlibrary_id(row["link"]) == row["external_id"]


@responses.activate
def test_missing_optional_fields_are_none_and_authors_are_capped():
    responses.get(
        SEARCH_URL,
        json={
            "docs": [
                {"key": "/works/OL1W", "title": "Bare"},
                {"key": "/works/OL2W", "title": "Many", "author_name": ["A", "B", "C"]},
                {"key": "/books/OL3M", "title": "An edition, not a work"},
            ]
        },
    )

    bare, many = ol.search_openlibrary_works("x", 10)

    assert bare["title_alt"] is None
    assert bare["year"] is None
    assert bare["detail"] is None
    assert bare["cover_url"] is None
    assert many["detail"] == "A, B"


@responses.activate
@pytest.mark.parametrize("status", [429, 500, 503])
def test_an_upstream_error_is_raised_after_one_attempt(status):
    responses.get(SEARCH_URL, status=status, json={})
    with pytest.raises(ExternalSearchError):
        ol.search_openlibrary_works("sapiens", 10)
    assert len(responses.calls) == 1


@responses.activate
def test_unreadable_json_is_an_error():
    responses.get(SEARCH_URL, body="<html>")
    with pytest.raises(ExternalSearchError):
        ol.search_openlibrary_works("sapiens", 10)


def test_a_network_failure_is_an_error(monkeypatch):
    def boom(*args, **kwargs):
        raise ol.requests.exceptions.Timeout("slow")

    monkeypatch.setattr(ol.requests, "get", boom)
    with pytest.raises(ExternalSearchError):
        ol.search_openlibrary_works("sapiens", 10)
