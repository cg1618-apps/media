"""The two access-mode tables and the users' mode columns, checked at the
metadata level.

No database needed: these assertions are about the mapping. What a mode shows
is derived in code, so there is no table of a mode's labels or field groups.
"""

from app import models


def test_two_tables_are_mapped():
    assert models.AccessMode.__tablename__ == "access_mode"
    assert models.UserAccessModeDenial.__tablename__ == "user_access_mode_denial"


def test_no_table_stores_what_a_mode_shows():
    """A stored set is one an edit or a Pull could make disagree with the
    derivation; the tables are gone so nothing can."""
    assert not hasattr(models, "AccessModeLabel")
    assert not hasattr(models, "AccessModeFieldGroup")
    tables = {table.name for table in models.AccessMode.metadata.sorted_tables}
    assert "access_mode_label" not in tables
    assert "access_mode_field_group" not in tables
    # The mirror: the metadata is the real one, and holds the mode table.
    assert "access_mode" in tables


def test_an_account_holds_no_mode_rows():
    """The held set is gone: an account has a ceiling and a default."""
    assert not hasattr(models, "UserAccessMode")
    columns = models.User.__table__.columns
    assert columns["mode_ceiling"].nullable is True
    assert columns["mode_default"].nullable is True


def test_the_users_constraints_spell_mode_order():
    """The database cannot call mode_rank, so the constraint carries its own
    copy of the order. This is what keeps the two from drifting."""
    from app.models.system import MODE_ARRAY_SQL, MODE_KEYS_SQL
    from app.services.rbac.seed_modes import MODE_ORDER

    quoted = ", ".join(f"'{key}'" for key in MODE_ORDER)
    assert MODE_KEYS_SQL == f"({quoted})"
    assert MODE_ARRAY_SQL == f"ARRAY[{quoted}]::varchar[]"
    names = {
        c.name
        for c in models.User.__table__.constraints
        if c.__class__.__name__ == "CheckConstraint"
    }
    assert {
        "ck_users_mode_keys",
        "ck_users_mode_pair",
        "ck_users_mode_default_within_ceiling",
    } <= names


def test_the_table_stores_no_anonymous_policy():
    """Which mode a logged-out visitor gets is not on this table at all.

    It is the `safe` mode, by key (`services/rbac/modes.py::resolve_mode`).
    A column would be one a Pull All, a migration or a hand-edit could move
    to `unrestricted`, publishing every labelled entry to the internet while
    looking like an ordinary restore.
    """
    assert "is_guest_default" not in models.AccessMode.__table__.columns
    assert not any(
        ix.name == "ix_one_guest_default_access_mode"
        for ix in models.AccessMode.__table__.indexes
    )


def test_a_denial_names_exactly_one_thing():
    """label_id XOR field_group_key - the same shape note's four owner
    columns already use. A row naming both, or neither, is meaningless."""
    names = {
        c.name
        for c in models.UserAccessModeDenial.__table__.constraints
        if c.__class__.__name__ == "CheckConstraint"
    }
    assert "ck_denial_names_one_thing" in names


def test_a_denial_belongs_to_the_account_and_goes_with_it():
    column = models.UserAccessModeDenial.__table__.c.user_id
    fk = next(iter(column.foreign_keys))
    assert fk.column.table.name == "users"
    assert fk.ondelete == "CASCADE"
    assert "user_access_mode_id" not in models.UserAccessModeDenial.__table__.c


