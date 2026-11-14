"""
The User Rating and User Novel Unit Rating tabs: Backup then Pull All brings
every account's ratings, expectations and unit remarks back to that account,
and a backup taken before revision u1r2atings3 - whose Collection, Franchise,
Series, Character, Person, Studio, Publisher and Novel Unit tabs still carry
my_rating / *_expectation / remark - restores those values onto the
installation owner rather than dropping them.

Drives the real execute_backup and execute_pull_all against an in-memory
workbook, as test_multi_user_sheet_roundtrip.py does.

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
    franchise = models.Franchise(system_id=uuid.uuid4(), franchise_type="ACG",
                                 franchise_name_en="Sheet Franchise")
    person = models.Person(system_id=uuid.uuid4(), name_en="Sheet Person")
    novel = models.Novel(system_id=uuid.uuid4(), novel_name_en="Sheet Novel")
    db.add_all([cg, kana, franchise, person, novel])
    db.commit()
    unit = models.NovelUnit(system_id=uuid.uuid4(), novel_id=novel.system_id,
                            unit_kind="volume", position=1)
    db.add(unit)
    db.commit()
    return {"cg": cg, "kana": kana, "franchise": franchise, "person": person,
            "novel": novel, "unit": unit}


def _ratings(db):
    out = {}
    for r in db.query(models.UserRating).all():
        owner = r.franchise_id or r.person_id
        out[(db.get(models.User, r.user_id).username, owner)] = (
            r.my_rating, r.expectation
        )
    return out


def _unit_ratings(db):
    return {
        (db.get(models.User, r.user_id).username, r.unit_id): (r.my_rating, r.remark)
        for r in db.query(models.UserNovelUnitRating).all()
    }


def test_both_tabs_round_trip_for_two_users(db, workbook, world):
    w = world
    db.add_all([
        models.UserRating(user_id=w["cg"].id, franchise_id=w["franchise"].system_id,
                          my_rating="S", expectation="Highest"),
        models.UserRating(user_id=w["kana"].id, franchise_id=w["franchise"].system_id,
                          my_rating="C"),
        models.UserRating(user_id=w["kana"].id, person_id=w["person"].system_id,
                          my_rating="A"),
        models.UserNovelUnitRating(user_id=w["cg"].id, unit_id=w["unit"].system_id,
                                   my_rating="B", remark="cg's note"),
        models.UserNovelUnitRating(user_id=w["kana"].id, unit_id=w["unit"].system_id,
                                   remark="kana's note"),
    ])
    db.commit()
    before = (_ratings(db), _unit_ratings(db))

    backup.execute_backup(db, action_type="Manual")
    for tab in ("User Rating", "User Novel Unit Rating"):
        assert "username" in workbook[tab][0]
        assert "user_id" not in workbook[tab][0]

    db.execute(text("DELETE FROM user_rating"))
    db.execute(text("DELETE FROM user_novel_unit_rating"))
    db.commit()

    result = pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)
    assert result["unresolved_refs"] == []
    assert (_ratings(db), _unit_ratings(db)) == before

    # Idempotent: a second Pull matches every row by its natural key.
    pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)
    assert (_ratings(db), _unit_ratings(db)) == before


def test_a_person_rating_follows_the_person_minted_under_another_uuid(
    db, workbook, world
):
    """Person uuids are minted per database. The sheet's person_id names the
    other machine's uuid, and Pull translates it through the Person tab."""
    w = world
    db.add(models.UserRating(user_id=w["kana"].id, person_id=w["person"].system_id,
                             my_rating="A"))
    db.commit()
    backup.execute_backup(db, action_type="Manual")
    # The other machine: the same person under its own uuid.
    foreign = str(uuid.uuid4())
    for tab in ("Person", "User Rating"):
        headers = workbook[tab][0]
        column = headers.index("system_id" if tab == "Person" else "person_id")
        for row in workbook[tab][1:]:
            if row[column] == str(w["person"].system_id):
                row[column] = foreign
    db.execute(text("DELETE FROM user_rating"))
    db.commit()

    pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)

    assert _ratings(db) == {("kana", w["person"].system_id): ("A", None)}


def test_an_unknown_username_is_skipped_and_reported(db, workbook, world):
    w = world
    db.add(models.UserRating(user_id=w["kana"].id,
                             franchise_id=w["franchise"].system_id, my_rating="C"))
    db.commit()
    backup.execute_backup(db, action_type="Manual")
    headers = workbook["User Rating"][0]
    workbook["User Rating"][1][headers.index("username")] = "nobody-here"
    db.execute(text("DELETE FROM user_rating"))
    db.commit()

    result = pull.execute_pull_specific(db, "User Rating", may_restore_authz=True)

    assert result["rows_skipped"] == 1
    assert any("nobody-here" in ref for ref in result["unresolved_refs"])
    assert db.query(models.UserRating).count() == 0


def test_a_tab_without_a_username_header_files_under_the_owner(db, workbook, world):
    w = world
    workbook["User Rating"] = [
        ["system_id", "franchise_id", "my_rating", "expectation"],
        [str(uuid.uuid4()), str(w["franchise"].system_id), "B", "Low"],
    ]

    pull.execute_pull_specific(db, "User Rating", may_restore_authz=True)

    assert _ratings(db) == {("cg1618", w["franchise"].system_id): ("B", "Low")}


def test_an_old_backup_restores_its_ratings_onto_the_installation_owner(
    db, workbook, world
):
    """
    A Franchise / Person / Novel Unit tab written before u1r2atings3: the
    values are not columns any more, and must become the owner's rows rather
    than vanish. The second account must get nothing - the old sheet held one
    person's view.
    """
    w = world
    backup.execute_backup(db, action_type="Manual")

    def add_column(tab, header, value_for):
        matrix = workbook[tab]
        matrix[0].append(header)
        ids = matrix[0].index("system_id")
        for row in matrix[1:]:
            row.append(value_for(row[ids]))

    fid, pid, uid = (str(w["franchise"].system_id), str(w["person"].system_id),
                     str(w["unit"].system_id))
    add_column("Franchise", "my_rating", lambda i: "A" if i == fid else "")
    add_column("Franchise", "franchise_expectation", lambda i: "High" if i == fid else "")
    add_column("Person", "my_rating", lambda i: "b" if i == pid else "")
    add_column("Novel Unit", "remark", lambda i: "old remark" if i == uid else "")
    workbook.pop("User Rating", None)
    workbook.pop("User Novel Unit Rating", None)

    result = pull.execute_pull_all(db, action_type="Manual", may_restore_authz=True)

    # Not reported as stale columns: they were read.
    assert not any("is not on this model" in ref for ref in result["unresolved_refs"])
    assert _ratings(db) == {
        ("cg1618", w["franchise"].system_id): ("A", "High"),
        # normalize_my_rating folds a lower-case grade, as it always did.
        ("cg1618", w["person"].system_id): ("B", None),
    }
    assert _unit_ratings(db) == {("cg1618", w["unit"].system_id): (None, "old remark")}


def test_the_new_tabs_restore_after_their_owners():
    at = TAB_NAMES.index
    for parent in ("Users", "Collection", "Franchise", "Series", "Character",
                   "Person", "Studio", "Publisher"):
        assert at(parent) < at("User Rating"), parent
    assert at("Users") < at("User Novel Unit Rating")
    assert at("Novel Unit") < at("User Novel Unit Rating")
