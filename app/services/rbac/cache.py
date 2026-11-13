"""
Role permission sets and access-mode item sets, cached in process.

Permissions are resolved from the database on every request rather than carried
in the JWT, so that revoking one takes effect immediately instead of whenever
the viewer's cookie happens to expire - there is no refresh flow or token
blacklist to bolt onto. That choice costs a query per request, which this
removes for all but the first.

Single-process by design: the app runs as one process, so one dict is the whole
cache. Every write to a grant, an account or the label set calls bump() - the
roles, access-mode, users and content-label routers, the gated-label seed and
Pull (docs/authorization.md, "Who calls bump()"); running a second instance
would need a short TTL instead.

THREE caches now, and ONE bump() that clears all of them. The mode caches are
keyed the way the role cache is - on the thing that is shared, not on the
account - because adding the user to a key would make the cache unbounded in
accounts and destroy the sharing that makes it worth having. The denial cache
is the exception: denials belong to the account, so it is keyed by user id,
and it is bounded by the number of accounts that have signed in:

  _CACHE          role_id             -> the role's permissions
  _MODE_CACHE     mode_id             -> the mode's labels and field groups,
                                         shared by everyone holding it, hot
  _DENIAL_CACHE   user_id             -> that account's denials, usually
                                         empty; one set per account, applied
                                         in every mode it uses

A bump() that cleared only the first would leave a mode's edited items, or
an account's pruned denials, live until restart, and would leak mode state
between tests in a way whose failures are random and order-dependent.

bump() also advances a GENERATION. The cover route's short-lived viewer cache
(cover_viewer.py) is keyed per session rather than on a shared object, so it
is not one of the dicts above; instead every entry records the generation it
was resolved under and is discarded once that has moved. Reading the
generation BEFORE resolving is what closes the race in which a request reads
the old rows, a write commits and bumps, and the request then stores its
stale answer after the bump.
"""

import threading
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy.orm import Session

from app import models

if TYPE_CHECKING:  # pragma: no cover
    from app.services.rbac.modes import ModeSets

_CACHE: dict[UUID, frozenset[str]] = {}
_MODE_CACHE: dict[UUID, "ModeSets"] = {}
_DENIAL_CACHE: dict[UUID, "ModeSets"] = {}
_GENERATION = 0
_GENERATION_LOCK = threading.Lock()


def bump() -> None:
    """Drop every cache. Called by every write that changes a grant - role
    permissions, access-mode items, and per-account denials alike - and by
    every write that changes who an account is or which labels exist."""
    global _GENERATION
    with _GENERATION_LOCK:
        _GENERATION += 1
    _CACHE.clear()
    _MODE_CACHE.clear()
    _DENIAL_CACHE.clear()


def generation() -> int:
    """How many times bump() has run in this process."""
    return _GENERATION


def every_label_id(db: Session) -> frozenset[UUID]:
    """Every content label row that exists. The label half of `unrestricted`."""
    return frozenset(
        system_id for (system_id,) in db.query(models.ContentLabel.system_id)
    )


def permissions_for(db: Session, role_id: UUID) -> frozenset[str]:
    cached = _CACHE.get(role_id)
    if cached is not None:
        return cached
    granted = frozenset(
        row.permission
        for row in db.query(models.RolePermission.permission).filter(
            models.RolePermission.role_id == role_id
        )
    )
    _CACHE[role_id] = granted
    return granted


def mode_sets(db: Session, mode_id: UUID) -> "ModeSets":
    """
    What one mode shows: its content labels and its field groups.

    DERIVED from the mode's key (seed_modes.MODE_ORDER and each label's lowest
    mode in labels.CONTENT_LABELS), never read from stored rows, so it cannot
    drift and every database answers the same. Only the key-to-id step reads
    the database, because the assignment tables cite labels by id.

    `unrestricted` shows every label ROW rather than every label the code
    names. The two are the same once ensure_labels and the migration have run;
    the difference is that a row nobody expected is still reachable in the
    widest mode, as the spec's "unrestricted always reaches everything" says,
    and hidden everywhere else. A key that is not a mode shows nothing.

    Shared by everyone holding the mode, so cached until bump().
    """
    cached = _MODE_CACHE.get(mode_id)
    if cached is not None:
        return cached

    from app.services.rbac.labels import labels_shown_in
    from app.services.rbac.modes import ModeSets
    from app.services.rbac.seed_modes import MODE_UNRESTRICTED, field_groups_shown_in

    mode = db.get(models.AccessMode, mode_id)
    key = mode.key if mode is not None else ""
    if key == MODE_UNRESTRICTED:
        label_ids = every_label_id(db)
    else:
        shown = labels_shown_in(key)
        label_ids = frozenset(
            system_id
            for (system_id,) in db.query(models.ContentLabel.system_id).filter(
                models.ContentLabel.key.in_(shown)
            )
        ) if shown else frozenset()
    sets = ModeSets(
        label_ids=label_ids, field_groups=frozenset(field_groups_shown_in(key))
    )
    _MODE_CACHE[mode_id] = sets
    return sets


def denials_for(db: Session, user_id: UUID) -> "ModeSets":
    """
    What one account subtracts from whichever mode it is in. Usually empty.

    Same shape as mode_sets because resolution is a set difference.
    """
    cached = _DENIAL_CACHE.get(user_id)
    if cached is not None:
        return cached

    from app.services.rbac.modes import ModeSets

    rows = db.query(
        models.UserAccessModeDenial.label_id,
        models.UserAccessModeDenial.field_group_key,
    ).filter(models.UserAccessModeDenial.user_id == user_id)
    labels, groups = set(), set()
    for label_id, field_group_key in rows:
        if label_id is not None:
            labels.add(label_id)
        if field_group_key is not None:
            groups.add(field_group_key)
    sets = ModeSets(label_ids=frozenset(labels), field_groups=frozenset(groups))
    _DENIAL_CACHE[user_id] = sets
    return sets
