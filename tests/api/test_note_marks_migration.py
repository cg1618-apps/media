"""
API integration tests for revision n1o2temarks3: every personal value on a
catalogue note row - a status column or a key of `fields`, per the
revision's frozen list - moves into the installation owner's note_mark row
and is cleared from `note`.

Runs the shipped revision's own data steps against the test session, as
test_highlights_personal_migration.py does. create_all has already built
note_mark, so only the data steps run.

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
REVISION = ROOT / "alembic" / "versions" / "n1o2temarks3_note_marks.py"


@pytest.fixture(scope="module")
def revision():
    spec = importlib.util.spec_from_file_location("_note_marks", REVISION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def clean(db_session):
    """No account eligible to own anything, and no notes: each test names the
    accounts the rule chooses between."""
    db_session.query(models.User).update({"is_installation_owner": False})
    db_session.execute(text("DELETE FROM note"))
    db_session.execute(
        text(
            "DELETE FROM users u USING role r WHERE r.system_id = u.role_id "
            "AND r.name NOT IN ('admin', 'guest')"
        )
    )
    db_session.flush()
    return db_session.connection()


def _role_id(db, name):
    """A seeded role's id; `shared` is not seeded in the test database, so it
    is made here under the name the owner rule excludes."""
    role = db.query(models.Role).filter(models.Role.name == name).first()
    if role is None:
        role = models.Role(system_id=uuid.uuid4(), name=name, label=name,
                           is_system=False, is_root=False)
        db.add(role)
        db.flush()
    return role_id_for(db, name)


def _account(db, username, role, owner=False, status="active"):
    user = models.User(
        id=uuid.uuid4(),
        username=username,
        hashed_password="!",
        role_id=_role_id(db, role),
        is_installation_owner=owner,
        status=status,
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def writer(db_session, clean):
    return _account(db_session, "zzz-writer", "admin")


@pytest.fixture
def rows(db_session, clean, writer):
    """One row per storage kind, a blank value beside them, and a catalogue
    status that is not personal (OP/ED 變動 has none, so a song type)."""
    game = models.Game(system_id=uuid.uuid4(), game_name_en="Mig Game")
    anime = models.Anime(system_id=uuid.uuid4(), anime_name_en="Mig Anime")
    db_session.add_all([game, anime])
    db_session.flush()

    def note(owner, section, **columns):
        n = models.Note(system_id=uuid.uuid4(), media_id=owner.system_id,
                        author_id=writer.id, section=section, **columns)
        db_session.add(n)
        return n

    made = {
        "item": note(game, "items", title="Flask", status="collected",
                     fields={"amount_total": "12", "ng_reset": "no"}),
        "enemy": note(game, "enemies", title="Malenia", status="beaten"),
        "ending": note(game, "endings", title="Ending", status="reached"),
        "stat": note(game, "stats_and_points", title="Vigor",
                     fields={"min_value": "10", "my_value": "40"}),
        "mod": note(game, "mods_and_tools", title="Co-op", kind="Mod", status="played"),
        "song": note(anime, "op", title="紅蓮華", kind="normal", status="Need"),
        "list": note(anime, "music_status", kind="op", status="Done"),
        "blank": note(game, "stats_and_points", title="Mind", fields={"my_value": " "}),
        "change": note(anime, "op_ed_changes", locator="ep 3", kind="變化OP"),
    }
    db_session.flush()
    return made


def _marks(db):
    db.expire_all()
    return {
        (m.user_id, m.note_id): m.values for m in db.query(models.NoteMark).all()
    }


def _note(db, note):
    return db.execute(
        text("SELECT status, kind, fields FROM note WHERE system_id = :id"),
        {"id": note.system_id},
    ).one()


def test_values_move_to_the_owner_per_storage_kind_never_to_a_guest(
    db_session, rows, revision
):
    """The flag is unset. A guest, a shared account and an inactive user all
    sort FIRST by username, so they would win if eligible."""
    guest = _account(db_session, "aaa-guest", "guest")
    shared = _account(db_session, "aab-shared", "shared")
    inactive = _account(db_session, "aac-user", "user", status="disabled")
    owner = _account(db_session, "cg1618", "super")

    revision.move_to_owner(db_session.connection())
    r = rows
    assert _marks(db_session) == {
        (owner.id, r["item"].system_id): {"collected": "collected"},
        (owner.id, r["enemy"].system_id): {"beaten": "beaten"},
        (owner.id, r["ending"].system_id): {"completion": "reached"},
        (owner.id, r["stat"].system_id): {"my_value": "40"},
        (owner.id, r["mod"].system_id): {"status": "played"},
        (owner.id, r["song"].system_id): {"status": "Need"},
        (owner.id, r["list"].system_id): {"status": "Done"},
    }
    for account in (guest, shared, inactive):
        assert account.id not in {u for u, _n in _marks(db_session)}

    # Cleared from note; catalogue values beside them are kept.
    for key in ("item", "enemy", "ending", "mod", "song", "list"):
        assert _note(db_session, r[key]).status is None, key
    assert _note(db_session, r["item"]).fields == {"amount_total": "12", "ng_reset": "no"}
    assert _note(db_session, r["stat"]).fields == {"min_value": "10"}
    assert _note(db_session, r["blank"]).fields is None
    assert _note(db_session, r["song"]).kind == "normal"
    assert _note(db_session, r["change"]).kind == "變化OP"


def test_the_same_account_active_does_own_the_data(db_session, rows, revision):
    """The mirror: active, the first eligible by username wins - so the
    refusal above was the role and the status."""
    first = _account(db_session, "aac-user", "user")
    _account(db_session, "cg1618", "super")

    revision.move_to_owner(db_session.connection())

    assert {u for u, _n in _marks(db_session)} == {first.id}


def test_the_flag_holder_wins(db_session, rows, revision):
    _account(db_session, "cg1618", "super")
    flagged = _account(db_session, "zzz-owner", "admin", owner=True)

    revision.move_to_owner(db_session.connection())

    assert {u for u, _n in _marks(db_session)} == {flagged.id}


def test_only_admin_and_guest_with_data_raises(db_session, rows, revision):
    _account(db_session, "aaa-guest", "guest")

    with pytest.raises(RuntimeError, match="no account can own them"):
        revision.move_to_owner(db_session.connection())


def test_only_admin_and_guest_without_data_is_quiet(db_session, clean, revision):
    """The mirror: nothing to move is not an error."""
    _account(db_session, "aaa-guest", "guest")

    revision.move_to_owner(db_session.connection())

    assert _marks(db_session) == {}


def test_downgrade_copies_the_owners_marks_back(db_session, rows, revision):
    owner = _account(db_session, "cg1618", "super")
    other = _account(db_session, "kana", "user")
    conn = db_session.connection()
    revision.move_to_owner(conn)
    # Another account's mark, made after the upgrade: the old shape has room
    # for one value per row, the owner's.
    db_session.add(models.NoteMark(user_id=other.id, note_id=rows["enemy"].system_id,
                                   values={"beaten": "skip"}))
    db_session.flush()

    revision.copy_back_to_note(conn)

    r = rows
    assert _note(db_session, r["item"]).status == "collected"
    assert _note(db_session, r["enemy"]).status == "beaten"
    assert _note(db_session, r["list"]).status == "Done"
    assert _note(db_session, r["stat"]).fields == {"min_value": "10", "my_value": "40"}
    assert owner.id != other.id
