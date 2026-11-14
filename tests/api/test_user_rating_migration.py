"""
API integration tests for revision u1r2atings3: the shared rows' ratings,
expectations and novel unit remarks become the installation owner's
user_rating / user_novel_unit_rating rows, and come back on downgrade.

Runs the shipped revision's own data steps against the test session, as
test_music_status_migration.py does. The schema here is create_all's, which
has already lost the old columns, so each test puts them back first with the
revision's own add_old_columns - inside the test's transaction, which rolls
back at teardown.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text

from app import models
from tests.api.conftest import role_id_for

ROOT = Path(__file__).resolve().parents[2]
REVISION = ROOT / "alembic" / "versions" / "u1r2atings3_user_rating.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_user_rating", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def old_schema(db_session, revision):
    """The pre-revision columns, and no account eligible to own anything:
    every account the database already holds is set aside, so each test
    names the accounts the rule chooses between."""
    conn = db_session.connection()
    revision.add_old_columns(conn)
    db_session.query(models.User).update({"is_installation_owner": False})
    db_session.execute(
        text(
            "DELETE FROM users u USING role r WHERE r.system_id = u.role_id "
            "AND r.name NOT IN ('admin', 'guest')"
        )
    )
    db_session.flush()
    return conn


def _account(db, username, role, owner=False, status="active"):
    user = models.User(
        id=uuid.uuid4(),
        username=username,
        hashed_password="!",
        role_id=role_id_for(db, role),
        is_installation_owner=owner,
        status=status,
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def rated(db_session, old_schema, sample_franchise, sample_series):
    """A franchise rated and expected, a studio rated, a unit remarked - on
    the old columns, which the ORM no longer maps."""
    studio = models.Studio(system_id=uuid.uuid4(), name_en="Old Studio")
    novel = models.Novel(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        novel_name_en="Old Novel",
    )
    db_session.add_all([studio, novel])
    db_session.flush()
    unit = models.NovelUnit(
        system_id=uuid.uuid4(), novel_id=novel.system_id, unit_kind="volume", position=1
    )
    db_session.add(unit)
    db_session.flush()
    conn = old_schema
    conn.execute(
        text("UPDATE franchise SET my_rating = 'A', franchise_expectation = 'High' "
             "WHERE system_id = :id"),
        {"id": sample_franchise.system_id},
    )
    conn.execute(
        text("UPDATE studio SET my_rating = 'B' WHERE system_id = :id"),
        {"id": studio.system_id},
    )
    conn.execute(
        text("UPDATE novel_unit SET remark = 'a remark' WHERE system_id = :id"),
        {"id": unit.system_id},
    )
    return {"franchise": sample_franchise, "studio": studio, "unit": unit}


def _ratings(db):
    return {
        (r.user_id, r.franchise_id or r.studio_id, r.my_rating, r.expectation)
        for r in db.query(models.UserRating).all()
    }


def test_values_land_on_the_super_account_never_on_guest(db_session, rated, revision):
    """
    (a) The flag is unset. The guest account is created FIRST and sorts
    FIRST by username, so it would win on either if guest were eligible -
    which is what makes this refusal bite. The data must land on cg1618.
    """
    guest = _account(db_session, "aaa-guest", "guest")
    admin = _account(db_session, "aaa-admin", "admin")
    owner = _account(db_session, "cg1618", "super")

    revision.copy_to_owner(db_session.connection())
    db_session.expire_all()

    assert _ratings(db_session) == {
        (owner.id, rated["franchise"].system_id, "A", "High"),
        (owner.id, rated["studio"].system_id, "B", None),
    }
    unit_rows = db_session.query(models.UserNovelUnitRating).all()
    assert [(u.user_id, u.unit_id, u.my_rating, u.remark) for u in unit_rows] == [
        (owner.id, rated["unit"].system_id, None, "a remark")
    ]
    # The mirror: the two ineligible accounts got nothing.
    held = {r.user_id for r in db_session.query(models.UserRating)}
    assert guest.id not in held and admin.id not in held


def test_the_flag_holder_wins(db_session, rated, revision):
    """(b) The flag beats the username order, and a role it would otherwise
    exclude: here it sits on an admin account."""
    _account(db_session, "cg1618", "super")
    flagged = _account(db_session, "zzz-owner", "admin", owner=True)

    revision.copy_to_owner(db_session.connection())

    assert {r.user_id for r in db_session.query(models.UserRating)} == {flagged.id}


@pytest.mark.parametrize("status", ["disabled", "pending"])
def test_an_inactive_account_never_owns_the_data(db_session, rated, revision, status):
    """
    The flag is unset and an otherwise eligible account sorts FIRST, but it is
    not active - which is what makes this refusal bite. The data must land on
    the active account after it.
    """
    inactive = _account(db_session, "aaa-user", "user", status=status)
    owner = _account(db_session, "cg1618", "super")

    revision.copy_to_owner(db_session.connection())

    held = {r.user_id for r in db_session.query(models.UserRating)}
    assert held == {owner.id}
    assert inactive.id not in held


def test_the_same_account_active_does_own_the_data(db_session, rated, revision):
    """The mirror: the same two accounts, both active. The first by username
    wins, so the refusal above was the status and nothing incidental."""
    first = _account(db_session, "aaa-user", "user")
    _account(db_session, "cg1618", "super")

    revision.copy_to_owner(db_session.connection())

    assert {r.user_id for r in db_session.query(models.UserRating)} == {first.id}


def test_a_disabled_flag_holder_still_owns_the_data(db_session, rated, revision):
    """The flag is an explicit designation of whose data it is, so it wins
    whatever the account's status: a disabled owner's collection is still
    theirs. An active, eligible account sorting first is what makes this
    bite."""
    _account(db_session, "aaa-user", "user")
    flagged = _account(db_session, "cg1618", "super", owner=True, status="disabled")

    revision.copy_to_owner(db_session.connection())

    assert {r.user_id for r in db_session.query(models.UserRating)} == {flagged.id}


def test_only_inactive_accounts_with_data_raises(db_session, rated, revision):
    """Nobody active to own it is the same as nobody: raise, never guess."""
    _account(db_session, "aaa-user", "user", status="disabled")
    _account(db_session, "cg1618", "super", status="pending")

    with pytest.raises(RuntimeError, match="no account can own them"):
        revision.copy_to_owner(db_session.connection())


def test_only_admin_and_guest_with_data_raises(db_session, rated, revision):
    """(c) Something to move and nobody to own it."""
    _account(db_session, "aaa-admin", "admin")
    _account(db_session, "aaa-guest", "guest")

    with pytest.raises(RuntimeError, match="no account can own them"):
        revision.copy_to_owner(db_session.connection())


def test_only_admin_and_guest_without_data_is_quiet(db_session, old_schema, revision):
    """The mirror of (c): nothing to move is not an error."""
    _account(db_session, "aaa-admin", "admin")

    revision.copy_to_owner(db_session.connection())

    assert db_session.query(models.UserRating).count() == 0


def test_an_existing_owner_unit_row_keeps_its_rating_and_gains_the_remark(
    db_session, rated, revision
):
    owner = _account(db_session, "cg1618", "super")
    db_session.add(
        models.UserNovelUnitRating(
            user_id=owner.id, unit_id=rated["unit"].system_id, my_rating="S"
        )
    )
    db_session.flush()

    revision.copy_to_owner(db_session.connection())
    db_session.expire_all()

    row = db_session.query(models.UserNovelUnitRating).one()
    assert (row.my_rating, row.remark) == ("S", "a remark")


def test_downgrade_restores_the_owners_values_and_drops_the_rest(
    db_session, rated, revision
):
    owner = _account(db_session, "cg1618", "super")
    other = _account(db_session, "kana", "user")
    conn = db_session.connection()
    revision.copy_to_owner(conn)
    # A second account's rating, made after the upgrade: the old shape has
    # no room for it.
    db_session.add(
        models.UserRating(
            user_id=other.id, franchise_id=rated["franchise"].system_id, my_rating="F"
        )
    )
    db_session.flush()
    conn.execute(text("UPDATE franchise SET my_rating = NULL, franchise_expectation = NULL"))
    conn.execute(text("UPDATE studio SET my_rating = NULL"))
    conn.execute(text("UPDATE novel_unit SET remark = NULL"))

    revision.copy_back_to_columns(conn)

    franchise = conn.execute(
        text("SELECT my_rating, franchise_expectation FROM franchise WHERE system_id = :id"),
        {"id": rated["franchise"].system_id},
    ).one()
    assert tuple(franchise) == ("A", "High")
    assert conn.execute(
        text("SELECT my_rating FROM studio WHERE system_id = :id"),
        {"id": rated["studio"].system_id},
    ).scalar() == "B"
    assert conn.execute(
        text("SELECT remark FROM novel_unit WHERE system_id = :id"),
        {"id": rated["unit"].system_id},
    ).scalar() == "a remark"
    assert owner.id != other.id
