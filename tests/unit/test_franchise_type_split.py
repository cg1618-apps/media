"""
"ACG" is not a franchise type any more: it split into "Anime" and "Manga".
A franchise_type still carrying it - from a Franchise tab backed up before the
split - has its ACG token rewritten by what the franchise holds: Anime for any
anime or anime movie, Manga for any manga, both when it holds both, and Anime
when it holds neither (ACG was what an anime or a series stamped).

This is the pure half of hierarchy.split_acg_franchise_types; the database
half is tests/api/test_split_acg_franchise_types.py.
"""

import pytest

from app.services.domain.hierarchy import split_acg_franchise_type
from app.utils.formatter import parse_franchise_from_sheet


@pytest.mark.parametrize(
    ("stored", "has_anime", "has_manga", "expected"),
    [
        ("ACG", True, False, "Anime"),
        ("ACG", False, True, "Manga"),
        ("ACG", True, True, "Anime, Manga"),
        # Neither: ACG was what anime and series creation stamped.
        ("ACG", False, False, "Anime"),
        # The other tokens keep their order and the separators their spacing.
        ("Game, ACG", False, True, "Game, Manga"),
        ("Game,ACG", True, False, "Game,Anime"),
        ("Game,ACG", True, True, "Game,Anime,Manga"),
        ("ACG, Book, Game", True, True, "Anime, Manga, Book, Game"),
        # A token already present is not repeated.
        ("ACG, Manga", True, True, "Anime, Manga"),
        ("Anime, ACG", True, False, "Anime"),
        ("ACG, Anime, Book", True, False, "Anime, Book"),
        ("ACG, ACG", False, True, "Manga"),
        # "Anime Movie" is its own type and is left alone.
        ("Anime Movie, ACG", False, True, "Anime Movie, Manga"),
        # Nothing to split.
        ("Anime, Game", True, True, "Anime, Game"),
        ("Anime Movie", True, False, "Anime Movie"),
        ("", True, False, ""),
        (None, True, False, None),
    ],
)
def test_split_acg_franchise_type(stored, has_anime, has_manga, expected):
    assert split_acg_franchise_type(stored, has_anime, has_manga) == expected


def test_the_sheet_parser_keeps_anime_as_it_is():
    # Anime is a franchise type again, so the parser folds nothing. An ACG
    # token passes through to be split once the entries have restored.
    assert parse_franchise_from_sheet({"franchise_type": "Anime, Game"})[
        "franchise_type"
    ] == "Anime, Game"
    assert parse_franchise_from_sheet({"franchise_type": "ACG"})["franchise_type"] == "ACG"
