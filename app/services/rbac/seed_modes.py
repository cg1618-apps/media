"""
The four access modes, in their fixed order.

A mode decides which OBJECTS a session reaches: which content labels it shows
and which field groups. Both are DERIVED here from the mode's place in
MODE_ORDER and never stored, so every database shows the same thing and no
edit can make a mode show something the mode above it hides. What stays
adjustable on a mode is its name and description.

The modes are rows (`access_mode`) because their name, description and
sort order are adjustable and a session's mode override names one by id;
accounts name a mode by key (users.mode_ceiling, users.mode_default).
ensure_access_mode_seed creates a missing one; nothing creates or deletes one
otherwise.

Called from the lifespan and mirrored by the migrations, which carry their own
frozen copies rather than importing this module - a migration that imports app
code breaks the day a later revision adds a column.
"""

from typing import Optional

from sqlalchemy.orm import Session

from app import models

MODE_UNRESTRICTED = "unrestricted"
MODE_BORDERLINE = "borderline"
MODE_NORMAL = "normal"
MODE_SAFE = "safe"

# Narrowest first. A mode shows everything the modes before it show; an
# account's ceiling is a position in this tuple.
MODE_ORDER: tuple[str, ...] = (
    MODE_SAFE,
    MODE_NORMAL,
    MODE_BORDERLINE,
    MODE_UNRESTRICTED,
)

_RANK: dict[str, int] = {key: rank for rank, key in enumerate(MODE_ORDER)}

# The lowest mode each field group is shown in. sources_restricted is the only
# group; it is withheld in `safe`, the mode a logged-out visitor resolves.
FIELD_GROUP_LOWEST_MODE: dict[str, str] = {"sources_restricted": MODE_NORMAL}


def mode_rank(key: str) -> Optional[int]:
    """A mode's place in MODE_ORDER, 0 for `safe`. None for an unknown key."""
    return _RANK.get(key)


def field_groups_shown_in(mode_key: str) -> tuple[str, ...]:
    """The field-group keys a mode shows. Empty for an unknown mode.

    `unrestricted` shows every group the code declares, as it shows every
    label: the widest mode reaches everything, including a group added
    without a FIELD_GROUP_LOWEST_MODE entry, which every other mode then
    withholds - the safe direction.
    """
    if mode_key == MODE_UNRESTRICTED:
        from app.services.rbac.field_groups import FIELD_GROUP_KEYS

        return tuple(FIELD_GROUP_KEYS)
    rank = mode_rank(mode_key)
    if rank is None:
        return ()
    return tuple(
        key
        for key, lowest in FIELD_GROUP_LOWEST_MODE.items()
        if _RANK[lowest] <= rank
    )


def seeded_modes() -> tuple[dict, ...]:
    """The four modes' names and descriptions as first created. Both are
    adjustable afterwards; the seed never overwrites them."""
    return (
        {
            "key": MODE_UNRESTRICTED,
            "label": "Unrestricted",
            "description": "Every entry and every field. The widest mode.",
            "sort_order": 0,
        },
        {
            "key": MODE_BORDERLINE,
            "label": "Borderline",
            "description": "Everything but the gated types.",
            "sort_order": 10,
        },
        {
            "key": MODE_NORMAL,
            "label": "Normal",
            "description": "Everything but erotica and the gated types.",
            "sort_order": 20,
        },
        {
            "key": MODE_SAFE,
            "label": "Safe",
            "description": (
                "No labelled entries, and the restricted source list is "
                "withheld. Always what a logged-out visitor sees."
            ),
            "sort_order": 30,
        },
    )


def ensure_access_mode_seed(db: Session) -> None:
    """Create any of the four modes that is missing. Idempotent; an existing
    mode's name and description are left as the admin set them."""
    for spec in seeded_modes():
        exists = (
            db.query(models.AccessMode.system_id)
            .filter(models.AccessMode.key == spec["key"])
            .first()
        )
        if exists is None:
            db.add(models.AccessMode(is_system=True, **spec))
    db.flush()
