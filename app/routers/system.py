"""
routers/system.py
Handles system-level read operations for audit trails (logs).
Also manages System Configurations (e.g. Current Season).
Strictly protected by Admin Role-Based Access Control.
"""

import logging
from typing import List

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.rbac.resolver import require_manage_pipelines

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/system",
    tags=["System Administration"],
    # The role gate only - see data_control.py. These routes are season
    # config, logs and deleted records; they read no entries, so there was
    # never an object set for a mode to narrow.
    dependencies=[
        Depends(require_manage_pipelines),
    ],
)

# ==========================================
# SYSTEM CONFIGURATIONS
# ==========================================


@router.get("/config/current_season", summary="Get Current Season")
def get_current_season(db: Session = Depends(get_db)):
    """Fetches the globally set current season from system_configs."""
    query = text(
        "SELECT config_value FROM system_configs WHERE config_key = 'current_season'"
    )
    result = db.execute(query).fetchone()
    return {"current_season": result[0] if result else "Not Set"}


@router.post("/config/current_season", summary="Set Current Season")
def set_current_season(payload: dict = Body(...), db: Session = Depends(get_db)):
    """Upserts the current season into the system_configs table."""
    val = payload.get("current_season")
    if not val:
        raise HTTPException(
            status_code=400, detail="Missing current_season in payload."
        )

    query = text(
        """
        INSERT INTO system_configs (config_key, config_value) 
        VALUES ('current_season', :val) 
        ON CONFLICT (config_key) 
        DO UPDATE SET config_value = EXCLUDED.config_value
    """
    )

    db.execute(query, {"val": val})
    db.commit()
    return {"message": "Current season updated successfully", "current_season": val}


# ==========================================
# AUDIT LOGS & TRAILS
# ==========================================


@router.get(
    "/logs",
    response_model=List[schemas.DataControlLogResponse],
    summary="Get Data Control Logs",
)
def get_system_logs(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """
    The most recent runs, newest first.

    An operation a batch run ran (Fill Anime under Fill All) is not listed:
    it is read with its run, from /logs/{log_id}. Each run carries how many
    operations it ran in `child_count`.
    """
    Log = models.DataControlLog
    runs = (
        db.query(Log)
        .filter(Log.parent_id.is_(None))
        .order_by(Log.timestamp.desc(), Log.id.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    counts = dict(
        db.query(Log.parent_id, func.count(Log.id))
        .filter(Log.parent_id.in_([run.id for run in runs]))
        .group_by(Log.parent_id)
        .all()
    )
    return [
        schemas.DataControlLogResponse.model_validate(run).model_copy(
            update={"child_count": counts.get(run.id, 0)}
        )
        for run in runs
    ]


@router.get(
    "/logs/{log_id}",
    response_model=schemas.DataControlLogDetailResponse,
    summary="Get a Data Control Log Entry and Its Operations",
)
def get_system_log(log_id: int, db: Session = Depends(get_db)):
    """One log entry, with every operation it ran in the order they ran."""
    Log = models.DataControlLog
    log = db.query(Log).filter(Log.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log entry not found")
    children = db.query(Log).filter(Log.parent_id == log_id).order_by(Log.id).all()
    return schemas.DataControlLogDetailResponse.model_validate(log).model_copy(
        update={
            "child_count": len(children),
            "children": [schemas.DataControlLogResponse.model_validate(c) for c in children],
        }
    )


@router.delete("/logs", summary="Clear Old Data Control Logs")
def clear_system_logs(db: Session = Depends(get_db)):
    """
    Deletes every run except the 10 most recent. A run's operations go with
    it (the foreign key cascades) and do not count toward the ten.
    """
    Log = models.DataControlLog
    keep_ids = (
        db.query(Log.id)
        .filter(Log.parent_id.is_(None))
        .order_by(Log.timestamp.desc(), Log.id.desc())
        .limit(10)
        .subquery()
    )
    count = (
        db.query(Log)
        .filter(Log.parent_id.is_(None), Log.id.notin_(db.query(keep_ids.c.id)))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": count}


@router.delete("/logs/{log_id}", summary="Delete a Data Control Log Entry")
def delete_system_log(log_id: int, db: Session = Depends(get_db)):
    """Deletes one log entry by ID, and the operations it ran with it."""
    log = db.query(models.DataControlLog).filter(models.DataControlLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log entry not found")
    db.delete(log)
    db.commit()
    return {"deleted": log_id}


@router.get(
    "/deleted",
    response_model=List[schemas.DeletedRecordResponse],
    summary="Get Deleted Records",
)
def get_deleted_records(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """Fetches the most recent deleted records log."""
    records = (
        db.query(models.DeletedRecord)
        .order_by(models.DeletedRecord.timestamp.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    return records


@router.delete("/deleted", summary="Clear Old Deleted Records")
def clear_deleted_records(db: Session = Depends(get_db)):
    """Deletes all deleted record entries except the 5 most recent."""
    keep_ids = (
        db.query(models.DeletedRecord.id)
        .order_by(models.DeletedRecord.timestamp.desc())
        .limit(5)
        .subquery()
    )
    count = (
        db.query(models.DeletedRecord)
        .filter(models.DeletedRecord.id.notin_(keep_ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": count}


@router.delete("/deleted/{record_id}", summary="Delete a Deleted Record Entry")
def delete_deleted_record(record_id: int, db: Session = Depends(get_db)):
    """Deletes a single deleted record entry by ID."""
    record = db.query(models.DeletedRecord).filter(models.DeletedRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(record)
    db.commit()
    return {"deleted": record_id}
