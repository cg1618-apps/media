"""
Granted features: per-account switches, off by default, that a part of the
site is personal behind.

A granted feature is personal data an account keeps only once the admin has
switched it on for that account on `/users`: quotes and memes, favourites,
the music statuses and the mod status. An account without the feature does
not see what it gates at all.

**This module is a stand-in.** The switches themselves - users columns named
`feature_<name>`, their panel and their travel on the Users tab - belong to
the switches branch, whose own `app/services/rbac/features.py` replaces this
file wholesale when the two branches meet. Its `has_feature` reads
`getattr(account, f"feature_{name}")`. Every caller asks through
`has_feature(db, viewer, name)` and stays exactly as it is; `db` is unused
here and is accepted because the real helper needs it.

Until then the stub answers True for an account (a viewer with a user id)
holding `self.personal_notes`, the permission personal notes are kept under,
and False otherwise. The root role never passes a `self.*` permission
(Viewer.has), so the admin holds no feature, as it keeps no personal data.
"""

from app.services.rbac.permissions import PERM_SELF_PERSONAL_NOTES

FEATURE_NAMES: tuple[str, ...] = ("quotes_memes", "favourites", "music_status", "mod_status")


def has_feature(db, viewer, name: str) -> bool:
    """Whether `viewer` holds the granted feature `name`. ValueError for a
    name that is not one of FEATURE_NAMES."""
    if name not in FEATURE_NAMES:
        raise ValueError(f"Unknown feature {name!r}.")
    if viewer is None or getattr(viewer, "user_id", None) is None:
        return False
    return viewer.has(PERM_SELF_PERSONAL_NOTES)
