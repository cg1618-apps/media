"""
The review queue's "have remark" block: GET /api/data-control/check/remarks.

Every entry here is built straight through the ORM and the session is
emptied before the request, so the endpoint loads FRESH instances. That is
what makes these tests bite: a status is not a column on any detail table
any more, and an instance that went through an entry router already carries
one that `attach_list_fields` put there - which is how a review queue reading
`entry.watching_status` directly passed its old test and answered 500 against
a real database.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

from app import models


def _remark(db_session, author, entry, text):
    db_session.add(
        models.Note(
            author_id=author.id,
            media_id=entry.system_id,
            section="remark",
            content=text,
        )
    )
    db_session.flush()


def _entry(db_session, model, **names):
    entry = model(system_id=uuid.uuid4(), **names)
    db_session.add(entry)
    db_session.flush()
    return entry


def _fetch(admin_client, db_session):
    # Fresh instances only: nothing an earlier request attached survives.
    db_session.expunge_all()
    res = admin_client.get("/api/data-control/check/remarks")
    assert res.status_code == 200, res.text
    return res.json()


def test_every_type_reports_its_status_from_the_viewers_list(
    admin_client, db_session, admin_user, list_row
):
    anime = _entry(db_session, models.Anime, anime_name_en="Remarked Anime")
    manga = _entry(db_session, models.Manga, manga_name_en="Remarked Manga")
    game = _entry(db_session, models.Game, game_name_en="Remarked Game")
    movie = _entry(
        db_session, models.Movies, movie_name_en="Remarked Movie",
        release_date_usa="2021-05-01",
    )
    list_row(anime, status="Completed")
    list_row(manga, status="Active Reading")
    list_row(game, status="Active Playing")
    for entry in (anime, manga, game, movie):
        _remark(db_session, admin_user, entry, f"remark on {entry.system_id}")

    body = _fetch(admin_client, db_session)

    (a,) = body["anime"]
    assert a["watching_status"] == "Completed"
    assert a["public_id"] == anime.public_id
    (m,) = body["manga"]
    assert m["reading_status"] == "Active Reading"
    (g,) = body["game"]
    assert g["playing_status"] == "Active Playing"
    assert g["remark"] == f"remark on {game.system_id}"
    (mv,) = body["movie"]
    # No list row: the type's default, not a crash and not None.
    assert mv["watching_status"] == "Might Watch"
    assert mv["release_date"] == "2021-05-01"


def test_the_gated_types_report_a_status_too(
    admin_client, db_session, admin_user, list_row
):
    h_comic = _entry(db_session, models.HComic, h_comic_name_en="Remarked HC")
    hentai = _entry(db_session, models.Hentai, hentai_name_en="Remarked HT")
    h_game = _entry(db_session, models.HGame, h_game_name_en="Remarked HG")
    list_row(h_comic, status="Completed")
    list_row(hentai, status="Paused")
    list_row(h_game, status="Completed")
    for entry in (h_comic, hentai, h_game):
        _remark(db_session, admin_user, entry, "gated remark")

    body = _fetch(admin_client, db_session)

    assert [r["reading_status"] for r in body["h_comic"]] == ["Completed"]
    assert [r["watching_status"] for r in body["hentai"]] == ["Paused"]
    assert [r["playing_status"] for r in body["h_game"]] == ["Completed"]
    for key in ("h_comic", "hentai", "h_game"):
        assert body[key][0]["public_id"] is not None


def test_every_media_type_has_a_key(admin_client, db_session):
    body = _fetch(admin_client, db_session)
    assert set(body) == {
        "anime", "anime_movie", "movie", "tv_show", "cartoon", "manga",
        "novel", "comic", "game", "h_comic", "hentai", "h_game",
    }


def test_another_authors_remark_and_other_sections_are_not_listed(
    admin_client, db_session, admin_user, plain_user
):
    # The mirror case: the same entry IS listed once the caller's own remark
    # exists, so an empty answer here is the filter working, not an empty set.
    anime = _entry(db_session, models.Anime, anime_name_en="Somebody Else's")
    _remark(db_session, plain_user, anime, "not mine")
    db_session.add(
        models.Note(
            author_id=admin_user.id,
            media_id=anime.system_id,
            section="personal_reviews",
            content="a review, not a remark",
        )
    )
    db_session.flush()
    assert _fetch(admin_client, db_session)["anime"] == []

    anime = db_session.get(models.Anime, anime.system_id)
    _remark(db_session, admin_user, anime, "mine")
    assert [r["remark"] for r in _fetch(admin_client, db_session)["anime"]] == ["mine"]
