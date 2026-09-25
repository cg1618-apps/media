"""
routers/franchise.py
Handles all operations for Franchises (the top-level V2 database entity).
Includes public lookups with multi-language search and secure administrative CRUD lifecycle.
"""

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_taipei_now
from app.dependencies import get_db
from app.routers._patching import apply_column_patch
from app.services.domain import attach_remark, pop_remark, upsert_remark
from app.services.domain.content_labels import attach_franchise_content_labels
from app.services.domain.h_comic import ensure_franchise_label
from app.services.domain.hierarchy import (
    check_franchise_entries_family,
    check_franchise_type_family,
)
from app.services.rbac.enforcement import (
    apply_franchise_visibility,
    franchise_visible,
)
from app.services.rbac.resolver import Viewer, get_viewer, require_manage_catalog
from app.utils.data_control_utils import log_deleted_record
from app.utils.entity_ref import find_entity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/franchise", tags=["Franchise Management"])


def _check_type_family(db: Session, franchise_id, data: dict) -> None:
    """
    422 when a written franchise_type spans two families, or - for an existing
    franchise - is another family than an entry it holds. Checked before the
    payload is applied. See FRANCHISE_FAMILY_FOR_TYPE.
    """
    if "franchise_type" not in data:
        return
    try:
        check_franchise_type_family(data["franchise_type"])
        if franchise_id is not None:
            check_franchise_entries_family(db, franchise_id, data["franchise_type"])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# ==========================================
# PUBLIC READ OPERATIONS (Unprotected)
# ==========================================


@router.get(
    "/", response_model=List[schemas.FranchiseResponse], summary="Get All Franchises"
)
def get_all_franchises(
    collection_id: Optional[str] = None,
    search_query: Optional[str] = None,
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """
    Retrieves all high-level Franchises from the database.
    - If 'collection_id' is provided, filters strictly to that parent collection.
      Used by the Collection hub to list its member franchises.
    - If 'search_query' is provided, it intelligently searches across EN, CN, roman, JP, and Alt names.
    Used by the frontend to populate autocomplete search dropdowns.
    """
    # Before any other filter: a franchise carrying a label this session's
    # mode lacks must not appear in a list, a search or an autocomplete, the
    # same way a labelled entry does not.
    query = apply_franchise_visibility(db.query(models.Franchise), db, viewer)

    if collection_id:
        query = query.filter(models.Franchise.collection_id == collection_id)

    if search_query:
        search_term = f"%{search_query}%"
        query = query.filter(
            or_(
                models.Franchise.franchise_name_en.ilike(search_term),
                models.Franchise.franchise_name_cn.ilike(search_term),
                models.Franchise.franchise_name_roman.ilike(search_term),
                models.Franchise.franchise_name_jp.ilike(search_term),
                models.Franchise.franchise_name_alt.ilike(search_term),
            )
        )

    rows = (
        query.order_by(models.Franchise.franchise_name_en)
        .limit(limit)
        .offset(offset)
        .all()
    )
    attach_franchise_content_labels(db, rows)
    return rows


@router.get(
    "/{system_id}",
    response_model=schemas.FranchiseResponse,
    summary="Get Franchise by ID",
)
def get_franchise_by_id(
    system_id: str,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(get_viewer),
):
    """Retrieves a single franchise by its public_id or its UUID."""
    db_franchise = find_entity(db, models.Franchise, system_id)
    if not db_franchise:
        raise HTTPException(status_code=404, detail="Franchise not found.")
    # Same message either way: a hidden franchise must be indistinguishable
    # from one that was never there.
    if not franchise_visible(db, viewer, db_franchise.system_id):
        raise HTTPException(status_code=404, detail="Franchise not found.")
    attach_remark(db, "franchise", db_franchise, viewer.user_id)
    attach_franchise_content_labels(db, db_franchise)
    return db_franchise


# ==========================================
# PROTECTED WRITE OPERATIONS (Admin Only)
# ==========================================


@router.post("/", response_model=schemas.FranchiseResponse, summary="Create Franchise")
def create_franchise(
    payload: schemas.FranchiseCreate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
    viewer: Viewer = Depends(get_viewer),
):
    """Creates a new Franchise. Does NOT trigger a background Google Sheets backup in V2."""
    # Outside the try: its blanket except turns everything into a 500.
    _check_type_family(db, None, payload.model_dump(exclude_unset=True))
    try:
        # Build from the validated payload rather than field-by-field. The previous
        # explicit form silently dropped cover_entry_id, type_covers, type_slots
        # and watch_next_group on every create.
        # Explicitly assign UUID and Timestamps in Python to bypass missing database default constraints
        data, remark, has_remark = pop_remark(payload.model_dump(exclude_unset=True))
        new_franchise = models.Franchise(
            **data,
            system_id=uuid.uuid4(),
            created_at=get_taipei_now(),
            updated_at=get_taipei_now(),
        )

        db.add(new_franchise)
        db.flush()
        # A franchise whose type includes H-Comic carries the h-comic label
        # from its first write - otherwise it is public until someone labels
        # it by hand.
        ensure_franchise_label(db, new_franchise)
        db.commit()
        db.refresh(new_franchise)

        if has_remark:
            upsert_remark(
                db, "franchise", new_franchise.system_id, remark, viewer.user_id
            )
            db.commit()
            db.refresh(new_franchise)

        attach_remark(db, "franchise", new_franchise, viewer.user_id)

        return new_franchise
    except Exception as e:
        logger.error("CRITICAL ERROR creating franchise: %s", str(e), exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Database Insertion Error: {str(e)}"
        )


@router.put(
    "/{system_id}", response_model=schemas.FranchiseResponse, summary="Update Franchise"
)
def update_franchise(
    system_id: str,
    payload: schemas.FranchiseUpdate,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
    viewer: Viewer = Depends(get_viewer),
):
    """Fully updates a Franchise's metadata."""
    db_franchise = (
        db.query(models.Franchise)
        .filter(models.Franchise.system_id == system_id)
        .first()
    )
    if not db_franchise or not franchise_visible(db, viewer, db_franchise.system_id):
        raise HTTPException(status_code=404, detail="Franchise not found.")

    update_data, remark, has_remark = pop_remark(payload.model_dump(exclude_unset=True))
    _check_type_family(db, db_franchise.system_id, update_data)
    for key, value in update_data.items():
        setattr(db_franchise, key, value)
    if has_remark:
        upsert_remark(
            db, "franchise", db_franchise.system_id, remark, viewer.user_id
        )

    db_franchise.updated_at = get_taipei_now()
    # A type that GAINS H-Comic gains the label with it.
    ensure_franchise_label(db, db_franchise)
    db.commit()
    db.refresh(db_franchise)

    attach_remark(db, "franchise", db_franchise, viewer.user_id)

    return db_franchise


@router.patch(
    "/{system_id}", response_model=schemas.FranchiseResponse, summary="Patch Franchise"
)
def patch_franchise(
    system_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
    viewer: Viewer = Depends(get_viewer),
):
    """Partially updates a Franchise (useful for quick inline rating edits)."""
    db_franchise = (
        db.query(models.Franchise)
        .filter(models.Franchise.system_id == system_id)
        .first()
    )
    if not db_franchise or not franchise_visible(db, viewer, db_franchise.system_id):
        raise HTTPException(status_code=404, detail="Franchise not found.")

    payload, remark, has_remark = pop_remark(payload)
    _check_type_family(db, db_franchise.system_id, payload)
    apply_column_patch(db_franchise, payload)
    if has_remark:
        upsert_remark(
            db, "franchise", db_franchise.system_id, remark, viewer.user_id
        )

    db_franchise.updated_at = get_taipei_now()
    # A type that GAINS H-Comic gains the label with it.
    ensure_franchise_label(db, db_franchise)
    db.commit()
    db.refresh(db_franchise)

    attach_remark(db, "franchise", db_franchise, viewer.user_id)

    return db_franchise


@router.delete("/{system_id}", summary="Delete Franchise")
def delete_franchise(
    system_id: str,
    db: Session = Depends(get_db),
    admin: Viewer = Depends(require_manage_catalog),
    viewer: Viewer = Depends(get_viewer),
):
    """
    Permanently deletes a Franchise.
    Note: Series and Anime entries linked to this Franchise will simply have their
    franchise_id set to NULL due to the V2 PostgreSQL ON DELETE SET NULL constraint.
    """
    db_franchise = (
        db.query(models.Franchise)
        .filter(models.Franchise.system_id == system_id)
        .first()
    )
    if not db_franchise or not franchise_visible(db, viewer, db_franchise.system_id):
        raise HTTPException(status_code=404, detail="Franchise not found")

    # Stage the deleted record log before actually deleting
    log_deleted_record(db, db_franchise, "Franchise")

    # fk_plan_next_franchise cascades the franchise's plan rows away.
    db.delete(db_franchise)
    db.commit()

    return {"status": "success", "message": "Franchise deleted successfully."}
