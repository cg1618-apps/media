"""
API integration tests for revision h1i2ghlights3: the six highlight sections'
rows become the installation owner's, every h_comic / h_game
highlight_group_order becomes the owner's user_highlight_group_order row, and
view.personal grants go.

Runs the shipped revision's own data steps against the test session, as
test_user_rating_migration.py does. The schema here is create_all's, which
has already lost the two columns, so each test puts them back first with the
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
REVISION = ROOT / "alembic" / "versions" / "h1i2ghlights3_personal_highlights.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_personal_highlights", REVISION)
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
    # Notes cascade with their author; clear them first so only this test's
    # rows are counted.
    db_session.execute(text("DELETE FROM note"))
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
def writer(db_session, old_schema):
    """Whoever wrote the highlights under the old code: an admin account,
    never eligible itself."""
    return _account(db_session, "zzz-writer", "admin")


@pytest.fixture
def highlighted(db_session, old_schema, writer, sample_anime, sample_franchise):
    """A highlight row, a catalogue row beside it, and a KR h-comic and an
    h-game holding a group order on the old columns."""
    h_comic = models.HComic(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        h_comic_name_cn="舊漫",
        region="KR",
    )
    h_game = models.HGame(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        h_game_name_cn="舊遊",
    )
    db_session.add_all([h_comic, h_game])
    db_session.flush()
    highlight = models.Note(
        system_id=uuid.uuid4(),
        media_id=sample_anime.system_id,
        section="highlights",
        content="第六話",
        author_id=writer.id,
    )
    catalogue = models.Note(
        system_id=uuid.uuid4(),
        media_id=sample_anime.system_id,
        section="public_reviews",
        content="大眾說好看",
        author_id=writer.id,
    )
    db_session.add_all([highlight, catalogue])
    db_session.flush()
    conn = old_schema
    conn.execute(
        text("UPDATE h_comic SET highlight_group_order = '[\"Bea\", \"Ana\"]' "
             "WHERE system_id = :id"),
        {"id": h_comic.system_id},
    )
    conn.execute(
        text("UPDATE h_game SET highlight_group_order = '[\"Cy\"]' WHERE system_id = :id"),
        {"id": h_game.system_id},
    )
    return {
        "h_comic": h_comic,
        "h_game": h_game,
        "highlight": highlight,
        "catalogue": catalogue,
    }


def _authors(db, note_id):
    return db.execute(
        text("SELECT author_id FROM note WHERE system_id = :id"), {"id": note_id}
    ).scalar()


def _orders(db):
    return {
        (row.user_id, row.media_id, tuple(row.group_order))
        for row in db.query(models.UserHighlightGroupOrder)
    }


def test_highlights_and_orders_move_to_the_owner_never_to_a_guest(
    db_session, highlighted, writer, revision
):
    """
    The flag is unset. A guest and a shared-looking admin sort FIRST by
    username, so they would win if either were eligible - which is what makes
    this refusal bite. Everything must land on cg1618.
    """
    guest = _account(db_session, "aaa-guest", "guest")
    owner = _account(db_session, "cg1618", "super")

    revision.move_to_owner(db_session.connection())
    db_session.expire_all()

    assert _authors(db_session, highlighted["highlight"].system_id) == owner.id
    # The catalogue row is not a highlight and keeps its author.
    assert _authors(db_session, highlighted["catalogue"].system_id) == writer.id
    assert _orders(db_session) == {
        (owner.id, highlighted["h_comic"].system_id, ("Bea", "Ana")),
        (owner.id, highlighted["h_game"].system_id, ("Cy",)),
    }
    assert guest.id not in {u for u, _m, _o in _orders(db_session)}


@pytest.mark.parametrize("status", ["disabled", "pending"])
def test_an_inactive_account_never_owns_the_data(
    db_session, highlighted, revision, status
):
    inactive = _account(db_session, "aaa-user", "user", status=status)
    owner = _account(db_session, "cg1618", "super")

    revision.move_to_owner(db_session.connection())
    db_session.expire_all()

    assert _authors(db_session, highlighted["highlight"].system_id) == owner.id
    assert inactive.id not in {u for u, _m, _o in _orders(db_session)}


def test_the_same_account_active_does_own_the_data(db_session, highlighted, revision):
    """The mirror: both active, the first by username wins - so the refusal
    above was the status."""
    first = _account(db_session, "aaa-user", "user")
    _account(db_session, "cg1618", "super")

    revision.move_to_owner(db_session.connection())
    db_session.expire_all()

    assert _authors(db_session, highlighted["highlight"].system_id) == first.id


def test_the_flag_holder_wins(db_session, highlighted, revision):
    """The flag beats the username order and a role it would otherwise
    exclude: here it sits on an admin account."""
    _account(db_session, "cg1618", "super")
    flagged = _account(db_session, "zzz-owner", "admin", owner=True)

    revision.move_to_owner(db_session.connection())
    db_session.expire_all()

    assert _authors(db_session, highlighted["highlight"].system_id) == flagged.id
    assert {u for u, _m, _o in _orders(db_session)} == {flagged.id}


def test_only_admin_and_guest_with_data_raises(db_session, highlighted, revision):
    _account(db_session, "aaa-guest", "guest")

    with pytest.raises(RuntimeError, match="no account can own them"):
        revision.move_to_owner(db_session.connection())


def test_only_admin_and_guest_without_data_is_quiet(db_session, old_schema, revision):
    """The mirror: nothing to move is not an error."""
    _account(db_session, "aaa-guest", "guest")

    revision.move_to_owner(db_session.connection())

    assert db_session.query(models.UserHighlightGroupOrder).count() == 0


def test_view_personal_grants_are_deleted(db_session, revision):
    """A grant on a role is put there first, beside one that must survive."""
    role = db_session.query(models.Role).filter(models.Role.name == "user").one()
    db_session.query(models.RolePermission).filter(
        models.RolePermission.permission == "view.personal"
    ).delete(synchronize_session=False)
    db_session.add(models.RolePermission(role_id=role.system_id, permission="view.personal"))
    db_session.flush()
    held_before = {
        r.permission
        for r in db_session.query(models.RolePermission).filter(
            models.RolePermission.role_id == role.system_id
        )
    }
    assert {"view.personal", "view.search"} <= held_before

    revision.drop_view_personal(db_session.connection())
    db_session.expire_all()

    held = {
        r.permission
        for r in db_session.query(models.RolePermission).filter(
            models.RolePermission.role_id == role.system_id
        )
    }
    assert "view.personal" not in held
    assert "view.search" in held


def test_downgrade_restores_the_owners_orders(db_session, highlighted, revision):
    owner = _account(db_session, "cg1618", "super")
    other = _account(db_session, "kana", "user")
    conn = db_session.connection()
    revision.move_to_owner(conn)
    # Another account's order, made after the upgrade: the old shape has no
    # room for it.
    db_session.add(
        models.UserHighlightGroupOrder(
            user_id=other.id,
            media_id=highlighted["h_game"].system_id,
            group_order=["Zed"],
        )
    )
    db_session.flush()
    conn.execute(text("UPDATE h_comic SET highlight_group_order = NULL"))
    conn.execute(text("UPDATE h_game SET highlight_group_order = NULL"))

    revision.copy_back_to_columns(conn)

    assert conn.execute(
        text("SELECT highlight_group_order FROM h_comic WHERE system_id = :id"),
        {"id": highlighted["h_comic"].system_id},
    ).scalar() == ["Bea", "Ana"]
    assert conn.execute(
        text("SELECT highlight_group_order FROM h_game WHERE system_id = :id"),
        {"id": highlighted["h_game"].system_id},
    ).scalar() == ["Cy"]
    assert owner.id != other.id
