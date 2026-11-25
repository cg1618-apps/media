"""The entries credited to a publisher, as the cards its page draws."""

import uuid

import pytest

from app import models


@pytest.fixture
def publisher(db_session):
    row = models.Publisher(name_en="Kadokawa")
    db_session.add(row)
    db_session.flush()
    return row


def credit(db_session, publisher, entry_id):
    db_session.add(
        models.MediaCredit(
            media_id=entry_id, role="publisher", publisher_id=publisher.system_id
        )
    )
    db_session.commit()


def test_lists_the_entries_credited_to_the_publisher(
    owner_client, db_session, publisher, manga_entry
):
    credit(db_session, publisher, manga_entry.system_id)
    body = owner_client.get(f"/api/publisher/{publisher.system_id}/entries").json()
    assert body["groups"][0]["media_type"] == "manga"
    assert body["groups"][0]["entries"][0]["system_id"] == str(manga_entry.system_id)


def test_an_entry_carries_the_library_card_fields(
    owner_client, db_session, publisher, manga_entry, list_row
):
    manga_entry.mal_rating = 8.9
    manga_entry.release_date = "2009-09-09"
    list_row(manga_entry, status="Completed", my_rating="B")
    credit(db_session, publisher, manga_entry.system_id)

    entry = owner_client.get(f"/api/publisher/{publisher.system_id}/entries").json()[
        "groups"
    ][0]["entries"][0]
    assert entry["release_date"] == "2009-09-09"
    assert entry["mal_rating"] == 8.9
    assert entry["my_rating"] == "B"


def test_unknown_publisher_is_404(owner_client):
    r = owner_client.get(f"/api/publisher/{uuid.uuid4()}/entries")
    assert r.status_code == 404
