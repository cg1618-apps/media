"""
Picking the one HowLongToBeat entry a game is, out of a search result.

The rule is conservative on purpose: a wrong link is worse than no link, so
anything short of exactly one confident candidate is None.
"""

from app.utils.hltb_utils import (
    hltb_link_for,
    hltb_match_key,
    pick_hltb_game_id,
)


def candidate(game_id, name, alias="", year=0):
    """One row of `data` as the search endpoint answers it."""
    return {
        "game_id": game_id,
        "game_name": name,
        "game_alias": alias,
        "release_world": year,
    }


WITCHER_RESULTS = [
    candidate(10270, "The Witcher 3: Wild Hunt", "The Witcher III: Wild Hunt", 2015),
    candidate(
        40171,
        "The Witcher 3: Wild Hunt - Remastered",
        "The Witcher 3: Wild Hunt - Complete Edition, "
        "The Witcher 3: Wild Hunt - Game of the Year Edition",
        2016,
    ),
    candidate(30003, "The Witcher 3: Wild Hunt - Hearts of Stone", "", 2015),
]


class TestTheLink:
    def test_the_link_is_the_game_page(self):
        assert hltb_link_for(10270) == "https://howlongtobeat.com/game/10270"


class TestTheKey:
    def test_case_spacing_and_punctuation_are_ignored(self):
        assert hltb_match_key("The Witcher 3: Wild Hunt") == hltb_match_key(
            "the witcher 3 - wild hunt"
        )

    def test_trademark_signs_are_ignored(self):
        assert hltb_match_key("Portal™") == hltb_match_key("Portal")
        assert hltb_match_key("Tom Clancy's® Rainbow Six") == hltb_match_key(
            "Tom Clancys Rainbow Six"
        )

    def test_full_width_latin_folds_to_half_width(self):
        assert hltb_match_key("ＤＯＯＭ") == hltb_match_key("DOOM")

    def test_digits_are_kept(self):
        assert hltb_match_key("Doom 2") != hltb_match_key("Doom")

    def test_empty_values_key_to_empty(self):
        assert hltb_match_key(None) == ""
        assert hltb_match_key("  :  ") == ""


class TestPicking:
    def test_an_exact_name_match_wins(self):
        assert pick_hltb_game_id(WITCHER_RESULTS, ["The Witcher 3: Wild Hunt"], None) == 10270

    def test_any_of_the_games_names_can_match(self):
        names = ["巫師3：狂獵", "The Witcher 3 - Wild Hunt"]
        assert pick_hltb_game_id(WITCHER_RESULTS, names, None) == 10270

    def test_an_alias_matches_when_no_name_does(self):
        names = ["The Witcher 3: Wild Hunt - Complete Edition"]
        assert pick_hltb_game_id(WITCHER_RESULTS, names, None) == 40171

    def test_a_name_match_beats_an_alias_match(self):
        """
        Another entry listing our title as an alias must not make an exact
        name match ambiguous - the alias tier is only consulted when no
        candidate's own name matches.
        """
        results = WITCHER_RESULTS + [
            candidate(99, "Witcher Collection", "The Witcher 3: Wild Hunt", 2015)
        ]
        assert pick_hltb_game_id(results, ["The Witcher 3: Wild Hunt"], None) == 10270

    def test_a_prefix_is_not_a_match(self):
        """`Hearts of Stone` is not the base game, and the base game is not it."""
        assert pick_hltb_game_id(WITCHER_RESULTS, ["The Witcher 3"], None) is None

    def test_no_results_is_none(self):
        assert pick_hltb_game_id([], ["The Witcher 3: Wild Hunt"], 2015) is None

    def test_no_names_is_none(self):
        assert pick_hltb_game_id(WITCHER_RESULTS, [], 2015) is None
        assert pick_hltb_game_id(WITCHER_RESULTS, ["", "  "], 2015) is None


class TestAmbiguity:
    DOOMS = [
        candidate(2708, "Doom", "", 1993),
        candidate(2709, "Doom", "Doom 4", 2016),
    ]

    def test_two_equal_names_and_no_year_is_none(self):
        assert pick_hltb_game_id(self.DOOMS, ["DOOM"], None) is None

    def test_the_release_year_breaks_the_tie(self):
        assert pick_hltb_game_id(self.DOOMS, ["DOOM"], 2016) == 2709
        assert pick_hltb_game_id(self.DOOMS, ["DOOM"], 1993) == 2708

    def test_a_year_that_matches_neither_is_none(self):
        assert pick_hltb_game_id(self.DOOMS, ["DOOM"], 2020) is None

    def test_a_year_that_matches_both_is_none(self):
        twins = [candidate(1, "Tetris", "", 1989), candidate(2, "Tetris", "", 1989)]
        assert pick_hltb_game_id(twins, ["Tetris"], 1989) is None

    def test_one_entry_reached_twice_is_not_ambiguous(self):
        """The same game_id matched by two of our names is still one game."""
        results = [candidate(5, "Nier", "NieR Replicant", 2010)]
        assert pick_hltb_game_id(results, ["NieR", "Nier"], None) == 5

    def test_a_single_match_is_kept_even_when_its_year_differs(self):
        """
        The year only breaks ties. HowLongToBeat's release_world and this
        collection's release_date disagree often enough (a JP release against
        a worldwide one) that refusing a lone exact match on it would cost
        more links than it saves.
        """
        results = [candidate(7, "Persona 5", "", 2016)]
        assert pick_hltb_game_id(results, ["Persona 5"], 2017) == 7
