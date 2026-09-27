"""
routers/random_picker_defaults.py
Backs the random picker's default filters (/random) and the admin page that
edits them (/random-defaults).

One row per picker mode in the system_configs key/value table, keyed as
'random_picker_defaults:<mode>' with a JSON blob as the value, the same way
routers/form_defaults.py stores form defaults. A mode is "all" (the general
picker) or one media type.

Reading is open to everyone, because the picker is: a guest's picker opens
with the same defaults as anyone's. Writing is manage.catalog, as with form
defaults. A gated type's mode answers 404 to a session that may not see the
type, on every verb, so the endpoint does not say the type exists.

Filter keys and chip values are the frontend's (the FilterDefs in
frontend/src/lib/randomPicker.js) and are validated for shape and size only;
the frontend drops what it does not recognise on read.
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.rbac.gated_types import can_see_gated_type
from app.services.rbac.resolver import Viewer, get_viewer, require_manage_catalog

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/random-picker-defaults", tags=["Random Picker Defaults"])

PICKER_DEFAULTS_PREFIX = "random_picker_defaults:"
MAX_PAYLOAD_BYTES = 32 * 1024

# Mirrors PICKER_TYPES in frontend/src/lib/randomPicker.js, plus "all".
VALID_MODES = frozenset(
    {
        "all",
        "anime",
        "anime-movie",
        "movie",
        "tv-show",
        "cartoon",
        "manga",
        "novel",
        "comic",
        "game",
        "h-comic",
        "h-game",
        "hentai",
    }
)


def _to_key(mode: str) -> str:
    """Builds the system_configs key for a picker mode's defaults."""
    return f"{PICKER_DEFAULTS_PREFIX}{mode}"


def _validate_mode(db: Session, viewer: Viewer, mode: str) -> str:
    """Rejects an unknown mode, and a gated type's mode the viewer may not see."""
    if mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail=f"Unknown picker mode '{mode}'.")
    if not can_see_gated_type(db, viewer, mode):
        raise HTTPException(status_code=404, detail="Not found.")
    return mode


def _get_row(db: Session, mode: str):
    """Fetches the system_configs row backing a mode's defaults, or None."""
    return (
        db.query(models.SystemConfigs)
        .filter(models.SystemConfigs.config_key == _to_key(mode))
        .first()
    )


def _parse(row) -> schemas.RandomPickerDefaultsPayload:
    """Decodes a stored row, treating unreadable JSON as 'not configured'."""
    try:
        return schemas.RandomPickerDefaultsPayload(**json.loads(row.config_value))
    except Exception:
        logger.warning(
            "Ignoring unreadable picker defaults in '%s'.", row.config_key, exc_info=True
        )
        return schemas.RandomPickerDefaultsPayload()


def _serialize(payload: schemas.RandomPickerDefaultsPayload) -> str:
    """Encodes a payload for storage, guarding against a runaway blob."""
    encoded = json.dumps(payload.model_dump(), ensure_ascii=False)
    if len(encoded.encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Picker defaults cannot exceed {MAX_PAYLOAD_BYTES // 1024} KB.",
        )
    return encoded


@router.get(
    "/{mode}",
    response_model=schemas.RandomPickerDefaultsResponse,
    summary="Get Random Picker Defaults",
)
def get_picker_defaults(
    mode: str,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """Returns one mode's default filters; an unconfigured mode has none."""
    _validate_mode(db, viewer, mode)
    row = _get_row(db, mode)
    payload = _parse(row) if row else schemas.RandomPickerDefaultsPayload()
    return schemas.RandomPickerDefaultsResponse(mode=mode, **payload.model_dump())


@router.put("/{mode}", summary="Save Random Picker Defaults")
def save_picker_defaults(
    mode: str,
    payload: schemas.RandomPickerDefaultsPayload,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """Replaces a mode's default filters wholesale (upsert)."""
    _validate_mode(db, admin, mode)
    encoded = _serialize(payload)

    row = _get_row(db, mode)
    if row:
        row.config_value = encoded
    else:
        db.add(models.SystemConfigs(config_key=_to_key(mode), config_value=encoded))
    db.commit()
    return {"message": f"Picker defaults for '{mode}' saved.", "mode": mode}


@router.delete("/{mode}", summary="Reset Random Picker Defaults")
def reset_picker_defaults(
    mode: str,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """Deletes a mode's stored defaults, so it opens with no filters. Idempotent."""
    _validate_mode(db, admin, mode)
    row = _get_row(db, mode)
    if row:
        db.delete(row)
        db.commit()
    return {"message": f"Picker defaults for '{mode}' reset.", "mode": mode}
