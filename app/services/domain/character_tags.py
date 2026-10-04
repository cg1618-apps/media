"""
A character's appearance and trait tags (`character_tag`).

The character-side twin of credits.replace_tags / tag_values: values resolve
through credits.resolve_option, so a value typed into the character form, one
restored from the sheet and one an admin added on the Options page all land on
the same system_option row, and a value that does not exist yet is created.

replace_character_tags is a whole-set replace for one field, for the same
reason replace_tags is: the form submits every value at once, so a replace is
the only way "the user removed one" can be expressed.
"""

from typing import Iterable, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.services.domain.credits import resolve_option
from app.utils.credit_roles import CHARACTER_TAG_FIELD_KEYS, CHARACTER_TAG_FIELDS
from app.utils.name_normalize import normalize_name, split_names


def clean_tag_values(values: Iterable[str]) -> list[str]:
    """Stripped, blanks dropped, duplicates (by normalize_name) folded to the first."""
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        stripped = (value or "").strip()
        key = normalize_name(stripped)
        if not stripped or not key or key in seen:
            continue
        seen.add(key)
        out.append(stripped)
    return out


def replace_character_tags(
    db: Session, character_id: UUID, field: str, values: list[str]
) -> None:
    """
    Make the character's tags for one field exactly `values`, in that order.

    Values are cleaned first, then each resolves to its option - created when
    missing, matched on the normalised key when not, so " twin tails" lands on
    an existing "Twin Tails". Two inputs that resolve to one option keep the
    first, since uq_character_tag_row allows a value once per field.
    """
    spec = CHARACTER_TAG_FIELDS[field]

    db.query(models.CharacterTag).filter_by(
        character_id=character_id, field=field
    ).delete(synchronize_session=False)

    placed: set[UUID] = set()
    for value in clean_tag_values(values):
        option = resolve_option(db, spec.category, value)
        if option.system_id in placed:
            continue
        placed.add(option.system_id)
        db.add(
            models.CharacterTag(
                character_id=character_id,
                field=field,
                option_id=option.system_id,
                position=len(placed) - 1,
            )
        )
    db.flush()


def pop_character_tags(data: dict) -> dict[str, Optional[list[str]]]:
    """
    The tag lists out of a Create or Update payload's model_dump(), popped so
    what remains is only columns - Character(**data) would TypeError on them.
    """
    return {field: data.pop(field, None) for field in CHARACTER_TAG_FIELD_KEYS}


def pop_patch_tags(payload: dict) -> dict[str, Optional[list[str]]]:
    """
    pop_character_tags for a PATCH body, which no schema has checked: 422 on a
    value that is neither null nor a list of strings.
    """
    tags = pop_character_tags(payload)
    for field, values in tags.items():
        if values is None:
            continue
        if not isinstance(values, list) or not all(
            isinstance(v, str) for v in values
        ):
            raise HTTPException(
                status_code=422, detail=f"{field} must be a list of strings."
            )
    return tags


def write_character_tags(
    db: Session, character_id: UUID, tags: dict[str, Optional[list[str]]]
) -> None:
    """Replace every field `tags` holds a list for; a None leaves that field as it is."""
    for field, values in tags.items():
        if values is not None:
            replace_character_tags(db, character_id, field, values)


def character_tag_values(
    db: Session, character_ids: Iterable[UUID]
) -> dict[UUID, dict[str, list[str]]]:
    """
    {character_id: {field: [value, ...]}} for every id asked about, in stored
    order, with an empty list for a field that has none. One query, however
    many characters - the list endpoint and Backup read a whole table at once.
    """
    ids = list(character_ids)
    out = {cid: {field: [] for field in CHARACTER_TAG_FIELD_KEYS} for cid in ids}
    if not ids:
        return out
    rows = (
        db.query(
            models.CharacterTag.character_id,
            models.CharacterTag.field,
            models.SystemOption.value,
        )
        .join(
            models.SystemOption,
            models.SystemOption.system_id == models.CharacterTag.option_id,
        )
        .filter(models.CharacterTag.character_id.in_(ids))
        .order_by(models.CharacterTag.position, models.CharacterTag.created_at)
        .all()
    )
    for character_id, field, value in rows:
        fields = out.get(character_id)
        if fields is not None and field in fields:
            fields[field].append(value)
    return out


def merge_character_tags(db: Session, keep_id: UUID, drop_id: UUID) -> None:
    """
    Give the survivor of a merge the union of both characters' tags per field:
    its own first, in their order, then the loser's it lacks. Runs before the
    loser is deleted, whose tags then cascade away with it.
    """
    both = character_tag_values(db, [keep_id, drop_id])
    for field in CHARACTER_TAG_FIELD_KEYS:
        kept = both[keep_id][field]
        dropped = both[drop_id][field]
        if not dropped:
            continue
        replace_character_tags(db, keep_id, field, kept + dropped)


# ---------------------------------------------------------------------------
# Sheets: the Character tab carries one comma-joined cell per field, headed by
# the field key, after the plain columns.
# ---------------------------------------------------------------------------


def character_tag_sheet_headers() -> list[str]:
    """The Character tab's tag headers, in the order the rows fill them."""
    return list(CHARACTER_TAG_FIELD_KEYS)


def character_tag_sheet_rows(db: Session, characters) -> list[list[str]]:
    """Comma-joined cells for many characters, aligned with the headers."""
    characters = list(characters)
    values = character_tag_values(db, [c.system_id for c in characters])
    return [
        [", ".join(values[c.system_id][field]) for field in CHARACTER_TAG_FIELD_KEYS]
        for c in characters
    ]


def character_tags_from_sheet(raw: Optional[str]) -> list[str]:
    """Split one comma-joined sheet cell back into values."""
    return split_names(raw)
