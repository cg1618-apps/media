"""
Parent-hierarchy resolution: turn whatever a form or a sheet row carries in
its franchise_id / series_id cells into real UUIDs.

One rule for every media type (it used to be nine near-identical copies that
had drifted: some searched three name columns, some five, two matched series
exactly instead of case-insensitively, anime ignored a name in the franchise
cell):

Franchise
  * a UUID passes through;
  * a non-empty string names the franchise itself and is looked up
    case-insensitively across every franchise name column, where
    franchise_name_alt is a comma-separated list and each of its fragments
    is a name of its own (find_by_names);
  * a blank cell falls back to the entry's own titles, looked up the same
    way - the entry's own alt column is split into its names too;
  * nothing found -> a franchise is created, typed for the media
    (see FRANCHISE_TYPE_FOR), carrying whatever names were available.

Families
  * FRANCHISE_FAMILY_FOR_TYPE (app/utils/constants.py) sorts franchise types
    into families; an unlisted type is mainstream. Name matching runs only
    within the entry's own family, and a franchise named by id is checked by
    check_entry_franchise_family - both directions, so an h-comic never lands
    in a mainstream franchise and a mainstream entry never lands under one
    whose label hides it. H-Comic, Hentai and H-Game are one family
    (`restricted`), so a name written for any of the three matches a
    franchise of any of them: an h-game named like an existing H-Comic or
    Hentai franchise attaches to it rather than creating an H-Game one.

Series
  * a UUID passes through;
  * a non-empty string is looked up case-insensitively by name, each
    fragment of series_name_alt counting as one;
  * not found -> None. A series is never auto-created: a series is a
    deliberate grouping, a franchise is just the top of the tree.
"""

import logging
import uuid
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import and_, func, or_, true
from sqlalchemy.orm import Session

from app.database import get_taipei_now
from app.models import Franchise, Media, Series
from app.utils.constants import (
    FRANCHISE_FAMILY_FOR_TYPE,
    MAINSTREAM_FAMILY,
    FranchiseType,
)
from app.utils.name_normalize import names_of

logger = logging.getLogger(__name__)

NAME_KEYS = ("en", "cn", "roman", "jp", "alt")
FRANCHISE_NAME_COLUMNS = (
    Franchise.franchise_name_en,
    Franchise.franchise_name_cn,
    Franchise.franchise_name_roman,
    Franchise.franchise_name_jp,
    Franchise.franchise_name_alt,
)
SERIES_NAME_COLUMNS = (Series.series_name_en, Series.series_name_cn, Series.series_name_alt)

# Type stamped on an auto-created franchise, per media type. Anime franchises
# are typed Anime, whichever of anime, anime movie or series created them;
# manga franchises are typed Manga.
FRANCHISE_TYPE_FOR = {
    "anime": FranchiseType.ANIME,
    "anime-movie": FranchiseType.ANIME,
    "series": FranchiseType.ANIME,
    "movie": FranchiseType.MOVIE,
    "tv-show": FranchiseType.TV,
    "cartoon": FranchiseType.CARTOON,
    "manga": FranchiseType.MANGA,
    "novel": FranchiseType.NOVEL,
    "comic": FranchiseType.COMIC,
    "game": FranchiseType.GAME,
    "h-comic": FranchiseType.H_COMIC,
    "hentai": FranchiseType.HENTAI,
    "h-game": FranchiseType.H_GAME,
}


def franchise_type_tokens(value) -> list[str]:
    """A franchise's comma-separated franchise_type, as tokens."""
    raw = value.strip() if isinstance(value, str) else ""
    return [t.strip() for t in raw.split(",") if t.strip()]


# Not a franchise type: the one type anime and manga franchises shared before
# it split into Anime and Manga. A franchise_type restored from a Franchise tab
# that still carries it is split by split_acg_franchise_types.
RETIRED_ACG_TYPE = "ACG"

# The media types whose entries decide which half of ACG a franchise gets.
_ANIME_MEDIA_TYPES = ("anime", "anime-movie")
_MANGA_MEDIA_TYPES = ("manga",)


def acg_replacement(has_anime: bool, has_manga: bool) -> list[str]:
    """
    The franchise types an ACG token becomes: Anime for a franchise holding
    any anime or anime movie, Manga for one holding any manga, both for one
    holding both, and Anime for one holding neither - ACG was what anime and
    series creation stamped.
    """
    out = []
    if has_anime or not has_manga:
        out.append(FranchiseType.ANIME.value)
    if has_manga:
        out.append(FranchiseType.MANGA.value)
    return out


def split_acg_franchise_type(value, has_anime: bool, has_manga: bool):
    """
    One franchise_type value with its ACG token split (acg_replacement).

    Token-wise inside the comma list: the other tokens keep their order and
    the separators their spacing, the replacement takes the ACG token's place,
    and a type the value already names is not listed twice. "Anime Movie" is
    its own type and is left alone. Anything that is not a string passes
    through.
    """
    if not isinstance(value, str):
        return value
    pieces = value.split(",")
    if RETIRED_ACG_TYPE not in (p.strip() for p in pieces):
        return value
    # Two tokens written for one: spaced like the value's own separators.
    sep = "," if len(pieces) > 1 and not any(
        p[:1].isspace() for p in pieces[1:]
    ) else ", "
    present = {p.strip() for p in pieces}
    replacement = [
        t for t in acg_replacement(has_anime, has_manga) if t not in present
    ]
    out: list[str] = []
    replaced = False
    for piece in pieces:
        if piece.strip() != RETIRED_ACG_TYPE:
            out.append(piece)
            continue
        if replaced or not replacement:
            continue
        replaced = True
        lead = piece[: len(piece) - len(piece.lstrip())]
        out.append(lead + sep.join(replacement))
    if out:
        out[0] = out[0].lstrip()
    return ",".join(out)


def split_acg_franchise_types(db: Session) -> Dict[str, int]:
    """
    Retypes every franchise still carrying the retired ACG type, by the
    entries it holds (split_acg_franchise_type). A type_covers choice filed
    under ACG moves to the type of the entry it names - Anime for an anime or
    an anime movie, Manga for a manga, otherwise the first type ACG became -
    and never overwrites a choice already made for that type.

    The same rule as the revision that split the type (a1n2imanga4); this is
    the copy a Pull runs, since a sheet backed up before the split still says
    ACG. It must run after the entries have restored, or every franchise
    comes out Anime. Idempotent. Commits nothing; the caller does. Returns
    franchises_split and how many became anime, manga and both.
    """
    counts = {"franchises_split": 0, "anime": 0, "manga": 0, "both": 0}
    rows = (
        db.query(Franchise)
        .filter(
            or_(
                Franchise.franchise_type.like(f"%{RETIRED_ACG_TYPE}%"),
                Franchise.type_covers.has_key(RETIRED_ACG_TYPE),
            )
        )
        .all()
    )
    rows = [
        f
        for f in rows
        if RETIRED_ACG_TYPE in franchise_type_tokens(f.franchise_type)
        or RETIRED_ACG_TYPE in (f.type_covers or {})
    ]
    if not rows:
        return counts

    held: Dict[Any, set] = {}
    for franchise_id, media_type in (
        db.query(Media.franchise_id, Media.media_type)
        .filter(Media.franchise_id.in_([f.system_id for f in rows]))
        .distinct()
        .all()
    ):
        held.setdefault(franchise_id, set()).add(media_type)

    for franchise in rows:
        types = held.get(franchise.system_id, set())
        has_anime = bool(types.intersection(_ANIME_MEDIA_TYPES))
        has_manga = bool(types.intersection(_MANGA_MEDIA_TYPES))
        if RETIRED_ACG_TYPE in franchise_type_tokens(franchise.franchise_type):
            franchise.franchise_type = split_acg_franchise_type(
                franchise.franchise_type, has_anime, has_manga
            )
            counts["franchises_split"] += 1
            if has_anime and has_manga:
                counts["both"] += 1
            elif has_manga:
                counts["manga"] += 1
            else:
                counts["anime"] += 1
        covers = dict(franchise.type_covers or {})
        if RETIRED_ACG_TYPE in covers:
            chosen = covers.pop(RETIRED_ACG_TYPE)
            target = _cover_type(db, chosen) or acg_replacement(has_anime, has_manga)[0]
            covers.setdefault(target, chosen)
            franchise.type_covers = covers or None
    db.flush()
    logger.info("Split the ACG franchise type: %s", counts)
    return counts


def _cover_type(db: Session, entry_id) -> Optional[str]:
    """The half of ACG a type_covers entry id belongs to, or None."""
    try:
        media_id = uuid.UUID(str(entry_id))
    except (TypeError, ValueError):
        return None
    media_type = (
        db.query(Media.media_type).filter(Media.system_id == media_id).scalar()
    )
    if media_type in _ANIME_MEDIA_TYPES:
        return FranchiseType.ANIME.value
    if media_type in _MANGA_MEDIA_TYPES:
        return FranchiseType.MANGA.value
    return None


def family_of_type(franchise_type: str) -> str:
    """The family one franchise type belongs to; unlisted is mainstream."""
    return FRANCHISE_FAMILY_FOR_TYPE.get(franchise_type, MAINSTREAM_FAMILY)


def franchise_families(franchise_type) -> frozenset[str]:
    """The families a franchise_type value spans. Untyped is mainstream."""
    tokens = franchise_type_tokens(franchise_type)
    if not tokens:
        return frozenset({MAINSTREAM_FAMILY})
    return frozenset(family_of_type(t) for t in tokens)


def entry_family(media_type: str) -> str:
    """The family of the franchise type this media type stamps."""
    return family_of_type(str(FRANCHISE_TYPE_FOR[media_type].value))


def check_franchise_type_family(franchise_type) -> None:
    """ValueError when a franchise_type value spans two families."""
    families = franchise_families(franchise_type)
    if len(families) > 1:
        raise ValueError(
            "A franchise's types must all belong to one family; "
            f"'{franchise_type}' mixes {', '.join(sorted(families))}."
        )


def check_franchise_entries_family(db: Session, franchise_id: Any, franchise_type) -> None:
    """
    ValueError when retyping a franchise would put it in another family than
    an entry it already holds - the franchise-side way of landing a mainstream
    entry under a gated franchise.
    """
    wanted = franchise_families(franchise_type)
    held = {
        media_type
        for (media_type,) in db.query(Media.media_type)
        .filter(Media.franchise_id == franchise_id)
        .distinct()
    }
    foreign = sorted(t for t in held if {entry_family(t)} != wanted)
    if foreign:
        raise ValueError(
            f"'{franchise_type}' is another family than the entries this "
            f"franchise holds ({', '.join(foreign)})."
        )


def check_entry_franchise_family(db: Session, franchise_id: Any, media_type: str) -> None:
    """
    ValueError when a franchise named by id belongs to another family than
    the entry. The name resolver never matches one; this is the other way in.
    A string that is not a UUID is a name, and so the resolver's business.
    """
    if not franchise_id:
        return
    if isinstance(franchise_id, str):
        try:
            franchise_id = uuid.UUID(franchise_id)
        except ValueError:
            return
    franchise = db.get(Franchise, franchise_id)
    if franchise is None:
        return
    wanted = entry_family(media_type)
    if franchise_families(franchise.franchise_type) != {wanted}:
        raise ValueError(
            f"A {media_type} can only sit in a franchise of the '{wanted}' family."
        )


def _clean_names(names: Dict[str, Any]) -> Dict[str, Optional[str]]:
    out = {}
    for key in NAME_KEYS:
        value = names.get(key)
        out[key] = str(value).strip() if value and str(value).strip() else None
    return out


def find_by_names(db: Session, model, columns, values, *criteria) -> Optional[Any]:
    """
    The first `model` row passing `criteria` that holds one of `values` as a
    name in one of `columns`, compared case-insensitively and exactly - a
    name is never a pattern, so `%` and `_` in it are literal.

    An `*_alt` column is a comma-separated list, and a name matches when it
    is any one of its fragments (names_of); the column's whole value is not
    one of its names. The SQL only narrows to rows where some column
    CONTAINS a wanted name - a superset, so a Pull resolving a franchise per
    row does not load every franchise into Python each time; names_of
    decides.
    """
    wanted = {str(v).strip().lower() for v in values if v and str(v).strip()}
    if not wanted:
        return None
    fields = [column.key for column in columns]
    contains = or_(*[c.icontains(v, autoescape=True) for c in columns for v in wanted])
    for row in db.query(model).filter(contains, *criteria):
        if any(name.lower() in wanted for name in names_of(row, fields)):
            return row
    return None


def _has_type(franchise_type: str):
    """
    franchise_type contains this one type, as a whole token. franchise_type
    is a comma-separated list, so the test is on the padded token rather
    than a substring: "H-Comic" must not match inside some longer type name.
    """
    padded = func.concat(
        ",", func.replace(func.coalesce(Franchise.franchise_type, ""), " ", ""), ","
    )
    return padded.like(f"%,{franchise_type.replace(' ', '')},%")


def _segregation(media_type: str):
    """The franchise-type condition name matching runs under for this type:
    a franchise of the entry's own family and of no other."""
    if media_type == "series":
        # A series names its parent franchise; it is not a work of any type,
        # and a gated series belongs under a gated franchise.
        return true()
    family = entry_family(media_type)
    foreign = [_has_type(t) for t, f in FRANCHISE_FAMILY_FOR_TYPE.items() if f != family]
    not_foreign = ~or_(*foreign) if foreign else true()
    if family == MAINSTREAM_FAMILY:
        return not_foreign
    own = [_has_type(t) for t, f in FRANCHISE_FAMILY_FOR_TYPE.items() if f == family]
    return and_(or_(*own), not_foreign)


def resolve_franchise(db: Session, franchise_id: Any, names: Dict[str, Any], media_type: str) -> Any:
    """See the module docstring. Returns a franchise system_id."""
    if franchise_id and not isinstance(franchise_id, str):
        return franchise_id

    label = media_type.replace("-", " ").title()
    cell = franchise_id.strip() if isinstance(franchise_id, str) else ""
    names = {"en": cell} if cell else _clean_names(names)

    existing = find_by_names(
        db, Franchise, FRANCHISE_NAME_COLUMNS, names_of(names, NAME_KEYS), _segregation(media_type)
    )
    if existing:
        logger.info("Auto-resolved existing Franchise for %s: %s", label, existing.system_id)
        return existing.system_id

    if not any(names.values()):
        return None

    created = Franchise(
        system_id=str(uuid.uuid4()),
        franchise_type=FRANCHISE_TYPE_FOR[media_type],
        franchise_name_en=names.get("en"),
        franchise_name_cn=names.get("cn"),
        franchise_name_roman=names.get("roman"),
        franchise_name_jp=names.get("jp"),
        franchise_name_alt=names.get("alt"),
        created_at=get_taipei_now(),
        updated_at=get_taipei_now(),
    )
    db.add(created)
    db.flush()
    # A gated type's franchise carries its label from birth; a no-op for
    # every other type. Imported here: this module is loaded while
    # app.services.domain is still initialising.
    from app.services.domain.gated_labels import ensure_franchise_labels

    ensure_franchise_labels(db, created)
    logger.info("Auto-created missing Franchise for %s: %s", label, created.system_id)
    return created.system_id


def resolve_series(db: Session, series_id: Any, media_type: str) -> Any:
    """See the module docstring. Returns a series system_id or None."""
    if not isinstance(series_id, str):
        return series_id
    name = series_id.strip()
    if not name:
        return None
    existing = find_by_names(db, Series, SERIES_NAME_COLUMNS, [name])
    if existing:
        return existing.system_id
    logger.warning("Could not resolve Series by name %r for %s; setting to null.", name, media_type)
    return None


def _entry_resolver(media_type: str):
    def resolve(db: Session, franchise_id: Any, series_id: Any, names: Dict[str, Any]) -> Tuple[Any, Any]:
        return (
            resolve_franchise(db, franchise_id, names, media_type),
            resolve_series(db, series_id, media_type),
        )

    resolve.__name__ = f"resolve_{media_type.replace('-', '_')}_parent_hierarchy"
    resolve.__doc__ = f"(franchise_id, series_id) for a {media_type} entry - see module docstring."
    return resolve


resolve_anime_parent_hierarchy = _entry_resolver("anime")
resolve_movie_parent_hierarchy = _entry_resolver("movie")
resolve_tv_show_parent_hierarchy = _entry_resolver("tv-show")
resolve_cartoon_parent_hierarchy = _entry_resolver("cartoon")
resolve_manga_parent_hierarchy = _entry_resolver("manga")
resolve_novel_parent_hierarchy = _entry_resolver("novel")
resolve_comic_parent_hierarchy = _entry_resolver("comic")
resolve_game_parent_hierarchy = _entry_resolver("game")
resolve_h_comic_parent_hierarchy = _entry_resolver("h-comic")
resolve_hentai_parent_hierarchy = _entry_resolver("hentai")
resolve_h_game_parent_hierarchy = _entry_resolver("h-game")


def resolve_anime_movie_parent_hierarchy(db: Session, franchise_id: Any, names: Dict[str, Any]) -> Any:
    """Franchise only: anime_movies has no series_id column."""
    return resolve_franchise(db, franchise_id, names, "anime-movie")


def resolve_series_parent_hierarchy(db: Session, franchise_id: Any, names: Dict[str, Any]) -> Any:
    """The franchise a Series entry belongs to, found or created from the series' own names."""
    return resolve_franchise(db, franchise_id, names, "series")
