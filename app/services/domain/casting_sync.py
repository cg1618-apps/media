"""
Keep cast rows and the character records they cast in step.

A cast row's ORIGINAL is the record it casts: the character's identity when
the row names one, otherwise the character itself. Remark and role come from
it - an identity has no role of its own, so the character's stands in. The
original's seiyuu are not a column anywhere: a seiyuu belongs to a
performance, so they are read from the same character-and-identity's OTHER
voiced cast rows - the voice list used most often, ties to the oldest row.
The original's photo needs no copying at all: a cast row with no photo of
its own already shows the identity's or the character's (casting_rows).

Three operations:

- `cast_originals` - what each cast row's original says, for the cast editor's
  "Sync from original" buttons, which REPLACE the row's values with it in the
  form. A value the original does not have leaves the row's alone; the photo
  is always cleared, back to the fallback.
- `sync_character_from_cast` - the character page's "Sync from cast": one cast
  row's role, remark and photo replace the character's (or its identity's).
- `fill_cast_and_characters` - the fill-only, both-ways pass Calculate All
  runs. Empty character fields take their cast rows' values first, then empty
  cast fields take their originals', so one run converges and a second
  changes nothing. Nothing that holds a value is overwritten.
"""

from collections import Counter
from datetime import datetime
from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy.orm import Session, selectinload

from app import models
from app.services.domain.casting import VOICED_MEDIA_TYPES, fill_character_roles
from app.utils.character_roles import CHARACTER_ROLES

# (character_id, identity_id) - identity_id None is the main identity.
Pair = tuple[UUID, Optional[UUID]]


def _blank(value: Optional[str]) -> bool:
    return value is None or not value.strip()


def _role_rank(role: Optional[str]) -> int:
    """CHARACTER_ROLES order, Main first; no role ranks last."""
    return CHARACTER_ROLES.index(role) if role in CHARACTER_ROLES else len(CHARACTER_ROLES)


def _created(casting: models.CharacterCasting) -> datetime:
    return casting.created_at or datetime.max


def _best_voices(castings: Iterable[models.CharacterCasting]) -> list[dict]:
    """
    The voice list used most often across `castings`, as [{person_id,
    remark}], taken from the oldest row that uses it. A row with no voices
    does not vote. Two lists used equally often go to the one whose oldest
    row is older. [] when no row has a voice.
    """
    voiced = [c for c in castings if c.voices]
    if not voiced:
        return []
    by_key: dict[tuple, list[models.CharacterCasting]] = {}
    for casting in voiced:
        key = tuple(v.person_id for v in casting.voices)
        by_key.setdefault(key, []).append(casting)
    counts = Counter({key: len(rows) for key, rows in by_key.items()})
    best_key = min(
        by_key,
        key=lambda k: (-counts[k], min(_created(c) for c in by_key[k])),
    )
    source = min(by_key[best_key], key=_created)
    return [{"person_id": v.person_id, "remark": v.remark} for v in source.voices]


def _voiced_castings_by_pair(
    db: Session, pairs: Iterable[Pair]
) -> dict[Pair, list[models.CharacterCasting]]:
    """Every voiced-type cast row of `pairs`' characters, grouped by pair."""
    character_ids = {character_id for character_id, _ in pairs}
    if not character_ids:
        return {}
    rows = (
        db.query(models.CharacterCasting)
        .options(selectinload(models.CharacterCasting.voices))
        .filter(
            models.CharacterCasting.character_id.in_(character_ids),
            models.CharacterCasting.media_type.in_(VOICED_MEDIA_TYPES),
        )
        .all()
    )
    grouped: dict[Pair, list[models.CharacterCasting]] = {}
    for row in rows:
        grouped.setdefault((row.character_id, row.identity_id), []).append(row)
    return grouped


def cast_originals(
    db: Session,
    media_type: str,
    entry_id: Optional[UUID],
    pairs: list[Pair],
    visible_pairs: Optional[set[tuple[str, UUID]]] = None,
) -> list[dict]:
    """
    What each (character, identity) in `pairs` would be synced to on an entry
    of `media_type`, in `pairs`' order.

    The seiyuu are read from the pair's cast rows on OTHER entries - `entry_id`
    is left out, so the row being edited never votes for itself - and only on
    a voiced media type; elsewhere `voices` is []. `visible_pairs`, when given,
    is the (media_type, entry_id) set a caller may read: a cast row on any
    other entry does not vote, so its seiyuu cannot surface here.
    """
    character_ids = {c for c, _ in pairs}
    identity_ids = {i for _, i in pairs if i}
    characters = {
        c.system_id: c
        for c in db.query(models.Character).filter(
            models.Character.system_id.in_(character_ids)
        )
    } if character_ids else {}
    identities = {
        i.system_id: i
        for i in db.query(models.CharacterIdentity).filter(
            models.CharacterIdentity.system_id.in_(identity_ids)
        )
    } if identity_ids else {}

    voiced = media_type in VOICED_MEDIA_TYPES
    sources = _voiced_castings_by_pair(db, pairs) if voiced else {}
    chosen: dict[Pair, list[dict]] = {}
    for pair in set(pairs):
        candidates = [
            c
            for c in sources.get(pair, [])
            if c.entry_id != entry_id
            and (visible_pairs is None or (c.media_type, c.entry_id) in visible_pairs)
        ]
        chosen[pair] = _best_voices(candidates)

    person_ids = {v["person_id"] for voices in chosen.values() for v in voices}
    people = {
        p.system_id: p
        for p in db.query(models.Person).filter(models.Person.system_id.in_(person_ids))
    } if person_ids else {}

    out = []
    for character_id, identity_id in pairs:
        character = characters.get(character_id)
        identity = identities.get(identity_id) if identity_id else None
        original = identity if identity is not None else character
        out.append(
            {
                "character_id": str(character_id),
                "identity_id": str(identity_id) if identity_id else None,
                # An identity has no role; the character's is the original's.
                "role": character.role if character else None,
                "remark": original.remark if original else None,
                "voices": [
                    {
                        "person_id": str(v["person_id"]),
                        "person_public_id": people[v["person_id"]].public_id,
                        "person_name": people[v["person_id"]].display_name,
                        "remark": v["remark"],
                    }
                    for v in chosen[(character_id, identity_id)]
                    if v["person_id"] in people
                ],
            }
        )
    return out


class CastSyncError(ValueError):
    """The cast row named is not one of this character's."""


def sync_character_from_cast(
    db: Session, character: models.Character, casting: models.CharacterCasting
) -> None:
    """
    Replaces the cast row's original with the row's values: the identity's
    remark and photo when the row names one, otherwise the character's role,
    remark and photo. A value the row does not hold - no role, a blank
    remark, no photo of its own - leaves the original's alone.
    """
    if casting.character_id != character.system_id:
        raise CastSyncError("That cast row is not one of this character's.")
    identity = (
        db.get(models.CharacterIdentity, casting.identity_id)
        if casting.identity_id
        else None
    )
    target = identity if identity is not None else character
    if identity is None and casting.role in CHARACTER_ROLES:
        character.role = casting.role
    if not _blank(casting.remark):
        target.remark = casting.remark
    if casting.photo_file:
        _set_photo(db, target, casting.photo_file, casting.photo_focus)


def _set_photo(db: Session, target, storage_key: str, focus: Optional[str]) -> None:
    """
    Point a character or identity at `storage_key`, as attaching that image
    would: the image_attachment row too when the key is a library image, so
    the Images page counts the use, and the column the readers use.
    """
    owner_type = (
        "character-identity"
        if isinstance(target, models.CharacterIdentity)
        else "character"
    )
    image = (
        db.query(models.Image)
        .filter(models.Image.storage_key == storage_key)
        .first()
    )
    if image is not None:
        attachment = (
            db.query(models.ImageAttachment)
            .filter(
                models.ImageAttachment.owner_type == owner_type,
                models.ImageAttachment.owner_id == target.system_id,
                models.ImageAttachment.role == "cover",
                models.ImageAttachment.position == 0,
            )
            .first()
        )
        if attachment is not None:
            attachment.image_id = image.system_id
        else:
            db.add(
                models.ImageAttachment(
                    image_id=image.system_id,
                    owner_type=owner_type,
                    owner_id=target.system_id,
                    role="cover",
                    position=0,
                )
            )
    target.photo_file = storage_key
    target.photo_focus = focus


def fill_cast_and_characters(db: Session) -> dict:
    """
    The fill-only sync, both ways, over every cast row; returns what it
    filled, by field.

    Cast rows to their originals first: an empty character role takes the
    highest-ranked role its rows carry (fill_character_roles), and an empty
    remark or photo on a character - or on an identity - takes the value of
    its highest-ranked row that has one, ties to the oldest. Only the rows
    casting that very record count: an identity's rows fill the identity,
    the main identity's fill the character.

    Then originals to cast rows: an empty role or remark takes the
    original's, and a voiced row with no seiyuu takes the original seiyuu.
    A cast row's photo is never filled - an empty one already shows the
    original's.
    """
    counts = {
        "character_role": fill_character_roles(db),
        "character_remark": 0,
        "character_photo": 0,
        "identity_remark": 0,
        "identity_photo": 0,
        "cast_role": 0,
        "cast_remark": 0,
        "cast_seiyuu": 0,
    }
    castings = (
        db.query(models.CharacterCasting)
        .options(selectinload(models.CharacterCasting.voices))
        .all()
    )
    if not castings:
        return counts

    characters = {
        c.system_id: c
        for c in db.query(models.Character).filter(
            models.Character.system_id.in_({c.character_id for c in castings})
        )
    }
    identity_ids = {c.identity_id for c in castings if c.identity_id}
    identities = {
        i.system_id: i
        for i in db.query(models.CharacterIdentity).filter(
            models.CharacterIdentity.system_id.in_(identity_ids)
        )
    } if identity_ids else {}

    by_pair: dict[Pair, list[models.CharacterCasting]] = {}
    for casting in castings:
        by_pair.setdefault((casting.character_id, casting.identity_id), []).append(casting)

    # Cast rows -> originals.
    for (character_id, identity_id), rows in by_pair.items():
        original = identities.get(identity_id) if identity_id else characters.get(character_id)
        if original is None:
            continue
        kind = "identity" if identity_id else "character"
        ranked = sorted(rows, key=lambda c: (_role_rank(c.role), _created(c)))
        if _blank(original.remark):
            source = next((c for c in ranked if not _blank(c.remark)), None)
            if source is not None:
                original.remark = source.remark
                counts[f"{kind}_remark"] += 1
        if not original.photo_file:
            source = next((c for c in ranked if c.photo_file), None)
            if source is not None:
                _set_photo(db, original, source.photo_file, source.photo_focus)
                counts[f"{kind}_photo"] += 1

    # Originals -> cast rows. The seiyuu are chosen per pair before any row is
    # filled, so the order rows are visited in cannot change the answer - and
    # a row with no voices never votes, so it never votes for itself.
    voices_by_pair = {
        pair: _best_voices(c for c in rows if c.media_type in VOICED_MEDIA_TYPES)
        for pair, rows in by_pair.items()
    }
    for casting in castings:
        character = characters.get(casting.character_id)
        if character is None:
            continue
        identity = identities.get(casting.identity_id) if casting.identity_id else None
        original = identity if identity is not None else character
        if casting.role is None and character.role in CHARACTER_ROLES:
            casting.role = character.role
            counts["cast_role"] += 1
        if _blank(casting.remark) and not _blank(original.remark):
            casting.remark = original.remark
            counts["cast_remark"] += 1
        if casting.media_type in VOICED_MEDIA_TYPES and not casting.voices:
            voices = voices_by_pair[(casting.character_id, casting.identity_id)]
            if voices:
                casting.voices = [
                    models.CharacterCastingVoice(
                        media_type=casting.media_type,
                        entry_id=casting.entry_id,
                        person_id=v["person_id"],
                        position=index,
                        remark=v["remark"],
                    )
                    for index, v in enumerate(voices)
                ]
                counts["cast_seiyuu"] += 1
    db.flush()
    return counts
