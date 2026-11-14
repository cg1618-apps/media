"""
Which cells of the role grid are not an admin's to decide.

permissions.locked_permissions() is one table read by two halves: the role
editor draws a locked box disabled, and PUT /api/roles/{id}/permissions
refuses a payload that disagrees. Both halves are tested here, against the
same table, because a disabled checkbox the server would have accepted is a
lie, and a 409 the editor cannot provoke is dead code.

Every refusal below is paired with the mirror case that must still succeed - a
409 proves nothing on its own if the endpoint would have refused anything.
"""


from app import models
from app.services.rbac.permissions import (
    ADMIN_FIXED_PERMISSIONS,
    ADMIN_PAGE_PERMISSIONS,
    PERM_ADMIN_AUTHZ,
    PERM_MANAGE_CATALOG,
    PERM_MANAGE_PIPELINES,
    PERM_MANAGE_REQUESTS,
    PERM_SELF_LIST,
    PERM_SELF_PASSWORD,
    PERM_SELF_PERSONAL_NOTES,
    PERM_SELF_REQUESTS,
    gated_type_permissions,
    locked_permissions,
    media_type_perm,
    static_catalog,
)
from app.services.rbac.seed import (
    ADMIN_ROLE,
    GUEST_ROLE,
    SUPER_ROLE,
    USER_ROLE,
    ensure_rbac_seed,
)

ROLES = "/api/roles/"


def _role(admin_client, name):
    rows = admin_client.get(ROLES).json()
    return next(r for r in rows if r["name"] == name)


# ---------------------------------------------------------------------------
# The table itself
# ---------------------------------------------------------------------------

def test_no_role_may_be_granted_authz():
    """The permission to change who may do what belongs to the admin role
    alone, locked on there; handing it out through the very page it governs
    is how an installation loses control of itself."""
    for name in (GUEST_ROLE, USER_ROLE, SUPER_ROLE, "friend"):
        _, off = locked_permissions(name)
        assert PERM_ADMIN_AUTHZ in off, name


def test_super_holds_everything_except_authz_and_can_change_none_of_it():
    on, off = locked_permissions(SUPER_ROLE)
    assert on == static_catalog() - {PERM_ADMIN_AUTHZ}
    assert off == {PERM_ADMIN_AUTHZ}
    # Nothing at all is left for an admin to decide on this role.
    assert on | off == static_catalog()


def test_guest_can_only_view():
    """No management, and no "own" anything: every anonymous request resolves
    to this role, so a self.* grant would hand one shared list to the whole
    internet."""
    on, off = locked_permissions(GUEST_ROLE)
    assert on == set()
    assert off == {
        PERM_ADMIN_AUTHZ,
        PERM_MANAGE_CATALOG,
        PERM_MANAGE_PIPELINES,
        PERM_MANAGE_REQUESTS,
        PERM_SELF_LIST,
        PERM_SELF_PASSWORD,
        PERM_SELF_PERSONAL_NOTES,
        PERM_SELF_REQUESTS,
    } | ADMIN_PAGE_PERMISSIONS | gated_type_permissions()
    # The ordinary media types stay free - narrowing what a guest may read is
    # the point of the page. The gated types are locked off.
    assert media_type_perm("anime") not in off
    assert media_type_perm("hentai") in off


def test_neither_catalogue_nor_pipelines_is_a_choice_for_user():
    """Writing the catalogue is what makes an account `super`, and one Pull
    All overwrites every table."""
    on, off = locked_permissions(USER_ROLE)
    assert PERM_MANAGE_PIPELINES in off
    assert PERM_MANAGE_CATALOG in off
    # The mirror: these two are neither forced nor refused.
    for permission in (PERM_SELF_LIST, media_type_perm("anime")):
        assert permission not in on and permission not in off


def test_a_user_always_holds_its_own_password():
    """Changing your own password is fixed for a member, as the reset link
    is: a member who could not would have to ask the admin every time."""
    on, _off = locked_permissions(USER_ROLE)
    assert PERM_SELF_PASSWORD in on


def test_a_user_always_files_requests_and_never_handles_them():
    """Filing is fixed per role for `user`, and the inbox is not a member's."""
    on, off = locked_permissions(USER_ROLE)
    assert PERM_SELF_REQUESTS in on
    assert PERM_MANAGE_REQUESTS in off


def test_a_user_has_exactly_those_two_and_the_gated_types_locked_on():
    on, _off = locked_permissions(USER_ROLE)
    assert gated_type_permissions()
    assert on == {PERM_SELF_REQUESTS, PERM_SELF_PASSWORD} | gated_type_permissions()


def test_the_admin_row_is_wholly_fixed():
    """The admin runs the installation and reads and writes no catalogue:
    its fixed set is locked on, everything else locked off, and no cell is
    left free."""
    on, off = locked_permissions(ADMIN_ROLE)
    assert on == ADMIN_FIXED_PERMISSIONS
    assert on | off == static_catalog()
    assert not on & off
    for permission in (PERM_ADMIN_AUTHZ, PERM_MANAGE_PIPELINES, PERM_MANAGE_REQUESTS):
        assert permission in on, permission
    assert ADMIN_PAGE_PERMISSIONS <= on
    # What it never holds: the catalogue, any read, any own row.
    for permission in (
        PERM_MANAGE_CATALOG,
        media_type_perm("anime"),
        PERM_SELF_LIST,
        PERM_SELF_PERSONAL_NOTES,
        PERM_SELF_REQUESTS,
        PERM_SELF_PASSWORD,
    ):
        assert permission in off, permission


# ---------------------------------------------------------------------------
# Served to the editor
# ---------------------------------------------------------------------------

def test_the_role_list_serves_the_locks(admin_client):
    super_role = _role(admin_client, SUPER_ROLE)
    assert PERM_ADMIN_AUTHZ in super_role["locked_off"]
    assert PERM_MANAGE_CATALOG in super_role["locked_on"]

    user_role = _role(admin_client, USER_ROLE)
    assert sorted(user_role["locked_on"]) == sorted(
        {PERM_SELF_REQUESTS, PERM_SELF_PASSWORD} | gated_type_permissions()
    )
    assert PERM_MANAGE_CATALOG in user_role["locked_off"]


def test_the_admin_role_serves_its_whole_row_locked(admin_client):
    """The admin tab draws every cell disabled: its fixed set ticked, the
    rest clear - and the grants it stores are exactly the ticked ones."""
    admin_role = _role(admin_client, ADMIN_ROLE)
    assert set(admin_role["locked_on"]) == ADMIN_FIXED_PERMISSIONS
    assert set(admin_role["locked_on"]) | set(admin_role["locked_off"]) == static_catalog()
    assert PERM_MANAGE_CATALOG in admin_role["locked_off"]
    assert set(admin_role["permissions"]) == ADMIN_FIXED_PERMISSIONS


def test_saving_the_admin_role_with_any_change_is_refused(admin_client):
    """No free cell, so any change is a 409 - in either direction."""
    admin_id = _role(admin_client, ADMIN_ROLE)["system_id"]
    fixed = sorted(ADMIN_FIXED_PERMISSIONS)

    adding = admin_client.put(
        f"{ROLES}{admin_id}/permissions",
        json={"permissions": fixed + [PERM_MANAGE_CATALOG]},
    )
    assert adding.status_code == 409
    dropping = admin_client.put(
        f"{ROLES}{admin_id}/permissions",
        json={"permissions": [p for p in fixed if p != PERM_MANAGE_PIPELINES]},
    )
    assert dropping.status_code == 409

    # The mirror: saving the row unchanged is accepted, so the 409s above are
    # the locks and not the role being untouchable.
    same = admin_client.put(f"{ROLES}{admin_id}/permissions", json={"permissions": fixed})
    assert same.status_code == 200, same.text


# ---------------------------------------------------------------------------
# Enforced on the write path
# ---------------------------------------------------------------------------

def test_a_guest_may_not_be_granted_its_own_list(admin_client):
    guest_id = _role(admin_client, GUEST_ROLE)["system_id"]
    response = admin_client.put(
        f"{ROLES}{guest_id}/permissions",
        json={"permissions": [media_type_perm("anime"), PERM_SELF_LIST]},
    )
    assert response.status_code == 409

    # The mirror: the same save without the self grant is accepted, so the 409
    # above came from that permission and not from the role being untouchable.
    ok = admin_client.put(
        f"{ROLES}{guest_id}/permissions",
        json={"permissions": [media_type_perm("anime")]},
    )
    assert ok.status_code == 200
    assert ok.json()["permissions"] == [media_type_perm("anime")]


def test_a_user_role_never_holds_the_catalogue_or_the_pipelines(admin_client):
    user_id = _role(admin_client, USER_ROLE)["system_id"]
    must = [PERM_SELF_REQUESTS, PERM_SELF_PASSWORD, *sorted(gated_type_permissions())]

    for permission in (PERM_MANAGE_CATALOG, PERM_MANAGE_PIPELINES):
        refused = admin_client.put(
            f"{ROLES}{user_id}/permissions",
            json={"permissions": must + [permission]},
        )
        assert refused.status_code == 409, permission
        assert permission in refused.text

    # Mirror: the same save with a free permission instead goes through.
    allowed = admin_client.put(
        f"{ROLES}{user_id}/permissions",
        json={"permissions": must + [PERM_SELF_LIST]},
    )
    assert allowed.status_code == 200
    assert PERM_SELF_LIST in allowed.json()["permissions"]


def test_the_super_role_cannot_have_anything_taken_away(admin_client):
    super_id = _role(admin_client, SUPER_ROLE)["system_id"]
    full = sorted(static_catalog() - {PERM_ADMIN_AUTHZ})

    dropped = admin_client.put(
        f"{ROLES}{super_id}/permissions",
        json={"permissions": [p for p in full if p != PERM_MANAGE_CATALOG]},
    )
    assert dropped.status_code == 409
    assert PERM_MANAGE_CATALOG in dropped.text

    added = admin_client.put(
        f"{ROLES}{super_id}/permissions",
        json={"permissions": full + [PERM_ADMIN_AUTHZ]},
    )
    assert added.status_code == 409

    unchanged = admin_client.put(
        f"{ROLES}{super_id}/permissions", json={"permissions": full}
    )
    assert unchanged.status_code == 200
    assert unchanged.json()["permissions"] == full


# ---------------------------------------------------------------------------
# Enforced by the seed
# ---------------------------------------------------------------------------

def test_the_seed_restores_a_locked_grant_removed_by_hand(db_session):
    """The top-up rule leaves an established role alone so that a deliberate
    removal sticks. A LOCKED grant is the exception: `super` means everything
    but authorization, so a super role sitting in the database without
    manage.pipelines would have the editor drawing a ticked, disabled box over
    a permission it does not actually hold."""
    ensure_rbac_seed(db_session)
    db_session.flush()
    role = db_session.query(models.Role).filter(models.Role.name == SUPER_ROLE).one()
    db_session.query(models.RolePermission).filter(
        models.RolePermission.role_id == role.system_id,
        models.RolePermission.permission == PERM_MANAGE_PIPELINES,
    ).delete()
    db_session.flush()

    ensure_rbac_seed(db_session)
    db_session.flush()

    held = {
        row.permission
        for row in db_session.query(models.RolePermission).filter(
            models.RolePermission.role_id == role.system_id
        )
    }
    assert PERM_MANAGE_PIPELINES in held


def test_the_seed_drops_a_grant_a_role_may_no_longer_hold(db_session):
    """A guest role still carrying manage.catalog is exactly the row that must
    not survive a restart."""
    ensure_rbac_seed(db_session)
    db_session.flush()
    guest = db_session.query(models.Role).filter(models.Role.name == GUEST_ROLE).one()
    db_session.add(
        models.RolePermission(role_id=guest.system_id, permission=PERM_MANAGE_CATALOG)
    )
    db_session.flush()

    ensure_rbac_seed(db_session)
    db_session.flush()

    held = {
        row.permission
        for row in db_session.query(models.RolePermission).filter(
            models.RolePermission.role_id == guest.system_id
        )
    }
    assert PERM_MANAGE_CATALOG not in held
    # The mirror: the reads it is supposed to keep are still there.
    assert media_type_perm("anime") in held
