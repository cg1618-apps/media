"""
The User Highlight Group Order tab: Backup then Pull All brings every
account's highlight group order back to that account, keyed by
(media_type, public_id, username); and a backup taken before revision
h1i2ghlights3 - whose H-Comic and H-Game tabs still carry
highlight_group_order - restores it onto the installation owner.

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

TAB = "User Highlight Group Order"


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
    franchise = models.Franchise(system_id=uuid.uuid4(), franchise_type="H-Comic",
                                 franchise_name_en="Sheet H Franchise")
    db.add_all([cg, kana, franchise])
    db.commit()
    h_comic = models.HComic(system_id=uuid.uuid4(), franchise_id=franchise.system_id,
                            h_comic_name_cn="表漫", region="KR")
    h_game = models.HGame(system_id=uuid.uuid4(), franchise_id=franchise.system_id,
                          h_game_name_cn="表遊")
    db.add_all([h_comic, h_game])
    db.commit()
    return {"cg": cg, "kana": kana, "h_comic": h_comic, "h_game": h_game}


def _orders(db):
    return {
        (db.get(models.User, r.user_id).username, r.media_id): r.group_order
        for r in db.query(models.UserHighlightGroupOrder).all()
    }


def test_the_tab_round_trips_for_two_users(db, workbook, world):
    w = world
    db.add_all([
        models.UserHighlightGroupOrder(user_id=w["cg"].id, media_id=w["h_comic"].system_id,
                                       group_order=["Bea", "Ana"]),
        models.UserHighlightGroupOrder(user_id=w["kana"].id, media_id=w["h_comic"].system_id,
                                       group_order=["Ana"]),
        models.UserHighlightGroupOrder(user_id=w["kana"].id, media_id=w["h_game"].system_id,
                                       group_order=["Cy", "Di"]),
    ])
    db.commit()
    before = _orders(db)
    assert len(before) == 3

    backup.execute_backup(db, action_type="Manual")
    header = workbook[TAB][0]
    assert {"media_type", "public_id", "username", "group_order"} <= set(header)
    assert not {"user_id", "media_id", "system_id"} & set(header)

    db.execute(text("DELETE FROM user_highlight_group_order"))
    db.commit()

    result = pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)
    assert not [r for r in result["unresolved_refs"] if TAB in r]
    assert _orders(db) == before

    # Idempotent: a second Pull matches every row by its natural key.
    pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)
    assert _orders(db) == before


def test_an_unknown_user_or_a_malformed_order_is_skipped_and_reported(
    db, workbook, world
):
    w = world
    db.add(models.UserHighlightGroupOrder(user_id=w["cg"].id,
                                          media_id=w["h_comic"].system_id,
                                          group_order=["Ana"]))
    db.commit()
    backup.execute_backup(db, action_type="Manual")
    matrix = workbook[TAB]
    header = matrix[0]
    good = matrix[1]
    stranger = list(good)
    stranger[header.index("username")] = "nobody-here"
    malformed = list(good)
    malformed[header.index("username")] = "kana"
    malformed[header.index("group_order")] = '"just a name"'
    workbook[TAB] = [header, good, stranger, malformed]
    db.execute(text("DELETE FROM user_highlight_group_order"))
    db.commit()

    result = pull.execute_pull_specific(db, TAB, may_restore_authz=True)

    reported = [r for r in result["unresolved_refs"] if TAB in r]
    assert any("nobody-here" in r for r in reported)
    assert any("kana" in r and "list of names" in r for r in reported)
    # The mirror: the well-formed row did restore.
    assert _orders(db) == {("cg1618", w["h_comic"].system_id): ["Ana"]}


def test_an_old_backup_restores_its_orders_onto_the_installation_owner(
    db, workbook, world
):
    """
    H-Comic / H-Game tabs written before h1i2ghlights3: the column is gone,
    and its value must become the owner's row rather than vanish. kana gets
    nothing - the old column held one person's order.
    """
    w = world
    backup.execute_backup(db, action_type="Manual")

    def add_column(tab, value_for):
        matrix = workbook[tab]
        matrix[0].append("highlight_group_order")
        ids = matrix[0].index("system_id")
        for row in matrix[1:]:
            row.append(value_for(row[ids]))

    cid, gid = str(w["h_comic"].system_id), str(w["h_game"].system_id)
    add_column("H-Comic", lambda i: '["Bea", "Ana"]' if i == cid else "")
    add_column("H-Game", lambda i: '["Cy"]' if i == gid else "")
    workbook.pop(TAB, None)

    result = pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)

    assert not any("is not on this model" in ref for ref in result["unresolved_refs"])
    assert _orders(db) == {
        ("cg1618", w["h_comic"].system_id): ["Bea", "Ana"],
        ("cg1618", w["h_game"].system_id): ["Cy"],
    }


def test_the_tab_restores_after_its_owners():
    at = TAB_NAMES.index
    for parent in ("Users", "Media", "H-Comic", "H-Game"):
        assert at(parent) < at(TAB), parent
