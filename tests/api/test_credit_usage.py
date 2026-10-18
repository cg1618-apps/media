"""
GET /api/credits/usage: how many entries of each media type use each studio,
publisher, person (per role) and vocabulary value - the counts the Add and
Modify forms order their suggestions by, and the studio scope they filter the
empty box on.

The scope tests carry a studio credited ONLY on a hentai, so "not in the anime
counts" has something to leave out; the mirror reads the same studio back
under hentai, so a green proves the media-type split did the excluding.

The visibility tests credit a label-hidden anime. The guest's mode lacks the
label (the hidden_anime fixture's nsfw label is carried only by wide modes)
and admin_client's carries it, so the same row read twice proves the label
filter, not an empty table, is what dropped the count.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import uuid

from sqlalchemy import event

from app import models

URL = "/api/credits/usage"


def _anime(db_session, name):
    entry = models.Anime(anime_name_cn=name)
    db_session.add(entry)
    db_session.flush()
    return entry


def _hentai(db_session, name):
    entry = models.Hentai(hentai_name_cn=name)
    db_session.add(entry)
    db_session.flush()
    return entry


def _studio(db_session, name):
    studio = models.Studio(system_id=uuid.uuid4(), name_en=name)
    db_session.add(studio)
    db_session.flush()
    return studio


def _credit(db_session, entry, role, **target):
    db_session.add(models.MediaCredit(media_id=entry.system_id, role=role, **target))
    db_session.flush()


def _option(db_session, category, value):
    option = models.SystemOption(system_id=uuid.uuid4(), category=category, value=value)
    db_session.add(option)
    db_session.flush()
    return option


def _tag(db_session, entry, field, option):
    db_session.add(
        models.MediaTag(media_id=entry.system_id, field=field, option_id=option.system_id)
    )
    db_session.flush()


def _usage(client):
    r = client.get(URL)
    assert r.status_code == 200, r.text
    return r.json()


def test_a_studio_is_counted_under_the_types_it_is_credited_on(
    admin_client, db_session
):
    first, second = _anime(db_session, "一"), _anime(db_session, "二")
    busy = _studio(db_session, "Usage Busy Studio")
    quiet = _studio(db_session, "Usage Quiet Studio")
    hentai_only = _studio(db_session, "Usage Hentai Only Studio")
    _credit(db_session, first, "studio", studio_id=busy.system_id)
    _credit(db_session, second, "studio", studio_id=busy.system_id)
    _credit(db_session, first, "studio", studio_id=quiet.system_id)
    _credit(
        db_session, _hentai(db_session, "三"), "studio", studio_id=hentai_only.system_id
    )

    usage = _usage(admin_client)

    anime = usage["anime"]["studio"]
    assert anime[str(busy.system_id)] == 2
    assert anime[str(quiet.system_id)] == 1
    # Out of scope for anime: credited, but never on an anime.
    assert str(hentai_only.system_id) not in anime
    # The mirror: the same studio IS counted under the type it works in.
    assert usage["hentai"]["studio"][str(hentai_only.system_id)] == 1


def test_an_entry_crediting_a_studio_twice_counts_once(admin_client, db_session):
    entry = _anime(db_session, "重複")
    studio = _studio(db_session, "Usage Twice Studio")
    _credit(db_session, entry, "studio", studio_id=studio.system_id)
    # A second row for the same studio on the same entry, under another role
    # key, written straight to the table: the count is of ENTRIES, so it
    # stays 1.
    db_session.add(
        models.MediaCredit(
            media_id=entry.system_id, role="director", studio_id=studio.system_id
        )
    )
    db_session.flush()

    assert _usage(admin_client)["anime"]["studio"][str(studio.system_id)] == 1


def test_people_are_counted_per_role(admin_client, db_session):
    first, second = _anime(db_session, "甲"), _anime(db_session, "乙")
    person = models.Person(system_id=uuid.uuid4(), name_en="Usage Director")
    db_session.add(person)
    db_session.flush()
    _credit(db_session, first, "director", person_id=person.system_id)
    _credit(db_session, second, "director", person_id=person.system_id)
    _credit(db_session, first, "producer", person_id=person.system_id)

    people = _usage(admin_client)["anime"]["person"]
    assert people["director"][str(person.system_id)] == 2
    assert people["producer"][str(person.system_id)] == 1
    assert str(person.system_id) not in people.get("composer", {})


def test_publishers_are_counted(admin_client, db_session):
    entry = _anime(db_session, "代理")
    publisher = models.Publisher(system_id=uuid.uuid4(), name_en="Usage Distributor")
    db_session.add(publisher)
    db_session.flush()
    _credit(db_session, entry, "publisher", publisher_id=publisher.system_id)

    usage = _usage(admin_client)
    assert usage["anime"]["publisher"][str(publisher.system_id)] == 1


def test_vocabulary_values_are_counted_per_type(admin_client, db_session):
    first, second = _anime(db_session, "戀愛"), _anime(db_session, "喜劇")
    romance = _option(db_session, "Genre Main", "Usage Romance")
    comedy = _option(db_session, "Genre Main", "Usage Comedy")
    _tag(db_session, first, "genre_main", romance)
    _tag(db_session, second, "genre_main", romance)
    _tag(db_session, second, "genre_main", comedy)

    options = _usage(admin_client)["anime"]["option"]
    assert options[str(romance.system_id)] == 2
    assert options[str(comedy.system_id)] == 1


def test_a_label_hidden_entry_is_not_counted(client, admin_client, db_session, hidden_anime):
    studio = _studio(db_session, "Usage Hidden Studio")
    _credit(db_session, hidden_anime, "studio", studio_id=studio.system_id)
    genre = _option(db_session, "Genre Main", "Usage Hidden Genre")
    _tag(db_session, hidden_anime, "genre_main", genre)
    # A visible anime crediting another studio, so the guest's anime counts
    # cannot be empty for the unrelated reason of lacking the type.
    seen = _studio(db_session, "Usage Seen Studio")
    _credit(db_session, _anime(db_session, "可見"), "studio", studio_id=seen.system_id)

    # The mirror first: a mode carrying the label counts the entry.
    admin = _usage(admin_client)["anime"]
    assert admin["studio"][str(studio.system_id)] == 1
    assert admin["option"][str(genre.system_id)] == 1

    guest = _usage(client)["anime"]
    assert guest["studio"][str(seen.system_id)] == 1
    assert str(studio.system_id) not in guest["studio"]
    assert str(genre.system_id) not in guest.get("option", {})


_TX_CONTROL = ("SAVEPOINT", "RELEASE", "ROLLBACK", "COMMIT", "BEGIN")


def _queries_for(db_session, client):
    seen = []

    def count(_conn, _cursor, statement, *_args, **_kwargs):
        if not statement.lstrip().upper().startswith(_TX_CONTROL):
            seen.append(1)

    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", count)
    try:
        assert client.get(URL).status_code == 200
    finally:
        event.remove(engine, "before_cursor_execute", count)
    return len(seen)


def test_the_query_count_does_not_grow_with_the_values(admin_client, db_session):
    entry = _anime(db_session, "計數")
    studio = _studio(db_session, "Usage Count Studio 0")
    _credit(db_session, entry, "studio", studio_id=studio.system_id)
    _tag(db_session, entry, "genre_main", _option(db_session, "Genre Main", "Usage C0"))
    _queries_for(db_session, admin_client)  # warm the permission cache
    before = _queries_for(db_session, admin_client)

    for i in range(1, 8):
        other = _anime(db_session, f"計數{i}")
        _credit(
            db_session, other, "studio",
            studio_id=_studio(db_session, f"Usage Count Studio {i}").system_id,
        )
        _tag(
            db_session, other, "genre_main",
            _option(db_session, "Genre Main", f"Usage C{i}"),
        )

    assert _queries_for(db_session, admin_client) == before
