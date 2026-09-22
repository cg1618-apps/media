"""
Unit tests for `type_slots` in the sheet parsers.

The favourite 3x3 grids are the only home of the owner's ranking, so a Pull
that dropped the column would silently empty a grid and nothing would say so.
That is not hypothetical: every one of the Franchise tab's JSONB columns was
omitted from its parser once, and each Pull wiped them.

`type_slots` now lives on four tables - franchise, series, movies and games -
and a parser is what carries it back off the sheet.
"""

import json

import pytest

from app.utils.formatter import (
    parse_franchise_from_sheet,
    parse_game_from_sheet,
    parse_movie_from_sheet,
    parse_series_from_sheet,
)

PARSERS = [
    parse_franchise_from_sheet,
    parse_series_from_sheet,
    parse_movie_from_sheet,
    parse_game_from_sheet,
]


@pytest.mark.parametrize("parse", PARSERS)
class TestTypeSlotsSurvivesAPull:
    def test_a_slot_map_is_parsed_back_into_a_dict(self, parse):
        parsed = parse({"type_slots": json.dumps({"Movie": 1, "Game": 9})})
        assert parsed["type_slots"] == {"Movie": 1, "Game": 9}

    def test_a_blank_cell_is_none_rather_than_a_string(self, parse):
        """
        A cleared grid writes an empty cell. It has to arrive as NULL: the
        string "" would fail the JSONB column rather than clear it.
        """
        assert parse({"type_slots": ""})["type_slots"] is None

    def test_an_absent_column_is_none(self, parse):
        assert parse({})["type_slots"] is None

    def test_unparseable_json_is_none_rather_than_raising(self, parse):
        """A hand-edited cell must cost one row's slot, not the whole tab."""
        assert parse({"type_slots": "{not json"})["type_slots"] is None
