"""
Order follows: where one viewer stands in an order they follow.

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

What is NEXT is decided by `next_steps`, the one place both the dashboard
and the entry page's panel read it from. A follow carries an importance, and
only steps at or above it are candidates (Optional < Normal < Recommended <
Essential); a step the viewer has skipped is never one, and nor is a step that
is done or already active - an active step is "now", not "next". From the
dashboard's point of view the next step is the earliest candidate, even when
later steps are done: a gap is exactly what the follower needs to see. From an
entry's point of view it is the first candidate after that entry's step.

The direct next may be followed by a short lookahead, so a follower reading a
Normal or Optional next still sees the next step that matters: the first
Recommended-or-Essential candidate after it, and, when that one is
Recommended, the first Essential after that. A Recommended next is followed by
the next Essential; an Essential next by nothing.

Which steps exist is not decided here. The router hands over the same
resolved steps the guide draws (resolve_items for a hand-built order, the
generated list for a built-in one), so the progress and the page always count
the same steps.
"""

from typing import Any, Dict, Iterable, List, Optional, Tuple
from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.services.domain.order import ITEM_IMPORTANCE, normalize_importance
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

# Rank on the importance ladder, lowest first. ITEM_IMPORTANCE lists the rungs
# highest first, so the rank is read off it backwards.
IMPORTANCE_RANK = {
    value: rank for rank, value in enumerate(reversed(ITEM_IMPORTANCE))
}
RECOMMENDED_RANK = IMPORTANCE_RANK["Recommended"]
ESSENTIAL_RANK = IMPORTANCE_RANK["Essential"]


def importance_rank(value: Any) -> int:
    """The rung's rank; anything unrecognised ranks as Normal."""
    return IMPORTANCE_RANK[normalize_importance(value)]


# The user_media_list column a step's ep_start / ep_end are measured against.
# Mirrors the range units the guide labels (frontend OrderGuide.jsx):
# episodes for the watched series types, issues for a comic, chapters for
# manga and books. A type not listed has no unit count, so its steps are
# done by status alone.
UNIT_FIELDS = {
    "anime": "ep_fin",
    "tv-show": "ep_fin",
    "cartoon": "ep_fin",
    "hentai": "ep_fin",
    "comic": "issue_fin",
    "manga": "ch_fin",
    "book": "ch_fin",
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
    steps: List[Dict[str, Any]],
    rows: Dict[UUID, Any],
    skipped: Iterable[Any] = (),
) -> List[Dict[str, Any]]:
    """
    Copies of `steps`, each carrying `number` (1-based), `state` and
    `skipped` - whether the step's `step_id` is among the follow's skips.
    """
    skipped = set(skipped)
    out = []
    for number, step in enumerate(steps, start=1):
        row = rows.get(step.get("entry_id"))
        status = row.status if row is not None else None
        field = UNIT_FIELDS.get(step.get("media_type"))
        units = getattr(row, field, None) if (row is not None and field) else None
        out.append(
            {
                **step,
                "number": number,
                "state": step_state(step, status, units),
                "skipped": step.get("step_id") in skipped,
            }
        )
    return out


def _is_candidate(step: Dict[str, Any]) -> bool:
    """Not done, not already in progress, and not skipped."""
    return step["state"] == PENDING and not step.get("skipped")


def _first_candidate(
    states: List[Dict[str, Any]], start: int, min_rank: int
) -> Tuple[int, Optional[Dict[str, Any]]]:
    """(index, step) of the first candidate from `start` at `min_rank` or above."""
    for index in range(start, len(states)):
        step = states[index]
        if _is_candidate(step) and importance_rank(step.get("importance")) >= min_rank:
            return index, step
    return -1, None


def next_steps(
    states: List[Dict[str, Any]],
    importance: Any,
    after: Optional[int] = None,
) -> Dict[str, Any]:
    """
    The direct next step and the lookahead behind it.

    `importance` is the follow's; `after` is the index in `states` of the step
    the viewer is standing on, or None to read from the start of the order.
    Returns {"next": step or None, "coming_up": [steps]}. Each lookahead step
    sits on a higher rung than the one before it, so the list holds at most
    two: a Recommended and then an Essential.
    """
    start = 0 if after is None else after + 1
    index, direct = _first_candidate(states, start, importance_rank(importance))
    coming_up: List[Dict[str, Any]] = []
    if direct is None:
        return {"next": None, "coming_up": coming_up}

    rank = importance_rank(direct.get("importance"))
    while rank < ESSENTIAL_RANK:
        index, step = _first_candidate(
            states, index + 1, max(rank + 1, RECOMMENDED_RANK)
        )
        if step is None:
            break
        coming_up.append(step)
        rank = importance_rank(step.get("importance"))
    return {"next": direct, "coming_up": coming_up}


def summarize(states: List[Dict[str, Any]], importance: Any) -> Dict[str, Any]:
    """done / total, every active step, and the next step from the start."""
    return {
        "done": sum(1 for s in states if s["state"] == DONE),
        "total": len(states),
        "now": [s for s in states if s["state"] == ACTIVE],
        "up_next": next_steps(states, importance)["next"],
    }


def occurrences_of(
    states: List[Dict[str, Any]], entry_id: UUID, importance: Any
) -> List[Dict[str, Any]]:
    """
    Every step of the order naming `entry_id`, with what is next from it.

    A split run (A ep 1-10 -> B -> A ep 11-12) names one entry twice, and the
    two halves sit at different places, so each occurrence carries its own
    next and lookahead rather than being folded into one.
    """
    found = []
    for index, step in enumerate(states):
        if step.get("entry_id") != entry_id:
            continue
        found.append({"step": step, **next_steps(states, importance, after=index)})
    return found
