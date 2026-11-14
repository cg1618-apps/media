"""resolve_mode, in isolation.

The four branches of the resolution order, plus the two that matter most: a
mode above the ceiling resolves to NOTHING rather than to the account's
default, and a
logged-out visitor resolves to `safe` and to nothing else, whatever the
database holds. Both are the fail-closed direction, and both would be
invisible in manual testing.
"""

import uuid

import pytest

from app import models
from app.services.rbac import cache
from app.services.rbac.modes import EMPTY_MODE, resolve_mode
from app.services.rbac.seed_modes import (
    MODE_NORMAL,
    MODE_SAFE,
    MODE_UNRESTRICTED,
    ensure_access_mode_seed,
)


@pytest.fixture
def label(db_session):
    row = models.ContentLabel(key="resolution-label", label="L")
    db_session.add(row)
    db_session.flush()
    ensure_access_mode_seed(db_session)
    cache.bump()
    return row


def _mode(db, key):
    return db.query(models.AccessMode).filter(models.AccessMode.key == key).one()


def _ceiling(db, user, key):
    user.mode_ceiling = key
    user.mode_default = key
    db.flush()


def test_a_granted_mode_resolves_to_its_sets(db_session, owner_user, label):
    mode = _mode(db_session, MODE_UNRESTRICTED)
    _ceiling(db_session, owner_user, MODE_UNRESTRICTED)

    resolved = resolve_mode(db_session, owner_user, mode.system_id)

    assert resolved.mode_key == MODE_UNRESTRICTED
    # Every label there is: this one and the system `h-comic` label.
    assert resolved.label_ids == frozenset(
        row.system_id for row in db_session.query(models.ContentLabel)
    )
    assert label.system_id in resolved.label_ids
    assert "sources_restricted" in resolved.field_groups


def test_denials_subtract(db_session, owner_user, label):
    mode = _mode(db_session, MODE_UNRESTRICTED)
    _ceiling(db_session, owner_user, MODE_UNRESTRICTED)
    db_session.add(
        models.UserAccessModeDenial(user_id=owner_user.id, label_id=label.system_id)
    )
    db_session.flush()
    cache.bump()

    resolved = resolve_mode(db_session, owner_user, mode.system_id)

    assert label.system_id not in resolved.label_ids
    assert resolved.label_ids == frozenset(
        row.system_id
        for row in db_session.query(models.ContentLabel)
        if row.system_id != label.system_id
    )
    assert "sources_restricted" in resolved.field_groups


def test_a_mode_above_the_ceiling_resolves_to_nothing(
    db_session, owner_user, label
):
    """NOT to the account's default or its ceiling: a session sitting in a
    mode the account can no longer use has no claim to anything."""
    _ceiling(db_session, owner_user, MODE_SAFE)

    for key in (MODE_NORMAL, MODE_UNRESTRICTED):
        above = _mode(db_session, key)
        assert resolve_mode(db_session, owner_user, above.system_id) == EMPTY_MODE


def test_a_mode_at_the_ceiling_resolves(db_session, owner_user, label):
    """The mirror, on the same account."""
    _ceiling(db_session, owner_user, MODE_SAFE)

    resolved = resolve_mode(
        db_session, owner_user, _mode(db_session, MODE_SAFE).system_id
    )

    assert resolved.mode_key == MODE_SAFE


def test_an_account_with_no_mode_resolves_to_nothing(db_session, owner_user, label):
    owner_user.mode_ceiling = None
    owner_user.mode_default = None
    db_session.flush()

    assert (
        resolve_mode(db_session, owner_user, _mode(db_session, MODE_SAFE).system_id)
        == EMPTY_MODE
    )


def test_a_mode_outside_the_order_resolves_to_nothing(db_session, owner_user, label):
    """A hand-made mode has no rank, so no ceiling reaches it."""
    custom = models.AccessMode(key="custom-resolution", label="Custom")
    db_session.add(custom)
    db_session.flush()
    _ceiling(db_session, owner_user, MODE_UNRESTRICTED)

    assert resolve_mode(db_session, owner_user, custom.system_id) == EMPTY_MODE


def test_an_unknown_mode_id_resolves_to_nothing(db_session, owner_user, label):
    assert resolve_mode(db_session, owner_user, uuid.uuid4()) == EMPTY_MODE


def test_a_logged_in_account_with_no_claim_resolves_to_nothing(
    db_session, owner_user, label
):
    """A signed-in caller does NOT fall through to the guest default: that
    would be a fallback that can widen, and the guest mode is not this
    account's policy."""
    _ceiling(db_session, owner_user, MODE_SAFE)
    assert resolve_mode(db_session, owner_user, None) == EMPTY_MODE


def test_no_user_resolves_to_safe(db_session, label):
    resolved = resolve_mode(db_session, None, None)
    assert resolved.mode_key == MODE_SAFE
    assert "sources_restricted" not in resolved.field_groups


def test_the_anonymous_policy_is_not_stored_anywhere(db_session, label):
    """`safe` is looked up by key, so there is no row an edit could move.

    The flag this replaced was ordinary data: a Pull All, a migration or a
    hand-edit could point it at `unrestricted`, and that failure publishes
    every labelled entry to the internet while looking like a successful
    restore. Nothing on the table decides this any more.
    """
    assert not hasattr(models.AccessMode, "is_guest_default")

    # The mirror, so a green above is not just the attribute being renamed:
    # widening every OTHER mode changes nothing about what a guest reaches.
    for key in (MODE_UNRESTRICTED, MODE_NORMAL):
        _mode(db_session, key).sort_order = -1
    db_session.flush()
    cache.bump()

    assert resolve_mode(db_session, None, None).mode_key == MODE_SAFE


def test_a_missing_safe_mode_resolves_to_nothing(db_session, label):
    """Fail closed. A misconfiguration must hide everything, not publish it."""
    db_session.query(models.AccessMode).filter(
        models.AccessMode.key == MODE_SAFE
    ).delete(synchronize_session=False)
    db_session.flush()
    cache.bump()

    assert resolve_mode(db_session, None, None) == EMPTY_MODE
