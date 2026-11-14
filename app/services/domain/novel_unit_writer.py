"""
Nested write for a novel's units.

The media-router factory builds an entry with spec.model(**payload) and
assigns updates with a blind setattr loop, so a nested list has to come out
of the payload first — the same escape hatch pop_remark and pop_plan_flag
use. This module owns what happens to that list.
"""

import uuid
from typing import Optional

from app.database import get_taipei_now
from app.models import NovelUnit, UserNovelUnitRating


def write_novel_units(db, entry, units, viewer=None) -> None:
    """
    Reconcile entry.units with the payload, in the caller's transaction.

    Rows carrying a system_id are updated, rows without one are inserted, and
    rows the payload omits are deleted. Passing None means "not supplied" and
    leaves the existing rows alone; passing [] clears them.

    Only the unit's own columns are written. A reader's rating of and remark
    on a unit are theirs, not the catalogue's, and are written only through
    PUT /api/me/novel-units/{unit_id} (write_unit_rating below); a units item
    naming either key has it ignored here, so a catalogue save neither files
    the editor's opinion nor clears anybody's. `viewer` is unused: it is the
    signature every MediaTypeSpec.nested_collections writer shares.
    """
    if units is None:
        return

    existing = {
        u.system_id: u
        for u in db.query(NovelUnit).filter(NovelUnit.novel_id == entry.system_id).all()
    }
    seen = set()

    for item in units:
        data = item if isinstance(item, dict) else item.model_dump()
        unit_id = data.get("system_id")
        # PUT/POST go through a pydantic schema, which parses this into a
        # UUID before it reaches us. PATCH's payload is a raw dict (see
        # apply_column_patch), so a JSON string survives untouched — coerce
        # it here rather than letting it fail the identity match below and
        # silently duplicate the row as an insert.
        if isinstance(unit_id, str):
            try:
                unit_id = uuid.UUID(unit_id)
            except ValueError:
                unit_id = None
        fields = {
            "unit_kind": data.get("unit_kind"),
            "position": data.get("position"),
            "unit_key": data.get("unit_key"),
            "name_cn": data.get("name_cn"),
            "name_en": data.get("name_en"),
            # Guarded by ck_novel_unit_ch_count_arc_only; normalise here so a
            # client that leaves a stale count on a re-kinded row cannot trip
            # the constraint.
            "ch_count": data.get("ch_count") if data.get("unit_kind") == "arc" else None,
        }

        row = existing.get(unit_id) if unit_id else None
        if row is None:
            row = NovelUnit(system_id=uuid.uuid4(), novel_id=entry.system_id, **fields)
            db.add(row)
        else:
            for key, value in fields.items():
                setattr(row, key, value)
        seen.add(row.system_id)

    for unit_id, row in existing.items():
        if unit_id not in seen:
            # The rating rows cascade with the unit (ondelete=CASCADE), so
            # nothing here has to chase them.
            db.delete(row)

    db.flush()
    db.refresh(entry)


def _blank_to_none(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return value


def write_unit_rating(
    db, user_id, unit_id, changes: dict
) -> Optional[UserNovelUnitRating]:
    """
    Apply `my_rating` and/or `remark` - only the keys present - to one
    reader's row for one unit. "" counts as clearing.

    A row left holding neither is deleted rather than kept holding None, so
    "never touched" and "cleared" do not become two different states in the
    table. Returns the row, or None when there is none afterwards. Not
    committed: the caller owns the transaction.
    """
    existing = (
        db.query(UserNovelUnitRating)
        .filter(
            UserNovelUnitRating.user_id == user_id,
            UserNovelUnitRating.unit_id == unit_id,
        )
        .first()
    )
    rating = _blank_to_none(
        changes["my_rating"] if "my_rating" in changes
        else (existing.my_rating if existing else None)
    )
    remark = _blank_to_none(
        changes["remark"] if "remark" in changes
        else (existing.remark if existing else None)
    )
    if rating is None and remark is None:
        if existing is not None:
            db.delete(existing)
            db.flush()
        return None
    if existing is None:
        existing = UserNovelUnitRating(
            system_id=uuid.uuid4(), user_id=user_id, unit_id=unit_id
        )
        db.add(existing)
    existing.my_rating = rating
    existing.remark = remark
    existing.updated_at = get_taipei_now()
    db.flush()
    return existing
