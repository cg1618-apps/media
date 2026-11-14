"""
routers/statistics.py
Counts of the catalogue for the Statistics page's catalogue sections.

Every holder of `view.statistics` - super, user and shared - sees them; an
account with a list of its own sees its personal sections beside them, built
in the browser (docs/viewers.md, "Seasonal and Statistics"). A guest has no
Statistics page and this route refuses it. The counts are aggregates, so they
are computed here rather than by downloading every entry to count them, and
each is narrowed to what the viewer may see (services/domain/catalogue_stats.py).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.dependencies import get_db
from app.services.domain.catalogue_stats import (
    anime_season_counts,
    score_distributions,
    type_counts,
)
from app.services.rbac.resolver import Viewer, require_view_statistics

router = APIRouter(prefix="/api/statistics", tags=["Statistics"])


@router.get(
    "/catalogue",
    response_model=schemas.CatalogueStatistics,
    summary="Counts of the catalogue",
)
def catalogue_statistics(
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_view_statistics),
):
    """Entries and franchises per media type, anime per season, and the MAL
    and AniList score distributions, over what the viewer's role and mode let
    it see."""
    return {
        "by_type": type_counts(db, viewer),
        "by_season": anime_season_counts(db, viewer),
        "scores": score_distributions(db, viewer),
    }
