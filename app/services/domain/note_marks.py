"""
Note marks: each viewer's own values on catalogue note rows.

The registry (app/utils/note_sections.personal_values) names, per section,
the values a catalogue row carries that belong to whoever reads it rather
than to the row: collected and the amount collected on the three 物品
sections, beaten on 敵人, completion on 結局, my value on 屬性&配點, and the
status of the song lists, music_status and 模組&工具 - the last three behind
a granted feature. They live in `note_mark`, one row per account per note.

Reads overlay them. `note_out` puts the viewer's value back on the row where
the field lives - its column, or `fields[key]` - so a response has exactly the
shape it had when the values were columns, and every reader of a row (the
notes page, its quick edit, its status bars) reads the viewer's own without
knowing marks exist. A viewer with no mark reads the field's empty value: its
registry `default` when it declares one, else null. A value granted by a
feature the viewer lacks is null on the row and missing from `fields`, and
the sections listing leaves the field out, so the viewer does not see it at
all. Whatever the row itself still carries in a personal column is never
read: a catalogue write drops personal values, and the overlay overwrites
every one, so a stale value cannot leak.

Writes come through PUT /api/notes/{id}/mark and the NG reset
(routers/note.py), never through a catalogue write.
"""

import uuid
from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.database import get_taipei_now
from app.schemas.note import NoteResponse
from app.services.rbac import features
from app.utils.note_sections import (
    NOTE_SECTIONS,
    NoteSection,
    PersonalValue,
    field_by_key,
    personal_values,
    section_by_key,
)

# The catalogue field saying whether a row's resettable values are cleared by
# the NG reset. A row without the key reads as its default.
NG_RESET_FIELD = "ng_reset"

for _section in NOTE_SECTIONS:
    for _value in personal_values(_section):
        if _value.granted and _value.granted not in features.FEATURE_NAMES:
            raise ValueError(
                f"Section '{_section.key}' value '{_value.key}' is granted by "
                f"unknown feature '{_value.granted}'."
            )


class MarkRefused(ValueError):
    """A mark write naming a value the section does not hold as personal, or
    one outside its vocabulary. The router answers 422."""


class FeatureRequired(Exception):
    """A mark write of a granted value by a viewer without the feature. The
    router answers 401, a capability failure."""

    def __init__(self, feature: str):
        super().__init__(feature)
        self.feature = feature


def features_held(db: Session, viewer) -> frozenset[str]:
    """The granted features this viewer holds, asked one by one through
    has_feature - the one place a feature is decided."""
    return frozenset(
        name for name in features.FEATURE_NAMES if features.has_feature(db, viewer, name)
    )


def _blank(value) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def marks_by_note(db: Session, user_id: Optional[UUID], note_ids: list) -> dict:
    """{note id: values} for one account, one query for the whole page."""
    if user_id is None or not note_ids:
        return {}
    rows = (
        db.query(models.NoteMark)
        .filter(
            models.NoteMark.user_id == user_id,
            models.NoteMark.note_id.in_(note_ids),
        )
        .all()
    )
    return {row.note_id: row.values or {} for row in rows}


def _overlay(response: NoteResponse, section: NoteSection, values: dict, held) -> None:
    spec = personal_values(section)
    if not spec:
        return
    blob = dict(response.fields or {})
    touched_blob = False
    for value in spec:
        hidden = value.granted is not None and value.granted not in held
        shown = None if hidden else values.get(value.key, value.default)
        if value.column:
            setattr(response, value.column, shown)
            continue
        touched_blob = True
        blob.pop(value.key, None)
        if shown is not None:
            blob[value.key] = shown
    if touched_blob:
        response.fields = blob or None


def note_out(
    note: models.Note, values: Optional[dict], held: frozenset[str]
) -> NoteResponse:
    """One row as a viewer reads it: the catalogue row with that viewer's
    `values` (its mark, or None) in place of every personal value."""
    response = NoteResponse.model_validate(note)
    section = section_by_key(note.section or "")
    if section is not None:
        _overlay(response, section, values or {}, held)
    return response


def notes_out(db: Session, viewer, notes: Iterable[models.Note]) -> list[NoteResponse]:
    """A page of rows as `viewer` reads them, its marks fetched in one query."""
    notes = list(notes)
    held = features_held(db, viewer)
    marks = marks_by_note(
        db, getattr(viewer, "user_id", None), [n.system_id for n in notes]
    )
    return [note_out(n, marks.get(n.system_id), held) for n in notes]


def check_mark_values(section: NoteSection, values: dict, held: frozenset[str]) -> None:
    """
    Refuse a mark write the section cannot hold: a key that is not one of its
    personal values (MarkRefused), a granted one the viewer lacks the feature
    for (FeatureRequired), or a value that is not text or not in a closed
    vocabulary (MarkRefused). A null or blank value clears and is always
    accepted for a personal key.
    """
    spec = {v.key: v for v in personal_values(section)}
    for key in values:
        if key not in spec:
            raise MarkRefused(
                f"'{key}' is not a personal value of section '{section.key}'."
            )
    for key, value in values.items():
        target: PersonalValue = spec[key]
        if target.granted and target.granted not in held:
            raise FeatureRequired(target.granted)
        if _blank(value):
            continue
        if not isinstance(value, str):
            raise MarkRefused(f"'{key}' must be text.")
        if target.options and value not in target.options:
            raise MarkRefused(
                f"'{value}' is not a valid {key}; expected one of "
                f"{', '.join(target.options)}."
            )


def mark_row(db: Session, user_id: UUID, note_id) -> Optional[models.NoteMark]:
    """One account's mark on one note, or None. Never creates."""
    return (
        db.query(models.NoteMark)
        .filter(models.NoteMark.user_id == user_id, models.NoteMark.note_id == note_id)
        .first()
    )


def write_mark(db: Session, user_id: UUID, note_id, values: dict) -> dict:
    """
    Merge `values` into one account's mark on one note: a key with a value
    sets it, a key with null or a blank string clears it, and a key not named
    is left alone. A mark left with nothing in it is deleted.

    Unchecked: the caller has run check_mark_values. Added to the session,
    not committed. Returns the stored values ({} when the mark went).
    """
    row = mark_row(db, user_id, note_id)
    merged = dict(row.values or {}) if row is not None else {}
    for key, value in values.items():
        if _blank(value):
            merged.pop(key, None)
        else:
            merged[key] = value
    if not merged:
        if row is not None:
            db.delete(row)
            db.flush()
        return {}
    if row is None:
        row = models.NoteMark(system_id=uuid.uuid4(), user_id=user_id, note_id=note_id)
        db.add(row)
    # A new dict, so the JSONB change is seen without a mutable tracker.
    row.values = merged
    row.updated_at = get_taipei_now()
    db.flush()
    return merged


def _resets_row(section: NoteSection, note: models.Note) -> bool:
    """Whether the NG reset reaches this row: always, unless the section has
    an ng_reset field and the row says no (a missing value is its default)."""
    field = field_by_key(section, NG_RESET_FIELD)
    if field is None:
        return True
    value = (note.fields or {}).get(NG_RESET_FIELD)
    if _blank(value):
        value = field.default
    return value == "yes"


def ng_reset(db: Session, user_id: UUID, notes: Iterable[models.Note]) -> int:
    """
    Start a new cycle for one account over one owner's rows: clear every
    value the registry marks `ng_resets` - collected and the amount
    collected on the rows whose ng_reset is yes, beaten on every enemy - from
    that account's own marks. Other accounts' marks and every other value are
    left alone. Returns how many marks changed.
    """
    reaching: dict = {}
    for note in notes:
        section = section_by_key(note.section or "")
        if section is None:
            continue
        keys = [v.key for v in personal_values(section) if v.ng_resets]
        if keys and _resets_row(section, note):
            reaching[note.system_id] = keys
    if not reaching:
        return 0
    changed = 0
    for row in (
        db.query(models.NoteMark)
        .filter(
            models.NoteMark.user_id == user_id,
            models.NoteMark.note_id.in_(list(reaching)),
        )
        .all()
    ):
        keys = reaching[row.note_id]
        if not any(key in (row.values or {}) for key in keys):
            continue
        write_mark(db, user_id, row.note_id, {key: None for key in keys})
        changed += 1
    return changed


# --- Sheets -----------------------------------------------------------------


def clean_mark_values(values) -> Optional[dict]:
    """A Note Mark cell as the write path would store it: the non-blank text
    values of an object, or None when there is nothing to store."""
    if not isinstance(values, dict):
        return None
    kept = {
        key: value
        for key, value in values.items()
        if isinstance(key, str) and isinstance(value, str) and value.strip()
    }
    return kept or None


# --- Old backups ------------------------------------------------------------


def pop_legacy_note_values(payload: dict) -> dict:
    """
    Take the personal values out of an old backup's Note row, in place, and
    return them as {mark key: value}.

    A Note tab written before the values moved to marks carries them on the
    row: the status column, or a key of `fields`. They can be told apart from
    catalogue values by section alone - on these sections that column or key
    has only ever held the personal value, and a current backup carries it
    null - so this is exact, not a guess. Only what the sheet carries is
    taken: a column the header lacks is not in the payload, and a blank cell
    takes nothing.
    """
    section = section_by_key(payload.get("section") or "")
    if section is None:
        return {}
    found: dict = {}
    for value in personal_values(section):
        if value.column:
            if value.column in payload:
                cell = payload[value.column]
                payload[value.column] = None
                if not _blank(cell):
                    found[value.key] = cell
        elif isinstance(payload.get("fields"), dict) and value.key in payload["fields"]:
            blob = dict(payload["fields"])
            cell = blob.pop(value.key)
            payload["fields"] = blob or None
            if not _blank(cell):
                found[value.key] = cell
    return found
