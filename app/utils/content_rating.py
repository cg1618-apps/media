"""
A shared record's content rating: how adult the record itself is.

People, studios, publishers and the pictures in a person's gallery of works
each carry one. It is a visibility gate by ACCESS MODE, layered on the
connection rule in app/services/rbac/shared_visibility.py: a record rated
above the viewer's active mode is hidden whatever it is connected to. It can
only hide - a record the connection rule hides stays hidden at any rating.

    rating         shown from      label
    normal         safe            Normal
    borderline     borderline      Borderline (15+)
    unrestricted   unrestricted    Unrestricted (18+)

`normal` is the default and is shown in every mode, so a record nobody has
rated is seen exactly where the connection rule alone says.

Two strictnesses, as app/utils/entity_vocab.py has:

  check_content_rating      what a WRITE accepts: one of the three exactly.
  normalize_content_rating  what a Sheets Pull restores: a blank or unknown
                            cell is `normal`, so a sheet with no such column
                            restores every record as unrated.

The mode keys are spelled here rather than imported from
app/services/rbac/seed_modes.py, so this module stays importable from the
schemas without pulling in the rbac package; tests/unit pins the two together.
"""

from typing import Optional

RATING_NORMAL = "normal"
RATING_BORDERLINE = "borderline"
RATING_UNRESTRICTED = "unrestricted"

# In ascending order. The default is the first.
CONTENT_RATINGS: tuple[str, ...] = (
    RATING_NORMAL,
    RATING_BORDERLINE,
    RATING_UNRESTRICTED,
)

DEFAULT_CONTENT_RATING = RATING_NORMAL

# What the SPA shows for each value, in CONTENT_RATINGS order.
CONTENT_RATING_LABELS: dict[str, str] = {
    RATING_NORMAL: "Normal",
    RATING_BORDERLINE: "Borderline (15+)",
    RATING_UNRESTRICTED: "Unrestricted (18+)",
}

# The narrowest access mode (seed_modes.MODE_ORDER) that shows each rating.
RATING_LOWEST_MODE: dict[str, str] = {
    RATING_NORMAL: "safe",
    RATING_BORDERLINE: "borderline",
    RATING_UNRESTRICTED: "unrestricted",
}


def check_content_rating(value) -> str:
    """A rating for a write: one of CONTENT_RATINGS exactly. Raises ValueError."""
    if value not in CONTENT_RATINGS:
        raise ValueError(
            f"'{value}' is not a content rating. Expected one of: "
            + ", ".join(CONTENT_RATINGS)
        )
    return value


def check_optional_content_rating(value) -> Optional[str]:
    """check_content_rating, letting None through - a form that does not send
    the key leaves the stored rating as it is."""
    return None if value is None else check_content_rating(value)


def normalize_content_rating(value) -> str:
    """A restored rating: one of CONTENT_RATINGS, else the default."""
    if value is None:
        return DEFAULT_CONTENT_RATING
    value = str(value).strip().casefold()
    return value if value in CONTENT_RATINGS else DEFAULT_CONTENT_RATING


def without_unset_rating(data: dict) -> dict:
    """
    `data` (a write schema's model_dump) minus a `content_rating` of None.

    The write schemas carry the rating as optional so that a PUT from a form
    that never sends it does not reset a stored one; dropping the None before
    the columns are copied is what makes that so, and lets a create fall to
    the column's default.
    """
    if data.get("content_rating", RATING_NORMAL) is None:
        data.pop("content_rating")
    return data
