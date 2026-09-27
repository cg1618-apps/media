"""
The two closed vocabularies a character and a person share: gender and
my_rating.

Two strictnesses, on purpose:

  check_*       what a WRITE accepts - the schemas and PATCH. A value is one
                of the vocabulary exactly, or NULL ("" and whitespace count
                as NULL); anything else is refused, so a typo is a 422 rather
                than a row nobody's filter can find.
  normalize_*   what a Sheets Pull restores. A backup taken before the
                vocabulary existed still carries free text ("Male", "a+");
                it is folded onto the vocabulary where the meaning is plain
                and dropped to NULL where it is not, the same rules the
                revision that introduced the vocabulary applied to the
                database (alembic/versions/c3p4photofb5_*). A Pull never
                refuses a row over one of these cells.

The revision inlines its own copy of the rules rather than importing this
module: a migration must keep meaning what it meant when it ran.
"""

from typing import Optional

from app.utils.constants import GENDERS, MY_RATINGS

# Free-text spellings the old gender column held that have a plain meaning in
# the vocabulary. Keys are casefolded.
_GENDER_SPELLINGS = {"male": "男", "female": "女"}


def _blank_to_none(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def check_gender(value: Optional[str]) -> Optional[str]:
    """A gender for a write: one of GENDERS or None. Raises ValueError."""
    value = _blank_to_none(value)
    if value is not None and value not in GENDERS:
        raise ValueError(
            f"'{value}' is not a gender. Expected one of: " + ", ".join(GENDERS)
        )
    return value


def check_my_rating(value: Optional[str]) -> Optional[str]:
    """A rating for a write: one of MY_RATINGS or None. Raises ValueError."""
    value = _blank_to_none(value)
    if value is not None and value not in MY_RATINGS:
        raise ValueError(
            f"'{value}' is not a rating. Expected one of: " + ", ".join(MY_RATINGS)
        )
    return value


def normalize_gender(value: Optional[str]) -> Optional[str]:
    """A stored or restored gender folded onto GENDERS; anything else is None."""
    value = _blank_to_none(value)
    if value is None:
        return None
    if value in GENDERS:
        return value
    return _GENDER_SPELLINGS.get(value.casefold())


def normalize_my_rating(value: Optional[str]) -> Optional[str]:
    """A stored or restored rating folded onto MY_RATINGS; anything else is None."""
    value = _blank_to_none(value)
    if value is None:
        return None
    value = value.upper()
    return value if value in MY_RATINGS else None
