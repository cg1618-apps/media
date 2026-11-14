"""
routers/statistics.py
Counts of the catalogue for the Statistics page's catalogue version.

An account with a list of its own sees Statistics built from that list, in the
browser. A viewer without one - a guest, a shared account - sees counts of the
catalogue instead (docs/viewers.md, "Seasonal and Statistics"), and those are
aggregates, so they are computed here rather than by downloading every list to
count it. Every count is narrowed to what the viewer may see
(services/domain/catalogue_stats.py).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.dependencies import get_db
from app.services.domain.catalogue_stats import (
    anime_season_counts,
    genre_counts,
    type_counts,
)
from app.services.rbac.resolver import Viewer, get_viewer

router = APIRouter(prefix="/api/statistics", tags=["Statistics"])


@router.get(
    "/catalogue",
    response_model=schemas.CatalogueStatistics,
    summary="Counts of the catalogue",
)
def catalogue_statistics(
    db: Session = Depends(get_db), viewer: Viewer = Depends(get_viewer)
):
    """Entries per media type, per anime season and per genre, over what the
    viewer's role and mode let it see."""
    return {
        "by_type": type_counts(db, viewer),
        "by_season": anime_season_counts(db, viewer),
        "by_genre": genre_counts(db, viewer),
    }
