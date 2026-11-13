"""
The Users tab.

Accounts have to travel or a machine switch strands every user's list: the
list rows point at users.id with a real FK, so a user_media_list restore into
a database that has never heard of that user fails on the foreign key and
rolls the whole tab back.

Two columns deliberately do NOT travel:
  * hashed_password - credential material for other people's accounts, and the
    sheet leaves this database's trust boundary on every Backup.
  * role_id - role.system_id is minted per database by ensure_rbac_seed, so
    the sheet's value is a dangling reference on the other machine. The role
    NAME travels in its place, the way Media Source carries an option's
    (category, value) instead of its option_id.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import pytest

from app import models
from app.services.pipelines.tabs import TAB_BY_NAME, TAB_NAMES
from app.utils.formatter import format_model_for_sheet


@pytest.fixture
def db(db_session):
    return db_session


def test_the_users_tab_is_registered_first():
    assert "Users" in TAB_NAMES
    # Nothing points at users, and Steps 3 and 5 add user_id to plan_next,
    # seasonal, note, meme and quote. First now means nothing moves later.
    assert TAB_NAMES.index("Users") == 0


def test_the_tab_drops_the_password_and_the_local_role_id():
    tab = TAB_BY_NAME["Users"]
    assert "hashed_password" in tab.drop_columns
    assert "role_id" in tab.drop_columns


def test_the_tab_carries_the_role_name_instead():
    tab = TAB_BY_NAME["Users"]
    assert [name for name, _fn in tab.extra_columns] == ["role"]


def test_the_backup_row_holds_the_username_and_role(db):
    tab = TAB_BY_NAME["Users"]
    role = db.query(models.Role).filter(models.Role.name == "admin").one()
    user = models.User(
        username="kana",
        hashed_password="$2b$12$notarealhashatallnotarealhashatallnotarealha",
        role_id=role.system_id,
    )
    db.add(user)
    db.flush()

    kept = [
        c.name
        for c in models.User.__table__.columns
        if c.name not in tab.drop_columns
    ]
    headers = kept + [name for name, _fn in tab.extra_columns]
    values = format_model_for_sheet(user, columns=kept) + [
        fn(user, db) for _name, fn in tab.extra_columns
    ]
    row = dict(zip(headers, values))

    assert "hashed_password" not in row
    assert "role_id" not in row
    assert row["username"] == "kana"
    assert row["role"] == "admin"
    # Everything per user is private: there is no visibility flag to carry.
    assert "list_is_public" not in row
    assert row["id"] == str(user.id)


import uuid  # noqa: E402

from app.services.pipelines import pull  # noqa: E402
from app.services.security import (  # noqa: E402
    UNUSABLE_PASSWORD_HASH,
    get_password_hash,
)

# list_is_public is a retired header: a sheet written before the column was
# dropped still carries it, and the Pull must accept it silently.
USER_HEADERS = ["id", "username", "list_is_public", "role"]


@pytest.fixture
def sheets(monkeypatch):
    """Feed execute_pull_specific fake tabs, keyed by tab name."""

    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


def test_a_new_user_arrives_with_an_unusable_password(db, sheets):
    sheets({"Users": [USER_HEADERS, [str(uuid.uuid4()), "kana", "TRUE", "user"]]})

    result = pull.execute_pull_specific(
        db, "Users", log_action=False, may_restore_authz=True
    )

    assert result["status"] == "success"
    kana = db.query(models.User).filter_by(username="kana").one()
    assert kana.hashed_password == UNUSABLE_PASSWORD_HASH
    assert kana.role_ref.name == "user"


def test_a_foreign_uuid_updates_the_local_account_by_username(db, sheets):
    """
    app/main.py mints the admin account on every machine, so the same person
    holds a different uuid here and there. Honouring the sheet's uuid would
    INSERT a second 'cg1618' and collide with users.username's UNIQUE index,
    rolling the whole tab back.
    """
    role = db.query(models.Role).filter(models.Role.name == "admin").one()
    local = models.User(
        username="cg1618",
        hashed_password=get_password_hash("real-password"),
        role_id=role.system_id,
    )
    db.add(local)
    db.flush()
    local_id = local.id

    sheets({"Users": [USER_HEADERS, [str(uuid.uuid4()), "cg1618", "TRUE", "admin"]]})

    result = pull.execute_pull_specific(
        db, "Users", log_action=False, may_restore_authz=True
    )

    assert result["status"] == "success"
    rows = db.query(models.User).filter_by(username="cg1618").all()
    assert len(rows) == 1
    assert rows[0].id == local_id


def test_a_pull_never_overwrites_an_existing_password(db, sheets):
    """The admin must still be able to log into their own machine after a
    Pull All. An UPDATE touching hashed_password would lock them out."""
    role = db.query(models.Role).filter(models.Role.name == "admin").one()
    kept = get_password_hash("real-password")
    db.add(
        models.User(
            username="cg1618",
            hashed_password=kept,
            role_id=role.system_id,
        )
    )
    db.flush()

    sheets({"Users": [USER_HEADERS, [str(uuid.uuid4()), "cg1618", "TRUE", "admin"]]})
    pull.execute_pull_specific(
        db, "Users", log_action=False, may_restore_authz=True
    )

    stored = db.query(models.User).filter_by(username="cg1618").one()
    assert stored.hashed_password == kept


def test_an_unknown_role_name_skips_the_row(db, sheets):
    """role_id is NOT NULL with ondelete=RESTRICT: inserting without one fails
    the whole tab, so one bad row must not cost every other account."""
    sheets({"Users": [USER_HEADERS, [str(uuid.uuid4()), "ghost", "FALSE", "wizard"]]})

    result = pull.execute_pull_specific(
        db, "Users", log_action=False, may_restore_authz=True
    )

    assert result["status"] == "success"
    assert db.query(models.User).filter_by(username="ghost").first() is None
    assert any("wizard" in ref for ref in result["unresolved_refs"])


# ---------------------------------------------------------------------------
# Account status travels; the session counter does not
# ---------------------------------------------------------------------------


def _backup_row(db, user):
    tab = TAB_BY_NAME["Users"]
    kept = [
        c.name for c in models.User.__table__.columns if c.name not in tab.drop_columns
    ]
    headers = kept + [name for name, _fn in tab.extra_columns]
    values = format_model_for_sheet(user, columns=kept) + [
        fn(user, db) for _name, fn in tab.extra_columns
    ]
    return dict(zip(headers, values))


def test_the_backup_row_carries_status_and_not_the_session_version(db):
    """session_version is this machine's revocation counter. Carried to the
    other machine it would either sign people out there for nothing or, worse,
    roll a counter back and revive a token revoked here."""
    role = db.query(models.Role).filter(models.Role.name == "user").one()
    user = models.User(
        username="kana",
        hashed_password=get_password_hash("x"),
        role_id=role.system_id,
        status="disabled",
        session_version=3,
    )
    db.add(user)
    db.flush()

    row = _backup_row(db, user)
    assert row["status"] == "disabled"
    assert "session_version" not in row


STATUS_HEADERS = ["id", "username", "list_is_public", "role", "status"]


def test_a_pull_carries_disabled_to_the_other_machine(db, sheets):
    role = db.query(models.Role).filter(models.Role.name == "user").one()
    db.add(
        models.User(
            username="kana",
            hashed_password=get_password_hash("x"),
            role_id=role.system_id,
            session_version=2,
        )
    )
    db.flush()
    sheets(
        {
            "Users": [
                STATUS_HEADERS + ["session_version"],
                [str(uuid.uuid4()), "kana", "FALSE", "user", "disabled", "0"],
                [str(uuid.uuid4()), "mio", "FALSE", "user", "disabled", "9"],
            ]
        }
    )
    pull.execute_pull_specific(db, "Users", log_action=False, may_restore_authz=True)

    kana = db.query(models.User).filter_by(username="kana").one()
    assert kana.status == "disabled"
    # The local counter is kept even when a sheet carries the column.
    assert kana.session_version == 2
    mio = db.query(models.User).filter_by(username="mio").one()
    assert mio.status == "disabled"
    assert mio.session_version == 0


def test_a_sheet_without_status_leaves_the_local_status_alone(db, sheets):
    """A sheet written before the column existed must not re-activate a
    disabled account on Pull."""
    role = db.query(models.Role).filter(models.Role.name == "user").one()
    db.add(
        models.User(
            username="kana",
            hashed_password=get_password_hash("x"),
            role_id=role.system_id,
            status="disabled",
        )
    )
    db.flush()
    sheets(
        {
            "Users": [
                USER_HEADERS,
                [str(uuid.uuid4()), "kana", "FALSE", "user"],
                [str(uuid.uuid4()), "mio", "FALSE", "user"],
            ]
        }
    )
    pull.execute_pull_specific(db, "Users", log_action=False, may_restore_authz=True)

    assert db.query(models.User).filter_by(username="kana").one().status == "disabled"
    # A new account from such a sheet starts active, the column default.
    assert db.query(models.User).filter_by(username="mio").one().status == "active"


def test_a_pending_status_in_the_sheet_is_not_restored(db, sheets):
    """Only active and disabled travel. A pending account belongs to the
    approval flow on the machine it registered on."""
    sheets(
        {
            "Users": [
                STATUS_HEADERS,
                [str(uuid.uuid4()), "kana", "FALSE", "user", "pending"],
            ]
        }
    )
    pull.execute_pull_specific(db, "Users", log_action=False, may_restore_authz=True)
    assert db.query(models.User).filter_by(username="kana").one().status == "active"


# ---------------------------------------------------------------------------
# The open-request limit travels
# ---------------------------------------------------------------------------


def test_the_open_request_limit_travels(db, sheets):
    """An account setting like is_installation_owner: named in the projection, or a
    Pull silently lifts every member's limit."""
    sheets(
        {
            "Users": [
                USER_HEADERS + ["open_request_limit"],
                [str(uuid.uuid4()), "capped", "FALSE", "user", "7"],
                [str(uuid.uuid4()), "uncapped", "FALSE", "user", ""],
            ]
        }
    )

    pull.execute_pull_specific(db, "Users", log_action=False, may_restore_authz=True)

    assert db.query(models.User).filter_by(username="capped").one().open_request_limit == 7
    assert (
        db.query(models.User).filter_by(username="uncapped").one().open_request_limit
        is None
    )


def test_a_sheet_without_the_limit_leaves_a_local_one_alone(db, sheets):
    """A sheet backed up before the column existed has no header for it."""
    local = models.User(
        id=uuid.uuid4(),
        username="kept",
        hashed_password=get_password_hash("pw"),
        role_id=db.query(models.Role).filter_by(name="user").one().system_id,
        open_request_limit=4,
    )
    db.add(local)
    db.flush()
    sheets({"Users": [USER_HEADERS, [str(local.id), "kept", "FALSE", "user"]]})

    pull.execute_pull_specific(db, "Users", log_action=False, may_restore_authz=True)

    db.refresh(local)
    assert local.open_request_limit == 4
