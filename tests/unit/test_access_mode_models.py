"""The three access-mode tables, checked at the metadata level.

No database needed: these assertions are about the mapping. What a mode shows
is derived in code, so there is no table of a mode's labels or field groups.
"""

from app import models


def test_three_tables_are_mapped():
    assert models.AccessMode.__tablename__ == "access_mode"
    assert models.UserAccessMode.__tablename__ == "user_access_mode"
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


def test_only_one_held_mode_may_be_the_login_default():
    index = next(
        ix
        for ix in models.UserAccessMode.__table__.indexes
        if ix.name == "ix_one_default_mode_per_user"
    )
    assert index.unique is True
    assert index.dialect_options["postgresql"]["where"] is not None


def test_a_denial_names_exactly_one_thing():
    """label_id XOR field_group_key - the same shape note's four owner
    columns already use. A row naming both, or neither, is meaningless."""
    names = {
        c.name
        for c in models.UserAccessModeDenial.__table__.constraints
        if c.__class__.__name__ == "CheckConstraint"
    }
    assert "ck_denial_names_one_thing" in names


def test_revoking_a_mode_grant_cascades_its_denials_away():
    column = models.UserAccessModeDenial.__table__.c.user_access_mode_id
    assert next(iter(column.foreign_keys)).ondelete == "CASCADE"


def test_removing_a_mode_cascades_its_grants_away():
    column = models.UserAccessMode.__table__.c.mode_id
    assert next(iter(column.foreign_keys)).ondelete == "CASCADE"
