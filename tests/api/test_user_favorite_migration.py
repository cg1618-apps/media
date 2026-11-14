"""
API integration tests for revision f1a2vourites3: the shared rows' favourite
flags become the installation owner's user_favorite rows, and come back on
downgrade.

Runs the shipped revision's own data steps against the test session, as
test_user_rating_migration.py does. The schema here is create_all's, which
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
REVISION = ROOT / "alembic" / "versions" / "f1a2vourites3_user_favorite.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_user_favorite", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def old_schema(db_session, revision):
    """The pre-revision columns, and no account eligible to own anything:
    every account the database already holds is set aside, so each test
    names the accounts the rule chooses between. The fixture quotes and
    memes are authored by the admin, which stays."""
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
def favoured(db_session, old_schema, admin_user):
    """A favourite quote, a plain quote and a favourite meme - on the old
    columns, which the ORM no longer maps."""
    fav_q = models.Quote(system_id=uuid.uuid4(), author_id=admin_user.id, text="fav")
    plain_q = models.Quote(system_id=uuid.uuid4(), author_id=admin_user.id, text="plain")
    fav_m = models.Meme(system_id=uuid.uuid4(), author_id=admin_user.id, text="gag",
                        collection_id=None)
    collection = models.Collection(system_id=uuid.uuid4(), collection_name_en="Gags")
    db_session.add_all([fav_q, plain_q, collection])
    db_session.flush()
    fav_m.collection_id = collection.system_id
    db_session.add(fav_m)
    db_session.flush()
    conn = old_schema
    conn.execute(
        text("UPDATE quote SET is_favorite = (system_id = :id)"), {"id": fav_q.system_id}
    )
    conn.execute(
        text("UPDATE meme SET is_favorite = true WHERE system_id = :id"),
        {"id": fav_m.system_id},
    )
    return {"quote": fav_q, "plain": plain_q, "meme": fav_m}


def _favourites(db):
    return {
        (f.user_id, f.quote_id or f.meme_id) for f in db.query(models.UserFavorite).all()
    }


def test_favourites_land_on_the_super_account_never_on_guest(
    db_session, favoured, revision
):
    """
    The flag is unset. The guest and admin accounts sort FIRST by username,
    so either would win if it were eligible - which is what makes this
    refusal bite. The favourites must land on cg1618, and only the two that
    were favourites.
    """
    guest = _account(db_session, "aaa-guest", "guest")
    admin = _account(db_session, "aaa-admin", "admin")
    owner = _account(db_session, "cg1618", "super")

    revision.copy_to_owner(db_session.connection())

    assert _favourites(db_session) == {
        (owner.id, favoured["quote"].system_id),
        (owner.id, favoured["meme"].system_id),
    }
    held = {user_id for user_id, _ in _favourites(db_session)}
    assert guest.id not in held and admin.id not in held


def test_the_flag_holder_wins(db_session, favoured, revision):
    """The flag beats the username order and a role it would otherwise
    exclude: here it sits on an admin account."""
    _account(db_session, "aaa-user", "user")
    flagged = _account(db_session, "zzz-owner", "admin", owner=True)

    revision.copy_to_owner(db_session.connection())

    assert {user_id for user_id, _ in _favourites(db_session)} == {flagged.id}


@pytest.mark.parametrize("status", ["disabled", "pending"])
def test_an_inactive_account_never_owns_the_favourites(
    db_session, favoured, revision, status
):
    """An otherwise eligible account sorts first but is not active."""
    inactive = _account(db_session, "aaa-user", "user", status=status)
    owner = _account(db_session, "cg1618", "super")

    revision.copy_to_owner(db_session.connection())

    held = {user_id for user_id, _ in _favourites(db_session)}
    assert held == {owner.id}
    assert inactive.id not in held


def test_the_same_account_active_does_own_them(db_session, favoured, revision):
    """The mirror: the first account by username, active, wins."""
    first = _account(db_session, "aaa-user", "user")
    _account(db_session, "cg1618", "super")

    revision.copy_to_owner(db_session.connection())

    assert {user_id for user_id, _ in _favourites(db_session)} == {first.id}


def test_only_admin_and_guest_with_favourites_raises(db_session, favoured, revision):
    _account(db_session, "aaa-admin", "admin")
    _account(db_session, "aaa-guest", "guest")

    with pytest.raises(RuntimeError, match="no account can own them"):
        revision.copy_to_owner(db_session.connection())


def test_only_admin_and_guest_without_favourites_is_quiet(
    db_session, old_schema, revision
):
    """The mirror: nothing to move is not an error."""
    _account(db_session, "aaa-admin", "admin")

    revision.copy_to_owner(db_session.connection())

    assert db_session.query(models.UserFavorite).count() == 0


def test_downgrade_restores_the_owners_favourites_and_drops_the_rest(
    db_session, favoured, revision
):
    owner = _account(db_session, "cg1618", "super")
    other = _account(db_session, "kana", "user")
    conn = db_session.connection()
    revision.copy_to_owner(conn)
    # A second account's favourite, made after the upgrade: the old shape
    # has no room for it.
    db_session.add(models.UserFavorite(user_id=other.id, quote_id=favoured["plain"].system_id))
    db_session.flush()
    conn.execute(text("UPDATE quote SET is_favorite = NULL"))
    conn.execute(text("UPDATE meme SET is_favorite = NULL"))

    revision.copy_back_to_columns(conn)

    flags = dict(conn.execute(text("SELECT system_id, is_favorite FROM quote")).all())
    assert flags[favoured["quote"].system_id] is True
    assert flags[favoured["plain"].system_id] is None
    meme_flag = conn.execute(
        text("SELECT is_favorite FROM meme WHERE system_id = :id"),
        {"id": favoured["meme"].system_id},
    ).scalar()
    assert meme_flag is True
    assert owner.id != other.id
