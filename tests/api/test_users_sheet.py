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


def test_the_backup_row_holds_the_username_role_and_visibility(db):
    tab = TAB_BY_NAME["Users"]
    role = db.query(models.Role).filter(models.Role.name == "admin").one()
    user = models.User(
        username="kana",
        hashed_password="$2b$12$notarealhashatallnotarealhashatallnotarealha",
        role_id=role.system_id,
        list_is_public=True,
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
    assert row["list_is_public"] == "TRUE"
    assert row["id"] == str(user.id)


import uuid  # noqa: E402

from app.services.pipelines import pull  # noqa: E402
from app.services.security import (  # noqa: E402
    UNUSABLE_PASSWORD_HASH,
    get_password_hash,
)

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
    assert kana.list_is_public is True
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
        list_is_public=False,
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
    assert rows[0].list_is_public is True


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
            list_is_public=False,
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


def test_the_open_request_limit_travels(db, sheets):
    """An account setting like list_is_public: named in the projection, or a
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


def test_the_mode_pair_travels(db, sheets):
    """Account settings, like the request limit: a Pull must not reset who
    may reach what. Keys, so they mean the same thing on both machines."""
    sheets(
        {
            "Users": [
                USER_HEADERS + ["mode_ceiling", "mode_default"],
                [str(uuid.uuid4()), "wide", "FALSE", "user", "borderline", "safe"],
                [str(uuid.uuid4()), "parked", "FALSE", "user", "", ""],
            ]
        }
    )

    pull.execute_pull_specific(db, "Users", log_action=False, may_restore_authz=True)

    wide = db.query(models.User).filter_by(username="wide").one()
    assert (wide.mode_ceiling, wide.mode_default) == ("borderline", "safe")
    parked = db.query(models.User).filter_by(username="parked").one()
    assert (parked.mode_ceiling, parked.mode_default) == (None, None)


def test_a_sheet_without_the_mode_pair_leaves_a_local_one_alone(db, sheets):
    """A sheet backed up before the columns existed has no header for them.
    An UPDATE from it must not reset the account to the column default."""
    local = models.User(
        id=uuid.uuid4(),
        username="kept",
        hashed_password=get_password_hash("pw"),
        role_id=db.query(models.Role).filter_by(name="user").one().system_id,
        mode_ceiling="unrestricted",
        mode_default="borderline",
    )
    db.add(local)
    db.flush()
    sheets({"Users": [USER_HEADERS, [str(local.id), "kept", "TRUE", "user"]]})

    pull.execute_pull_specific(db, "Users", log_action=False, may_restore_authz=True)

    db.refresh(local)
    assert local.list_is_public is True  # the row did update
    assert (local.mode_ceiling, local.mode_default) == ("unrestricted", "borderline")


def test_an_insert_from_a_sheet_without_the_mode_pair_gets_normal(db, sheets):
    sheets({"Users": [USER_HEADERS, [str(uuid.uuid4()), "fresh", "FALSE", "user"]]})

    pull.execute_pull_specific(db, "Users", log_action=False, may_restore_authz=True)

    fresh = db.query(models.User).filter_by(username="fresh").one()
    assert (fresh.mode_ceiling, fresh.mode_default) == ("normal", "normal")


def test_an_invalid_mode_pair_is_reported_and_the_rest_of_the_tab_lands(db, sheets):
    """ck_users_mode_* would raise at the tab's commit and roll back every
    account. One bad pair must cost only itself: the account keeps its local
    pair and the other row lands."""
    local = models.User(
        id=uuid.uuid4(),
        username="kept",
        hashed_password=get_password_hash("pw"),
        role_id=db.query(models.Role).filter_by(name="user").one().system_id,
        mode_ceiling="borderline",
        mode_default="normal",
    )
    db.add(local)
    db.flush()
    sheets(
        {
            "Users": [
                USER_HEADERS + ["mode_ceiling", "mode_default"],
                [str(local.id), "kept", "TRUE", "user", "safe", "unrestricted"],
                [str(uuid.uuid4()), "other", "FALSE", "user", "normal", "safe"],
            ]
        }
    )

    result = pull.execute_pull_specific(
        db, "Users", log_action=False, may_restore_authz=True
    )

    assert result["status"] == "success"
    db.refresh(local)
    assert local.list_is_public is True
    assert (local.mode_ceiling, local.mode_default) == ("borderline", "normal")
    assert any("mode pair" in ref for ref in result["unresolved_refs"])
    other = db.query(models.User).filter_by(username="other").one()
    assert (other.mode_ceiling, other.mode_default) == ("normal", "safe")


def test_the_backup_row_carries_the_mode_pair(db):
    tab = TAB_BY_NAME["Users"]
    role = db.query(models.Role).filter(models.Role.name == "user").one()
    user = models.User(
        username="ranked",
        hashed_password="x",
        role_id=role.system_id,
        mode_ceiling="borderline",
        mode_default="safe",
    )
    db.add(user)
    db.flush()

    kept = [
        c.name
        for c in models.User.__table__.columns
        if c.name not in tab.drop_columns
    ]
    row = dict(zip(kept, format_model_for_sheet(user, columns=kept)))

    assert row["mode_ceiling"] == "borderline"
    assert row["mode_default"] == "safe"
