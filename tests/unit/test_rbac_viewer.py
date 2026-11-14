"""
Viewer is the answer to "who is asking", resolved once per request.

has() is a set membership test for every role. No role holds a permission
it was not granted - the admin included - so a permission minted tomorrow
reaches nobody until somebody grants it.
"""

from app.services.rbac.permissions import ADMIN_FIXED_PERMISSIONS
from app.services.rbac.resolver import Viewer

GUEST = Viewer(
    username=None,
    role_id=None,
    role_name="guest",
    permissions=frozenset({"media_type.anime"}),
)

ADMIN = Viewer(
    username="admin",
    role_id=None,
    role_name="admin",
    permissions=ADMIN_FIXED_PERMISSIONS,
)


def test_a_granted_permission_is_held():
    assert GUEST.has("media_type.anime")


def test_an_ungranted_permission_is_not_held():
    assert not GUEST.has("media_type.manga")


def test_the_admin_holds_no_permission_nobody_granted():
    """The property root had and lost: a name outside its fixed set."""
    assert not ADMIN.has("anything.at.all")
    assert not ADMIN.has("manage.catalog")
    # The mirror: what it was granted, it holds.
    assert ADMIN.has("admin.authz")


def test_a_guest_is_anonymous():
    assert GUEST.username is None
    assert GUEST.role_name == "guest"
