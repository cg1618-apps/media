"""
The five roles, and the two shared accounts.

The set of roles is fixed: these five exist, nothing creates or deletes one,
and an admin edits only their free grants (permissions.locked_permissions).

Called from the lifespan AND from migration A, because tests/api/conftest.py
resets the schema with Base.metadata.create_all and never runs Alembic - a seed
that lived only in a migration body would leave every API test role-less.
Idempotent for the same reason: the lifespan runs against a database that may
already hold these rows, and it must not duplicate or overwrite them.

Guest is granted every ordinary media type on purpose, so the authorization
system ships behaving exactly like its absence; an admin narrows it further
by REMOVING grants. The three gated types are not a free choice for any role
(permissions.locked_permissions), so _enforce_locks, not the top-up, decides
who holds them.

Field groups are NOT here any more. They left the role axis in Phase B for
the access-mode axis - see app/services/rbac/seed_modes.py, whose `safe` mode
is what a logged-out visitor now resolves to, and which is DERIVED from this
role's own field-group grants at migration time precisely so that nothing a
visitor sees changed on the day it landed.
"""

import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.models.system import USER_STATUS_ACTIVE
from app.services.domain.requests import default_request_limit
from app.services.rbac.modes import set_mode_ceiling
from app.services.rbac.permissions import (
    ADMIN_ROLE_NAME,
    ENTITY_VIEW_KEYS,
    ENTITY_VIEW_PERMISSIONS,
    GUEST_ROLE_NAME,
    PERM_MANAGE_CATALOG,
    PERM_MANAGE_PIPELINES,
    PERM_MANAGE_REQUESTS,
    PERM_SELF_LIST,
    PERM_SELF_PASSWORD,
    PERM_SELF_PERSONAL_NOTES,
    PERM_SELF_REQUESTS,
    PERM_VIEW_RANDOM_PICKER,
    PERM_VIEW_STATISTICS,
    SHARED_ROLE_NAME,
    SUPER_ROLE_NAME,
    USER_ROLE_NAME,
    VIEW_PERMISSION_KEYS,
    gated_type_permissions,
    locked_permissions,
    media_type_perm,
    view_perm,
)
from app.services.rbac.seed_modes import MODE_BORDERLINE, MODE_NORMAL
from app.services.security import UNUSABLE_PASSWORD_HASH
from app.utils.media_resolver import MEDIA_TYPE_KEYS

logger = logging.getLogger(__name__)

# These names are owned by permissions.py, which keys the lock table on them.
GUEST_ROLE = GUEST_ROLE_NAME
ADMIN_ROLE = ADMIN_ROLE_NAME
# A signed-in member. Not an administrator and not a second kind of admin:
# guest reads, the view.* reads a guest lacks, and the three self.* writes.
USER_ROLE = USER_ROLE_NAME
# Everything except the ability to change who may do what. Its grant set is
# finite and inspectable, like every role's, so a permission minted in code
# reaches it only when someone grants it.
SUPER_ROLE = SUPER_ROLE_NAME
# An account several people sign in to. Reads what a guest reads and files
# requests; each account is seeded at its own mode (SHARED_ACCOUNTS below).
SHARED_ROLE = SHARED_ROLE_NAME

# The shared accounts: the username and the mode it is created at, as both
# ceiling and default. Created on boot with an unusable password - the admin
# sets one on /users when handing the account out, and may change the mode
# there like any account's.
SHARED_ACCOUNTS: tuple[tuple[str, str], ...] = (
    ("shared-normal", MODE_NORMAL),
    ("shared-borderline", MODE_BORDERLINE),
)

def ordinary_media_type_permissions() -> set[str]:
    """media_type.<key> for every media type that is not gated."""
    return {media_type_perm(mt) for mt in MEDIA_TYPE_KEYS} - gated_type_permissions()


def default_guest_permissions() -> set[str]:
    """The nine ordinary media types. That is the whole of the guest role.

    The gated types are not here: they are locked off for guest
    (permissions.locked_permissions), so seeding them would only have
    _enforce_locks take them away again on the same boot.

    Field groups used to be here too. They left the role axis in Phase B -
    they scope which FIELDS of a reachable entry a session sees, which is the
    access mode's job (app/services/rbac/seed_modes.py, the `safe` mode). A
    union can only add, so a field group granted here could never be taken
    away by a mode, and the narrow tiers would have been unbuildable.
    """
    return ordinary_media_type_permissions()


def default_user_permissions() -> set[str]:
    """
    A signed-in member's grants: everything a guest may read, the gated
    types (locked on for a member; the access mode still decides whether
    their entries show), search, the Random Picker and personal content, and the four
    permissions over their own account - their list, their personal notes,
    their requests and their password.

    The four entity-page keys (view.studio, view.publisher, view.person,
    view.character) are NOT seeded: they start off for a role created now and
    are the admin's to switch on. An established database keeps what it held
    under the single view.entities key, which the migration carries onto all
    four.

    Derived from default_guest_permissions() rather than restated, so a media
    type added later reaches both roles at once.
    """
    return (
        default_guest_permissions()
        | gated_type_permissions()
        | {view_perm(key) for key in VIEW_PERMISSION_KEYS if key not in ENTITY_VIEW_KEYS}
        | {
            PERM_SELF_LIST,
            PERM_SELF_PERSONAL_NOTES,
            PERM_SELF_REQUESTS,
            PERM_SELF_PASSWORD,
        }
    )


def default_shared_permissions() -> set[str]:
    """
    A shared account's grants: what a guest reads, plus filing requests, the
    Random Picker and Statistics (all three locked on for this role).

    Derived from default_guest_permissions() so a media type added later
    reaches it too. No gated types, as for guest: they are locked off for
    this role. The four entity-page keys start off and stay adjustable.
    """
    return default_guest_permissions() | {
        PERM_SELF_REQUESTS,
        PERM_VIEW_RANDOM_PICKER,
        PERM_VIEW_STATISTICS,
    }


def default_super_permissions() -> set[str]:
    """
    A super account: everything a signed-in member has, the four entity-page
    keys (locked on for super, unlike for a member), and the management
    permissions; the admin's page keys (manage.announcements and the rest)
    reach it through the lock reconciliation, which locks them on. Derived from default_user_permissions() rather than
    restated, so a media type added later reaches this role too.

    admin.authz is deliberately absent. That is the whole distinction between
    this role and the admin account.
    """
    return default_user_permissions() | ENTITY_VIEW_PERMISSIONS | {
        PERM_MANAGE_CATALOG,
        PERM_MANAGE_PIPELINES,
        PERM_MANAGE_REQUESTS,
    }


def _ensure_role(db: Session, name: str, **fields) -> models.Role:
    role = db.query(models.Role).filter(models.Role.name == name).first()
    if role is None:
        role = models.Role(name=name, **fields)
        db.add(role)
        db.flush()
    return role


def ensure_rbac_seed(db: Session) -> None:
    """Create the five roles and top up their grants."""
    guest = _ensure_role(
        db,
        GUEST_ROLE,
        label="Guest",
        description="Anyone who is not logged in.",
        sort_order=0,
    )
    _ensure_role(
        db,
        ADMIN_ROLE,
        label="Admin",
        description=(
            "Runs the installation: accounts, roles, access modes, pipelines, "
            "the request inbox, announcements, options, images and resources. "
            "Reads and writes no catalogue, and keeps no list or notes."
        ),
        sort_order=100,
    )
    user = _ensure_role(
        db,
        USER_ROLE,
        label="User",
        description=(
            "A signed-in member. Reads the whole site, and writes their "
            "own list and their own personal notes."
        ),
        sort_order=50,
    )
    shared = _ensure_role(
        db,
        SHARED_ROLE,
        label="Shared",
        description=(
            "An account several people sign in to. Reads what a guest reads "
            "and files requests; its mode and its role are fixed, and only "
            "the admin sets its password."
        ),
        sort_order=25,
    )
    super_role = _ensure_role(
        db,
        SUPER_ROLE,
        label="Super",
        description=(
            "Manages the catalogue and runs the pipelines. Cannot itself "
            "change roles, accounts or content labels - but running a "
            "pipeline (Pull All) can rewrite all three from the sheet, "
            "since it restores the Users and Content Label tabs and role "
            "assignments along with everything else."
        ),
        sort_order=75,
    )

    # Only add what is missing. An admin who deliberately removed a grant
    # must not have it handed back on the next restart, so each role is
    # topped up only while it holds nothing at all.
    _top_up(db, guest, default_guest_permissions())
    _top_up(db, user, default_user_permissions())
    _top_up(db, super_role, default_super_permissions())
    _top_up(db, shared, default_shared_permissions())

    db.flush()
    _enforce_locks(db)


def _top_up(db: Session, role: models.Role, permissions: set[str]) -> None:
    """Grant `permissions` to a role holding nothing at all, and leave a role
    holding anything alone - a grant an admin removed is not handed back."""
    held = (
        db.query(models.RolePermission)
        .filter(models.RolePermission.role_id == role.system_id)
        .first()
    )
    if held is None:
        for permission in sorted(permissions):
            db.add(
                models.RolePermission(role_id=role.system_id, permission=permission)
            )


def ensure_shared_accounts(db: Session) -> None:
    """
    Create the shared accounts if missing, and re-assert their role.

    Runs on every boot after ensure_rbac_seed and the access-mode seed, so the
    role and the modes it names exist. A new account gets an unusable
    password (nothing verifies against UNUSABLE_PASSWORD_HASH), its role's
    request limit and status `active`; the admin sets the password on /users.

    On every run, whatever a Pull or a hand edit left, the role is `shared`.
    The mode is the admin's, like the password, status and request limit, and
    is left alone - except on an account with no mode at all, which would see
    nothing, and is put back at its seeded mode.
    """
    role = db.query(models.Role).filter(models.Role.name == SHARED_ROLE).one()
    for username, mode in SHARED_ACCOUNTS:
        user = (
            db.query(models.User)
            .filter(func.lower(models.User.username) == username.lower())
            .first()
        )
        if user is None:
            user = models.User(
                username=username,
                hashed_password=UNUSABLE_PASSWORD_HASH,
                role_id=role.system_id,
                status=USER_STATUS_ACTIVE,
                open_request_limit=default_request_limit(SHARED_ROLE),
            )
            db.add(user)
            db.flush()
            # Explicitly: a new users row defaults to normal / normal, which
            # is not every shared account's mode.
            set_mode_ceiling(db, user, mode, mode)
        if user.role_id != role.system_id:
            user.role_id = role.system_id
        if user.mode_ceiling is None:
            set_mode_ceiling(db, user, mode, mode)
    db.flush()


def ensure_admin_accounts_modeless(db: Session) -> None:
    """
    Re-assert that every admin-role account has no mode.

    The admin reads no catalogue, so its ceiling and default are both NULL
    and it resolves the empty object set - no catalogue read even through a
    route that forgot a permission check. Runs on every boot, the way
    ensure_shared_accounts re-asserts the shared modes, so a Pull or a hand
    edit that gave the account a mode is undone on the next start.
    """
    role = db.query(models.Role).filter(models.Role.name == ADMIN_ROLE).first()
    if role is None:
        return
    for user in db.query(models.User).filter(models.User.role_id == role.system_id):
        if user.mode_ceiling is not None or user.mode_default is not None:
            set_mode_ceiling(db, user, None, None)
    db.flush()



def ensure_no_admin_installation_owner(db: Session) -> None:
    """
    Clear users.is_installation_owner from every admin-role account.

    No admin account may be the installation owner: the owner is whose
    collection a restore or a pipeline files rows under, and the admin keeps
    no personal data. /api/users never writes the flag and never gives an
    account the admin role, and Pull restores an admin row without it, so
    only a hand edit leaves one. Runs on every boot, beside
    ensure_admin_accounts_modeless, so that state does not outlive a start.
    """
    role = db.query(models.Role).filter(models.Role.name == ADMIN_ROLE).first()
    if role is None:
        return
    flagged = db.query(models.User).filter(
        models.User.role_id == role.system_id, models.User.is_installation_owner
    )
    for user in flagged:
        logger.warning(
            "Account %r holds the admin role and cannot be the installation "
            "owner; clearing its is_installation_owner flag.",
            user.username,
        )
        user.is_installation_owner = False
    db.flush()

def _enforce_locks(db: Session) -> None:
    """
    Make every stored grant set agree with permissions.locked_permissions().

    The top-up blocks above deliberately leave an established role alone, so
    that a grant an admin removed is not handed back. A LOCKED grant is the
    one thing that rule must not cover: `super` means "everything except
    changing authorization", and a super role sitting in the database without
    manage.catalog would have the role editor drawing a ticked, disabled box
    over a permission it does not actually hold. The same run drops a locked
    OFF grant - a guest role still holding manage.catalog from before this
    rule existed is exactly the row that must not survive a restart.

    The admin role is covered like any other: its row is wholly locked, so
    this tops it up to its fixed set and drops anything else.
    """
    roles = db.query(models.Role).all()
    for role in roles:
        locked_on, locked_off = locked_permissions(role.name)
        held = {
            row.permission
            for row in db.query(models.RolePermission).filter(
                models.RolePermission.role_id == role.system_id
            )
        }
        for permission in sorted(locked_on - held):
            db.add(
                models.RolePermission(role_id=role.system_id, permission=permission)
            )
        stale = sorted(locked_off & held)
        if stale:
            db.query(models.RolePermission).filter(
                models.RolePermission.role_id == role.system_id,
                models.RolePermission.permission.in_(stale),
            ).delete(synchronize_session=False)
    db.flush()
