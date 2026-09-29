"""
What a character or person card shows beyond its own columns, for one viewer:
the picture, the media types it appears in, and whether any of them is gated.

Resolved for a whole page at once. Every query here is per page or per media
type, never per row, so the library lists cost the same with 5 rows as with
500 (tests/api/test_entity_photos.py counts them).

Only entries the viewer may see are ever used - the same filter_visible_pairs
pass /entries and casting_count / credit_count already go through, so a card
can never show the cover of an entry its own page would not list.

Character picture, first hit wins. A casting photo is how the character
looks in that entry, so it beats the entry's cover at every step:

  1. character.photo_file
  2. the chosen photo_fallback_entry_id entry's casting photo_file - only
     while the character is still cast on it and it is visible
  3. that chosen entry's cover, when its casting has no photo
  4. the newest visible casting photo_file of this character
  5. the newest visible cast entry that has a cover
  6. None - the SPA draws its placeholder

Person picture - a casting photo is a character's picture, so it has no
casting steps:

  1. person.photo_file
  2. the chosen entry's cover, while the person is credited on it (or voices
     a character cast on it) and it is visible
  3. the newest visible credited/voiced entry that has a cover
  4. None

"Newest" is /entries' order: the entry's primary release date, descending,
undated last; ties keep casting/credit position order. A chosen id that no
longer names a visible linked entry - deleted, un-cast, or hidden from this
viewer - falls through to the automatic steps without complaint.
"""

from dataclasses import dataclass, field
from typing import Iterable, Optional, Sequence
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.services.rbac.enforcement import filter_visible_pairs
from app.services.rbac.gated_types import gated_types
from app.utils.media_resolver import MEDIA_TABLES
from app.utils.release_date import RELEASE_PRIORITY


@dataclass(frozen=True)
class EntityMedia:
    """One character's or person's viewer-resolved card fields."""

    display_photo_file: Optional[str] = None
    media_types: list[str] = field(default_factory=list)
    restricted: bool = False
    # Visible linked entries, counted the way casting_count / credit_count
    # always have been: one per distinct (media_type, entry_id) pair.
    count: int = 0
    # The stored photo_fallback_entry_id when it names a visible linked entry,
    # else None - a viewer is not handed the id of an entry it cannot see.
    photo_fallback_entry_id: Optional[UUID] = None


@dataclass(frozen=True)
class _Link:
    media_type: str
    entry_id: UUID
    photo_file: Optional[str] = None


def _entry_facts(
    db: Session, pairs: Iterable[tuple[str, UUID]]
) -> tuple[dict[UUID, Optional[str]], dict[UUID, str]]:
    """
    ({entry_id: cover}, {entry_id: primary release value}) for `pairs`.

    One query for every cover (they live on the media supertable) and one per
    media type for release dates (they live on the detail tables, under
    per-type column names).
    """
    by_type: dict[str, set[UUID]] = {}
    for media_type, entry_id in pairs:
        if media_type in MEDIA_TABLES:
            by_type.setdefault(media_type, set()).add(entry_id)
    ids = {entry_id for group in by_type.values() for entry_id in group}
    if not ids:
        return {}, {}

    covers = dict(
        db.query(models.Media.system_id, models.Media.cover_image_file)
        .filter(models.Media.system_id.in_(ids))
        .all()
    )
    released: dict[UUID, str] = {}
    for media_type, type_ids in by_type.items():
        model = MEDIA_TABLES[media_type].model
        columns = [
            getattr(model, name)
            for name in RELEASE_PRIORITY.get(media_type, ())
            if hasattr(model, name)
        ]
        if not columns:
            continue
        for system_id, *values in (
            db.query(model.system_id, *columns)
            .filter(model.system_id.in_(type_ids))
            .all()
        ):
            value = next((v for v in values if v), None)
            if value:
                released[system_id] = value
    return covers, released


def _newest_first(links: list[_Link], released: dict[UUID, str]) -> list[_Link]:
    # sorted() is stable, so equal dates keep position order.
    return sorted(links, key=lambda link: released.get(link.entry_id, ""), reverse=True)


def _first_picture(
    links: list[_Link], covers: dict[UUID, Optional[str]], use_casting_photos: bool
) -> Optional[str]:
    """The first casting photo in `links`, else the first entry cover."""
    if use_casting_photos:
        photo = next((link.photo_file for link in links if link.photo_file), None)
        if photo:
            return photo
    return next(
        (covers[link.entry_id] for link in links if covers.get(link.entry_id)), None
    )


def _summarise(
    links: list[_Link],
    visible: set[tuple[str, UUID]],
    own_photo: Optional[str],
    chosen: Optional[UUID],
    covers: dict[UUID, Optional[str]],
    released: dict[UUID, str],
    use_casting_photos: bool,
) -> EntityMedia:
    seen_pairs = {(link.media_type, link.entry_id) for link in links}
    shown = [
        link
        for link in links
        if (link.media_type, link.entry_id) in visible
        and link.media_type in MEDIA_TABLES
    ]
    media_types = sorted({link.media_type for link in shown})
    shown_ids = {link.entry_id for link in shown}
    chosen_visible = chosen if chosen in shown_ids else None

    photo = own_photo
    if not photo and chosen_visible is not None:
        chosen_links = [link for link in shown if link.entry_id == chosen_visible]
        photo = _first_picture(chosen_links, covers, use_casting_photos)
    if not photo:
        photo = _first_picture(
            _newest_first(shown, released), covers, use_casting_photos
        )

    return EntityMedia(
        display_photo_file=photo or None,
        media_types=media_types,
        restricted=bool(set(media_types) & gated_types()),
        count=len(seen_pairs & visible),
        photo_fallback_entry_id=chosen_visible,
    )


def _resolve(
    db: Session,
    viewer,
    entities: Sequence,
    links_by_entity: dict[UUID, list[_Link]],
    use_casting_photos: bool,
) -> dict[UUID, EntityMedia]:
    every_pair = {
        (link.media_type, link.entry_id)
        for links in links_by_entity.values()
        for link in links
    }
    visible = filter_visible_pairs(db, viewer, every_pair)
    covers, released = _entry_facts(db, visible)
    return {
        entity.system_id: _summarise(
            links_by_entity.get(entity.system_id, []),
            visible,
            entity.photo_file,
            entity.photo_fallback_entry_id,
            covers,
            released,
            use_casting_photos,
        )
        for entity in entities
    }


def character_media(
    db: Session, viewer, characters: Sequence[models.Character]
) -> dict[UUID, EntityMedia]:
    """{character.system_id: EntityMedia} for a page of characters."""
    ids = [c.system_id for c in characters]
    if not ids:
        return {}
    links: dict[UUID, list[_Link]] = {}
    for character_id, media_type, entry_id, photo_file in (
        db.query(
            models.CharacterCasting.character_id,
            models.CharacterCasting.media_type,
            models.CharacterCasting.entry_id,
            models.CharacterCasting.photo_file,
        )
        .filter(models.CharacterCasting.character_id.in_(ids))
        .order_by(models.CharacterCasting.position)
        .all()
    ):
        if media_type and entry_id:
            links.setdefault(character_id, []).append(
                _Link(media_type, entry_id, photo_file)
            )
    return _resolve(db, viewer, characters, links, use_casting_photos=True)


def person_media(
    db: Session, viewer, people: Sequence[models.Person]
) -> dict[UUID, EntityMedia]:
    """
    {person.system_id: EntityMedia} for a page of people.

    Both stores, as credit_count and /entries read them: media_credit, and
    character_casting for a seiyuu, who has no media_credit rows at all.
    """
    ids = [p.system_id for p in people]
    if not ids:
        return {}
    links: dict[UUID, list[_Link]] = {}
    credit_rows = (
        db.query(
            models.MediaCredit.person_id,
            models.Media.media_type,
            models.MediaCredit.media_id,
        )
        .join(models.Media, models.MediaCredit.media_id == models.Media.system_id)
        .filter(models.MediaCredit.person_id.in_(ids))
        .order_by(models.MediaCredit.position)
        .all()
    )
    casting_rows = (
        db.query(
            models.CharacterCasting.person_id,
            models.CharacterCasting.media_type,
            models.CharacterCasting.entry_id,
        )
        .filter(models.CharacterCasting.person_id.in_(ids))
        .order_by(models.CharacterCasting.position)
        .all()
    )
    for person_id, media_type, entry_id in list(credit_rows) + list(casting_rows):
        if media_type and entry_id:
            links.setdefault(person_id, []).append(_Link(media_type, entry_id))
    return _resolve(db, viewer, people, links, use_casting_photos=False)


def linked_entry_pairs(
    db: Session, model, system_id: UUID, entry_id: UUID
) -> set[tuple[str, UUID]]:
    """
    The (media_type, entry_id) pairs linking one character or person to one
    entry - empty when they are not linked. What PUT and PATCH check a
    photo_fallback_entry_id against.
    """
    pairs: set[tuple[str, UUID]] = set()
    if model is models.Character:
        column = models.CharacterCasting.character_id
    else:
        column = models.CharacterCasting.person_id
        pairs |= {
            (media_type, media_id)
            for media_type, media_id in db.query(
                models.Media.media_type, models.MediaCredit.media_id
            )
            .join(models.Media, models.MediaCredit.media_id == models.Media.system_id)
            .filter(
                models.MediaCredit.person_id == system_id,
                models.MediaCredit.media_id == entry_id,
            )
        }
    pairs |= {
        (media_type, eid)
        for media_type, eid in db.query(
            models.CharacterCasting.media_type, models.CharacterCasting.entry_id
        ).filter(column == system_id, models.CharacterCasting.entry_id == entry_id)
    }
    return pairs
