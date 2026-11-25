"""
A book's Anime Studio: the studio that animated its adaptation, as on a manga.

A plain column rather than a credit - like manga.anime_studio it points at the
adaptation, not at anyone who made the book - so it saves and reads back
through the ordinary book router, and travels in the Books sheet tab.
"""

from app import models
from app.utils.formatter import parse_book_from_sheet


def test_a_book_saves_and_reads_back_its_anime_studio(owner_client):
    created = owner_client.post(
        "/api/book/", json={"book_name_cn": "測試小說", "anime_studio": "Kyoto Animation"}
    )
    assert created.status_code == 201
    assert created.json()["anime_studio"] == "Kyoto Animation"

    book_id = created.json()["system_id"]
    patched = owner_client.patch(f"/api/book/{book_id}", json={"anime_studio": "Shaft"})
    assert patched.status_code == 200
    assert owner_client.get(f"/api/book/{book_id}").json()["anime_studio"] == "Shaft"


def test_the_column_exists_and_defaults_to_none():
    assert "anime_studio" in models.Book.__table__.columns


def test_the_sheet_round_trip_reads_it_and_tolerates_an_older_tab():
    assert parse_book_from_sheet({"book_name_cn": "x", "anime_studio": "Shaft"})["anime_studio"] == "Shaft"
    # A tab backed up before the column existed has no header for it.
    assert parse_book_from_sheet({"book_name_cn": "x"})["anime_studio"] is None
