"""
Access-mode policy: which objects a session may reach.

The role axis (permissions.py, resolver.py) answers "what kinds of operation
may this account perform". This module answers "which objects can those
operations reach", and the two are disjoint by construction - the role axis
holds admin.*, manage.*, media_type.* and self.*; this axis holds content
labels and field groups, and neither can express the other.

Effective access = (the role's permissions) applied to (the active mode's
object set, minus the account's denials). The four modes are ordered
(seed_modes.MODE_ORDER), and an account has a CEILING and a DEFAULT on that
order (users.mode_ceiling, users.mode_default): it may switch to any mode
ranked at or below the ceiling and lands in the default on login. Denials hang
off the account and apply in every mode it uses; they only subtract, so an
account's reach is always a subset of its active mode's.

Resolution is fail-closed at every step, matching role_for_user's existing
"least access, not most" rule.
"""

from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.services.rbac import cache
from app.services.rbac.seed_modes import MODE_ORDER, MODE_SAFE, mode_rank


@dataclass(frozen=True)
class ModeSets:
    """
    What a mode carries, or what an account's denials subtract.

    One shape for both, because the resolution step is a set difference.
    """

    label_ids: frozenset[UUID] = frozenset()
    field_groups: frozenset[str] = frozenset()


@dataclass(frozen=True)
class ResolvedMode:
    """The active mode of one session, after denials."""

    mode_id: Optional[UUID] = None
    mode_key: Optional[str] = None
    label_ids: frozenset[UUID] = frozenset()
    field_groups: frozenset[str] = frozenset()


EMPTY_MODE = ResolvedMode()


def resolve_mode(
    db: Session, user: Optional[models.User], token_mode_id: Optional[UUID]
) -> ResolvedMode:
    """
    Which objects this session may reach.

        token.mode  ->  ranked at or below this account's ceiling?
                          yes -> effective = mode's sets - account's denials
                          no  -> effective = EMPTY SET
        no token    ->  the `safe` mode, or EMPTY SET if it is missing

    The claim NAMES A CHOICE, NOT A GRANT. Whether the account may still use
    the mode is resolved from the database on every request, exactly as the
    role already is - today's `role` claim is decorative and resolver.py says
    so. Lowering a ceiling or ticking a new denial therefore takes effect on
    the viewer's next request, even with a live cookie.

    The fallback for a mode above the ceiling is the EMPTY SET, never the
    account's default or the ceiling itself. A session sitting in a mode the
    account can no longer use has no claim to anything, and the empty set is
    the only fallback that cannot widen. A mode outside MODE_ORDER (one an
    admin created by hand) has no rank and is never within a ceiling.

    A signed-in caller with no usable claim does NOT fall through to the guest
    default either. That mode is the anonymous policy, not this account's, and
    inheriting it would be a second fallback that can widen.
    """
    if user is None:
        # `safe` BY KEY, and not a flag on the table. Which mode an anonymous
        # visitor gets is not an administrator's choice: it is the definition
        # of the mode, and storing it as data means a Pull All, a migration or
        # a hand-edit can move it to `unrestricted` - a change that publishes
        # every labelled entry to the internet while looking like a successful
        # restore, and that nothing on any screen would report. The key is
        # safe to depend on because it is deliberately not patchable
        # (schemas/rbac.py): renaming one would detach the seeder from the row
        # it maintains.
        mode = (
            db.query(models.AccessMode)
            .filter(models.AccessMode.key == MODE_SAFE)
            .first()
        )
        if mode is None:
            return EMPTY_MODE
        sets = cache.mode_sets(db, mode.system_id)
        return ResolvedMode(
            mode.system_id, mode.key, sets.label_ids, sets.field_groups
        )

    if token_mode_id is None:
        return EMPTY_MODE

    mode = db.get(models.AccessMode, token_mode_id)
    if mode is None or not within_ceiling(user, mode.key):
        return EMPTY_MODE

    return _effective(db, user, mode)


def within_ceiling(user: models.User, mode_key: str) -> bool:
    """Whether `mode_key` ranks at or below this account's ceiling.

    False for an account with no mode, and for a key outside MODE_ORDER.
    """
    if user.mode_ceiling is None or mode_key not in MODE_ORDER:
        return False
    return mode_rank(mode_key) <= mode_rank(user.mode_ceiling)


def _effective(
    db: Session, user: models.User, mode: models.AccessMode
) -> ResolvedMode:
    """One mode's sets minus this account's denials."""
    sets = cache.mode_sets(db, mode.system_id)
    denials = cache.denials_for(db, user.id)
    return ResolvedMode(
        mode.system_id,
        mode.key,
        sets.label_ids - denials.label_ids,
        sets.field_groups - denials.field_groups,
    )


def switch_requires_password(current: ResolvedMode, target: ResolvedMode) -> bool:
    """
    Whether moving from `current` to `target` needs the password again.

    A SET COMPARISON, not a rank comparison (spec decision 3). Narrowing is
    free; adding even one label or one field group asks for the password.
    With denials uniform across an account's modes, the subset test agrees
    with the rank everywhere but one place: from the EMPTY set, where moving
    to `safe` is upward by rank yet adds nothing that matters - the subset
    test answers that correctly, so it stays the test.

    Both sides are EFFECTIVE sets, after denials. An account at ceiling
    `borderline` denied `nsfw` reaches no more in `borderline` than in
    `normal`, so switching between them is free even though the mode is
    nominally wider.

    Computed here and published by /api/auth/me so the SPA never models this
    rule. Two implementations of one rule is how they drift, and the one in
    the browser would be the one nobody tested.
    """
    return not (
        target.label_ids <= current.label_ids
        and target.field_groups <= current.field_groups
    )


def held_modes(
    db: Session, user: Optional[models.User], active: ResolvedMode
) -> list[dict]:
    """
    Every mode this account may switch to - each one ranked at or below its
    ceiling, narrowest first - with the cost of switching to it.

    A guest holds none - they have no account, so there is nothing to switch
    between; wanting more means logging in. An account with no mode holds
    none either.
    """
    if user is None or user.mode_ceiling is None:
        return []

    modes = {
        mode.key: mode
        for mode in db.query(models.AccessMode).filter(
            models.AccessMode.key.in_(MODE_ORDER)
        )
    }
    out = []
    for key in MODE_ORDER:
        mode = modes.get(key)
        if mode is None or not within_ceiling(user, key):
            continue
        effective = _effective(db, user, mode)
        is_active = mode.system_id == active.mode_id
        out.append(
            {
                "id": str(mode.system_id),
                "key": mode.key,
                "label": mode.label,
                "is_active": is_active,
                # Switching to where you already are is a no-op, never a
                # widening - and the subset test would say so anyway, but
                # saying it explicitly keeps a denial edge from making the
                # active row ask for a password.
                "requires_password": (
                    False
                    if is_active
                    else switch_requires_password(active, effective)
                ),
            }
        )
    return out


def default_mode_id(db: Session, user: models.User) -> Optional[UUID]:
    """
    The mode a fresh login lands in: the access_mode row keyed by the
    account's mode_default.

    None when the account has no mode (or the row is missing), which
    resolve_mode turns into the empty set - so a login with no mode shows
    nothing rather than everything.
    """
    if user.mode_default is None:
        return None
    row = (
        db.query(models.AccessMode.system_id)
        .filter(models.AccessMode.key == user.mode_default)
        .first()
    )
    return row[0] if row else None


def check_mode_pair(ceiling_key: Optional[str], default_key: Optional[str]) -> None:
    """ValueError unless (ceiling, default) is a pair set_mode_ceiling accepts.

    Separate so a caller can refuse a payload before it writes anything.
    """
    if (ceiling_key is None) != (default_key is None):
        raise ValueError("A ceiling and a default are set together or not at all.")
    if ceiling_key is not None and mode_rank(default_key) > mode_rank(ceiling_key):
        raise ValueError(
            f"The default mode {default_key!r} is above the ceiling {ceiling_key!r}."
        )


def set_mode_ceiling(
    db: Session,
    user: models.User,
    ceiling_key: Optional[str],
    default_key: Optional[str],
) -> None:
    """
    Set an account's ceiling and default. The one writer of the two columns.

    Both None parks the account with no mode: it resolves the empty set.
    Raises ValueError on a key outside MODE_ORDER, on exactly one of the two
    being None, and on a default ranked above the ceiling - the rules the
    three ck_users_mode_* constraints enforce, checked here first so a caller
    gets an error it can answer with a 422 rather than an IntegrityError.
    `unrestricted` is an accepted ceiling; a caller that must not hand it out
    refuses it before calling.

    Also deletes the account's denials that the new ceiling's mode does not
    show, so "a denial names something the ceiling shows" stays true after a
    ceiling is lowered. Flushes and calls cache.bump(); never commits - the
    caller owns the transaction.
    """
    check_mode_pair(ceiling_key, default_key)

    user.mode_ceiling = ceiling_key
    user.mode_default = default_key
    db.flush()

    denials = db.query(models.UserAccessModeDenial).filter(
        models.UserAccessModeDenial.user_id == user.id
    )
    if ceiling_key is None:
        denials.delete(synchronize_session=False)
    else:
        ceiling = (
            db.query(models.AccessMode)
            .filter(models.AccessMode.key == ceiling_key)
            .first()
        )
        if ceiling is not None:
            shown = cache.mode_sets(db, ceiling.system_id)
            for denial in denials.all():
                if denial.label_id is not None:
                    stale = denial.label_id not in shown.label_ids
                else:
                    stale = denial.field_group_key not in shown.field_groups
                if stale:
                    db.delete(denial)
    db.flush()
    cache.bump()
