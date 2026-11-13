"""
The Note Mark tab: Backup then Pull All brings every account's marks back to
that account, by `username` and the note's id; a mark on a music_status row
the other database minted under its own uuid follows the row; and a backup
taken before revision n1o2temarks3, whose Note tab still carries the personal
values in `status` and `fields`, files them under the installation owner.

Drives the real execute_backup and execute_pull_all against an in-memory
workbook, as test_user_rating_sheets.py does.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import json
import uuid

import pytest
from sqlalchemy import text

from app import models
from app.services.pipelines import backup, pull
from tests.api.conftest import role_id_for


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def workbook(monkeypatch):
    sheet: dict[str, list[list]] = {}

    def _write(tab_name, matrix):
        if not matrix:
            raise ValueError("refusing to blank a tab")
        sheet[tab_name] = [list(row) for row in matrix]
        return True

    def _read(tab_name):
        return sheet.get(tab_name, [])

    monkeypatch.setattr(backup, "bulk_overwrite_sheet", _write)
    monkeypatch.setattr(pull, "get_all_raw_rows", _read)
    return sheet


@pytest.fixture
def world(db):
    cg = models.User(username="cg1618", hashed_password="!",
                     role_id=role_id_for(db, "super"), is_installation_owner=True)
    kana = models.User(username="kana", hashed_password="!",
                       role_id=role_id_for(db, "user"))
    game = models.Game(system_id=uuid.uuid4(), game_name_en="Sheet Game")
    anime = models.Anime(system_id=uuid.uuid4(), anime_name_en="Sheet Anime")
    db.add_all([cg, kana, game, anime])
    db.commit()
    item = models.Note(system_id=uuid.uuid4(), media_id=game.system_id, author_id=cg.id,
                       section="items", title="Flask", fields={"amount_total": "12"})
    stat = models.Note(system_id=uuid.uuid4(), media_id=game.system_id, author_id=cg.id,
                       section="stats_and_points", title="Vigor")
    lst = models.Note(system_id=uuid.uuid4(), media_id=anime.system_id, author_id=cg.id,
                      section="music_status", kind="op")
    db.add_all([item, stat, lst])
    db.commit()
    return {"cg": cg, "kana": kana, "game": game, "anime": anime,
            "item": item, "stat": stat, "list": lst}


def _marks(db):
    db.expire_all()
    return {
        (db.get(models.User, m.user_id).username, m.note_id): m.values
        for m in db.query(models.NoteMark).all()
    }


def test_the_tab_round_trips_for_two_users(db, workbook, world):
    w = world
    db.add_all([
        models.NoteMark(user_id=w["cg"].id, note_id=w["item"].system_id,
                        values={"collected": "collected", "amount_collected": "3"}),
        models.NoteMark(user_id=w["kana"].id, note_id=w["item"].system_id,
                        values={"collected": "skip"}),
        models.NoteMark(user_id=w["kana"].id, note_id=w["stat"].system_id,
                        values={"my_value": "40"}),
    ])
    db.commit()
    before = _marks(db)

    backup.execute_backup(db, action_type="Manual")
    headers = workbook["Note Mark"][0]
    assert "username" in headers and "user_id" not in headers
    assert "note_id" in headers

    db.execute(text("DELETE FROM note_mark"))
    db.commit()

    result = pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)
    assert result["unresolved_refs"] == []
    assert _marks(db) == before

    # Idempotent: the second Pull matches every row by (user, note).
    pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)
    assert _marks(db) == before


def test_a_mark_follows_a_music_status_row_minted_under_another_uuid(db, workbook, world):
    """music_status rows are minted per database. The sheet's row folds onto
    the local one for the same list, and its mark has to follow it."""
    w = world
    db.add(models.NoteMark(user_id=w["kana"].id, note_id=w["list"].system_id,
                           values={"status": "Need"}))
    db.commit()
    backup.execute_backup(db, action_type="Manual")
    foreign = str(uuid.uuid4())
    for tab, column in (("Note", "system_id"), ("Note Mark", "note_id")):
        index = workbook[tab][0].index(column)
        for row in workbook[tab][1:]:
            if row[index] == str(w["list"].system_id):
                row[index] = foreign
    db.execute(text("DELETE FROM note_mark"))
    db.commit()

    result = pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)

    assert result["unresolved_refs"] == []
    assert _marks(db) == {("kana", w["list"].system_id): {"status": "Need"}}


def test_a_mark_naming_an_unknown_user_is_skipped_and_reported(db, workbook, world):
    w = world
    db.add(models.NoteMark(user_id=w["kana"].id, note_id=w["item"].system_id,
                           values={"collected": "skip"}))
    db.commit()
    backup.execute_backup(db, action_type="Manual")
    index = workbook["Note Mark"][0].index("username")
    workbook["Note Mark"][1][index] = "nobody"
    db.execute(text("DELETE FROM note_mark"))
    db.commit()

    result = pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)

    assert any("nobody" in ref for ref in result["unresolved_refs"])
    assert _marks(db) == {}


def test_an_old_backups_note_values_go_to_the_installation_owner(db, workbook, world):
    """A Note tab written before n1o2temarks3 carries the personal values on
    the row. They are told apart by section: on these sections the status (or
    the key) can only ever have been personal."""
    w = world
    backup.execute_backup(db, action_type="Manual")
    headers = workbook["Note"][0]
    sid, status, fields = (headers.index(c) for c in ("system_id", "status", "fields"))
    for row in workbook["Note"][1:]:
        if row[sid] == str(w["item"].system_id):
            row[status] = "collected"
        if row[sid] == str(w["stat"].system_id):
            row[fields] = json.dumps({"my_value": "40"})
        if row[sid] == str(w["list"].system_id):
            row[status] = "Pending"
    # An old sheet has no Note Mark tab.
    workbook.pop("Note Mark", None)

    result = pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)

    assert result["unresolved_refs"] == []
    assert _marks(db) == {
        ("cg1618", w["item"].system_id): {"collected": "collected"},
        ("cg1618", w["stat"].system_id): {"my_value": "40"},
        ("cg1618", w["list"].system_id): {"status": "Pending"},
    }
    db.expire_all()
    assert db.get(models.Note, w["item"].system_id).status is None
    assert db.get(models.Note, w["list"].system_id).status is None
    assert not (db.get(models.Note, w["stat"].system_id).fields or {}).get("my_value")
