"""
The granted-feature helper, app/services/rbac/features.py.

Until the switches land it answers from a stub: a feature is held by an
account (a viewer with a user id) that holds self.personal_notes. Each
refusal below is asserted beside its mirror, the same viewer with the one
missing thing put back, so a green says which half did the refusing.
"""

import uuid

import pytest

from app.services.rbac.features import FEATURE_NAMES, has_feature
from app.services.rbac.permissions import PERM_SELF_PERSONAL_NOTES
from app.services.rbac.resolver import Viewer


def _viewer(user_id=None, permissions=(), is_root=False):
    return Viewer(
        username="someone",
        role_id=None,
        role_name="user",
        is_root=is_root,
        permissions=frozenset(permissions),
        user_id=user_id,
    )


def test_the_four_feature_names():
    assert FEATURE_NAMES == ("quotes_memes", "favourites", "music_status", "mod_status")


@pytest.mark.parametrize("name", FEATURE_NAMES)
def test_an_account_holding_personal_notes_has_every_feature(name):
    viewer = _viewer(uuid.uuid4(), {PERM_SELF_PERSONAL_NOTES})
    assert has_feature(None, viewer, name) is True


def test_an_account_without_personal_notes_has_none():
    without = _viewer(uuid.uuid4(), set())
    assert has_feature(None, without, "music_status") is False
    # The mirror: the same account with the permission.
    with_it = _viewer(without.user_id, {PERM_SELF_PERSONAL_NOTES})
    assert has_feature(None, with_it, "music_status") is True


def test_no_account_means_no_feature_even_with_the_permission():
    assert has_feature(None, _viewer(None, {PERM_SELF_PERSONAL_NOTES}), "mod_status") is False


def test_the_root_role_holds_no_feature():
    """Root never passes a self.* permission, so it keeps no personal data."""
    assert has_feature(None, _viewer(uuid.uuid4(), set(), is_root=True), "mod_status") is False


def test_an_unknown_feature_raises():
    with pytest.raises(ValueError, match="favorites"):
        has_feature(None, _viewer(uuid.uuid4(), {PERM_SELF_PERSONAL_NOTES}), "favorites")
