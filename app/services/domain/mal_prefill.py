"""
What a MyAnimeList pick on the Add page fills into an anime, anime movie,
manga or novel form.

`mal_prefill` answers GET /api/<type>/mal-prefill/{mal_id}: a flat object of
FORM field names to values, nulls left out. It carries exactly what that
type's MAL autofill writes on save and on Fill - under the same conditions -
plus MAL's English and Japanese titles and the studio or author credits as
comma-joined names. The cover and the Official/Twitter reference rows are not
in it: the save path fetches those itself.

Read-only. A credited studio or person is looked up the way the MAL autofill
looks it up (credits.find_*_for_mal: MAL id, then name), but nothing is
created or linked here; the form's own save resolves the names it is given.
That is why a matched row is named by a name that resolves back to that same
row (`_form_name`), not simply by MAL's.
"""

import logging
from typing import Any, Callable, Dict, Optional

from sqlalchemy.orm import Session

from app import models
from app.services.domain.credits import (
    AmbiguousNameError,
    _find_by_name,
    find_person_for_mal,
    find_studio_for_mal,
)
from app.services.integrations.tenrai import lookup_mal_anime, lookup_mal_manga
from app.utils.credit_roles import CREDIT_ROLES, sheet_column_for
from app.utils.name_normalize import names_of
from app.utils.tenrai_utils import (
    map_tenrai_credits,
    map_tenrai_titles,
    map_tenrai_to_anime_data,
    map_tenrai_to_anime_movie_data,
    map_tenrai_to_manga_data,
    map_tenrai_to_novel_data,
)

logger = logging.getLogger(__name__)

# The serialization status after which a manga's or novel's totals are final;
# the autofills fill them only then, and so does the prefill.
_FINISHED = "完結"


def _anime_fields(j: dict) -> dict:
    return {k: j.get(k) for k in (
        "airing_type", "airing_status", "release_season", "release_date", "ep_total",
    )}


def _anime_movie_fields(j: dict) -> dict:
    return {k: j.get(k) for k in ("airing_status", "release_date_jp")}


def _serialized_fields(j: dict, totals: tuple) -> dict:
    out = {k: j.get(k) for k in ("serialization_status", "release_date", "end_date")}
    if j.get("serialization_status") == _FINISHED:
        out.update({k: j.get(k) for k in totals})
    return out


# media type -> (Tenrai lookup, mapper, the columns its autofill fills). The
# lookups are wrapped so they are read from this module when called, which is
# where the API tests stub them.
_TYPES: Dict[str, tuple[Callable, Callable, Callable]] = {
    "anime": (lambda i: lookup_mal_anime(i), map_tenrai_to_anime_data, _anime_fields),
    "anime-movie": (
        lambda i: lookup_mal_anime(i), map_tenrai_to_anime_movie_data, _anime_movie_fields,
    ),
    "manga": (
        lambda i: lookup_mal_manga(i), map_tenrai_to_manga_data,
        lambda j: _serialized_fields(j, ("vol_total", "ch_total")),
    ),
    "novel": (
        lambda i: lookup_mal_manga(i), map_tenrai_to_novel_data,
        lambda j: _serialized_fields(j, ("vol_total_original", "ch_total")),
    ),
}

# Form name-field prefix per type ("anime-movie" -> anime_movie_name_en).
_NAME_PREFIX = {
    "anime": "anime",
    "anime-movie": "anime_movie",
    "manga": "manga",
    "novel": "novel",
}

PREFILL_MEDIA_TYPES = tuple(_TYPES)


def _resolves_to(db: Session, model, name: str, row) -> bool:
    """Whether the save path would resolve `name` to exactly `row`."""
    try:
        found = _find_by_name(db, model, name)
    except AmbiguousNameError:
        return False
    return found is not None and found.system_id == row.system_id


def _form_name(db: Session, model, row) -> str:
    """
    A name for `row` that the form's save path resolves back to `row`: its
    display name when that does, else the first of its names that does.
    A name carrying a comma is never used - the form field is a
    comma-joined list, so the comma would split it into two names.
    """
    candidates = [row.display_name, *names_of(row, model._name_fields)]
    for name in dict.fromkeys(c for c in candidates if c):
        if "," not in name and _resolves_to(db, model, name, row):
            return name
    return row.display_name


def _credit_name(db: Session, target: str, item: dict) -> Optional[str]:
    """The form's name for one MAL studio or author."""
    model = models.Studio if target == "studio" else models.Person
    try:
        if target == "studio":
            row = find_studio_for_mal(db, item.get("mal_id"), item["name"])
        else:
            row = find_person_for_mal(db, item.get("mal_id"), item.get("name_mal") or item["name"])
    except AmbiguousNameError:
        # The admin sees the ambiguity when the form is saved, exactly as if
        # the name had been typed; the prefill itself never fails on it.
        row = None
    name = _form_name(db, model, row) if row is not None else item["name"]
    if "," in name:
        logger.info("MAL prefill left out %r: a comma would split it in two.", name)
        return None
    return name


def _credit_fields(db: Session, media_type: str, raw: dict) -> Dict[str, str]:
    out = {}
    for role, items in map_tenrai_credits(media_type, raw).items():
        target = CREDIT_ROLES[role].target
        names = []
        for item in items:
            name = _credit_name(db, target, item)
            if name and name not in names:
                names.append(name)
        if names:
            out[sheet_column_for(media_type, role)] = ", ".join(names)
    return out


def mal_prefill(db: Session, media_type: str, mal_id: int) -> Optional[Dict[str, Any]]:
    """
    The prefill for one MAL record, or None when MAL has no such id. Raises
    ExternalSearchError when Tenrai cannot be reached.
    """
    lookup, mapper, fields = _TYPES[media_type]
    raw = lookup(mal_id)
    if raw is None:
        return None

    j_data = mapper(raw)
    prefix = _NAME_PREFIX[media_type]
    titles = map_tenrai_titles(raw)
    out: Dict[str, Any] = {
        f"{prefix}_name_en": titles["name_en"],
        f"{prefix}_name_jp": titles["name_jp"],
        **fields(j_data),
        # The autofills take a rating or rank only when MAL has one.
        "mal_rating": j_data.get("mal_rating") or None,
        "mal_rank": j_data.get("mal_rank") or None,
    }
    out.update(_credit_fields(db, media_type, raw))
    return {k: v for k, v in out.items() if v is not None}
