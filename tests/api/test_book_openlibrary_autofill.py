"""
Tests for autofill_book_from_openlibrary.

The fetch and the cover download are both patched out — these lock down the
fill-only semantics (never overwrite what the admin typed) and the anchor-book
contract (never write what one book cannot know about a multi-book entry),
not the network layer. The author credit is a media_credit row, so this needs a
real db_session rather than a SimpleNamespace fake.
"""

import uuid

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_book_from_openlibrary
from app.services.domain.credits import credit_names, replace_credits

WORK_RESULT = {
    "work": {"title": "The Final Empire", "covers": [14658160]},
    "editions": [{"publish_date": "2006"}, {"publish_date": "July 2015"}],
    "authors": [{"name": "Brandon Sanderson"}],
}


def make_book(db_session, **kwargs):
    """A real Book row with every Open-Library-fillable field blank."""
    defaults = dict(
        system_id=uuid.uuid4(),
        book_name_en="Mistborn",
        openlibrary_id="OL5738148W",
        release_date_jp=None,
        end_date=None,
        vol_total_original=None,
        ch_total=None,
        serialization_status=None,
        cover_image_file=None,
    )
    defaults.update(kwargs)
    book = models.Book(**defaults)
    db_session.add(book)
    db_session.flush()
    return book


@pytest.fixture
def patched(monkeypatch):
    """Patches the fetch and the cover download; records how each was called."""
    calls = {"fetch": [], "download": []}

    def fake_fetch(work_id, *, want_editions=True, want_authors=True):
        calls["fetch"].append(
            {"work_id": work_id, "want_editions": want_editions, "want_authors": want_authors}
        )
        return WORK_RESULT

    def fake_download(url, owner_type, system_id):
        calls["download"].append((url, system_id))
        return "downloaded.jpg"

    monkeypatch.setattr(autofill_module, "fetch_openlibrary_work", fake_fetch)
    monkeypatch.setattr(autofill_module, "download_cover_image", fake_download)
    return calls


class TestFillsBlankFields:
    def test_fills_release_date_from_the_earliest_edition(self, db_session, patched):
        book = make_book(db_session)
        autofill_book_from_openlibrary(book, db_session)
        assert book.release_date_jp == "2006"

    def test_fills_the_cover(self, db_session, patched):
        book = make_book(db_session)
        autofill_book_from_openlibrary(book, db_session)
        assert book.cover_image_file == "downloaded.jpg"
        assert patched["download"][0][0] == (
            "https://covers.openlibrary.org/b/id/14658160-L.jpg"
        )

    def test_creates_the_author_credit(self, db_session, patched):
        book = make_book(db_session)
        autofill_book_from_openlibrary(book, db_session)
        assert credit_names(db_session, book.system_id, "author") == [
            "Brandon Sanderson"
        ]


class TestFillOnly:
    def test_keeps_an_existing_release_date(self, db_session, patched):
        book = make_book(db_session, release_date_jp="1999")
        autofill_book_from_openlibrary(book, db_session)
        assert book.release_date_jp == "1999"

    def test_keeps_an_existing_cover(self, db_session, patched):
        book = make_book(db_session, cover_image_file="mine.jpg")
        autofill_book_from_openlibrary(book, db_session)
        assert book.cover_image_file == "mine.jpg"
        assert patched["download"] == []

    def test_keeps_an_existing_author_credit(self, db_session, patched):
        book = make_book(db_session)
        replace_credits(db_session, "book", book.system_id, "author", ["Someone Else"])
        autofill_book_from_openlibrary(book, db_session)
        assert credit_names(db_session, book.system_id, "author") == [
            "Someone Else"
        ]


class TestAnchorBookContract:
    def test_never_writes_fields_one_book_cannot_know(self, db_session, patched):
        book = make_book(db_session)
        autofill_book_from_openlibrary(book, db_session)
        assert book.end_date is None
        assert book.vol_total_original is None
        assert book.ch_total is None
        assert book.serialization_status is None

    def test_never_touches_the_entry_name(self, db_session, patched):
        book = make_book(db_session, book_name_en="Mistborn")
        autofill_book_from_openlibrary(book, db_session)
        assert book.book_name_en == "Mistborn"


class TestConditionalFetching:
    def test_asks_for_editions_and_authors_when_both_are_missing(self, db_session, patched):
        book = make_book(db_session)
        autofill_book_from_openlibrary(book, db_session)
        assert patched["fetch"][0]["want_editions"] is True
        assert patched["fetch"][0]["want_authors"] is True

    def test_skips_editions_when_the_release_date_is_already_set(self, db_session, patched):
        book = make_book(db_session, release_date_jp="1999")
        autofill_book_from_openlibrary(book, db_session)
        assert patched["fetch"][0]["want_editions"] is False

    def test_skips_authors_when_a_credit_already_exists(self, db_session, patched):
        book = make_book(db_session)
        replace_credits(db_session, "book", book.system_id, "author", ["Someone Else"])
        autofill_book_from_openlibrary(book, db_session)
        assert patched["fetch"][0]["want_authors"] is False


class TestFailureHandling:
    def test_does_nothing_without_an_id(self, db_session, patched):
        book = make_book(db_session, openlibrary_id=None)
        autofill_book_from_openlibrary(book, db_session)
        assert patched["fetch"] == []
        assert book.release_date_jp is None

    def test_survives_a_fetch_returning_none(self, db_session, monkeypatch):
        monkeypatch.setattr(
            autofill_module, "fetch_openlibrary_work", lambda *a, **k: None
        )
        book = make_book(db_session)
        autofill_book_from_openlibrary(book, db_session)
        assert book.release_date_jp is None

    def test_swallows_and_logs_a_fetch_exception(self, db_session, monkeypatch):
        def boom(*a, **k):
            raise RuntimeError("network down")

        monkeypatch.setattr(autofill_module, "fetch_openlibrary_work", boom)
        book = make_book(db_session)
        autofill_book_from_openlibrary(book, db_session)  # must not raise
        assert book.release_date_jp is None
