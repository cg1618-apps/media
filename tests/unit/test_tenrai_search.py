"""
The Add-tab MAL pickers' searches through Tenrai: the payload mapping onto
ExternalSearchResult, the type filters, and the single-attempt failure path.

requests is mocked with `responses` - the suite makes no live calls. The
payloads below are trimmed copies of live Tenrai search responses.
"""

import pytest
import requests
import responses
from responses import matchers

from app.services.integrations import tenrai
from app.services.integrations.external_search import ExternalSearchError
from app.utils.utils import (
    extract_mal_id_anime,
    extract_mal_id_character,
    extract_mal_id_manga_novel,
    extract_mal_id_person,
)

BASE = tenrai.TENRAI_BASE_URL

SEARCHES = (
    tenrai.search_mal_anime,
    tenrai.search_mal_manga,
    tenrai.search_mal_novel,
    tenrai.search_mal_people,
    tenrai.search_mal_characters,
)

FRIEREN = {
    "mal_id": 52991,
    "url": "https://myanimelist.net/anime/52991/Sousou_no_Frieren",
    "title": "Sousou no Frieren",
    "title_english": "Frieren: Beyond Journey's End",
    "title_japanese": "葬送のフリーレン",
    "type": "TV",
    "year": 2023,
    "episodes": 28,
    "aired": {"prop": {"from": {"year": 2023}}},
    "images": {
        "jpg": {"image_url": "https://cdn.myanimelist.net/images/anime/1015/138006.jpg"},
        "webp": {"image_url": "https://cdn.myanimelist.net/images/anime/1015/138006.webp"},
    },
}

# Movies often carry no `year`; the aired from-date supplies it.
MOVIE = {
    "mal_id": 199,
    "url": "https://myanimelist.net/anime/199/Sen_to_Chihiro_no_Kamikakushi",
    "title": "Sen to Chihiro no Kamikakushi",
    "title_english": "Spirited Away",
    "title_japanese": "千と千尋の神隠し",
    "type": "Movie",
    "year": None,
    "episodes": 1,
    "aired": {"prop": {"from": {"year": 2001}}},
    "images": {"webp": {"image_url": "https://cdn.myanimelist.net/images/anime/6/179931.webp"}},
}


def _manga(mal_id, type_, **extra):
    return {
        "mal_id": mal_id,
        "url": f"https://myanimelist.net/manga/{mal_id}/Ookami_to_Koushinryou",
        "title": "Ookami to Koushinryou",
        "title_english": None,
        "title_japanese": "狼と香辛料",
        "type": type_,
        "volumes": None,
        "chapters": None,
        "published": {"prop": {"from": {"year": 2006}}},
        "images": {"jpg": {"image_url": f"https://cdn.myanimelist.net/images/manga/{mal_id}.jpg"}},
        **extra,
    }


PERSON = {
    "mal_id": 185,
    "url": "https://myanimelist.net/people/185/Kana_Hanazawa",
    "name": "Hanazawa, Kana",
    "given_name": "香菜",
    "family_name": "花澤",
    "birthday": "1989-02-25T00:00:00+00:00",
    "favorites": 103099,
    "images": {"jpg": {"image_url": "https://cdn.myanimelist.net/images/voiceactors/3/69318.jpg"}},
}

CHARACTER = {
    "mal_id": 184947,
    "url": "https://myanimelist.net/character/184947/Frieren",
    "name": "Frieren",
    "name_kanji": "フリーレン",
    "nicknames": ["Frieren the Slayer"],
    "favorites": 33181,
    "images": {"jpg": {"image_url": "https://cdn.myanimelist.net/images/characters/7/525105.jpg"}},
}


def _page(*items):
    return {"pagination": {"has_next_page": False}, "data": list(items)}


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    monkeypatch.setattr(tenrai.tenrai_rate_limiter, "wait_if_needed", lambda: None)
    for search in SEARCHES:
        search.cache_clear()
    yield
    for search in SEARCHES:
        search.cache_clear()


class TestAnime:
    @responses.activate
    def test_maps_a_result_onto_the_picker_shape(self):
        responses.get(
            f"{BASE}/anime",
            json=_page(FRIEREN),
            match=[matchers.query_param_matcher({"q": "frieren", "limit": "10", "sfw": "true"})],
        )
        assert tenrai.search_mal_anime("frieren", 10) == [
            {
                "external_id": "52991",
                "link": "https://myanimelist.net/anime/52991/Sousou_no_Frieren",
                "title": "Sousou no Frieren",
                "title_alt": "Frieren: Beyond Journey's End",
                "year": 2023,
                "detail": "TV · 28 eps",
                "cover_url": "https://cdn.myanimelist.net/images/anime/1015/138006.jpg",
            }
        ]

    @responses.activate
    def test_a_media_type_becomes_the_type_filter(self):
        responses.get(
            f"{BASE}/anime",
            json=_page(MOVIE),
            match=[
                matchers.query_param_matcher(
                    {"q": "spirited", "limit": "5", "sfw": "true", "type": "movie"}
                )
            ],
        )
        [row] = tenrai.search_mal_anime("spirited", 5, media_type="movie")
        # No `year` in the payload: the aired from-date fills it. One episode
        # is singular, and a missing jpg falls back to the webp.
        assert row["year"] == 2001
        assert row["detail"] == "Movie · 1 ep"
        assert row["cover_url"].endswith(".webp")

    @responses.activate
    def test_the_japanese_title_stands_in_when_the_english_one_adds_nothing(self):
        same = {**FRIEREN, "title_english": FRIEREN["title"]}
        responses.get(f"{BASE}/anime", json=_page(same))
        [row] = tenrai.search_mal_anime("frieren", 10)
        assert row["title_alt"] == "葬送のフリーレン"

    @responses.activate
    def test_a_repeated_query_costs_one_request(self):
        responses.get(f"{BASE}/anime", json=_page(FRIEREN))
        tenrai.search_mal_anime("Frieren", 10)
        tenrai.search_mal_anime("frieren ", 10)
        assert len(responses.calls) == 1


class TestManga:
    @responses.activate
    def test_novels_are_left_out_and_the_request_over_fetches(self):
        responses.get(
            f"{BASE}/manga",
            json=_page(
                _manga(3299, "Manga", volumes=16),
                _manga(9115, "Light Novel", volumes=24),
                _manga(1, "Novel"),
                _manga(2, "One-shot", chapters=1),
            ),
            match=[matchers.query_param_matcher({"q": "spice", "limit": "6", "sfw": "true"})],
        )
        rows = tenrai.search_mal_manga("spice", 3)
        assert [r["external_id"] for r in rows] == ["3299", "2"]
        assert rows[0]["detail"] == "Manga · 16 vols"
        assert rows[1]["detail"] == "One-shot · 1 ch"
        assert rows[0]["year"] == 2006

    @responses.activate
    def test_the_answer_is_trimmed_to_the_limit(self):
        responses.get(
            f"{BASE}/manga",
            json=_page(*[_manga(i, "Manga") for i in range(1, 5)]),
        )
        assert len(tenrai.search_mal_manga("spice", 2)) == 2

    @responses.activate
    def test_the_over_fetch_never_exceeds_fifty(self):
        responses.get(
            f"{BASE}/manga",
            json=_page(),
            match=[matchers.query_param_matcher({"q": "spice", "limit": "50", "sfw": "true"})],
        )
        assert tenrai.search_mal_manga("spice", 40) == []


class TestNovel:
    @responses.activate
    def test_asks_for_each_novel_type_and_interleaves_them(self):
        responses.get(
            f"{BASE}/manga",
            json=_page(_manga(10, "Light Novel"), _manga(11, "Light Novel")),
            match=[
                matchers.query_param_matcher(
                    {"q": "wolf", "limit": "3", "sfw": "true", "type": "lightnovel"}
                )
            ],
        )
        responses.get(
            f"{BASE}/manga",
            json=_page(_manga(20, "Novel"), _manga(10, "Light Novel")),
            match=[
                matchers.query_param_matcher(
                    {"q": "wolf", "limit": "3", "sfw": "true", "type": "novel"}
                )
            ],
        )
        rows = tenrai.search_mal_novel("wolf", 3)
        # Round-robin, a duplicate kept once, trimmed to the limit.
        assert [r["external_id"] for r in rows] == ["10", "20", "11"]
        assert rows[0]["detail"] == "Light Novel"

    @responses.activate
    def test_one_type_failing_fails_the_search(self):
        responses.get(
            f"{BASE}/manga",
            json=_page(_manga(10, "Light Novel")),
            match=[matchers.query_param_matcher({"type": "lightnovel"}, strict_match=False)],
        )
        responses.get(
            f"{BASE}/manga",
            status=503,
            match=[matchers.query_param_matcher({"type": "novel"}, strict_match=False)],
        )
        with pytest.raises(ExternalSearchError):
            tenrai.search_mal_novel("wolf", 3)


class TestPeopleAndCharacters:
    @responses.activate
    def test_maps_a_person(self):
        responses.get(
            f"{BASE}/people",
            json=_page(PERSON),
            match=[matchers.query_param_matcher({"q": "hanazawa", "limit": "10"})],
        )
        assert tenrai.search_mal_people("hanazawa", 10) == [
            {
                "external_id": "185",
                "link": "https://myanimelist.net/people/185/Kana_Hanazawa",
                "title": "Hanazawa, Kana",
                "title_alt": "花澤香菜",
                "year": None,
                "detail": "Born 1989-02-25",
                "cover_url": "https://cdn.myanimelist.net/images/voiceactors/3/69318.jpg",
            }
        ]

    @responses.activate
    def test_maps_a_character(self):
        responses.get(
            f"{BASE}/characters",
            json=_page(CHARACTER),
            match=[matchers.query_param_matcher({"q": "frieren", "limit": "10"})],
        )
        assert tenrai.search_mal_characters("frieren", 10) == [
            {
                "external_id": "184947",
                "link": "https://myanimelist.net/character/184947/Frieren",
                "title": "Frieren",
                "title_alt": "フリーレン",
                "year": None,
                "detail": "33,181 favourites",
                "cover_url": "https://cdn.myanimelist.net/images/characters/7/525105.jpg",
            }
        ]


@responses.activate
def test_every_link_round_trips_into_its_mal_id():
    """The link is what the tab writes to mal_link; the extractors must read it back."""
    responses.get(f"{BASE}/anime", json=_page(FRIEREN))
    responses.get(f"{BASE}/manga", json=_page(_manga(3299, "Manga")))
    responses.get(f"{BASE}/people", json=_page(PERSON))
    responses.get(f"{BASE}/characters", json=_page(CHARACTER))

    [anime] = tenrai.search_mal_anime("frieren", 1)
    [manga] = tenrai.search_mal_manga("spice", 1)
    [person] = tenrai.search_mal_people("hanazawa", 1)
    [character] = tenrai.search_mal_characters("frieren", 1)

    assert extract_mal_id_anime(anime["link"]) == int(anime["external_id"])
    assert extract_mal_id_manga_novel(manga["link"]) == int(manga["external_id"])
    assert extract_mal_id_person(person["link"]) == int(person["external_id"])
    assert extract_mal_id_character(character["link"]) == int(character["external_id"])


class TestFailures:
    """One attempt, and an error rather than an empty list."""

    @pytest.mark.parametrize("status", [404, 429, 500, 503])
    @responses.activate
    def test_a_non_2xx_answer_raises_after_one_attempt(self, status):
        responses.get(f"{BASE}/anime", status=status)
        with pytest.raises(ExternalSearchError):
            tenrai.search_mal_anime("frieren", 10)
        assert len(responses.calls) == 1

    @responses.activate
    def test_a_network_error_raises_after_one_attempt(self):
        responses.get(f"{BASE}/people", body=requests.exceptions.ConnectionError("down"))
        with pytest.raises(ExternalSearchError, match="unreachable"):
            tenrai.search_mal_people("hanazawa", 10)
        assert len(responses.calls) == 1

    @responses.activate
    def test_an_unreadable_body_raises(self):
        responses.get(f"{BASE}/characters", body="<html>maintenance</html>")
        with pytest.raises(ExternalSearchError):
            tenrai.search_mal_characters("frieren", 10)

    @responses.activate
    def test_a_body_without_a_data_list_raises(self):
        responses.get(f"{BASE}/manga", json={"status": 200})
        with pytest.raises(ExternalSearchError):
            tenrai.search_mal_manga("spice", 10)

    @responses.activate
    def test_a_failure_is_not_cached(self):
        responses.get(f"{BASE}/anime", status=503)
        responses.get(f"{BASE}/anime", json=_page(FRIEREN))
        with pytest.raises(ExternalSearchError):
            tenrai.search_mal_anime("frieren", 10)
        assert tenrai.search_mal_anime("frieren", 10)[0]["external_id"] == "52991"

    @responses.activate
    def test_the_search_takes_a_slot_from_the_shared_limiter(self, monkeypatch):
        taken = []
        monkeypatch.setattr(tenrai.tenrai_rate_limiter, "wait_if_needed", lambda: taken.append(1))
        responses.get(f"{BASE}/anime", json=_page(FRIEREN))
        tenrai.search_mal_anime("frieren", 10)
        assert taken == [1]
