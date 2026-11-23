"""
Tabs restored with the sheet's own integer PK must leave their sequence sane.

Postgres does not advance a sequence when an INSERT supplies the id
explicitly. Restoring into a fresh instance therefore leaves person_role
holding ids 1..N while person_role_id_seq still sits at 1, and the first save
that lets the sequence pick a value dies on
`duplicate key value violates unique constraint "person_role_pkey"` - over and
over, because the sequence only creeps forward one collision at a time.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import pytest
from sqlalchemy import text

from app import models
from app.services.pipelines import pull


@pytest.fixture
def sheet(monkeypatch):
    def _install(headers, rows):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [headers] + rows)

    return _install


def _rewind(db_session, sequence):
    """
    Put the sequence back where a freshly created database leaves it.

    Sequences are non-transactional, so a resync from an earlier test in the
    same session survives this test's rollback and would make the assertion
    below pass even with the fix removed.
    """
    db_session.execute(text(f"SELECT setval('{sequence}', 1, false)"))


def test_person_role_sequence_is_resynced_after_a_restore(db_session, sheet):
    _rewind(db_session, "person_role_id_seq")
    person = models.Person(name_jp="新海誠")
    db_session.add(person)
    db_session.flush()

    sheet(
        ["id", "person_id", "role", "scope"],
        [
            # Ids 1..N are exactly what a restore into a fresh instance brings.
            ["1", str(person.system_id), "director", "anime"],
            # A real scope, not "": person_role.scope is NOT NULL now, so a
            # sheet row with an empty scope fails the restore. Backups taken
            # after the role collapse always carry one - and a backup taken
            # BEFORE it cannot be restored anyway, because its role names are
            # the retired vocabulary.
            ["2", str(person.system_id), "producer", "anime"],
        ],
    )
    result = pull.execute_pull_specific(db_session, "Person Role", log_action=False)
    assert result["status"] == "success"

    # The next role saved from the Add form lets the sequence choose the id.
    db_session.add(
        models.PersonRole(person_id=person.system_id, role="composer", scope="anime")
    )
    db_session.flush()

    ids = {r.id for r in db_session.query(models.PersonRole).all()}
    assert {1, 2} <= ids
    assert len(ids) == 3, "the sequence handed out an id that already existed"


def test_publisher_scope_sequence_is_resynced_after_a_restore(db_session, sheet):
    _rewind(db_session, "publisher_scope_id_seq")
    publisher = models.Publisher(name_en="Sega")
    db_session.add(publisher)
    db_session.flush()

    sheet(
        ["id", "publisher_id", "scope"],
        [
            ["1", str(publisher.system_id), "game"],
            ["2", str(publisher.system_id), "anime"],
        ],
    )
    result = pull.execute_pull_specific(db_session, "Publisher Scope", log_action=False)
    assert result["status"] == "success"

    # The next scope pill saved from the Publisher form lets the sequence choose.
    db_session.add(
        models.PublisherScope(publisher_id=publisher.system_id, scope="manga")
    )
    db_session.flush()

    ids = {r.id for r in db_session.query(models.PublisherScope).all()}
    assert {1, 2} <= ids
    assert len(ids) == 3, "the sequence handed out an id that already existed"


def test_system_option_scope_sequence_is_resynced_after_a_restore(db_session, sheet):
    _rewind(db_session, "system_option_scope_id_seq")
    option = models.SystemOption(category="Genre Main", value="Action")
    db_session.add(option)
    db_session.flush()

    sheet(
        ["id", "option_id", "scope"],
        [["1", str(option.system_id), "anime"]],
    )
    result = pull.execute_pull_specific(
        db_session, "System Option Scope", log_action=False
    )
    assert result["status"] == "success"

    db_session.add(
        models.SystemOptionScope(option_id=option.system_id, scope="comic")
    )
    db_session.flush()

    ids = {r.id for r in db_session.query(models.SystemOptionScope).all()}
    assert 1 in ids
    assert len(ids) == 2, "the sequence handed out an id that already existed"


def test_system_option_usage_sequence_is_resynced_after_a_restore(db_session, sheet):
    _rewind(db_session, "system_option_usage_id_seq")
    option = models.SystemOption(category="Platform", value="Fox")
    db_session.add(option)
    db_session.flush()

    sheet(
        ["id", "option_id", "usage"],
        [["1", str(option.system_id), "origin"]],
    )
    result = pull.execute_pull_specific(
        db_session, "System Option Usage", log_action=False
    )
    assert result["status"] == "success"

    db_session.add(
        models.SystemOptionUsage(option_id=option.system_id, usage="access")
    )
    db_session.flush()

    ids = {r.id for r in db_session.query(models.SystemOptionUsage).all()}
    assert 1 in ids
    assert len(ids) == 2, "the sequence handed out an id that already existed"


def test_a_table_whose_public_id_has_no_sequence_is_skipped(db_session):
    """
    `media` carries a public_id but owns no sequence: the value is a copy of
    the detail row's, minted by that table's own <table>_public_id_seq. Pull
    walks every tab, so deriving the sequence name from the table name made
    the whole Pull All crash with

        relation "media_public_id_seq" does not exist

    before any tab was restored. The resync must key off the column's actual
    Sequence default, not the table's name.
    """
    pull.resync_public_id_sequence(db_session, models.Media)


def test_an_entry_table_is_still_resynced(db_session):
    """The guard above must not stop the tables that do own a sequence."""
    _rewind(db_session, "anime_public_id_seq")
    a = models.Anime(anime_name_cn="序號測試", public_id=90001)
    db_session.add(a)
    db_session.flush()

    pull.resync_public_id_sequence(db_session, models.Anime)

    nxt = db_session.execute(text("SELECT nextval('anime_public_id_seq')")).scalar_one()
    assert nxt > 90001


def test_system_option_alias_sequence_is_resynced_after_a_restore(db_session, sheet):
    """
    The tab a hand-written list of tabs left out. A Pull All restored
    system_option_alias with ids up to 86 and left its sequence at 3, and the
    next INSERT that let the sequence choose - a migration seeding aliases -
    died on system_option_alias_pkey.
    """
    _rewind(db_session, "system_option_alias_id_seq")
    option = models.SystemOption(category="Game Platform", value="Switch")
    db_session.add(option)
    db_session.flush()

    sheet(
        ["id", "option_id", "source", "value"],
        [
            ["1", str(option.system_id), "igdb", "Nintendo Switch"],
            ["86", str(option.system_id), "igdb", "Switch"],
        ],
    )
    result = pull.execute_pull_specific(
        db_session, "System Option Alias", log_action=False
    )
    assert result["status"] == "success"

    db_session.add(
        models.SystemOptionAlias(
            option_id=option.system_id, source="steam", value="Switch"
        )
    )
    db_session.flush()

    ids = {r.id for r in db_session.query(models.SystemOptionAlias).all()}
    assert len(ids) == 3, "the sequence handed out an id that already existed"


def test_an_alias_matched_by_natural_key_keeps_its_local_id(db_session, sheet):
    """
    An alias's integer id is minted per database, so the sheet's is no
    identity. A fresh database holds the aliases a migration seeded, under
    its own ids; the sheet names the same alias under the id another local
    alias holds. Pull must match by natural key and leave both ids alone -
    writing the sheet's id onto the match collided on system_option_alias_pkey.
    """
    option = models.SystemOption(category="Game Platform", value="Switch")
    db_session.add(option)
    db_session.flush()
    seeded = models.SystemOptionAlias(option_id=option.system_id, source="igdb", value="Nintendo Switch")
    other = models.SystemOptionAlias(option_id=option.system_id, source="igdb", value="NS")
    db_session.add_all([seeded, other])
    db_session.flush()
    seeded_id, other_id = seeded.id, other.id

    sheet(
        ["id", "option_id", "source", "value"],
        [[str(other_id), str(option.system_id), "igdb", "Nintendo Switch"]],
    )
    result = pull.execute_pull_specific(
        db_session, "System Option Alias", log_action=False
    )
    assert result["status"] == "success", result
    db_session.expire_all()
    by_value = {
        r.value: r.id
        for r in db_session.query(models.SystemOptionAlias).filter_by(option_id=option.system_id)
    }
    assert by_value == {"Nintendo Switch": seeded_id, "NS": other_id}


def _sequence_backed_integer_keys(db_session):
    """
    Every (tab, table, sequence) whose primary key is an integer the database
    mints from a sequence - found by asking PostgreSQL about every tab's key
    columns, independently of how Pull finds them.
    """
    from sqlalchemy import Integer

    from app.services.pipelines.tabs import SHEET_TABS

    found = []
    for tab in SHEET_TABS:
        table = tab.model.__table__
        for column in table.primary_key.columns:
            if not isinstance(column.type, Integer):
                continue
            sequence = db_session.execute(
                text("SELECT pg_get_serial_sequence(:t, :c)"),
                {"t": f'"{table.name}"', "c": column.name},
            ).scalar_one()
            if sequence is not None:
                found.append((tab.name, table.name, column.name, sequence))
    return found


def test_every_sequence_backed_integer_key_is_resynced(db_session):
    """
    A tab added later with an integer key cannot silently miss the resync.

    Each sequence is pushed far ahead of its (empty) table and then resynced;
    only a resync that actually reached it brings it back to 1. The set is
    asserted non-empty, and to hold the known tables, so the loop cannot pass
    by having nothing to check.
    """
    keys = _sequence_backed_integer_keys(db_session)
    tables = {table for _, table, _, _ in keys}
    assert {
        "system_configs",
        "person_role",
        "publisher_scope",
        "system_option_scope",
        "system_option_usage",
        "system_option_alias",
    } <= tables

    from app.services.pipelines.tabs import TAB_MODELS

    for tab_name, table, _column, sequence in keys:
        db_session.execute(text(f'DELETE FROM "{table}"'))
        db_session.execute(text(f"SELECT setval('{sequence}', 5000, true)"))

        pull.resync_id_sequence(db_session, TAB_MODELS[tab_name])

        nxt = db_session.execute(text(f"SELECT nextval('{sequence}')")).scalar_one()
        assert nxt == 1, f"{tab_name}: {sequence} was not resynced ({nxt})"
        _rewind(db_session, sequence)


def test_every_tab_resolves_one_primary_key_column():
    """
    Pull reads each tab's key column off its model. A tab added later with a
    composite key would otherwise fail only when somebody pulls it; Seasonal,
    the one composite key, is matched on `seasonal` by name.
    """
    from app.services.pipelines.tabs import SHEET_TABS

    keys = {
        tab.name: pull._primary_key_column(tab.model)
        for tab in SHEET_TABS
        if tab.name != "Seasonal"
    }
    assert keys["System Option Alias"] == "id"
    assert keys["Users"] == "id"
    assert keys["Person"] == "system_id"
