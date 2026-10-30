"""
routers/character.py
CRUD for fictional characters, plus their per-entry castings, reverse lookup
by entry, and merge.

Deleting a character cascades their castings away (see
CharacterCasting.character_id ondelete="CASCADE") - that is the chosen design
for a genuine removal. Merge exists because deleting is the WRONG fix for a
duplicate: it repoints every casting onto the survivor before deleting the
loser, so no casting history is lost - and where both were cast on one entry,
the loser's voices join the survivor's casting there.
"""

import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.routers._entity_patch import prepare_patch, resolve_fallback
from app.routers._external_search import SEARCH_LIMIT, SEARCH_QUERY, run_search
from app.routers._patching import apply_column_patch
from app.schemas.external_search import ExternalSearchResult
from app.services.domain import casting_sync
from app.services.domain.autofill import autofill_character_from_mal
from app.services.domain.casting_entries import casting_entry_groups
from app.services.domain.character_display_names import prefer_cn_display_name
from app.services.domain.character_responses import (
    character_response,
    character_responses,
)
from app.services.domain.character_tags import (
    merge_character_tags,
    pop_character_tags,
    pop_patch_tags,
    write_character_tags,
)
from app.services.domain.derivation import apply_extract_mal_id_character
from app.services.domain.merge_fill import absorb_casting, finish_merge
from app.services.integrations.tenrai import search_mal_characters
from app.services.rbac.enforcement import entry_visible, filter_visible_pairs
from app.services.rbac.resolver import (
    Viewer,
    require_manage_catalog,
    require_view_entities,
)
from app.services.rbac.shared_visibility import (
    apply_shared_visibility,
    require_visible_shared,
)
from app.utils.character_roles import check_character_role
from app.utils.entity_ref import find_entity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/character", tags=["Character Management"])

NOT_FOUND = "Character not found."


def _derive_and_fill_from_mal(db: Session, character: models.Character) -> None:
    """
    Derive mal_id from mal_link, then fill the empty columns from MAL's
    character record. Runs after the payload is copied, so the payload's own
    values win and only blank columns are filled. Flushed first: a new
    character's portrait is stored under its system_id.
    """
    apply_extract_mal_id_character(character)
    if character.mal_id is None:
        return
    db.flush()
    autofill_character_from_mal(character)


def _cast_in_scope(
    db: Session, viewer, franchise_id: Optional[UUID], series_id: Optional[UUID]
) -> tuple[set[UUID], set[UUID]]:
    """
    (character ids, identity ids) cast on the visible entries of a franchise
    and/or a series. Both given means both must hold.
    """
    query = db.query(
        models.CharacterCasting.character_id,
        models.CharacterCasting.identity_id,
        models.CharacterCasting.media_type,
        models.CharacterCasting.entry_id,
    ).join(models.Media, models.Media.system_id == models.CharacterCasting.entry_id)
    if franchise_id:
        query = query.filter(models.Media.franchise_id == franchise_id)
    if series_id:
        query = query.filter(models.Media.series_id == series_id)
    rows = query.all()
    visible = filter_visible_pairs(db, viewer, [(r.media_type, r.entry_id) for r in rows])
    shown = [r for r in rows if (r.media_type, r.entry_id) in visible]
    return (
        {r.character_id for r in shown},
        {r.identity_id for r in shown if r.identity_id},
    )


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get(
    "/", response_model=List[schemas.CharacterResponse], summary="Get All Characters"
)
def get_all_characters(
    name: Optional[str] = Query(
        default=None,
        description="Case-insensitive substring match against any of the four name columns.",
    ),
    franchise_id: Optional[UUID] = Query(
        default=None,
        description="Only characters cast on an entry in this franchise.",
    ),
    series_id: Optional[UUID] = Query(
        default=None,
        description="Only characters cast on an entry in this series.",
    ),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_view_entities),
):
    """
    Retrieves every character, or - when `name` is given - only those whose
    name_en/name_cn/name_jp/name_alt contains it (case-insensitive).

    The filter exists so the cast editor's character combobox never has to
    download the whole table just to offer suggestions as an admin types.
    Character names deliberately recur across unrelated works (no unique
    constraint on purpose - see CharacterCreate), so this search, together
    with the entries each match already appears in, is how an admin tells
    one "Yuki" from another before reusing or minting one.

    A character every casting of which is on a label-hidden entry is absent
    - see app/services/rbac/shared_visibility.py.

    `franchise_id` / `series_id` scope the list to the characters cast on that
    tier's entries - the franchise and series hubs' Characters tab. Only
    castings on entries this viewer may see count, and each character's
    `identities` narrows to the ones cast there, so the tab shows a card per
    character and one per identity that actually appears. casting_count keeps
    its unscoped meaning.
    """
    query = apply_shared_visibility(
        db.query(models.Character), models.Character, db, viewer
    )
    scoped_identity_ids = None
    if franchise_id or series_id:
        character_ids, scoped_identity_ids = _cast_in_scope(
            db, viewer, franchise_id, series_id
        )
        if not character_ids:
            return []
        query = query.filter(models.Character.system_id.in_(character_ids))
    if name:
        search_term = f"%{name}%"
        query = query.filter(
            or_(
                models.Character.name_en.ilike(search_term),
                models.Character.name_cn.ilike(search_term),
                models.Character.name_jp.ilike(search_term),
                models.Character.name_alt.ilike(search_term),
            )
        )
    characters = query.all()
    # Sorted in Python, not SQL: display_name is a property over four columns
    # with a per-row choice, so no single ORDER BY column can express it.
    characters.sort(key=lambda c: c.display_name.casefold())
    return character_responses(db, viewer, characters, scoped_identity_ids)


# Before every /{system_id} route, which would otherwise swallow this path.
@router.get(
    "/search-mal",
    response_model=List[ExternalSearchResult],
    summary="Search MyAnimeList Characters",
)
def search_mal(
    q: str = SEARCH_QUERY,
    limit: int = SEARCH_LIMIT,
    admin: Viewer = Depends(require_manage_catalog),
):
    """Searches MAL characters by name for the Add-tab picker, which writes `mal_link`."""
    return run_search(search_mal_characters, q, limit)


@router.get(
    "/{system_id}/entries", summary="Entries This Character Is Cast On"
)
def get_character_entries(
    system_id: UUID,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_view_entities),
):
    """
    The entries this character appears in, grouped by media type.

    The reverse of GET /api/credits/{media_type}/{entry_id}'s cast list, and
    the mirror of get_person_entries - except that a character holds no roles,
    so the group key is only the media type, not (media type, role).

    A character hidden from this viewer - every casting on a label-hidden
    entry, see shared_visibility.py - answers 404, as their own page does. A
    visible character's castings on label-hidden entries are omitted whole,
    group and all; a casting withheld only by a media-type permission gap
    keeps its group, empty, because that gap does not hide the connection.

    The grouping and the visibility rule are casting_entry_groups', shared
    with an identity's own /entries.
    """
    character = db.get(models.Character, system_id)
    if character is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(db, viewer, models.Character, system_id, NOT_FOUND)

    rows = (
        db.query(models.CharacterCasting)
        .filter(models.CharacterCasting.character_id == system_id)
        .order_by(models.CharacterCasting.position)
        .all()
    )
    return {"groups": casting_entry_groups(db, viewer, rows)}


@router.get(
    "/{system_id}",
    response_model=schemas.CharacterResponse,
    summary="Get Character by ID",
)
def get_character_by_id(
    system_id: str,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_view_entities),
):
    """Retrieves a single character by their public_id or their UUID."""
    character = find_entity(db, models.Character, system_id)
    if character is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(
        db, viewer, models.Character, character.system_id, NOT_FOUND
    )
    return character_response(db, character, viewer)


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post("/", response_model=schemas.CharacterResponse, summary="Create Character")
def create_character(
    payload: schemas.CharacterCreate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Creates a character. Always a plain create - never find-or-create.

    Decision G: POST /api/person is find-or-create because two spellings of
    one director are one human. Characters are the opposite - the "Yuki" of
    one anime and the "Yuki" of another are different characters, and
    silently returning the first would fuse two unrelated casts under one
    system_id. There is deliberately no find_character helper, and no name
    slotting: this endpoint must never resolve a payload against an existing
    row by name. Disambiguation belongs in the cast editor's combobox, which
    lets the admin pick "existing" or "new" explicitly - never in a silent
    server-side match here.

    A new character is cast on nothing, so any photo_fallback_entry_id is a
    422 - resolve_fallback has no link to find.

    appearance and trait are written once the row exists; a value with no
    system_option yet creates one (character_tags.replace_character_tags).
    """
    if payload.photo_fallback_entry_id is not None:
        raise HTTPException(
            status_code=422,
            detail="photo_fallback_entry_id must name an entry this character is linked to.",
        )
    data = payload.model_dump()
    tags = pop_character_tags(data)
    character = models.Character(**data)
    db.add(character)
    db.flush()
    write_character_tags(db, character.system_id, tags)
    _derive_and_fill_from_mal(db, character)
    prefer_cn_display_name(character)
    db.commit()
    db.refresh(character)
    return character_response(db, character, admin)


@router.put(
    "/{system_id}", response_model=schemas.CharacterResponse, summary="Update Character"
)
def update_character(
    system_id: UUID,
    payload: schemas.CharacterUpdate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Fully updates a character's metadata.

    photo_fallback_entry_id must name an entry this character is cast on
    (422 otherwise); a null keeps a choice this editor cannot see - see
    _entity_patch.resolve_fallback.

    appearance and trait replace their lists whole; one left out or null is
    unchanged.
    """
    character = db.get(models.Character, system_id)
    if character is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(db, admin, models.Character, system_id, NOT_FOUND)

    data = payload.model_dump()
    tags = pop_character_tags(data)
    data["photo_fallback_entry_id"] = resolve_fallback(
        db, admin, models.Character, character,
        data["photo_fallback_entry_id"], "character",
    )
    for key, value in data.items():
        setattr(character, key, value)
    write_character_tags(db, system_id, tags)
    _derive_and_fill_from_mal(db, character)
    prefer_cn_display_name(character)

    db.commit()
    db.refresh(character)
    return character_response(db, character, admin)


@router.patch(
    "/{system_id}", response_model=schemas.CharacterResponse, summary="Patch Character"
)
def patch_character(
    system_id: UUID,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Partially updates a character - the detail page's inline rating and
    remark edits. Only the keys sent change.

    The same rules as PUT, checked before anything is written: gender,
    my_rating and role are their vocabularies ("" is NULL), display_name_field
    is en / cn / jp / alt, at least one name survives the patch, and a
    photo_fallback_entry_id names an entry this character is cast on. Server
    columns (system_id, public_id, timestamps) are a 422; keys that are not
    columns are ignored (_patching.apply_column_patch) - except appearance
    and trait, which are popped out first and replace their lists as on PUT
    (a list of strings, else 422; null is unchanged). A mal_link in the
    patch re-derives mal_id; the MAL fetch itself stays with POST and PUT.
    """
    character = db.get(models.Character, system_id)
    if character is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(db, admin, models.Character, system_id, NOT_FOUND)

    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="A PATCH body must be a JSON object.")
    payload = dict(payload)
    tags = pop_patch_tags(payload)
    data = prepare_patch(
        character, payload, "character", {"role": check_character_role}
    )
    if "photo_fallback_entry_id" in data:
        data["photo_fallback_entry_id"] = resolve_fallback(
            db, admin, models.Character, character,
            data["photo_fallback_entry_id"], "character",
        )
    apply_column_patch(character, data)
    write_character_tags(db, system_id, tags)
    if "mal_link" in data:
        apply_extract_mal_id_character(character)

    db.commit()
    db.refresh(character)
    return character_response(db, character, admin)


@router.delete("/{system_id}", summary="Delete Character")
def delete_character(
    system_id: UUID,
    castings: int = Query(..., description="Casting count the admin confirmed"),
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Permanently deletes a character. Their castings cascade away with them -
    see the merge endpoint for the correct fix when this character is a
    duplicate.

    `castings` is the count the UI showed in its confirmation, and it is
    REQUIRED. If it no longer matches, the request is rejected with 409: the
    admin agreed to destroy a specific amount of casting history, and a count
    that moved underneath them - another session casting this character while
    the dialog was open - is not what they agreed to.
    """
    character = db.get(models.Character, system_id)
    if character is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(db, admin, models.Character, system_id, NOT_FOUND)

    actual = (
        db.query(models.CharacterCasting).filter_by(character_id=system_id).count()
    )
    if actual != castings:
        raise HTTPException(
            status_code=409,
            detail=(
                f"This character now has {actual} castings, not {castings}. "
                "Reload and confirm again."
            ),
        )

    db.delete(character)
    db.commit()

    return {"status": "success", "message": "Character deleted successfully."}


@router.post("/{system_id}/merge", summary="Merge Another Character Into This One")
def merge_character(
    system_id: UUID,
    payload: schemas.MergeRequest,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    Repoint every casting from `source_id` onto this character, then delete
    the source. This - not delete - is the fix for a duplicate: deleting
    cascades the castings away, so merging is the only way to keep them.

    Every column this character leaves blank is filled from the source's,
    and an entry both are cast in keeps this character's casting, its blanks
    filled from the source's (`merge_fill`). Castings match per identity: the
    source's identities move to this character, after its own, with their
    cast rows, and only a main row meets a main row. Each tag list ends as the union
    of both: this character's values first, then the source's it lacked.
    """
    if system_id == payload.source_id:
        raise HTTPException(
            status_code=400, detail="Cannot merge a character into itself."
        )

    keep = db.get(models.Character, system_id)
    drop = db.get(models.Character, payload.source_id)
    if keep is None or drop is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    for character_id in (system_id, payload.source_id):
        require_visible_shared(db, admin, models.Character, character_id, NOT_FOUND)

    # The loser's identities move to the survivor first, after its own. Their
    # cast rows move with them below, unmatched: no survivor row names a
    # loser's identity. fk_casting_identity is deferred, so the identity and
    # its rows may change in either order inside this flush.
    # Past the survivor's highest position, not its count: positions may have
    # gaps (a deleted identity), and 0 when it has none.
    highest = (
        db.query(func.max(models.CharacterIdentity.position))
        .filter_by(character_id=system_id)
        .scalar()
    )
    offset = 0 if highest is None else highest + 1
    for identity in (
        db.query(models.CharacterIdentity)
        .filter_by(character_id=payload.source_id)
        .order_by(models.CharacterIdentity.position)
        .all()
    ):
        identity.character_id = system_id
        identity.position += offset

    held = {
        (c.identity_id, c.media_type, c.entry_id): c
        for c in db.query(models.CharacterCasting)
        .filter_by(character_id=system_id)
        .all()
    }
    moved = 0
    for casting in (
        db.query(models.CharacterCasting)
        .filter_by(character_id=payload.source_id)
        .all()
    ):
        kept = held.get((casting.identity_id, casting.media_type, casting.entry_id))
        if kept is not None:
            absorb_casting(kept, casting)
            db.delete(casting)
            continue
        casting.character_id = system_id
        moved += 1

    merge_character_tags(db, system_id, payload.source_id)

    # drop.identities may be loaded and still list the moved identities; the
    # delete-orphan cascade would delete them with drop. Reload it from the rows.
    db.expire(drop, ["identities"])
    finish_merge(db, "character", keep, drop)
    return {"status": "success", "castings_moved": moved}


class SyncFromCastIn(BaseModel):
    casting_id: UUID


@router.post(
    "/{system_id}/sync-from-cast",
    response_model=schemas.CharacterResponse,
    summary="Replace This Character's Role, Remark and Photo From a Cast Row",
)
def sync_character_from_cast(
    system_id: UUID,
    payload: SyncFromCastIn,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
):
    """
    The character page's "Sync from cast": one of this character's cast rows
    replaces the role, remark and photo of the record it casts - the
    character, or the identity the row names (an identity has no role). A
    value the row does not hold leaves the record's alone
    (casting_sync.sync_character_from_cast). 404 for a cast row that is not
    this character's, or is on an entry the caller cannot see.
    """
    character = db.get(models.Character, system_id)
    if character is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    require_visible_shared(db, admin, models.Character, system_id, NOT_FOUND)

    casting = db.get(models.CharacterCasting, payload.casting_id)
    if (
        casting is None
        or casting.character_id != system_id
        or not entry_visible(db, admin, casting.media_type, casting.entry_id)
    ):
        raise HTTPException(status_code=404, detail="Cast row not found.")

    casting_sync.sync_character_from_cast(db, character, casting)
    db.commit()
    db.refresh(character)
    return character_response(db, character, admin)
