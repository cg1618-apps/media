"""
credit_count is computed for a whole list in one pass, not per row.

The Add and Modify pages open by fetching thirteen person lists and six
publisher lists to fill their pickers, and every one of those responses used to
run two queries plus a visibility check PER PERSON. With 554 people that is
over a thousand round trips for a field the pickers never read.

These tests assert the query COUNT, not just that the number is right - an
N+1 produces exactly the same numbers, just slowly, so a correctness-only test
passes just as happily with the regression back in place. The correctness
tests below are the other half: a batch that counted wrong would otherwise
look like a win.
"""

import uuid

from sqlalchemy import event

from app import models


def _anime(db_session, name):
    a = models.Anime(anime_name_cn=name)
    db_session.add(a)
    db_session.flush()
    return a


def _person(db_session, name, role="director", scope="anime"):
    p = models.Person(system_id=uuid.uuid4(), name_en=name)
    db_session.add(p)
    db_session.flush()
    db_session.add(
        models.PersonRole(person_id=p.system_id, role=role, scope=scope)
    )
    return p


def _credit(db_session, person, entry, role="director"):
    db_session.add(
        models.MediaCredit(
            media_id=entry.system_id, role=role, person_id=person.system_id
        )
    )


# SAVEPOINT / RELEASE / ROLLBACK are the test harness's nested transaction,
# not work the endpoint asked for, and the harness emits one more of them once
# the suite has committed between two measurements. Counting them would make
# this test fail on its own scaffolding rather than on an N+1.
_TX_CONTROL = ("SAVEPOINT", "RELEASE", "ROLLBACK", "COMMIT", "BEGIN")


def _query_counter(db_session, client):
    """Returns queries_for(url) -> (query_count, body)."""
    seen = []

    def count(_conn, _cursor, statement, *_args, **_kwargs):
        if not statement.lstrip().upper().startswith(_TX_CONTROL):
            seen.append(1)

    engine = db_session.get_bind()

    def queries_for(url):
        seen.clear()
        event.listen(engine, "before_cursor_execute", count)
        try:
            body = client.get(url).json()
        finally:
            event.remove(engine, "before_cursor_execute", count)
        return len(seen), body

    return queries_for


def test_person_list_query_count_does_not_grow_with_the_row_count(
    admin_client, db_session
):
    entry = _anime(db_session, "測試")
    for i in range(2):
        _credit(db_session, _person(db_session, f"D{i}"), entry)
    db_session.commit()

    queries_for = _query_counter(db_session, admin_client)
    # The RBAC permission cache is process-local and loads on the first call,
    # so an unwarmed measurement counts a query the second never issues and
    # the comparison would measure the cache rather than the N+1.
    admin_client.get("/api/person/")

    two, body = queries_for("/api/person/")
    assert len(body) == 2

    for i in range(2, 5):
        _credit(db_session, _person(db_session, f"D{i}"), entry)
    db_session.commit()

    five, body = queries_for("/api/person/")
    assert len(body) == 5
    assert five == two, "query count grew with the number of people"


def test_person_list_counts_each_person_separately(admin_client, db_session):
    """
    A batch that shares one visible-pair set across every row is exactly the
    way this optimisation goes wrong: everyone ends up with the total. Three
    people with three different counts is what makes that fail.
    """
    a, b = _anime(db_session, "甲"), _anime(db_session, "乙")
    # Credited on nothing, and never bound: this person is here so the
    # assertion below can prove a zero is REPORTED rather than the row being
    # dropped from the map, which is how a dict-of-counts quietly goes wrong.
    _person(db_session, "None")
    one_p = _person(db_session, "One")
    two_p = _person(db_session, "Two")
    _credit(db_session, one_p, a)
    _credit(db_session, two_p, a)
    _credit(db_session, two_p, b)
    db_session.commit()

    counts = {
        p["display_name"]: p["credit_count"]
        for p in admin_client.get("/api/person/").json()
    }
    assert counts == {"None": 0, "One": 1, "Two": 2}


def test_person_list_counts_castings_not_only_credits(
    admin_client, db_session, seiyuu_with_one_casting
):
    """
    A seiyuu has no media_credit rows at all, so a batch that walked only
    media_credit would report 0 - the same defect the per-row version was
    fixed for, reintroduced by the batching.
    """
    rows = {
        r["system_id"]: r for r in admin_client.get("/api/person/").json()
    }
    assert rows[str(seiyuu_with_one_casting.system_id)]["credit_count"] == 1


def test_person_list_does_not_double_count_one_entry(
    admin_client, db_session, seiyuu_with_one_casting
):
    """
    The two stores are unioned as a SET of (media_type, entry_id) pairs, so a
    person both credited on and cast in one entry counts once. Concatenating
    the two lists instead would read 2.
    """
    entry_id = (
        db_session.query(models.CharacterCasting.entry_id)
        .filter_by(person_id=seiyuu_with_one_casting.system_id)
        .scalar()
    )
    db_session.add(
        models.MediaCredit(
            media_id=entry_id,
            role="director",
            person_id=seiyuu_with_one_casting.system_id,
        )
    )
    db_session.commit()

    rows = {
        r["system_id"]: r for r in admin_client.get("/api/person/").json()
    }
    assert rows[str(seiyuu_with_one_casting.system_id)]["credit_count"] == 1


def test_studio_list_query_count_does_not_grow_with_the_row_count(
    admin_client, db_session
):
    entry = _anime(db_session, "測試")
    for i in range(2):
        s = models.Studio(name_en=f"S{i}")
        db_session.add(s)
        db_session.flush()
        db_session.add(
            models.MediaCredit(
                media_id=entry.system_id, role="studio", studio_id=s.system_id
            )
        )
    db_session.commit()

    queries_for = _query_counter(db_session, admin_client)
    admin_client.get("/api/studio/")
    two, body = queries_for("/api/studio/")
    assert len(body) == 2

    for i in range(2, 5):
        s = models.Studio(name_en=f"S{i}")
        db_session.add(s)
        db_session.flush()
        db_session.add(
            models.MediaCredit(
                media_id=entry.system_id, role="studio", studio_id=s.system_id
            )
        )
    db_session.commit()

    five, body = queries_for("/api/studio/")
    assert len(body) == 5
    assert five == two, "query count grew with the number of studios"


def test_publisher_list_query_count_does_not_grow_with_the_row_count(
    admin_client, db_session
):
    entry = _anime(db_session, "測試")
    for i in range(2):
        p = models.Publisher(name_en=f"P{i}")
        db_session.add(p)
        db_session.flush()
        db_session.add(
            models.MediaCredit(
                media_id=entry.system_id,
                role="publisher",
                publisher_id=p.system_id,
            )
        )
    db_session.commit()

    queries_for = _query_counter(db_session, admin_client)
    admin_client.get("/api/publisher/")
    two, body = queries_for("/api/publisher/")
    assert len(body) == 2

    for i in range(2, 5):
        p = models.Publisher(name_en=f"P{i}")
        db_session.add(p)
        db_session.flush()
        db_session.add(
            models.MediaCredit(
                media_id=entry.system_id,
                role="publisher",
                publisher_id=p.system_id,
            )
        )
    db_session.commit()

    five, body = queries_for("/api/publisher/")
    assert len(body) == 5
    assert five == two, "query count grew with the number of publishers"
