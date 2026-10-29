"""
How many entries each franchise or series holds, for the admin pickers that
offer the busiest first.

One grouped count over the `media` supertable per list, through
apply_media_visibility: a count is a smaller leak than a name, but a
franchise counting an entry the viewer cannot see still says it exists.
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.services.rbac.enforcement import apply_media_visibility


def attach_entry_counts(db: Session, rows, column, viewer) -> None:
    """
    Set `row.entry_count` on ORM franchises or series in place.

    `column` is the media column naming the tier - `models.Media.franchise_id`
    or `models.Media.series_id`. A row with no visible entries counts 0.
    """
    if not rows:
        return
    query = db.query(column, func.count(models.Media.system_id)).filter(
        column.in_([row.system_id for row in rows])
    )
    counts = dict(apply_media_visibility(query, db, viewer).group_by(column).all())
    for row in rows:
        row.entry_count = counts.get(row.system_id, 0)
