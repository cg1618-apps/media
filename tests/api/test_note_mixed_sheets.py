"""
The Note tab carries `personal`: a personal row of a mixed section comes back
from Backup then Pull All as a personal row under its own author, by
`username`, exactly as a personal section's rows do. A backup taken before the
column existed restores every row as catalogue, which is all it can hold. A
personal row is never matched onto a local catalogue twin.

Drives the real execute_backup and execute_pull_all against an in-memory
workbook, as test_note_mark_sheets.py does.

Requires PostgreSQL. See tests/api/conftest.py.
"""

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

    monkeypatch.setattr(backup, "bulk_overwrite_sheet", _write)
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: sheet.get(tab, []))
    return sheet


@pytest.fixture
def world(db):
    cg = models.User(username="cg1618", hashed_password="!",
                     role_id=role_id_for(db, "super"), is_installation_owner=True)
    kana = models.User(username="kana", hashed_password="!",
                       role_id=role_id_for(db, "user"))
    mio = models.User(username="mio", hashed_password="!",
                      role_id=role_id_for(db, "user"))
    game = models.Game(system_id=uuid.uuid4(), game_name_en="Sheet Game")
    db.add_all([cg, kana, mio, game])
    db.commit()

    def note(author, title, personal, sort_index):
        return models.Note(system_id=uuid.uuid4(), media_id=game.system_id,
                           author_id=author.id, section="items", title=title,
                           personal=personal, sort_index=sort_index)

    rows = {
        "catalogue": note(cg, "Flask", False, 0),
        "kana": note(kana, "Kana's", True, 1),
        "mio": note(mio, "Mio's", True, 2),
    }
    db.add_all(rows.values())
    db.commit()
    return {"cg": cg, "kana": kana, "mio": mio, "game": game, **rows}


def _items(db):
    db.expire_all()
    return {
        n.system_id: (db.get(models.User, n.author_id).username, n.personal)
        for n in db.query(models.Note).filter(models.Note.section == "items")
    }


def test_personal_rows_round_trip_under_their_authors(db, workbook, world):
    w = world
    before = _items(db)
    assert before[w["kana"].system_id] == ("kana", True)

    backup.execute_backup(db, action_type="Manual")
    assert "personal" in workbook["Note"][0]
    db.execute(text("DELETE FROM note"))
    db.commit()

    result = pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)
    assert result["unresolved_refs"] == []
    assert _items(db) == before

    pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)
    assert _items(db) == before


def test_an_old_backup_without_the_column_restores_catalogue_rows(db, workbook, world):
    catalogue_id = world["catalogue"].system_id
    db.execute(text("DELETE FROM note WHERE personal"))
    db.commit()
    backup.execute_backup(db, action_type="Manual")
    headers = workbook["Note"][0]
    index = headers.index("personal")
    workbook["Note"] = [row[:index] + row[index + 1:] for row in workbook["Note"]]
    db.execute(text("DELETE FROM note"))
    db.commit()

    result = pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)
    assert result["unresolved_refs"] == []
    assert _items(db) == {catalogue_id: ("cg1618", False)}


def test_a_personal_row_never_folds_onto_a_catalogue_twin(db, workbook, world):
    """A sheet row under an unknown uuid is matched to a local twin by
    content. A personal row is never minted per database, so it has no twin -
    and folding it onto the catalogue row with the same title would hand the
    catalogue row to one account."""
    w = world
    w["kana"].title = "Flask"
    db.commit()
    backup.execute_backup(db, action_type="Manual")
    headers = workbook["Note"][0]
    sid = headers.index("system_id")
    tab = [headers]
    for row in workbook["Note"][1:]:
        if row[sid] == str(w["catalogue"].system_id):
            continue  # the local catalogue row is not on the sheet
        if row[sid] == str(w["kana"].system_id):
            row[sid] = str(uuid.uuid4())
        tab.append(row)
    workbook["Note"] = tab
    db.execute(text("DELETE FROM note WHERE personal"))
    db.commit()

    pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)

    items = _items(db)
    assert items[w["catalogue"].system_id] == ("cg1618", False)
    assert sorted(items.values()) == [("cg1618", False), ("kana", True), ("mio", True)]
