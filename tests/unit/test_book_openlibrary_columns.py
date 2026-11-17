"""
The two Open Library columns on book, and their Sheets round-trip.

No-DB half: the schema defaults/acceptance and the Sheets parse round-trip.
The DB-backed model cases live in tests/api/test_book_openlibrary_columns.py.

openlibrary_id is a String, not an Integer like comicvine_id: the trailing
letter is what distinguishes a work (OL...W) from an edition (OL...M) or an
author (OL...A), so the digits alone would lose the only signal that the id
names the right kind of thing.
"""

from app.schemas.book import BookCreate
from app.utils.formatter import parse_book_from_sheet


class TestBookOpenLibraryColumns:
    def test_schema_accepts_both_columns(self):
        payload = BookCreate(
            book_name_en="The Final Empire",
            openlibrary_link="https://openlibrary.org/works/OL5738148W",
            openlibrary_id="OL5738148W",
        )
        assert payload.openlibrary_id == "OL5738148W"

    def test_schema_defaults_both_to_none(self):
        payload = BookCreate(book_name_en="Untitled")
        assert payload.openlibrary_link is None
        assert payload.openlibrary_id is None


class TestParseBookFromSheet:
    def test_reads_both_columns_from_a_sheet_row(self):
        parsed = parse_book_from_sheet(
            {
                "book_name_en": "The Final Empire",
                "openlibrary_link": "https://openlibrary.org/works/OL5738148W",
                "openlibrary_id": "OL5738148W",
            }
        )
        assert parsed["openlibrary_link"] == "https://openlibrary.org/works/OL5738148W"
        assert parsed["openlibrary_id"] == "OL5738148W"

    def test_blank_cells_become_none(self):
        parsed = parse_book_from_sheet(
            {"book_name_en": "Untitled", "openlibrary_link": "", "openlibrary_id": ""}
        )
        assert parsed["openlibrary_link"] is None
        assert parsed["openlibrary_id"] is None
