"""
The review queue's relation block: franchises and series holding exactly one
media entry, across all twelve types.

GET  /api/data-control/check/alone-groups
POST /api/data-control/check/alone-groups/{kind}/{system_id}/reviewed

Some groups are legitimately single, so a group can be marked reviewed: its
`alone_reviewed_media_id` records WHICH lone entry was reviewed, and the group
stays hidden only while that same entry is still its only one.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

from app import models

URL = "/api/data-control/check/alone-groups"


def _franchise(db_session, name):
    f = models.Franchise(system_id=uuid.uuid4(), franchise_type="ACG", franchise_name_en=name)
    db_session.add(f)
    db_session.flush()
    return f


def _series(db_session, franchise, name):
    s = models.Series(system_id=uuid.uuid4(), franchise_id=franchise.system_id, series_name_en=name)
    db_session.add(s)
    db_session.flush()
    return s


def _anime(db_session, franchise, name, series=None):
    a = models.Anime(system_id=uuid.uuid4(), anime_name_en=name, franchise_id=franchise.system_id)
    if series is not None:
        a.series_id = series.system_id
    db_session.add(a)
    db_session.flush()
    return a


def _listed(admin_client, kind):
    res = admin_client.get(URL)
    assert res.status_code == 200, res.text
    return {g["system_id"]: g for g in res.json()[kind]}


def test_a_franchise_and_a_series_with_one_entry_are_listed(admin_client, db_session):
    franchise = _franchise(db_session, "Lonely")
    series = _series(db_session, franchise, "Lonely Series")
    anime = _anime(db_session, franchise, "Only Child", series=series)

    franchises = _listed(admin_client, "franchise")
    group = franchises[str(franchise.system_id)]
    assert group["public_id"] == franchise.public_id
    assert group["display_name"] == "Lonely"
    assert group["entry"] == {
        "system_id": str(anime.system_id),
        "media_type": "anime",
        "public_id": anime.public_id,
        "display_name": "Only Child",
    }
    assert str(series.system_id) in _listed(admin_client, "series")


def test_the_lone_entry_may_be_of_any_type(admin_client, db_session):
    franchise = _franchise(db_session, "Gamey")
    game = models.Game(system_id=uuid.uuid4(), game_name_en="Solo Game",
                       franchise_id=franchise.system_id)
    db_session.add(game)
    db_session.flush()

    group = _listed(admin_client, "franchise")[str(franchise.system_id)]
    assert group["entry"]["media_type"] == "game"


def test_a_group_with_two_entries_is_not_listed(admin_client, db_session):
    # Mirror case in the same response: `single` IS listed, so the absence of
    # `pair` is the count working, not an empty table.
    pair = _franchise(db_session, "Pair")
    _anime(db_session, pair, "First")
    db_session.add(models.Manga(system_id=uuid.uuid4(), manga_name_en="Second",
                                franchise_id=pair.system_id))
    db_session.flush()
    single = _franchise(db_session, "Single")
    _anime(db_session, single, "Alone")

    listed = _listed(admin_client, "franchise")
    assert str(pair.system_id) not in listed
    assert str(single.system_id) in listed


def test_an_empty_group_is_not_listed(admin_client, db_session):
    empty = _franchise(db_session, "Empty")
    assert str(empty.system_id) not in _listed(admin_client, "franchise")


def test_a_reviewed_group_is_hidden(admin_client, db_session):
    franchise = _franchise(db_session, "Reviewed")
    anime = _anime(db_session, franchise, "Kept Alone")

    res = admin_client.post(f"{URL}/franchise/{franchise.system_id}/reviewed")
    assert res.status_code == 200, res.text
    db_session.refresh(franchise)
    assert franchise.alone_reviewed_media_id == anime.system_id
    assert str(franchise.system_id) not in _listed(admin_client, "franchise")


def test_a_reviewed_group_returns_when_its_lone_entry_is_swapped(admin_client, db_session):
    franchise = _franchise(db_session, "Swapped")
    first = _anime(db_session, franchise, "First Child")
    assert admin_client.post(f"{URL}/franchise/{franchise.system_id}/reviewed").status_code == 200
    assert str(franchise.system_id) not in _listed(admin_client, "franchise")

    # The reviewed entry leaves and another takes its place: still one entry,
    # but not the one that was reviewed.
    first.franchise_id = None
    db_session.flush()
    second = _anime(db_session, franchise, "Second Child")

    group = _listed(admin_client, "franchise")[str(franchise.system_id)]
    assert group["entry"]["system_id"] == str(second.system_id)


def test_reviewing_a_series(admin_client, db_session):
    franchise = _franchise(db_session, "Has Series")
    series = _series(db_session, franchise, "Single Series")
    _anime(db_session, franchise, "In Series", series=series)
    _anime(db_session, franchise, "Outside Series")

    assert str(series.system_id) in _listed(admin_client, "series")
    assert admin_client.post(f"{URL}/series/{series.system_id}/reviewed").status_code == 200
    assert str(series.system_id) not in _listed(admin_client, "series")


def test_reviewing_a_group_without_exactly_one_entry_is_refused(admin_client, db_session):
    franchise = _franchise(db_session, "Two Now")
    _anime(db_session, franchise, "A")
    _anime(db_session, franchise, "B")
    res = admin_client.post(f"{URL}/franchise/{franchise.system_id}/reviewed")
    assert res.status_code == 409
    db_session.refresh(franchise)
    assert franchise.alone_reviewed_media_id is None


def test_reviewing_an_unknown_group_or_kind(admin_client, db_session):
    assert admin_client.post(f"{URL}/franchise/{uuid.uuid4()}/reviewed").status_code == 404
    assert admin_client.post(f"{URL}/collection/{uuid.uuid4()}/reviewed").status_code == 422


def test_needs_manage_pipelines(user_client, db_session):
    franchise = _franchise(db_session, "Guarded")
    assert user_client.get(URL).status_code in (401, 403)
    res = user_client.post(f"{URL}/franchise/{franchise.system_id}/reviewed")
    assert res.status_code in (401, 403)
