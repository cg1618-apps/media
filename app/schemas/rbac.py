"""Role, user-management and content-label schemas."""

from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Permission catalog
# ---------------------------------------------------------------------------

class PermissionOut(BaseModel):
    """One grantable permission, described for the role editor."""

    permission: str
    label: str
    description: str = ""


class PermissionFamilyOut(BaseModel):
    """
    Permissions grouped the way the admin UI renders them.

    The catalog is served rather than mirrored in the frontend so the checkbox
    grid cannot drift from what the server will actually accept.
    """

    family: str
    label: str
    permissions: List[PermissionOut]


# ---------------------------------------------------------------------------
# Roles
# ---------------------------------------------------------------------------

class RoleBase(BaseModel):
    name: str
    label: str
    description: Optional[str] = None
    sort_order: int = 0


class RoleUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class RolePermissions(BaseModel):
    """The whole set, replaced at once - never an incremental add."""

    permissions: List[str]


class RoleResponse(RoleBase):
    system_id: UUID
    is_root: bool
    permissions: List[str] = []
    user_count: int = 0
    # What this role must hold and what it may never hold, from
    # permissions.locked_permissions(). Served rather than mirrored in the SPA
    # for the same reason the permission catalog is: the disabled checkbox and
    # the 409 that would reject the same save come from one table.
    locked_on: List[str] = []
    locked_off: List[str] = []

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

class AccessModeItems(BaseModel):
    """What a mode carries. Replaced wholesale, like a role's permissions."""

    label_keys: List[str] = []
    field_group_keys: List[str] = []


class AccessModeCreate(AccessModeItems):
    key: str
    label: str
    description: Optional[str] = None
    sort_order: int = 0


class AccessModeUpdate(BaseModel):
    """Label, description, order and the guest-default flag.

    `key` is absent deliberately: the seeded modes are read by key in
    seed_modes.py, and renaming one would silently detach the seeder from the
    row it maintains.
    """

    label: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class AccessModeResponse(BaseModel):
    system_id: UUID
    key: str
    label: str
    description: Optional[str] = None
    sort_order: int
    is_system: bool
    label_keys: List[str]
    field_group_keys: List[str]
    user_count: int
    # Where the mode sits in seed_modes.MODE_ORDER, narrowest first; null for
    # a mode outside it, which no account's ceiling reaches. Served so the
    # SPA orders the ceiling and default selects without a copy of the order.
    rank: Optional[int] = None


class AccessModeCatalogItem(BaseModel):
    key: str
    label: str
    description: Optional[str] = None
    # How many modes carry this item. Zero on a content label means its
    # entries are hidden from everybody, which is what the page warns about.
    mode_count: int


class AccessModeCatalogGroup(BaseModel):
    group: str
    label: str
    items: List[AccessModeCatalogItem]


class UserAccessModes(BaseModel):
    """An account's whole object axis - ceiling, default and denials.

    `ceiling` and `default` are mode KEYS. Both null parks the account with no
    mode: it resolves the empty object set, which is fail-closed and a
    reasonable way to park somebody. Denials only SUBTRACT, and only from what
    the ceiling shows; they apply in every mode the account uses.

    One payload and one write, matching PUT /roles/{id}/permissions.
    """

    ceiling: Optional[str] = None
    default: Optional[str] = None
    denied_label_keys: List[str] = []
    denied_field_group_keys: List[str] = []


class AccessModeSwitch(BaseModel):
    """Body of POST /api/auth/access-mode.

    `password` is optional because narrowing does not need one. Widening
    without it is a 401 carrying `requires_password`, so the SPA prompts
    rather than guessing which switches are free.
    """

    mode_id: UUID
    password: Optional[str] = None


class ManagedUserCreate(BaseModel):
    username: str
    password: str
    role_id: UUID


class ManagedUserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    role_id: Optional[UUID] = None
    # `pending` is not settable here: a registration is approved or declined,
    # not edited. Anything else is a 422.
    status: Optional[Literal["active", "disabled"]] = None
    # Null is no limit. Left out of the payload it is untouched - unless the
    # same save changes the role, which resets it to the new role's default.
    # Not settable on a super account, which never has one.
    open_request_limit: Optional[int] = Field(default=None, ge=0)


class ManagedUserResponse(BaseModel):
    id: UUID
    username: str
    role_id: Optional[UUID] = None
    role_name: Optional[str] = None
    # active / disabled / pending. Changed through PATCH /api/users/{id}.
    status: str = "active"
    # The OBJECT axis for this account. Carried on the user response rather
    # than behind a second endpoint because the panel that edits it lives on
    # the users page, and PUT .../access-modes returns this same shape - so
    # the page never has to reconcile two sources. Ceiling and default are
    # mode keys; both null is no mode.
    mode_ceiling: Optional[str] = None
    mode_default: Optional[str] = None
    denied_label_keys: List[str] = []
    denied_field_group_keys: List[str] = []
    # How many open requests the account may hold at once; null is no limit.
    open_request_limit: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# The caller's own account
# ---------------------------------------------------------------------------

class AccountSettingsResponse(BaseModel):
    """What the caller may see about their own account."""

    username: str
    role_name: str


class OwnPasswordChange(BaseModel):
    """Body of PUT /api/account/password. No user id, as everywhere on this
    router: the account is the session's."""

    current_password: str
    new_password: str


# ---------------------------------------------------------------------------
# Content labels
# ---------------------------------------------------------------------------

class ContentLabelBase(BaseModel):
    key: str
    label: str
    description: Optional[str] = None
    sort_order: int = 0


class ContentLabelCreate(ContentLabelBase):
    pass


class ContentLabelUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class ContentLabelResponse(ContentLabelBase):
    system_id: UUID
    # No `permission` field. A label stopped being a permission in Phase B -
    # it is carried by an access mode now, not granted to a role - and
    # publishing `label.<key>` would have named something that no longer
    # exists. `key` is the identifier that still means something, and it is on
    # ContentLabelBase.

    model_config = ConfigDict(from_attributes=True)


class ContentLabelRef(BaseModel):
    """
    One label as it is SHOWN on a detail page, rather than administered.

    Carries no sort_order and no system_id: the page renders a chip from the
    display name and needs the key only to look the label up. Kept separate
    from ContentLabelResponse so that widening the admin payload does not
    widen what every public entry response carries.
    """

    key: str
    label: str
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class EntryLabels(BaseModel):
    """
    The whole set for one owner, replaced at once - as credits.py does.

    Serves a media entry and a franchise alike: both PUT the same body, and
    the two write paths differ only in which join table they rewrite.
    """

    label_keys: List[str]
