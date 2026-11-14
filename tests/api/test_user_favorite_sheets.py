"""
The User Favorite tab: Backup then Pull All brings every account's favourite
quotes and memes back to that account, and a backup taken before revision
f1a2vourites3 - whose Quote and Meme tabs still carry `is_favorite` -
restores those flags onto the installation owner rather than dropping them.

Drives the real execute_backup and execute_pull_all against an in-memory
workbook, as test_user_rating_sheets.py does.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest
from sqlalchemy import text

from app import models
from app.services.pipelines import backup, pull
from app.services.pipelines.tabs import TAB_NAMES
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
    db.add_all([cg, kana])
    db.commit()
    quote = models.Quote(system_id=uuid.uuid4(), author_id=cg.id, text="Sheet line")
    other = models.Quote(system_id=uuid.uuid4(), author_id=cg.id, text="Other line")
    collection = models.Collection(system_id=uuid.uuid4(),
                                   collection_name_en="Sheet Collection")
    db.add_all([quote, other, collection])
    db.commit()
    meme = models.Meme(system_id=uuid.uuid4(), author_id=cg.id, text="Sheet gag",
                       collection_id=collection.system_id)
    db.add(meme)
    db.commit()
    return {"cg": cg, "kana": kana, "quote": quote, "other": other, "meme": meme}


def _favourites(db):
    db.expire_all()
    return {
        (db.get(models.User, f.user_id).username, f.quote_id or f.meme_id)
        for f in db.query(models.UserFavorite).all()
    }


def test_the_tab_round_trips_for_two_users(db, workbook, world):
    w = world
    db.add_all([
        models.UserFavorite(user_id=w["cg"].id, quote_id=w["quote"].system_id),
        models.UserFavorite(user_id=w["kana"].id, quote_id=w["quote"].system_id),
        models.UserFavorite(user_id=w["kana"].id, meme_id=w["meme"].system_id),
    ])
    db.commit()
    before = _favourites(db)

    backup.execute_backup(db, action_type="Manual")
    headers = workbook["User Favorite"][0]
    assert "username" in headers and "user_id" not in headers
    assert "is_favorite" not in workbook["Quote"][0]
    assert "is_favorite" not in workbook["Meme"][0]

    db.execute(text("DELETE FROM user_favorite"))
    db.commit()

    result = pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)
    assert result["unresolved_refs"] == []
    assert _favourites(db) == before

    # Idempotent: a second Pull matches every row by its natural key.
    pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)
    assert _favourites(db) == before
    assert db.query(models.UserFavorite).count() == 3


def test_an_unknown_username_is_skipped_and_reported(db, workbook, world):
    w = world
    db.add(models.UserFavorite(user_id=w["kana"].id, quote_id=w["quote"].system_id))
    db.commit()
    backup.execute_backup(db, action_type="Manual")
    headers = workbook["User Favorite"][0]
    workbook["User Favorite"][1][headers.index("username")] = "nobody-here"
    db.execute(text("DELETE FROM user_favorite"))
    db.commit()

    result = pull.execute_pull_specific(db, "User Favorite", may_restore_authz=True)

    assert result["rows_skipped"] == 1
    assert any("nobody-here" in ref for ref in result["unresolved_refs"])
    assert db.query(models.UserFavorite).count() == 0


def test_an_old_backup_restores_its_favourites_onto_the_installation_owner(
    db, workbook, world
):
    """
    Quote and Meme tabs written before f1a2vourites3: the flags are not
    columns any more, and must become the owner's rows rather than vanish.
    The second account gets nothing - the old sheet held one person's view -
    and a false cell is no favourite.
    """
    w = world
    backup.execute_backup(db, action_type="Manual")

    def add_column(tab, header, value_for):
        matrix = workbook[tab]
        matrix[0].append(header)
        ids = matrix[0].index("system_id")
        for row in matrix[1:]:
            row.append(value_for(row[ids]))

    qid, mid = str(w["quote"].system_id), str(w["meme"].system_id)
    add_column("Quote", "is_favorite", lambda i: "TRUE" if i == qid else "FALSE")
    add_column("Meme", "is_favorite", lambda i: "TRUE" if i == mid else "")
    workbook.pop("User Favorite", None)

    result = pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)

    # Not reported as stale columns: they were read.
    assert not any("is not on this model" in ref for ref in result["unresolved_refs"])
    assert _favourites(db) == {
        ("cg1618", w["quote"].system_id),
        ("cg1618", w["meme"].system_id),
    }


def test_the_tab_restores_after_its_owners():
    at = TAB_NAMES.index
    for parent in ("Users", "Quote", "Meme"):
        assert at(parent) < at("User Favorite"), parent
