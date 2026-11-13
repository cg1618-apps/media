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

class AccessModeUpdate(BaseModel):
    """The adjustable parts of a mode: its name, description and display
    order. What it shows is derived from its key's place in
    seed_modes.MODE_ORDER, so `key` is absent deliberately."""

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
    # Derived from the key, never stored: the labels and field groups this mode
    # shows. Read-only.
    label_keys: List[str]
    field_group_keys: List[str]
    user_count: int
    # Where the mode sits in seed_modes.MODE_ORDER, narrowest first; null for
    # a mode outside it, which no account's ceiling reaches. Served so the
    # SPA orders the ceiling and default selects without a copy of the order.
    rank: Optional[int] = None


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
    # The per-account feature switches (services/rbac/features.py). Left out
    # is untouched. Switching one ON for an account that is not `user` or
    # `super` is a 409; switching one off is always allowed.
    feature_quotes_memes: Optional[bool] = None
    feature_favourites: Optional[bool] = None
    feature_music_status: Optional[bool] = None
    feature_mod_status: Optional[bool] = None


class RegistrationApproval(BaseModel):
    """Body of POST /api/users/{id}/approve. Every field has the approval
    form's default: role `user`, ceiling and default `normal`. The role is
    `user` or `super`, and neither mode may be `unrestricted` - that is
    granted later on /users, per person, never from this form."""

    role_id: Optional[UUID] = None
    ceiling_mode: str = "normal"
    default_mode: str = "normal"


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
    # The per-account feature switches, as stored. Always false on an account
    # that is not `user` or `super`.
    feature_quotes_memes: bool = False
    feature_favourites: bool = False
    feature_music_status: bool = False
    feature_mod_status: bool = False

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

class ContentLabelResponse(BaseModel):
    """One row of the label reference. Labels are defined in
    app/services/rbac/labels.py; everything here is read-only."""

    system_id: UUID
    key: str
    label: str
    description: Optional[str] = None
    sort_order: int = 0
    # The lowest mode that shows the label, and every mode that does, in
    # seed_modes.MODE_ORDER. Generated from the rule, never written as prose.
    lowest_mode: Optional[str] = None
    modes: List[str] = []
    # The labels this one requires alongside it: ["nsfw"] for every label but
    # nsfw itself.
    also_carries: List[str] = []
    # How many of each carry it directly - not through a group above.
    entry_count: int = 0
    collection_count: int = 0
    franchise_count: int = 0
    series_count: int = 0

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
