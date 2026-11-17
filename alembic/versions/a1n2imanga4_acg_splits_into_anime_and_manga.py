"""franchise: the "ACG" franchise type splits into "Anime" and "Manga"

`ACG` is not a franchise type any more: an anime franchise is typed `Anime`
and a manga franchise `Manga`, matching the media types. Each franchise
carrying an `ACG` token is retyped by what it holds - `Anime` for any anime or
anime movie entry, `Manga` for any manga entry, `Anime, Manga` for both, and
`Anime` for neither, since ACG was what anime and series creation stamped.

`franchise.franchise_type` is a comma-separated token list, so the rewrite is
token-wise: the replacement takes the ACG token's place, the other tokens keep
their order and the separators their spacing, and a type the value already
names is not listed twice. `Anime Movie` is its own token and is not touched.

`franchise.type_covers` is keyed by franchise type, so a cover chosen under
`ACG` moves to the type of the entry it names (Anime or Manga; otherwise the
first type the ACG token became), never over a choice already made there.

`franchise.type_slots` is NOT rewritten: its `ACG` key is the favourite
AniManga franchises grid's storage key (frontend/src/config/favoriteGrids.js),
not a franchise type, and a sheet backup carries it in that spelling.
`deleted_record.franchise_type` is a tombstone of what a deleted entry's
franchise was typed at the time, and is left as it was.

The downgrade folds every `Anime` and `Manga` token back into one `ACG`
(and their type_covers keys into an `ACG` key, Anime's choice first). That is
the vocabulary the previous revision expects: no franchise was typed `Anime`
or `Manga` before this one, because a1n2imeacg3 folded `Anime` onto `ACG` and
`Manga` was never offered. Only the split itself is forgotten.

Revision ID: a1n2imanga4
Revises: n1l2inkpairs3
Create Date: 2026-11-17 00:00:00.000000

"""

import json
import logging
from typing import Optional, Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "a1n2imanga4"
down_revision: Union[str, Sequence[str], None] = "n1l2inkpairs3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

ACG = "ACG"
ANIME = "Anime"
MANGA = "Manga"
ANIME_MEDIA_TYPES = ("anime", "anime-movie")
MANGA_MEDIA_TYPES = ("manga",)


def _replacement(has_anime: bool, has_manga: bool) -> list[str]:
    out = []
    if has_anime or not has_manga:
        out.append(ANIME)
    if has_manga:
        out.append(MANGA)
    return out


def split_value(value: Optional[str], has_anime: bool, has_manga: bool) -> Optional[str]:
    """
    One franchise_type value with its ACG token split.

    A copy of app.services.domain.hierarchy.split_acg_franchise_type, frozen
    here so the revision does not change when the app does.
    """
    if not isinstance(value, str):
        return value
    pieces = value.split(",")
    if ACG not in (p.strip() for p in pieces):
        return value
    sep = "," if len(pieces) > 1 and not any(p[:1].isspace() for p in pieces[1:]) else ", "
    present = {p.strip() for p in pieces}
    replacement = [t for t in _replacement(has_anime, has_manga) if t not in present]
    out: list[str] = []
    replaced = False
    for piece in pieces:
        if piece.strip() != ACG:
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


def fold_value(value: Optional[str]) -> Optional[str]:
    """One franchise_type value with its Anime and Manga tokens folded into one ACG."""
    if not isinstance(value, str):
        return value
    out: list[str] = []
    seen = False
    for piece in value.split(","):
        token = piece.strip()
        if token in (ANIME, MANGA, ACG):
            if seen:
                continue
            seen = True
            piece = piece.replace(token, ACG)
        out.append(piece)
    if out:
        out[0] = out[0].lstrip()
    return ",".join(out)


def _covers(raw) -> Optional[dict]:
    if raw is None:
        return None
    if isinstance(raw, str):
        raw = json.loads(raw)
    return dict(raw)


def _write(bind, system_id, franchise_type, covers) -> None:
    bind.execute(
        sa.text(
            "UPDATE franchise SET franchise_type = :franchise_type, "
            "type_covers = CAST(:covers AS JSONB) WHERE system_id = :system_id"
        ),
        {
            "franchise_type": franchise_type,
            "covers": json.dumps(covers) if covers else None,
            "system_id": system_id,
        },
    )


def rewrite(bind) -> dict:
    """
    The data half of the upgrade, against any bind.

    Split out so tests can run the SHIPPED code against the test session.
    Returns how many franchises became anime, manga and both.
    """
    counts = {"anime": 0, "manga": 0, "both": 0, "covers_moved": 0}
    rows = bind.execute(
        sa.text(
            "SELECT system_id, franchise_type, type_covers FROM franchise "
            "WHERE franchise_type LIKE :pattern OR type_covers ? :key"
        ),
        {"pattern": f"%{ACG}%", "key": ACG},
    ).all()
    for system_id, franchise_type, raw_covers in rows:
        held = {
            media_type
            for (media_type,) in bind.execute(
                sa.text("SELECT DISTINCT media_type FROM media WHERE franchise_id = :id"),
                {"id": system_id},
            ).all()
        }
        has_anime = bool(held.intersection(ANIME_MEDIA_TYPES))
        has_manga = bool(held.intersection(MANGA_MEDIA_TYPES))

        new_type = split_value(franchise_type, has_anime, has_manga)
        if new_type != franchise_type:
            if has_anime and has_manga:
                counts["both"] += 1
            elif has_manga:
                counts["manga"] += 1
            else:
                counts["anime"] += 1

        covers = _covers(raw_covers)
        if covers and ACG in covers:
            chosen = covers.pop(ACG)
            chosen_type = bind.execute(
                sa.text("SELECT media_type FROM media WHERE CAST(system_id AS TEXT) = :id"),
                {"id": str(chosen)},
            ).scalar()
            if chosen_type in ANIME_MEDIA_TYPES:
                target = ANIME
            elif chosen_type in MANGA_MEDIA_TYPES:
                target = MANGA
            else:
                target = _replacement(has_anime, has_manga)[0]
            covers.setdefault(target, chosen)
            counts["covers_moved"] += 1

        if new_type != franchise_type or covers != _covers(raw_covers):
            _write(bind, system_id, new_type, covers)
    logger.info("Split the ACG franchise type: %s", counts)
    return counts


def fold(bind) -> dict:
    """The data half of the downgrade: Anime and Manga folded back into ACG."""
    counts = {"franchises_folded": 0}
    rows = bind.execute(
        sa.text(
            "SELECT system_id, franchise_type, type_covers FROM franchise "
            "WHERE franchise_type LIKE :anime_pattern OR franchise_type LIKE :manga_pattern "
            "OR type_covers ? :anime OR type_covers ? :manga"
        ),
        {
            "anime_pattern": f"%{ANIME}%",
            "manga_pattern": f"%{MANGA}%",
            "anime": ANIME,
            "manga": MANGA,
        },
    ).all()
    for system_id, franchise_type, raw_covers in rows:
        new_type = fold_value(franchise_type)
        covers = _covers(raw_covers)
        if covers:
            folded = [covers.pop(k) for k in (ANIME, MANGA) if k in covers]
            if folded:
                covers.setdefault(ACG, folded[0])
        if new_type != franchise_type or covers != _covers(raw_covers):
            _write(bind, system_id, new_type, covers)
            counts["franchises_folded"] += 1
    logger.info("Folded Anime and Manga back into ACG: %s", counts)
    return counts


def upgrade() -> None:
    rewrite(op.get_bind())


def downgrade() -> None:
    fold(op.get_bind())
