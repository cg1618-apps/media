"""
What a character is to the work.

Lives here rather than in routers/constants.py, where it used to, because
services/domain/casting.py validates against it and a service importing a
router is an inversion - and in this case a load-bearing one. It closed an
import cycle: rbac/field_groups imports domain.credits, initialising
services.domain, whose __init__ imports casting, which imported
routers.constants, which imports the rbac resolver, which imports
rbac/permissions, which imports field_groups. The cycle only raised when
field_groups happened to be the FIRST of those modules imported, so it stayed
latent for a year and surfaced when a new test file sorted alphabetically
ahead of everything that used to load the chain first.

routers/constants.py still re-exports the name, so its /api/constants payload
is unchanged.
"""

from typing import Optional

# In dropdown order - /api/constants serves it as `character_role` as is.
# Used by two independent columns: character_casting.role (what the character
# is to one entry) and character.role (what the character is overall). Both
# are nullable: an admin need not classify.
CHARACTER_ROLES: tuple[str, ...] = ("Main", "Core", "Supporting", "Other")


def check_character_role(value: Optional[str]) -> Optional[str]:
    """A role for a write: one of CHARACTER_ROLES, or None for blank. Raises
    ValueError on anything else."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    value = str(value).strip()
    if value not in CHARACTER_ROLES:
        raise ValueError(
            f"'{value}' is not a character role. Expected one of: "
            + ", ".join(CHARACTER_ROLES)
        )
    return value


def normalize_character_role(value: Optional[str]) -> Optional[str]:
    """A restored role: kept when it is one of CHARACTER_ROLES, else None."""
    if value is None:
        return None
    value = str(value).strip()
    return value if value in CHARACTER_ROLES else None
