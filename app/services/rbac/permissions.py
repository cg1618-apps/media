"""
The permission vocabulary.

Permissions are declared in code and only their grants are stored, following
the rule app/models/system.py::SystemOption already states: anything the
business logic compares against is a Python constant, so it cannot be renamed
out from under the logic. A permission names a column, a MEDIA_TABLES key or a
field group - all code - so a row with no code behind it would be inert.

Content labels and field groups are NOT here. They stopped being permissions
in Phase B of the authorization redesign: they scope which OBJECTS a session
reaches, which is the access-mode axis (app/services/rbac/modes.py), and they
had to leave this one because permission resolution is a union and a union can
only add - a role holding field_group.sources_restricted could never have it
taken away by a mode. label_perm() and field_group_perm() were deleted rather
than left unused, so that any call site still asking has(field_group.<key>)
is an ImportError instead.

A name is always `<family>.<key>`. The bare `admin` that used to be the
exception was removed in Phase A of the authorization redesign; it is now
three named permissions, `admin.authz` and the two `manage.*`.
"""

from typing import TYPE_CHECKING

from app.utils.media_resolver import MEDIA_TYPE_KEYS

if TYPE_CHECKING:  # pragma: no cover
    from sqlalchemy.orm import Session

FAMILY_ADMIN = "admin"
# What an account may DO, as opposed to which objects it may reach. These
# three permissions (admin.authz and the two manage.* below) replaced the old
# bare `admin` permission at the end of Phase A.
FAMILY_MANAGE = "manage"

FAMILY_MEDIA_TYPE = "media_type"
# What a viewer may write about their OWN rows. Every other family answers
# "may you see this"; this one answers "may you write your own". It is the
# whole of the `user` role beyond the guest reads, which is why it is two
# permissions rather than a subsystem.
FAMILY_SELF = "self"
# Which parts of the site beyond the libraries and their detail pages a viewer
# may READ. Held by `user` and `super`, not by `guest`, so a logged-out visitor
# sees the catalogue and nothing around it. Deliberately not locked off for
# guest: opening search or the entity pages to the public is an admin's choice.
FAMILY_VIEW = "view"

PERMISSION_FAMILIES: tuple[str, ...] = (
    FAMILY_ADMIN,
    FAMILY_MANAGE,
    FAMILY_MEDIA_TYPE,
    FAMILY_SELF,
    FAMILY_VIEW,
)

ADMIN_PERMISSION_KEYS: tuple[str, ...] = ("authz",)
MANAGE_PERMISSION_KEYS: tuple[str, ...] = (
    "catalog",
    "pipelines",
    "requests",
    "announcements",
    "options",
    "images",
    "resources",
)

ADMIN_PERMISSION_LABELS: dict[str, tuple[str, str]] = {
    "authz": (
        "Manage Authorization",
        "Create and edit roles and accounts, and the adjustable parts of the "
        "access modes - that is, change who may do what. Does not itself "
        "grant any catalogue write. Not the only way to change these, "
        "though: manage.pipelines can rewrite accounts and role assignments "
        "too, by running Pull All over the sheet.",
    ),
}

MANAGE_PERMISSION_LABELS: dict[str, tuple[str, str]] = {
    "catalog": (
        "Manage Catalogue",
        "Add, change and delete entries, groups, people, studios, publishers, "
        "characters, credits, options, relations, watch orders and catalogue "
        "notes.",
    ),
    "pipelines": (
        "Run Pipelines",
        "Backup, Pull, Fill, Replace and Calculate. Separate from the "
        "catalogue because a single Pull All overwrites every table.",
    ),
    "requests": (
        "Handle Requests",
        "The request inbox: read every member's requests and reports, mark "
        "them done or declined with a response, reopen them, and delete them.",
    ),
    "announcements": (
        "Manage Announcements",
        "Write, edit and remove the site announcements.",
    ),
    "options": (
        "Manage Options",
        "The Note pages: System Options, Alias Conversion and External APIs.",
    ),
    "images": (
        "Manage Images",
        "The image library: upload, crop, attach and remove images.",
    ),
    "resources": (
        "Manage Resources",
        "Read and edit the site-wide Resources page.",
    ),
}


def admin_perm(key: str) -> str:
    """Permission to change who may do what."""
    return f"{FAMILY_ADMIN}.{key}"


def manage_perm(key: str) -> str:
    """Permission to perform one class of catalogue-side operation."""
    return f"{FAMILY_MANAGE}.{key}"


PERM_ADMIN_AUTHZ = admin_perm("authz")
PERM_MANAGE_CATALOG = manage_perm("catalog")
PERM_MANAGE_PIPELINES = manage_perm("pipelines")
PERM_MANAGE_REQUESTS = manage_perm("requests")
# The admin's own pages beyond accounts and pipelines. Separate from
# manage.catalog so that holding them writes no catalogue row.
PERM_MANAGE_ANNOUNCEMENTS = manage_perm("announcements")
PERM_MANAGE_OPTIONS = manage_perm("options")
PERM_MANAGE_IMAGES = manage_perm("images")
PERM_MANAGE_RESOURCES = manage_perm("resources")
ADMIN_PAGE_PERMISSIONS: frozenset[str] = frozenset(
    {
        PERM_MANAGE_ANNOUNCEMENTS,
        PERM_MANAGE_OPTIONS,
        PERM_MANAGE_IMAGES,
        PERM_MANAGE_RESOURCES,
    }
)

# Declared here rather than derived from a table: like every other permission
# these name code (a router dependency), so a row with no code behind it would
# be inert.
SELF_PERMISSION_KEYS: tuple[str, ...] = (
    "list",
    "personal_notes",
    "requests",
    "password",
)

SELF_PERMISSION_LABELS: dict[str, tuple[str, str]] = {
    "list": (
        "Own List",
        "Add, change and remove entries on your own list. Does not grant any "
        "write access to the catalogue itself.",
    ),
    "personal_notes": (
        "Own Personal Notes",
        "Write your own personal-scope notes on an entry - highlights, todos, "
        "saves, NG+ goals - and your own highlight group order. Catalogue "
        "notes stay admin-only.",
    ),
    "requests": (
        "Own Requests",
        "File requests and reports - a missing entry, wrong or incomplete "
        "data, a bug - and read and edit your own while they are open.",
    ),
    "password": (
        "Own Password",
        "Change your own password from Settings, given the current one. An "
        "account without it asks the admin, who sets it on Users.",
    ),
}


# The four entity kinds are four keys rather than one, so an admin can open
# the people pages and keep the character pages closed, say. `person` covers
# the seiyuu library too - a seiyuu opens a person page - and `character`
# covers character identities, which are pages of a character.
ENTITY_VIEW_KEYS: tuple[str, ...] = ("studio", "publisher", "person", "character")

VIEW_PERMISSION_KEYS: tuple[str, ...] = ENTITY_VIEW_KEYS + (
    "search",
    "random_picker",
    "extras",
)

VIEW_PERMISSION_LABELS: dict[str, tuple[str, str]] = {
    "studio": (
        "View Studios",
        "Open the studio library and studio pages, and follow the links to "
        "them from an entry, franchise or series page. Without it studio "
        "names show as plain text.",
    ),
    "publisher": (
        "View Publishers",
        "Open the publisher library and publisher pages, and follow the links "
        "to them. Without it publisher names show as plain text.",
    ),
    "person": (
        "View People",
        "Open the person and seiyuu libraries and person pages, and follow "
        "the links to them - staff, authors and the voice cast. Without it "
        "their names show as plain text.",
    ),
    "character": (
        "View Characters",
        "Open the character library, character and character-identity pages, "
        "the Characters tab on franchise and series pages, and follow the "
        "links to them. Without it character names show as plain text.",
    ),
    "search": (
        "Search",
        "Use the site-wide search.",
    ),
    "random_picker": (
        "Random Picker",
        "Open the Random Picker and read its saved defaults. Fixed per role: "
        "super, user and shared hold it, a guest never does.",
    ),
    "extras": (
        "View Extras",
        "Future releases and completions. Quotes and memes are a per-account "
        "switch on Users instead.",
    ),
}


def media_type_perm(media_type: str) -> str:
    """Permission to see any entry of one media type. Keys are hyphenated."""
    return f"{FAMILY_MEDIA_TYPE}.{media_type}"


def self_perm(key: str) -> str:
    """Permission to write one kind of your own rows."""
    return f"{FAMILY_SELF}.{key}"


PERM_SELF_LIST = self_perm("list")
PERM_SELF_PERSONAL_NOTES = self_perm("personal_notes")
PERM_SELF_REQUESTS = self_perm("requests")
PERM_SELF_PASSWORD = self_perm("password")


def view_perm(key: str) -> str:
    """Permission to read one part of the site beyond the catalogue."""
    return f"{FAMILY_VIEW}.{key}"


PERM_VIEW_STUDIO = view_perm("studio")
PERM_VIEW_PUBLISHER = view_perm("publisher")
PERM_VIEW_PERSON = view_perm("person")
PERM_VIEW_CHARACTER = view_perm("character")
# The four entity-page keys together.
ENTITY_VIEW_PERMISSIONS: frozenset[str] = frozenset(
    view_perm(key) for key in ENTITY_VIEW_KEYS
)
PERM_VIEW_SEARCH = view_perm("search")
PERM_VIEW_RANDOM_PICKER = view_perm("random_picker")
PERM_VIEW_EXTRAS = view_perm("extras")


def split_perm(permission: str) -> tuple[str, str]:
    """
    ("media_type", "tv-show") for "media_type.tv-show"; (perm, "") for a bare
    name like admin. Splits once, so a hyphenated key keeps its hyphen.
    """
    family, sep, key = permission.partition(".")
    return (family, key) if sep else (permission, "")


def static_catalog() -> frozenset[str]:
    """Every permission knowable without a database."""
    return frozenset(
        {admin_perm(key) for key in ADMIN_PERMISSION_KEYS}
        | {manage_perm(key) for key in MANAGE_PERMISSION_KEYS}
        | {media_type_perm(media_type) for media_type in MEDIA_TYPE_KEYS}
        | {self_perm(key) for key in SELF_PERMISSION_KEYS}
        | {view_perm(key) for key in VIEW_PERMISSION_KEYS}
    )


def catalog(db: "Session") -> frozenset[str]:
    """
    The whole grantable vocabulary. Writes validate against it, so a grant
    naming nothing is rejected rather than silently stored.

    Takes a Session it no longer reads: the label family used to be joined in
    here from content_label, and since Phase B there is no database-dependent
    half. The parameter stays because is_valid() and roles.py both pass one,
    and changing their signatures is a separate edit from deleting a family.
    """
    return static_catalog()


def is_valid(db: "Session", permission: str) -> bool:
    return permission in catalog(db)


# ---------------------------------------------------------------------------
# Which grants a role may not change
# ---------------------------------------------------------------------------
#
# Some cells of the role grid are not an admin's to decide. `admin.authz` is
# the clearest: it is the permission to change who may do what, so handing it
# out through the very page it governs is how an installation loses control of
# itself. It is grantable to nothing: only the `admin` role holds it, locked
# on, and the admin role's whole row is fixed.
#
# The rest follow from what each system role IS, rather than from what it
# happens to have been seeded with. `super` means "everything except changing
# authorization", so every permission but admin.authz is locked on; `guest` is
# what an anonymous request resolves to, so the whole of admin.*, manage.* and
# self.* is locked off and that role can only view.
#
# Returned to the frontend per role (RoleResponse.locked_on / locked_off) and
# enforced on the write path from this same table, so the disabled checkbox
# and the 409 can never disagree.
#
# The role NAMES live here rather than in seed.py, which imports them back:
# a table keyed on a name must own that name, or a rename reaches the seed and
# silently unlocks the role.

ADMIN_ROLE_NAME = "admin"
SUPER_ROLE_NAME = "super"
GUEST_ROLE_NAME = "guest"
USER_ROLE_NAME = "user"
# The role of an account several people sign in to - the two shared accounts
# seed.py::ensure_shared_accounts keeps on every boot.
SHARED_ROLE_NAME = "shared"

# Every role there is. The set is fixed: there is no route that creates or
# deletes a role, and migration f1i2veroles45 removed every other name.
ROLE_NAMES: tuple[str, ...] = (
    ADMIN_ROLE_NAME,
    SUPER_ROLE_NAME,
    USER_ROLE_NAME,
    GUEST_ROLE_NAME,
    SHARED_ROLE_NAME,
)

# The roles an admin may give an account on /users. admin and guest are not
# held by choice (one installation account; the anonymous visitor), and a
# shared account's role is fixed by the seed.
ASSIGNABLE_ROLE_NAMES: frozenset[str] = frozenset({USER_ROLE_NAME, SUPER_ROLE_NAME})


def _self_family() -> frozenset[str]:
    return frozenset(self_perm(key) for key in SELF_PERMISSION_KEYS)


def gated_type_permissions() -> frozenset[str]:
    """
    media_type.<key> for every gated type (gated_types.REQUIRED_LABEL_FOR_TYPE).

    Imported lazily: gated_types reaches this module back through
    enforcement.py, so a top-level import would be a cycle.
    """
    from app.services.rbac.gated_types import gated_types

    return frozenset(media_type_perm(media_type) for media_type in gated_types())


# The admin role's whole row. It runs the installation - accounts, roles,
# access modes, pipelines, the request inbox and its own pages - and reads
# and writes no catalogue: manage.catalog, every media_type.*, every view.*
# and every self.* are locked off, so nothing on its row is a free choice.
ADMIN_FIXED_PERMISSIONS: frozenset[str] = frozenset(
    {PERM_ADMIN_AUTHZ, PERM_MANAGE_PIPELINES, PERM_MANAGE_REQUESTS}
    | ADMIN_PAGE_PERMISSIONS
)


def locked_permissions(role_name: str) -> tuple[frozenset[str], frozenset[str]]:
    """
    (locked_on, locked_off) for one role: what it must hold and what it may
    never hold. Disjoint by construction - a permission in neither set is the
    admin's free choice.

    The admin role's two sets cover the whole vocabulary: it holds exactly
    ADMIN_FIXED_PERMISSIONS and nothing else, so no cell on its row is free.
    """
    every = static_catalog()
    own = _self_family()
    # The gated types are not a free choice for any role. A member holds them
    # and a guest or shared account never does; what a member actually SEES
    # of them is still the access mode's decision, through each type's
    # required label, so holding the permission shows nothing outside
    # `unrestricted`. The nine ordinary types stay free for all three.
    gated = gated_type_permissions()

    if role_name == ADMIN_ROLE_NAME:
        return ADMIN_FIXED_PERMISSIONS, frozenset(every - ADMIN_FIXED_PERMISSIONS)
    if role_name == GUEST_ROLE_NAME:
        # Every anonymous request resolves to this role, so anything beyond a
        # read would be handed to every visitor on the internet.
        return frozenset(), frozenset(
            {admin_perm(key) for key in ADMIN_PERMISSION_KEYS}
            | {manage_perm(key) for key in MANAGE_PERMISSION_KEYS}
            | own
            | gated
            | {PERM_VIEW_RANDOM_PICKER}
        )
    if role_name == SUPER_ROLE_NAME:
        return frozenset(every - {PERM_ADMIN_AUTHZ}), frozenset({PERM_ADMIN_AUTHZ})
    # Running a pipeline is never a free choice below super, because one Pull
    # All overwrites every table including the accounts and role assignments.
    refused = {PERM_ADMIN_AUTHZ, PERM_MANAGE_PIPELINES}
    if role_name == USER_ROLE_NAME:
        # Filing requests and changing your own password are fixed for a
        # member: without the second every change goes through the admin.
        # Handling requests is not a member's: the inbox reads every
        # account's requests. Writing the catalogue is what makes an account
        # `super`, so a member never holds it.
        # The admin's own pages are not a member's either.
        return frozenset(
            {PERM_SELF_REQUESTS, PERM_SELF_PASSWORD, PERM_VIEW_RANDOM_PICKER} | gated
        ), frozenset(
            refused
            | {PERM_MANAGE_CATALOG, PERM_MANAGE_REQUESTS}
            | ADMIN_PAGE_PERMISSIONS
        )
    if role_name == SHARED_ROLE_NAME:
        # Several people sign in to one shared account. It files requests and
        # reads; it keeps no list or personal notes of its own, because they
        # would be everyone's. Its password is the admin's to set - one person
        # changing it would lock out everyone else using the login. It holds
        # the Random Picker, in its catalogue-only version (viewers.md,
        # "Shared"). view.extras stays off until it goes. Quotes and memes are
        # a per-account switch, which a shared account can never hold
        # (features.FEATURE_ROLE_NAMES).
        return frozenset({PERM_SELF_REQUESTS, PERM_VIEW_RANDOM_PICKER}), frozenset(
            {admin_perm(key) for key in ADMIN_PERMISSION_KEYS}
            | {manage_perm(key) for key in MANAGE_PERMISSION_KEYS}
            | {PERM_SELF_LIST, PERM_SELF_PERSONAL_NOTES, PERM_SELF_PASSWORD}
            | {PERM_VIEW_EXTRAS}
            | gated
        )
    # A name outside ROLE_NAMES cannot exist after migration f1i2veroles45.
    # Should one appear anyway, it is given nothing: a lock table must not
    # hand a stranger the free choices.
    return frozenset(), frozenset(every)
