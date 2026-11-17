"""
The Open Library fill gate for books.

Deliberately narrower than has_missing_values_book: only the three things
Open Library can actually supply count. Requiring serialization_status or
mal_rating here would mark every such entry permanently incomplete and
re-request it forever.
"""

import uuid

from app import models
from app.services.domain import has_missing_values_book_openlibrary
from app.services.domain.credits import replace_credits


def make_book(db_session, **kwargs):
    defaults = dict(
        system_id=uuid.uuid4(),
        book_name_en="Mistborn",
        openlibrary_id="OL5738148W",
        release_date_jp="2006",
        cover_image_file="cover.jpg",
    )
    defaults.update(kwargs)
    book = models.Book(**defaults)
    db_session.add(book)
    db_session.flush()
    return book


def complete(db_session, **kwargs):
    """A book with nothing left for Open Library to fill."""
    book = make_book(db_session, **kwargs)
    replace_credits(db_session, "book", book.system_id, "author", ["Brandon Sanderson"])
    return book


class TestHasMissingValuesBookOpenlibrary:
    def test_false_when_everything_is_present(self, db_session):
        book = complete(db_session)
        assert has_missing_values_book_openlibrary(db_session, book) is False

    def test_true_when_the_release_date_is_missing(self, db_session):
        book = complete(db_session, release_date_jp=None)
        assert has_missing_values_book_openlibrary(db_session, book) is True

    def test_true_when_the_cover_is_missing(self, db_session):
        book = complete(db_session, cover_image_file=None)
        assert has_missing_values_book_openlibrary(db_session, book) is True

    def test_true_when_the_cover_is_blank_whitespace(self, db_session):
        book = complete(db_session, cover_image_file="   ")
        assert has_missing_values_book_openlibrary(db_session, book) is True

    def test_true_when_there_is_no_author_credit(self, db_session):
        book = make_book(db_session)
        assert has_missing_values_book_openlibrary(db_session, book) is True

    def test_ignores_fields_open_library_never_supplies(self, db_session):
        """serialization_status, end_date, mal_rating and mal_rank all blank,
        yet the entry is complete as far as Open Library is concerned."""
        book = complete(
            db_session,
            serialization_status=None,
            end_date=None,
            mal_rating=None,
            mal_rank=None,
            vol_total_original=None,
            ch_total=None,
        )
        assert has_missing_values_book_openlibrary(db_session, book) is False
