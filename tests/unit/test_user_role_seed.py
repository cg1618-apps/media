"""
The `user` role is five ideas, not a subsystem: everything a guest may read,
plus the view.* reads a guest lacks, plus write-your-own-list, plus
write-your-own-personal-notes, plus file-your-own-requests, plus
change-your-own-password. Catalogue writes
stay behind require_manage_catalog, so granting this role adds no admin
surface at all.
"""

from app.services.rbac.permissions import (
    ENTITY_VIEW_KEYS,
    PERM_ADMIN_AUTHZ,
    PERM_MANAGE_CATALOG,
    PERM_MANAGE_PIPELINES,
    PERM_MANAGE_REQUESTS,
    PERM_SELF_LIST,
    PERM_SELF_PASSWORD,
    PERM_SELF_PERSONAL_NOTES,
    PERM_SELF_REQUESTS,
    VIEW_PERMISSION_KEYS,
    gated_type_permissions,
    view_perm,
)
from app.services.rbac.seed import (
    ADMIN_ROLE,
    GUEST_ROLE,
    USER_ROLE,
    default_guest_permissions,
    default_user_permissions,
)


def test_the_role_is_named_user():
    assert USER_ROLE == "user"
    assert {GUEST_ROLE, ADMIN_ROLE, USER_ROLE} == {"guest", "admin", "user"}


def test_it_holds_everything_guest_holds():
    assert default_guest_permissions() <= default_user_permissions()


def test_it_adds_the_gated_types_the_non_entity_view_keys_and_the_self_permissions():
    """The four entity-page keys are not seeded: they start off for a member
    and are the admin's to switch on. The gated types are locked on."""
    extra = default_user_permissions() - default_guest_permissions()
    assert gated_type_permissions()
    assert extra == gated_type_permissions() | {
        view_perm(key) for key in VIEW_PERMISSION_KEYS if key not in ENTITY_VIEW_KEYS
    } | {
        PERM_SELF_LIST,
        PERM_SELF_PERSONAL_NOTES,
        PERM_SELF_REQUESTS,
        PERM_SELF_PASSWORD,
    }


def test_it_is_not_an_admin():
    assert PERM_ADMIN_AUTHZ not in default_user_permissions()
    assert PERM_MANAGE_CATALOG not in default_user_permissions()
    assert PERM_MANAGE_PIPELINES not in default_user_permissions()
    assert PERM_MANAGE_REQUESTS not in default_user_permissions()
