"""
routers/seasonal.py
Handles API endpoints for the Seasonal table — one account's seasons: their
four counters and their own rating.

Every route on `router` needs an account that may KEEP one (`self.list`). The
counters and the rating belong to one user, so a logged-out caller gets 401
rather than somebody else's numbers, and the rating PATCH asks for `self.list`
rather than for admin - because the rating it writes is the caller's own, and
an administrative account does not keep a library.

`catalogue_router` holds the two reads that are about the catalogue rather
than one account - the current season and the seasons the catalogue holds -
and answers every viewer who reads the catalogue.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_current_user_id, get_db
from app.services.domain.catalogue_stats import anime_season_counts
from app.services.rbac.permissions import PERM_SELF_LIST
from app.services.rbac.resolver import Viewer, get_viewer, require_permission

router = APIRouter(
    prefix="/api/seasonal",
    tags=["Seasonal"],
    # Router-level, not per-route, the shape /api/me uses: every route here
    # reads or writes the caller's OWN rows, so one added later is gated by
    # default rather than by someone remembering. Until 2026-09-12 the prefix
    # asked get_current_user_id alone - "is anybody signed in" - which let an
    # admin account, which holds no self.* grant, keep season ratings of its own.
    # require_permission answers 401, never 403, matching the one error shape
    # the SPA knows.
    dependencies=[Depends(require_permission(PERM_SELF_LIST))],
)

# The catalogue half of the prefix: what any viewer who reads the catalogue may
# ask about seasons, with no list of its own. No router-level gate, so it is a
# separate router, and main.py includes it BEFORE `router` - otherwise
# `/catalogue` would match `router`'s `/{seasonal_id}` and be refused 401 by
# its self.list gate.
catalogue_router = APIRouter(prefix="/api/seasonal", tags=["Seasonal"])


@catalogue_router.get("/current-season", summary="Get Current Season")
def get_current_season(db: Session = Depends(get_db)):
    """The globally configured current season, from system_configs. A fact
    about the calendar, not anybody's data: Future Releases and the catalogue
    version of Seasonal read it for every viewer. The Control Center writes it
    through /api/system/config/current_season, which stays manage.pipelines."""
    result = db.execute(
        text("SELECT config_value FROM system_configs WHERE config_key = 'current_season'")
    ).fetchone()
    return {"current_season": result[0] if result else None}


@catalogue_router.get(
    "/catalogue",
    response_model=List[schemas.SeasonCount],
    summary="Seasons in the catalogue",
)
def list_catalogue_seasons(
    db: Session = Depends(get_db), viewer: Viewer = Depends(get_viewer)
):
    """Every season the viewer's visible anime aired in, newest first, with
    how many. The All Seasons table of Seasonal's catalogue version, for a
    viewer with no seasonal rows of its own."""
    return anime_season_counts(db, viewer)



@router.get("/", response_model=List[schemas.SeasonalResponse], summary="List All Seasonals")
def list_seasonals(
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Returns the caller's own seasonal records, newest season first."""
    return (
        db.query(models.Seasonal)
        .filter(models.Seasonal.user_id == user_id)
        .order_by(models.Seasonal.seasonal.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )


@router.get("/{seasonal_id}", response_model=schemas.SeasonalResponse, summary="Get Seasonal by ID")
def get_seasonal(
    seasonal_id: str,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Returns the caller's own record for one season (e.g. 'WIN 2026')."""
    record = (
        db.query(models.Seasonal)
        .filter(
            models.Seasonal.user_id == user_id,
            models.Seasonal.seasonal == seasonal_id,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail=f"Seasonal '{seasonal_id}' not found.")
    return record


@router.patch("/{seasonal_id}", response_model=schemas.SeasonalResponse, summary="Update Seasonal Rating")
def update_seasonal(
    seasonal_id: str,
    payload: schemas.SeasonalUpdate,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Updates my_rating on the CALLER'S OWN row for this season.

    Any real account may write theirs; a missing row still 404s, because
    create_missing_seasonal mints rows, not this endpoint."""
    record = (
        db.query(models.Seasonal)
        .filter(
            models.Seasonal.user_id == user_id,
            models.Seasonal.seasonal == seasonal_id,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail=f"Seasonal '{seasonal_id}' not found.")
    record.my_rating = payload.my_rating
    db.commit()
    db.refresh(record)
    return record
