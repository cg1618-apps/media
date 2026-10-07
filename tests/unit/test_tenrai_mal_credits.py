"""
The pure halves of the MAL prefill and the MAL credit fill: titles, studios
and authors read off a raw Tenrai payload (app/utils/tenrai_utils.py).

Shapes are the real ones, fetched from api.tenrai.org/v1/anime/{id}/full and
/manga/{id}/full.
"""

from app.utils.tenrai_utils import (
    map_tenrai_authors,
    map_tenrai_credits,
    map_tenrai_studios,
    map_tenrai_titles,
)

FRIEREN = {
    "title": "Sousou no Frieren",
    "title_english": "Frieren: Beyond Journey's End",
    "title_japanese": "葬送のフリーレン",
    "studios": [
        {
            "mal_id": 11,
            "type": "anime",
            "name": "Madhouse",
            "url": "https://myanimelist.net/anime/producer/11/Madhouse",
        }
    ],
}

ONE_PIECE = {
    "title": "One Piece",
    "title_english": "One Piece",
    "title_japanese": "ONE PIECE",
    "authors": [
        {
            "mal_id": 1881,
            "type": "people",
            "name": "Oda, Eiichiro",
            "url": "https://myanimelist.net/people/1881/Eiichiro_Oda",
            "role": "Story & Art",
        }
    ],
}

SPLIT_CREDITS = {
    "authors": [
        {"mal_id": 1, "name": "Ohba, Tsugumi", "url": "u1", "role": "Story"},
        {"mal_id": 2, "name": "Obata, Takeshi", "url": "u2", "role": "Art"},
        # A role MAL may add later: ignored rather than guessed at.
        {"mal_id": 3, "name": "Someone, Else", "url": "u3", "role": "Original Creator"},
    ]
}


class TestTitles:
    def test_english_and_japanese_titles(self):
        assert map_tenrai_titles(FRIEREN) == {
            "name_en": "Frieren: Beyond Journey's End",
            "name_jp": "葬送のフリーレン",
        }

    def test_blank_or_missing_titles_are_none(self):
        assert map_tenrai_titles({"title_english": "  ", "title": "X"}) == {
            "name_en": None,
            "name_jp": None,
        }


class TestStudios:
    def test_id_name_and_url(self):
        assert map_tenrai_studios(FRIEREN) == [
            {
                "mal_id": 11,
                "name": "Madhouse",
                "url": "https://myanimelist.net/anime/producer/11/Madhouse",
            }
        ]

    def test_a_studio_with_no_name_is_dropped(self):
        assert map_tenrai_studios({"studios": [{"mal_id": 5, "name": " "}]}) == []

    def test_no_studios_key(self):
        assert map_tenrai_studios({}) == []


class TestAuthors:
    def test_story_and_art_is_both_roles_in_western_order(self):
        assert map_tenrai_authors(ONE_PIECE) == [
            {
                "mal_id": 1881,
                "name": "Eiichiro Oda",
                "name_mal": "Oda, Eiichiro",
                "url": "https://myanimelist.net/people/1881/Eiichiro_Oda",
                "roles": ["author", "illustrator"],
            }
        ]

    def test_story_is_author_art_is_illustrator_and_unknown_is_dropped(self):
        authors = map_tenrai_authors(SPLIT_CREDITS)
        assert [(a["name"], a["roles"]) for a in authors] == [
            ("Tsugumi Ohba", ["author"]),
            ("Takeshi Obata", ["illustrator"]),
        ]


class TestCreditsByRole:
    def test_anime_and_anime_movie_credit_studios(self):
        for media_type in ("anime", "anime-movie"):
            credits = map_tenrai_credits(media_type, FRIEREN)
            assert list(credits) == ["studio"]
            assert [s["name"] for s in credits["studio"]] == ["Madhouse"]

    def test_manga_and_novel_split_authors_by_role(self):
        for media_type in ("manga", "novel"):
            credits = map_tenrai_credits(media_type, SPLIT_CREDITS)
            assert [a["name"] for a in credits["author"]] == ["Tsugumi Ohba"]
            assert [a["name"] for a in credits["illustrator"]] == ["Takeshi Obata"]

    def test_story_and_art_lands_in_both_roles(self):
        credits = map_tenrai_credits("manga", ONE_PIECE)
        assert [a["name"] for a in credits["author"]] == ["Eiichiro Oda"]
        assert [a["name"] for a in credits["illustrator"]] == ["Eiichiro Oda"]

    def test_a_type_with_no_mal_credits(self):
        assert map_tenrai_credits("hentai", FRIEREN) == {}
