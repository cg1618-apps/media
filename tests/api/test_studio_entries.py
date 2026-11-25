"""The entries credited to a studio, and who may see them."""

import uuid

import pytest

from app import models
from app.services.rbac.seed import default_guest_permissions
from tests.api.conftest import (  # noqa: F401
    ALL_VIEW_PERMISSIONS,
    HIDDEN_NAME,
    hidden_anime,
    make_viewer,
    nsfw_label,
)


@pytest.fixture
def mappa(db_session):
    studio = models.Studio(name_en="MAPPA")
    db_session.add(studio)
    db_session.flush()
    return studio


def credit(db_session, studio, entry_id):
    db_session.add(
        models.MediaCredit(
            media_id=entry_id,
            role="studio",
            studio_id=studio.system_id,
        )
    )
    db_session.commit()


def test_lists_the_entries_credited_to_the_studio(
    owner_client, db_session, mappa, sample_anime
):
    credit(db_session, mappa, sample_anime.system_id)
    body = owner_client.get(f"/api/studio/{mappa.system_id}/entries").json()
    assert body["groups"][0]["media_type"] == "anime"
    assert body["groups"][0]["entries"][0]["system_id"] == str(sample_anime.system_id)


def test_a_studio_with_no_credits_returns_no_groups(owner_client, mappa):
    body = owner_client.get(f"/api/studio/{mappa.system_id}/entries").json()
    assert body["groups"] == []


def test_unknown_studio_is_404(owner_client):
    r = owner_client.get(f"/api/studio/{uuid.uuid4()}/entries")
    assert r.status_code == 404


def test_a_labelled_entry_is_hidden_from_a_viewer_without_the_permission(
    client, db_session, mappa, hidden_anime, nsfw_label
):
    credit(db_session, mappa, hidden_anime.system_id)
    # label_keys=(): a mode carrying no labels. "Without the permission" was
    # a role grant until Phase B moved object scoping to the access mode.
    make_viewer(
        db_session, client, "plain", (default_guest_permissions() | ALL_VIEW_PERMISSIONS), label_keys=()
    )
    r = client.get(f"/api/studio/{mappa.system_id}/entries")
    # Assert on the whole body, not parsed fields: a title can leak through a
    # key this test does not model. A studio credited only on hidden entries
    # is hidden with them, so the answer is the not-found one.
    assert HIDDEN_NAME not in r.text
    assert r.status_code == 404


def test_the_same_entry_is_visible_to_a_viewer_holding_the_label(
    client, db_session, mappa, hidden_anime, nsfw_label
):
    credit(db_session, mappa, hidden_anime.system_id)
    make_viewer(
        db_session,
        client,
        "labelled",
        list((default_guest_permissions() | ALL_VIEW_PERMISSIONS)),
        label_keys=(nsfw_label.key,),
    )
    assert HIDDEN_NAME in client.get(f"/api/studio/{mappa.system_id}/entries").text


# The card fields: a studio page draws each entry as its library card minus
# the tracker, so the entry carries what that card reads.


def test_an_entry_carries_the_library_card_fields(
    owner_client, db_session, mappa, sample_anime, owner_user
):
    sample_anime.release_season = "Spring"
    sample_anime.release_date_jp = "2024-04-05"
    sample_anime.mal_rating = 8.5
    row = (
        db_session.query(models.UserMediaList)
        .filter_by(user_id=owner_user.id, media_id=sample_anime.system_id)
        .one()
    )
    row.my_rating = "A"
    credit(db_session, mappa, sample_anime.system_id)

    entry = owner_client.get(f"/api/studio/{mappa.system_id}/entries").json()[
        "groups"
    ][0]["entries"][0]
    assert entry["airing_type"] == "TV"
    assert entry["release_season"] == "Spring"
    assert entry["release_date_jp"] == "2024-04-05"
    assert entry["mal_rating"] == 8.5
    assert entry["my_rating"] == "A"


def test_a_game_carries_its_metacritic_score(owner_client, db_session, mappa, sample_franchise):
    game = models.Game(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        game_name_en="Test Game",
        metacritic_score=91,
    )
    db_session.add(game)
    db_session.flush()
    credit(db_session, mappa, game.system_id)

    group = owner_client.get(f"/api/studio/{mappa.system_id}/entries").json()["groups"][0]
    assert group["media_type"] == "game"
    assert group["entries"][0]["metacritic_score"] == 91
    # A column the type does not have is left out, not sent as null.
    assert "mal_rating" not in group["entries"][0]


def test_my_rating_is_the_viewers_own_not_anothers(
    client, db_session, mappa, sample_anime, owner_user
):
    # The owner's row is rated, so there is a rating that could leak.
    row = (
        db_session.query(models.UserMediaList)
        .filter_by(user_id=owner_user.id, media_id=sample_anime.system_id)
        .one()
    )
    row.my_rating = "S"
    credit(db_session, mappa, sample_anime.system_id)
    make_viewer(
        db_session, client, "other", (default_guest_permissions() | ALL_VIEW_PERMISSIONS)
    )

    entry = client.get(f"/api/studio/{mappa.system_id}/entries").json()["groups"][0][
        "entries"
    ][0]
    assert entry["my_rating"] is None


def test_the_owner_reads_the_same_rating_as_its_own(
    owner_client, db_session, mappa, sample_anime, owner_user
):
    # The mirror of the test above: the same row, read by the user it belongs to.
    row = (
        db_session.query(models.UserMediaList)
        .filter_by(user_id=owner_user.id, media_id=sample_anime.system_id)
        .one()
    )
    row.my_rating = "S"
    credit(db_session, mappa, sample_anime.system_id)

    entry = owner_client.get(f"/api/studio/{mappa.system_id}/entries").json()["groups"][
        0
    ]["entries"][0]
    assert entry["my_rating"] == "S"
