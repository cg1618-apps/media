"""
Watch order follows: where one viewer stands in an order they follow.

Progress is computed on read, per viewer, from that viewer's own
user_media_list rows - nothing about it is stored. Each step of the order is
in exactly one of three states:

- **done** - the entry's status is one of the type's completed statuses, or
  "Dropped" / "Temp Dropped" (a dropped entry is not something to come back
  to in this order), or the step covers a range ending at `ep_end` and the
  viewer's unit count for the entry has reached it.
- **active** - the entry's status is an in-progress one (Active / Passive
  Watching, Reading or Playing) and the step is not done by its range. A
  ranged step the viewer has not reached yet (`ep_start` beyond the next
  unit) stays pending, so a split run's later half is not "now" while the
  first half is being watched.
- **pending** - everything else: no list row, a Plan to / Might status,
  Paused, and so on.

"Up next" is the EARLIEST pending step in reading order, even when later
steps are done: a gap is exactly what the follower needs to see.

Which steps exist is not decided here. The router hands over the same
resolved steps the guide draws (resolve_items for a hand-built order, the
generated list for a built-in one), so the progress and the page always count
the same steps.
"""

from typing import Any, Dict, Iterable, List, Optional, Tuple
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.utils.constants import (
    COMPLETED_PLAY_STATUSES,
    COMPLETED_READ_STATUSES,
    COMPLETED_WATCH_STATUSES,
    PlayStatus,
    ReadStatus,
    WatchStatus,
)

DONE = "done"
ACTIVE = "active"
PENDING = "pending"

# Completed for any type, plus the two dropped statuses every vocabulary
# shares. The three vocabularies spell those the same way, so one set serves
# them all.
DONE_STATUSES = frozenset(
    str(s.value)
    for s in (
        *COMPLETED_WATCH_STATUSES,
        *COMPLETED_READ_STATUSES,
        *COMPLETED_PLAY_STATUSES,
        WatchStatus.DROPPED,
        WatchStatus.TEMP_DROPPED,
        ReadStatus.DROPPED,
        ReadStatus.TEMP_DROPPED,
        PlayStatus.DROPPED,
        PlayStatus.TEMP_DROPPED,
    )
)

ACTIVE_STATUSES = frozenset(
    str(s.value)
    for s in (
        WatchStatus.ACTIVE_WATCHING,
        WatchStatus.PASSIVE_WATCHING,
        ReadStatus.ACTIVE_READING,
        ReadStatus.PASSIVE_READING,
        PlayStatus.ACTIVE_PLAYING,
        PlayStatus.PASSIVE_PLAYING,
    )
)

# The user_media_list column a step's ep_start / ep_end are measured against.
# Mirrors the range units the guide labels (frontend WatchOrderGuide.jsx):
# episodes for the watched series types, issues for a comic, chapters for
# manga and novels. A type not listed has no unit count, so its steps are
# done by status alone.
UNIT_FIELDS = {
    "anime": "ep_fin",
    "tv-show": "ep_fin",
    "cartoon": "ep_fin",
    "hentai": "ep_fin",
    "comic": "issue_fin",
    "manga": "ch_fin",
    "novel": "ch_fin",
}


def step_state(step: Dict[str, Any], status: Optional[str], units) -> str:
    """The state of one step, given the viewer's status and unit count."""
    if status in DONE_STATUSES:
        return DONE
    ep_start, ep_end = step.get("ep_start"), step.get("ep_end")
    if ep_end is not None and units is not None and units >= ep_end:
        return DONE
    if status in ACTIVE_STATUSES:
        # Not reached yet: the next unit to watch is before this range.
        if ep_start is not None and (units or 0) + 1 < ep_start:
            return PENDING
        return ACTIVE
    return PENDING


def list_rows_for(
    db: Session, user_id: UUID, entry_ids: Iterable[UUID]
) -> Dict[UUID, Tuple[Optional[str], Any]]:
    """{media_id: user_media_list row} for the viewer, in one query."""
    ids = {e for e in entry_ids if e is not None}
    if not ids or user_id is None:
        return {}
    rows = (
        db.query(models.UserMediaList)
        .filter(
            models.UserMediaList.user_id == user_id,
            models.UserMediaList.media_id.in_(list(ids)),
        )
        .all()
    )
    return {row.media_id: row for row in rows}


def annotate_states(
    steps: List[Dict[str, Any]], rows: Dict[UUID, Any]
) -> List[Dict[str, Any]]:
    """Copies of `steps`, each carrying `number` (1-based) and `state`."""
    out = []
    for number, step in enumerate(steps, start=1):
        row = rows.get(step.get("entry_id"))
        status = row.status if row is not None else None
        field = UNIT_FIELDS.get(step.get("media_type"))
        units = getattr(row, field, None) if (row is not None and field) else None
        out.append(
            {**step, "number": number, "state": step_state(step, status, units)}
        )
    return out


def summarize(states: List[Dict[str, Any]]) -> Dict[str, Any]:
    """done / total, every active step, and the earliest pending step."""
    return {
        "done": sum(1 for s in states if s["state"] == DONE),
        "total": len(states),
        "now": [s for s in states if s["state"] == ACTIVE],
        "up_next": next((s for s in states if s["state"] == PENDING), None),
    }


def occurrences_of(
    states: List[Dict[str, Any]], entry_id: UUID
) -> List[Dict[str, Any]]:
    """
    Every step of the order naming `entry_id`, with its neighbours.

    A split run (A ep 1-10 -> B -> A ep 11-12) names one entry twice, and the
    two halves sit between different steps, so each occurrence carries its own
    previous and next rather than being folded into one.
    """
    found = []
    for index, step in enumerate(states):
        if step.get("entry_id") != entry_id:
            continue
        found.append(
            {
                "step": step,
                "previous": states[index - 1] if index > 0 else None,
                "next": states[index + 1] if index + 1 < len(states) else None,
            }
        )
    return found
