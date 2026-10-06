"""
Read and wholesale-replace one media entry's cast.

Owns the two operations app/routers/casting.py needs: `casting_rows` (bulk
read, positioned, with the display photo already resolved) and `replace_casting`
(delete-then-insert the whole set in payload order, each casting with its
voices), plus `fill_character_roles`, which gives a character with no role
of its own the role its castings give it. Validation that would otherwise surface as a raw IntegrityError from
ck_casting_voice_scope - a seiyuu on a manga/novel casting - is rejected here
in Python, before any row is written, so the constraint is a backstop rather
than the user-facing message.
"""

from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.utils.character_roles import CHARACTER_ROLES

# The ACG media types character_casting.media_type may hold - a subset of
# MEDIA_TABLES. h-comic casts real character rows like manga does (D6); it has
# no voice acting, so ck_casting_voice_scope already refuses a seiyuu there.
# hentai is animated, so it is cast the way anime is, seiyuu included.
CASTING_MEDIA_TYPES: tuple[str, ...] = (
    "anime", "anime-movie", "manga", "novel", "h-comic", "hentai",
)

# Media types a seiyuu (person_id) may be attached to - the ones with voice
# acting. Mirrors ck_casting_voice_scope exactly.
VOICED_MEDIA_TYPES: tuple[str, ...] = ("anime", "anime-movie", "hentai")


class CastingValidationError(ValueError):
    """A casting payload failed a rule the CHECK constraint would also catch."""


def casting_rows(db: Session, media_type: str, entry_id: UUID) -> list[dict]:
    """
    One entry's cast, ordered by position, each row with its voices in order.

    Bulk-loads the voices, characters and people in a fixed number of queries,
    regardless of cast size - not one per row - then resolves display_photo_file
    here (the casting's own value, falling back to the identity's, then the
    character's) so every reader gets the same answer without repeating the
    fallback. photo_file stays the row's own value so an editor round trip
    never freezes the resolved picture into the row.
    """
    castings = (
        db.query(models.CharacterCasting)
        .filter(
            models.CharacterCasting.media_type == media_type,
            models.CharacterCasting.entry_id == entry_id,
        )
        .order_by(models.CharacterCasting.position)
        .all()
    )
    if not castings:
        return []

    character_ids = {c.character_id for c in castings}
    characters = {
        c.system_id: c
        for c in db.query(models.Character).filter(
            models.Character.system_id.in_(character_ids)
        )
    }

    identity_ids = {c.identity_id for c in castings if c.identity_id}
    identities = (
        {
            i.system_id: i
            for i in db.query(models.CharacterIdentity).filter(
                models.CharacterIdentity.system_id.in_(identity_ids)
            )
        }
        if identity_ids
        else {}
    )

    voices = (
        db.query(models.CharacterCastingVoice)
        .filter(
            models.CharacterCastingVoice.media_type == media_type,
            models.CharacterCastingVoice.entry_id == entry_id,
        )
        .order_by(models.CharacterCastingVoice.position)
        .all()
    )
    person_ids = {v.person_id for v in voices}
    people = (
        {
            p.system_id: p
            for p in db.query(models.Person).filter(
                models.Person.system_id.in_(person_ids)
            )
        }
        if person_ids
        else {}
    )
    voices_by_casting: dict[UUID, list[dict]] = {}
    for voice in voices:
        person = people.get(voice.person_id)
        voices_by_casting.setdefault(voice.casting_id, []).append(
            {
                "person_id": str(voice.person_id),
                "person_public_id": person.public_id if person else None,
                "person_name": person.display_name if person else None,
                "remark": voice.remark,
            }
        )

    rows = []
    for casting in castings:
        character = characters.get(casting.character_id)
        identity = identities.get(casting.identity_id) if casting.identity_id else None
        # The display photo: the row's own, then the identity's, then the
        # character's; the focus travels with whichever photo won.
        if casting.photo_file:
            display_file, display_focus = casting.photo_file, casting.photo_focus
        elif identity is not None and identity.photo_file:
            display_file, display_focus = identity.photo_file, identity.photo_focus
        elif character is not None:
            display_file, display_focus = character.photo_file, character.photo_focus
        else:
            display_file = display_focus = None
        rows.append(
            {
                "system_id": str(casting.system_id),
                "character_id": str(casting.character_id),
                # The public ids ride along so the cast table can link to the
                # character and the seiyuu the same way every other link is
                # built - from a public_id, not the UUID.
                "character_public_id": character.public_id if character else None,
                "character_name": character.display_name if character else None,
                "identity_id": str(casting.identity_id) if casting.identity_id else None,
                "identity_name": identity.display_name if identity else None,
                "voices": voices_by_casting.get(casting.system_id, []),
                "role": casting.role,
                "position": casting.position,
                # The row's OWN photo (null when it has none) - what the cast
                # editor loads and sends back - and the resolved pair readers
                # display.
                "photo_file": casting.photo_file,
                "photo_focus": casting.photo_focus,
                "display_photo_file": display_file,
                "display_photo_focus": display_focus,
                "remark": casting.remark,
            }
        )
    return rows


def _validate_row(media_type: str, row: dict) -> None:
    voices = row.get("voices") or []
    if voices and media_type not in VOICED_MEDIA_TYPES:
        raise CastingValidationError(
            f"A seiyuu cannot be cast on a {media_type} entry."
        )
    seen: set = set()
    for voice in voices:
        if voice["person_id"] in seen:
            raise CastingValidationError(
                f"Person {voice['person_id']} voices the same character twice."
            )
        seen.add(voice["person_id"])
    role = row.get("role")
    if role is not None and role not in CHARACTER_ROLES:
        raise CastingValidationError(
            f"'{role}' is not a valid character role."
        )


def _validate_rows(db: Session, rows: list[dict]) -> None:
    """
    Payload-wide checks _validate_row cannot do row-by-row: a repeated
    (character_id, identity_id) (would violate uq_character_casting), and a
    character_id, identity_id or voice person_id that does not exist (would
    violate a FK). Each check runs as ONE query over every id the payload
    names, not one query per row - CastEditor can hand this a cast list of any
    size.
    """
    character_ids = [row["character_id"] for row in rows if row.get("character_id")]
    seen: set = set()
    for row in rows:
        if not row.get("character_id"):
            continue
        key = (row["character_id"], row.get("identity_id"))
        if key in seen:
            raise CastingValidationError(
                f"Character {row['character_id']} is cast twice as the same "
                "identity in the same payload."
            )
        seen.add(key)

    if character_ids:
        found = {
            c.system_id
            for c in db.query(models.Character.system_id).filter(
                models.Character.system_id.in_(set(character_ids))
            )
        }
        missing = set(character_ids) - found
        if missing:
            raise CastingValidationError(
                f"Unknown character id: {sorted(str(m) for m in missing)[0]}."
            )

    wanted = {
        (row["identity_id"], row["character_id"])
        for row in rows
        if row.get("identity_id")
    }
    if wanted:
        owners = {
            i.system_id: i.character_id
            for i in db.query(
                models.CharacterIdentity.system_id,
                models.CharacterIdentity.character_id,
            ).filter(
                models.CharacterIdentity.system_id.in_({w[0] for w in wanted})
            )
        }
        for identity_id, character_id in sorted(wanted, key=str):
            if identity_id not in owners:
                raise CastingValidationError(f"Unknown identity id: {identity_id}.")
            if owners[identity_id] != character_id:
                raise CastingValidationError(
                    f"Identity {identity_id} does not belong to character "
                    f"{character_id}."
                )

    person_ids = {
        voice["person_id"] for row in rows for voice in row.get("voices") or []
    }
    if person_ids:
        found = {
            p.system_id
            for p in db.query(models.Person.system_id).filter(
                models.Person.system_id.in_(person_ids)
            )
        }
        missing = person_ids - found
        if missing:
            raise CastingValidationError(
                f"Unknown person id: {sorted(str(m) for m in missing)[0]}."
            )


def replace_casting(
    db: Session, media_type: str, entry_id: UUID, rows: list[dict]
) -> None:
    """
    Deletes an entry's existing castings and inserts `rows` in order. Each
    row's `voices` are inserted beneath it in their own order; the old voices
    go with the old castings, by fk_casting_voice_casting's ON DELETE CASCADE.

    `position` is taken from list index when a row omits it, so callers may
    submit an ordered list without stamping positions themselves. Raises
    CastingValidationError - mapped to a 422 by the router - for a media type
    outside CASTING_MEDIA_TYPES, a seiyuu on a non-voiced media type, a role
    outside CHARACTER_ROLES, a (character, identity) repeated within the payload,
    an identity that is unknown or belongs to another character, a
    character_id/person_id that does not exist, a person voicing one casting
    twice, so a CHECK or FK violation is
    never the first line of defense - and never a generic 500.

    A character in `rows` with no role of its own then takes one from its
    castings - see fill_character_roles.
    """
    if media_type not in CASTING_MEDIA_TYPES:
        raise CastingValidationError(f"Unknown casting media type: {media_type}")

    for row in rows:
        _validate_row(media_type, row)
    _validate_rows(db, rows)

    db.query(models.CharacterCasting).filter(
        models.CharacterCasting.media_type == media_type,
        models.CharacterCasting.entry_id == entry_id,
    ).delete(synchronize_session=False)

    for index, row in enumerate(rows):
        casting = models.CharacterCasting(
            character_id=row["character_id"],
            identity_id=row.get("identity_id"),
            media_type=media_type,
            entry_id=entry_id,
            role=row.get("role"),
            position=row.get("position", index),
            photo_file=row.get("photo_file"),
            photo_focus=row.get("photo_focus"),
            remark=row.get("remark"),
        )
        casting.voices = [
            models.CharacterCastingVoice(
                media_type=media_type,
                entry_id=entry_id,
                person_id=voice["person_id"],
                position=voice_index,
                remark=voice.get("remark"),
            )
            for voice_index, voice in enumerate(row.get("voices") or [])
        ]
        db.add(casting)

    db.flush()
    fill_character_roles(db, [row["character_id"] for row in rows])


def fill_character_roles(
    db: Session, character_ids: Optional[Iterable[UUID]] = None
) -> int:
    """
    Gives every character whose own `role` is NULL the highest-ranked role
    (CHARACTER_ROLES order, Main first) any of its castings carries, and
    returns how many it filled. `character_ids` narrows it to those
    characters; None means all of them.

    Fill-only: a character that already has a role keeps it, whatever its
    castings say, so an admin's choice is never overwritten. The cost is that
    clearing a character's role does not stick while a casting still names
    one - the next cast save or Calculate fills it again.
    """
    query = (
        db.query(models.Character, models.CharacterCasting.role)
        .join(
            models.CharacterCasting,
            models.CharacterCasting.character_id == models.Character.system_id,
        )
        .filter(
            models.Character.role.is_(None),
            models.CharacterCasting.role.in_(CHARACTER_ROLES),
        )
    )
    if character_ids is not None:
        ids = list(character_ids)
        if not ids:
            return 0
        query = query.filter(models.Character.system_id.in_(ids))

    best: dict[UUID, tuple[models.Character, str]] = {}
    for character, role in query:
        held = best.get(character.system_id)
        if held is None or CHARACTER_ROLES.index(role) < CHARACTER_ROLES.index(held[1]):
            best[character.system_id] = (character, role)
    for character, role in best.values():
        character.role = role
    return len(best)
