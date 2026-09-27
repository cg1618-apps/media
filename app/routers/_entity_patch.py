"""
Write-side checks the character and person routers share.

PATCH takes a free-form dict (see _patching.py), so the rules the Create and
Update schemas enforce for these two entities are applied here by hand before
apply_column_patch runs: the gender and my_rating vocabularies (and
character.role, passed in as an extra check), the known
display_name_field values, the at-least-one-name rule, and a well-formed
photo_fallback_entry_id. PUT and PATCH then both ask the same question of the
fallback id: does it name an entry this record is linked to and the writer
can see?
"""

from typing import Callable, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.services.domain.entity_photos import linked_entry_pairs
from app.services.rbac.enforcement import filter_visible_pairs
from app.utils.entity_vocab import check_gender, check_my_rating

NAME_COLUMNS = ("name_en", "name_cn", "name_jp", "name_alt")
DISPLAY_NAME_FIELDS = (None, "en", "cn", "jp", "alt")

# Server-owned beyond _patching.PROTECTED_COLUMNS: the id in the SPA's URLs.
PATCH_PROTECTED = frozenset({"public_id"})


def _refuse(detail: str):
    raise HTTPException(status_code=422, detail=detail)


def prepare_patch(
    entity,
    payload: dict,
    noun: str,
    extra_checks: Optional[dict[str, Callable]] = None,
) -> dict:
    """
    `payload` checked and normalised for apply_column_patch; 422 on a value
    the schemas would refuse. `noun` names the entity in the name-rule
    message ("character", "person"). `extra_checks` maps a column only one of
    the two has (character.role) to its check_* function, which returns the
    normalised value or raises ValueError.
    """
    if not isinstance(payload, dict):
        _refuse("A PATCH body must be a JSON object.")
    protected = sorted(k for k in payload if k in PATCH_PROTECTED)
    if protected:
        _refuse(f"Field(s) cannot be set through PATCH: {', '.join(protected)}")

    out = dict(payload)
    try:
        if "gender" in out:
            out["gender"] = check_gender(out["gender"])
        if "my_rating" in out:
            out["my_rating"] = check_my_rating(out["my_rating"])
        for column, check in (extra_checks or {}).items():
            if column in out:
                out[column] = check(out[column])
    except ValueError as exc:
        _refuse(str(exc))

    if "display_name_field" in out:
        out["display_name_field"] = out["display_name_field"] or None
        if out["display_name_field"] not in DISPLAY_NAME_FIELDS:
            _refuse("display_name_field must be en, cn, jp or alt.")

    if "photo_fallback_entry_id" in out:
        raw = out["photo_fallback_entry_id"]
        if raw in (None, ""):
            out["photo_fallback_entry_id"] = None
        else:
            try:
                out["photo_fallback_entry_id"] = UUID(str(raw))
            except ValueError:
                _refuse("photo_fallback_entry_id must be an entry id.")

    names = [out.get(column, getattr(entity, column)) for column in NAME_COLUMNS]
    if not any(isinstance(n, str) and n.strip() for n in names):
        _refuse(f"A {noun} needs at least one name.")
    return out


def resolve_fallback(
    db: Session, writer, model, entity, requested: Optional[UUID], noun: str
) -> Optional[UUID]:
    """
    The photo_fallback_entry_id to store for a write asking for `requested`.

    A non-null id must name an entry `entity` is linked to - cast on, for a
    character; credited or cast on, for a person - and that the writer can
    see; 422 otherwise, so a typo or a stale form cannot store a choice that
    would only ever fall through.

    A null does not clear a choice the writer cannot see: the response hid it
    from them (EntityMedia.photo_fallback_entry_id), so the null their form
    sends back is not a removal - the same rule update_person applies to
    roles scoped to a hidden type.
    """
    if requested is None:
        stored = entity.photo_fallback_entry_id
        if stored is None:
            return None
        pairs = linked_entry_pairs(db, model, entity.system_id, stored)
        if pairs and not filter_visible_pairs(db, writer, pairs):
            return stored
        return None
    pairs = linked_entry_pairs(db, model, entity.system_id, requested)
    if not pairs or not filter_visible_pairs(db, writer, pairs):
        _refuse(f"photo_fallback_entry_id must name an entry this {noun} is linked to.")
    return requested
