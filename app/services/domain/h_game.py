"""
The rules that make an h-game an h-game, on every write path.

Two invariants, and one place that keeps them:

  values    The fixed-choice fields carry closed vocabularies from
            app/utils/constants.py: playstyle and language_availability are
            single choices, audio_availability, h_presentation, art_style and
            platform lists. An unknown value is refused (422) on a write through the
            API; a list is de-duplicated and kept in vocabulary order, so two
            ways of ticking the same boxes store the same list. An empty list
            is kept as an answer ("none of these"), distinct from null
            ("unknown").

  label     Every h-game entry carries the `h-game` content label, and every
            franchise whose type includes `H-Game` carries it too. The
            machinery is every gated type's (gated_labels.py); this module
            only stamps it in the hook.

The write paths that reach them:

  form create / update                  the write schemas, then the registry's
                                        progress hook (app/registry.py)
  tracker PATCH                         the progress hook alone - PATCH has no
                                        schema, so the hook checks again
  Pull, sheet restore                   the parser keeps known values only;
                                        gated_labels' generic pass re-attaches
                                        the label after the tab lands
  Calculate                             the same generic pass

H-Game has no rule of its own beyond these - no region, nothing derived - so
it has no invariant pass of its own: the label is the only thing a restore
could break, and the pass every gated type shares covers it.
"""

import logging
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.services.domain.gated_labels import ensure_entry_label
from app.services.domain.h_comic import check_usefulness, normalize_group_order
from app.services.domain.hierarchy import check_entry_franchise_family
from app.utils.constants import (
    H_GAME_ART_STYLES,
    H_GAME_AUDIO_AVAILABILITY,
    H_GAME_H_PRESENTATIONS,
    H_GAME_LANGUAGE_AVAILABILITY,
    H_GAME_PLATFORMS,
    H_GAME_PLAYSTYLES,
)

logger = logging.getLogger(__name__)

MEDIA_TYPE = "h-game"
# Named here as well as in gated_types.REQUIRED_LABEL_FOR_TYPE so this module
# does not import the rbac layer at module scope; a unit test pins the two.
LABEL_KEY = "h-game"

# column -> (vocabulary, what an error calls it). The multi-choice lists.
CHOICE_LISTS: dict[str, tuple[tuple[str, ...], str]] = {
    "audio_availability": (H_GAME_AUDIO_AVAILABILITY, "audio availability"),
    "h_presentation": (H_GAME_H_PRESENTATIONS, "H presentation"),
    "art_style": (H_GAME_ART_STYLES, "art style"),
    "platform": (H_GAME_PLATFORMS, "platform"),
}

# The single choices, the same way.
SINGLE_CHOICES: dict[str, tuple[tuple[str, ...], str]] = {
    "playstyle": (H_GAME_PLAYSTYLES, "playstyle"),
    "language_availability": (H_GAME_LANGUAGE_AVAILABILITY, "language availability"),
}


# ---------------------------------------------------------------------------
# Values
# ---------------------------------------------------------------------------


def check_choice(value, allowed: tuple[str, ...], label: str) -> Optional[str]:
    """One value of `allowed`, or None for a blank. ValueError otherwise."""
    if isinstance(value, str) and not value.strip():
        return None
    if value is None:
        return None
    if value not in allowed:
        raise ValueError(
            f"'{value}' is not a valid {label}; expected one of "
            f"{', '.join(allowed)}."
        )
    return value


def normalize_choice_list(value, allowed: tuple[str, ...], label: str) -> Optional[list[str]]:
    """
    A multi-choice field as stored: the chosen values, each once, in
    vocabulary order. None stays None (unknown); [] stays [] (none of them).
    A non-list, or a value outside `allowed`, is a ValueError.
    """
    if value is None:
        return None
    if not isinstance(value, (list, tuple)):
        raise ValueError(f"{label} must be a list of values.")
    chosen = set()
    for item in value:
        if not isinstance(item, str) or item not in allowed:
            raise ValueError(
                f"'{item}' is not a valid {label}; expected any of "
                f"{', '.join(allowed)}."
            )
        chosen.add(item)
    return [option for option in allowed if option in chosen]


def check_playstyle(value) -> Optional[str]:
    return check_choice(value, H_GAME_PLAYSTYLES, "playstyle")


def check_language_availability(value) -> Optional[str]:
    return check_choice(value, H_GAME_LANGUAGE_AVAILABILITY, "language availability")


def check_audio_availability(value) -> Optional[list[str]]:
    return normalize_choice_list(value, H_GAME_AUDIO_AVAILABILITY, "audio availability")


def check_h_presentation(value) -> Optional[list[str]]:
    return normalize_choice_list(value, H_GAME_H_PRESENTATIONS, "H presentation")


def check_art_style(value) -> Optional[list[str]]:
    return normalize_choice_list(value, H_GAME_ART_STYLES, "art style")


def check_platform(value) -> Optional[list[str]]:
    return normalize_choice_list(value, H_GAME_PLATFORMS, "platform")


def lenient_choice_list(value, allowed: tuple[str, ...], label: str) -> Optional[list[str]]:
    """
    The Sheets parser's form of normalize_choice_list: a restore must not
    abort a whole tab over one hand-typed cell, so an unknown value is logged
    and dropped rather than raised. Accepts a list or a comma-separated
    string.
    """
    if value is None:
        return None
    if isinstance(value, str):
        value = [part.strip() for part in value.split(",") if part.strip()]
    if not isinstance(value, (list, tuple)):
        logger.warning("%s: %r is not a list of values; cleared.", label, value)
        return None
    known = [item for item in value if isinstance(item, str) and item in allowed]
    dropped = [item for item in value if item not in known]
    if dropped:
        logger.warning("%s: unknown value(s) %r dropped.", label, dropped)
    return [option for option in allowed if option in set(known)]


# ---------------------------------------------------------------------------
# The write paths
# ---------------------------------------------------------------------------


def _validate_catalog(entry) -> None:
    """Every h-game vocabulary column, checked on the entry as it will be."""
    for column, (allowed, label) in SINGLE_CHOICES.items():
        setattr(entry, column, check_choice(getattr(entry, column), allowed, label))
    for column, (allowed, label) in CHOICE_LISTS.items():
        setattr(
            entry, column, normalize_choice_list(getattr(entry, column), allowed, label)
        )
    entry.highlight_group_order = normalize_group_order(entry.highlight_group_order)


def h_game_progress_hook(db: Session, entry) -> None:
    """
    The catalogue half of every form and tracker write: validate, keep the
    label on.

    Raised as a 422 here because the tracker PATCH has no request schema to
    validate against - the dict body reaches the model unchecked, so this is
    the one place every write path passes through.
    """
    try:
        _validate_catalog(entry)
        # The router factory checks this too; the hook keeps it with the
        # type, as h-comic's does, so the rule holds whichever runs.
        check_entry_franchise_family(
            db, getattr(entry, "franchise_id", None), MEDIA_TYPE
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if entry.system_id is not None:
        db.flush()
        ensure_entry_label(db, entry.system_id, LABEL_KEY)


def h_game_progress_hook_list(row, entry) -> None:
    """The player's half: usefulness is a vocabulary."""
    try:
        row.usefulness = check_usefulness(row.usefulness)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
