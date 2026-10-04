"""
"Anime" is not a franchise type; "ACG" is the one type for anime and manga
franchises. A Franchise tab backed up while "Anime" still existed must not
bring it back on Pull, so the sheet parser folds the token onto "ACG".
"""

import pytest

from app.services.domain.hierarchy import normalize_franchise_type
from app.utils.formatter import parse_franchise_from_sheet


@pytest.mark.parametrize(
    ("stored", "expected"),
    [
        ("Anime", "ACG"),
        ("Anime, Game", "ACG, Game"),
        ("Game, Anime", "Game, ACG"),
        ("Game,Anime", "Game,ACG"),
        # Already ACG: the folded token is dropped, the first one stays put.
        ("ACG, Anime", "ACG"),
        ("Anime, ACG, Novel", "ACG, Novel"),
        ("Novel, ACG, Anime, Game", "Novel, ACG, Game"),
        # "Anime Movie" is its own type, not an "Anime" token.
        ("Anime Movie", "Anime Movie"),
        ("Anime Movie, Anime", "Anime Movie, ACG"),
        ("ACG, Game", "ACG, Game"),
        ("", ""),
        (None, None),
    ],
)
def test_normalize_franchise_type(stored, expected):
    assert normalize_franchise_type(stored) == expected


def test_pull_folds_anime_onto_acg():
    parsed = parse_franchise_from_sheet({"franchise_type": "Anime, Game"})
    assert parsed["franchise_type"] == "ACG, Game"


def test_pull_leaves_other_types_alone():
    parsed = parse_franchise_from_sheet({"franchise_type": "Movie, TV"})
    assert parsed["franchise_type"] == "Movie, TV"
