"""
The closed vocabularies of a character and a person: gender and my_rating.
my_rating is shared; gender is not - a character takes GENDERS, a person
(seiyuu included) only PERSON_GENDERS, 男 or 女.

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

from app.utils.constants import GENDERS, MY_RATINGS, PERSON_GENDERS

# Free-text spellings the old gender column held that have a plain meaning in
# the vocabulary. Keys are casefolded.
_GENDER_SPELLINGS = {"male": "男", "female": "女"}


def _blank_to_none(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def _check_in(value: Optional[str], vocabulary: tuple[str, ...]) -> Optional[str]:
    value = _blank_to_none(value)
    if value is not None and value not in vocabulary:
        raise ValueError(
            f"'{value}' is not a gender. Expected one of: " + ", ".join(vocabulary)
        )
    return value


def check_gender(value: Optional[str]) -> Optional[str]:
    """A character's gender for a write: one of GENDERS or None. Raises ValueError."""
    return _check_in(value, GENDERS)


def check_person_gender(value: Optional[str]) -> Optional[str]:
    """A person's gender for a write: one of PERSON_GENDERS or None. Raises ValueError."""
    return _check_in(value, PERSON_GENDERS)


def check_my_rating(value: Optional[str]) -> Optional[str]:
    """A rating for a write: one of MY_RATINGS or None. Raises ValueError."""
    value = _blank_to_none(value)
    if value is not None and value not in MY_RATINGS:
        raise ValueError(
            f"'{value}' is not a rating. Expected one of: " + ", ".join(MY_RATINGS)
        )
    return value


def _normalize_in(value: Optional[str], vocabulary: tuple[str, ...]) -> Optional[str]:
    value = _blank_to_none(value)
    if value is None:
        return None
    if value in vocabulary:
        return value
    return _GENDER_SPELLINGS.get(value.casefold())


def normalize_gender(value: Optional[str]) -> Optional[str]:
    """A character's stored or restored gender folded onto GENDERS; anything else is None."""
    return _normalize_in(value, GENDERS)


def normalize_person_gender(value: Optional[str]) -> Optional[str]:
    """A person's restored gender folded onto PERSON_GENDERS; anything else is None."""
    return _normalize_in(value, PERSON_GENDERS)


def normalize_my_rating(value: Optional[str]) -> Optional[str]:
    """A stored or restored rating folded onto MY_RATINGS; anything else is None."""
    value = _blank_to_none(value)
    if value is None:
        return None
    value = value.upper()
    return value if value in MY_RATINGS else None
