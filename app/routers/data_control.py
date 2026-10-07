"""
routers/data_control.py - the admin Data Control actions.

Fill / Replace / Pull routes are generated from the pipeline registry
(app/services/pipelines/specs.py), one literal route per media type, so a new
type gets its endpoints by being added there. Backup, Calculate and Check are
single actions and stay hand-written below.
"""

import asyncio
import json
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.dependencies import get_db
from app.schemas.review import (
    AloneGroupKind,
    AloneGroupReviewed,
    AloneGroupsReport,
    MusicReviewRow,
)
from app.services.calculation import (
    bulk_check_cover_image,
    bulk_delete_orphaned_cover_images,
    bulk_download_missing_covers,
    bulk_set_cover_image_fields,
    run_calculate_all,
    run_sync_cast,
)
from app.services.domain import find_all_duplicates, find_all_remarks
from app.services.domain.alone_groups import (
    GroupNotFound,
    NotAlone,
    find_alone_groups,
    mark_alone_group_reviewed,
)
from app.services.domain.music_review import find_flagged_music
from app.services.pipelines import fill, replace
from app.services.pipelines.backup import BackupAlreadyRunning, start_backup
from app.services.pipelines.clean import CleanAborted, apply_clean, scan_orphans
from app.services.pipelines.pull import execute_pull_all, execute_pull_specific
from app.services.pipelines.specs import PIPELINES
from app.services.pipelines.tabs import MEDIA_TYPE_FOR_TAB
from app.services.rbac.permissions import PERM_ADMIN_AUTHZ
from app.services.rbac.resolver import Viewer, require_manage_pipelines
from app.utils.data_control_utils import log_data_control

logger = logging.getLogger(__name__)


class DownloadCoversBody(BaseModel):
    system_ids: Optional[list[str]] = None


router = APIRouter(
    prefix="/api/data-control",
    tags=["Data Control Pipelines"],
    # ONE gate: the ROLE. `manage.pipelines` answers "may this account run
    # pipelines", and nothing asks which access mode it is sitting in.
    #
    # There used to be a second gate requiring an unscoped mode (Decision 14),
    # on the grounds that a narrowed session would write a PARTIAL sheet over
    # the complete one. No pipeline is viewer-aware, so it never could:
    # execute_backup reads db.query(tab.model).all(), runner.py reads
    # db.query(spec.model).all(), and calculation.py says outright that
    # Calculate "is a pipeline with no viewer". entry_visible and
    # hidden_label_ids are called only from the entry routers. The gate
    # refused requests without changing a byte of output.
    #
    # ROUTER level, not per handler: most of this router's routes are
    # registered in a loop over PIPELINES rather than declared, so a
    # per-handler gate would miss them silently - which is exactly how the
    # Replace-one oracle survived a year.
    dependencies=[
        Depends(require_manage_pipelines),
    ],
)


def _stream(generator) -> StreamingResponse:
    return StreamingResponse(generator, media_type="text/event-stream")


def _json(result: dict) -> JSONResponse:
    """A pipeline reports failure as a status dict; map it to the HTTP error
    it names (404 for a missing entry, 400 for a bad request) instead of 200."""
    if result.get("status") == "error":
        raise HTTPException(
            status_code=result.get("status_code", 400), detail=result.get("message")
        )
    return JSONResponse(content=result)


def _attr(module, prefix: str, key: str):
    return getattr(module, f"{prefix}{key.replace('-', '_')}")


# ---------------------------------------------------------------------------
# Fill / Replace / Pull per media type
# ---------------------------------------------------------------------------

# Literal routes come first so "/fill/all" and "/pull" can never be caught by
# a parameterised sibling declared below.


@router.post("/fill/all", summary="Fill every type, then Backup (SSE)")
async def trigger_fill_all(request: Request, db: Session = Depends(get_db)):
    return _stream(fill.execute_fill_all(db, request, action_type="Manual"))


@router.post("/replace/all", summary="Replace every type, then Backup (SSE)")
async def trigger_replace_all(request: Request, db: Session = Depends(get_db)):
    return _stream(replace.execute_replace_all(db, request, action_type="Manual"))


def _register_fill_route(spec) -> None:
    key, label = spec.key, spec.label
    run_fill = _attr(fill, "execute_fill_", key)

    @router.post(f"/fill/{key}", summary=f"Fill {label} (SSE)", name=f"fill_{key}")
    async def trigger_fill(request: Request, db: Session = Depends(get_db)):
        return _stream(run_fill(db, request, action_type="Manual", log_action=True))


def _register_replace_routes(spec) -> None:
    key, label = spec.key, spec.label
    run_single = _attr(replace, "execute_replace_single_", key)

    if spec.replace_select is not None:
        run_bulk = _attr(replace, "execute_replace_", key)

        @router.post(f"/replace/{key}", summary=f"Replace {label} (SSE)", name=f"replace_{key}")
        async def trigger_replace(request: Request, db: Session = Depends(get_db)):
            return _stream(run_bulk(db, request, action_type="Manual", log_action=True))

    @router.post(
        f"/replace/{key}/{{entry_id}}",
        summary=f"Replace one {label} entry",
        name=f"replace_single_{key}",
    )
    async def trigger_replace_single(entry_id: str, db: Session = Depends(get_db)):
        return _json(await run_single(db, entry_id, action_type="Manual", log_action=False))


for _spec in PIPELINES.values():
    _register_fill_route(_spec)
    # A fill_only type (Studio, Seiyuu) has no Replace, bulk or single - see
    # PipelineSpec.fill_only.
    if not _spec.fill_only:
        _register_replace_routes(_spec)


# ---------------------------------------------------------------------------
# Backup / Pull
# ---------------------------------------------------------------------------


# Production sits behind a Cloudflare Tunnel, which answers 524 to a request
# that sends nothing for ~100 s. A tab paused on a Sheets 429 waits 60-120 s,
# so the stream says something well inside that window even when the Backup
# has nothing new to report.
BACKUP_KEEPALIVE_SECONDS = 15.0


@router.post("/backup", summary="Back up every table to Google Sheets (SSE)")
async def trigger_backup_all():
    """
    Starts the Backup on a worker of its own and relays its progress as SSE.

    409 while another Backup runs. Once started, the Backup finishes and logs
    its row whether or not anyone is still listening - see start_backup.
    """
    loop = asyncio.get_running_loop()
    events: asyncio.Queue = asyncio.Queue()

    def emit(event: dict) -> None:
        # Never raise into the worker: a closed loop (the server shutting
        # down) means nobody is listening, not that the Backup failed.
        try:
            loop.call_soon_threadsafe(events.put_nowait, event)
        except RuntimeError:
            pass

    try:
        start_backup(SessionLocal, emit, action_type="Manual")
    except BackupAlreadyRunning as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    async def relay():
        while True:
            try:
                event = await asyncio.wait_for(events.get(), BACKUP_KEEPALIVE_SECONDS)
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"
                continue
            yield f"data: {json.dumps(event)}\n\n"
            if event["status"] != "processing":
                return

    return _stream(relay())


@router.post("/pull", summary="Restore every tab from Google Sheets")
def trigger_pull_all(
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_manage_pipelines),
):
    # The router-level gate already established manage.pipelines; this reads
    # the same viewer to decide whether the three authorization tabs restore
    # too. See AUTHZ_TABS in tabs.py for why they are separate.
    return JSONResponse(
        content=execute_pull_all(
            db,
            action_type="Manual",
            may_restore_authz=viewer.has(PERM_ADMIN_AUTHZ),
        )
    )


def _register_pull_route(key: str, tab_name: str) -> None:
    @router.post(f"/pull/{key}", summary=f"Restore the {tab_name} tab", name=f"pull_{key}")
    def trigger_pull(
        db: Session = Depends(get_db),
        viewer: Viewer = Depends(require_manage_pipelines),
    ):
        return _json(
            execute_pull_specific(
                db,
                tab_name,
                action_type="Manual",
                log_action=True,
                may_restore_authz=viewer.has(PERM_ADMIN_AUTHZ),
            )
        )


# Per-type shortcuts the admin page links to; every other tab goes through
# /pull/{tab_name}.
for _tab, _media in MEDIA_TYPE_FOR_TAB.items():
    if _media in ("manga", "novel", "comic", "cartoon"):
        _register_pull_route(_media, _tab)


@router.post("/pull/{tab_name}", summary="Restore one sheet tab by name")
def trigger_pull_specific(
    tab_name: str,
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_manage_pipelines),
):
    return _json(
        execute_pull_specific(
            db,
            tab_name,
            action_type="Manual",
            log_action=True,
            may_restore_authz=viewer.has(PERM_ADMIN_AUTHZ),
        )
    )


# ---------------------------------------------------------------------------
# Clean (find rows the sheet has forgotten, then delete the ones an admin ticks)
# ---------------------------------------------------------------------------


class CleanItem(BaseModel):
    tab: str
    system_id: str


class CleanApplyBody(BaseModel):
    items: list[CleanItem]


@router.get("/clean/scan", summary="Find local rows the sheet no longer mentions")
def clean_scan(db: Session = Depends(get_db)):
    """
    Read-only, and logs nothing - like check/duplicates.

    Both Clean routes are gated on `manage.pipelines` and nothing else.

    Clean is the one place on this router where the removed mode gate did
    something real, and it is recorded here rather than left to be found. The
    rest of the router is viewer-blind in a way that made the gate inert; this
    report is an unrestricted READ of the whole catalogue by construction - it
    names every orphan row, including entries a narrow mode hides - and apply
    deletes by system_id. So a narrowed operator now sees orphans it could not
    see through any entry route.

    Accepted: that operator holds `manage.pipelines`, which is `admin` or
    `super`, and a mode is a view ceiling they chose for themselves rather
    than a boundary against them. If this ever needs closing, close it here,
    by filtering the report - not by gating the router on a mode that the
    other four pipelines never read.
    """
    try:
        return JSONResponse(content=scan_orphans(db))
    except CleanAborted as exc:
        # 503, not 500: the request was fine, the sheet is unavailable or
        # untrustworthy, and retrying later is the right advice.
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/clean/apply", summary="Delete the ticked orphans, after a re-scan")
def clean_apply(body: CleanApplyBody, db: Session = Depends(get_db)):
    """
    Delete the ticked rows, minus any the re-scan no longer calls orphaned.

    The re-scan is why this takes an explicit list of ids rather than a
    dry_run flag: the destructive call names exactly what it intends to remove,
    and the server independently re-derives whether each one still qualifies.
    """
    try:
        return JSONResponse(
            content=apply_clean(db, [item.model_dump() for item in body.items])
        )
    except CleanAborted as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Calculate / Check
# ---------------------------------------------------------------------------


@router.post("/calculate/all")
def trigger_calculate_all(db: Session = Depends(get_db)):
    return JSONResponse(content=run_calculate_all(db))


@router.post("/calculate/sync-cast")
def trigger_sync_cast(db: Session = Depends(get_db)):
    """Calculate All's cast step on its own - see calculation.run_sync_cast."""
    try:
        result = run_sync_cast(db)
    except Exception as exc:
        log_data_control(
            db, "Calculate", "Sync Cast", "Manual", "Failed", error_message=str(exc)
        )
        raise
    log_data_control(db, "Calculate", "Sync Cast", "Manual", "Success")
    return JSONResponse(content=result)


@router.get("/calculate/check-cover-image")
def trigger_check_cover_image(
    db: Session = Depends(get_db), entry_type: Optional[str] = Query(None)
):
    return JSONResponse(content=bulk_check_cover_image(db, entry_type=entry_type))


@router.delete("/calculate/delete-orphaned-covers")
def trigger_delete_orphaned_covers(db: Session = Depends(get_db)):
    return JSONResponse(content=bulk_delete_orphaned_cover_images(db))


@router.post("/calculate/set-cover-image-fields")
def trigger_set_cover_image_fields(db: Session = Depends(get_db)):
    return JSONResponse(content=bulk_set_cover_image_fields(db))


@router.post("/calculate/download-missing-covers")
def trigger_download_missing_covers(
    body: DownloadCoversBody = DownloadCoversBody(), db: Session = Depends(get_db)
):
    return JSONResponse(content=bulk_download_missing_covers(db, system_ids=body.system_ids))


@router.get("/check/duplicates")
def check_duplicates(db: Session = Depends(get_db)):
    return JSONResponse(content=find_all_duplicates(db))


@router.get("/check/remarks")
def check_remarks(
    db: Session = Depends(get_db),
    viewer: Viewer = Depends(require_manage_pipelines),
):
    # The CALLER's own remarks. A remark is a personal-scope note and belongs
    # to its author (decision 12), and this screen shows one per entry - a
    # shape that only means something once an author is fixed. Identical to
    # the old answer on a single-account installation.
    return JSONResponse(content=find_all_remarks(db, viewer.user_id))


@router.get("/check/music", response_model=list[MusicReviewRow])
def check_music(db: Session = Depends(get_db)):
    # Every anime with a song list or a song on Need, Pending or No Full
    # Version. Not per caller: the music sections are catalogue notes, one
    # shared set of rows per anime (music_review.py).
    return find_flagged_music(db)


@router.get("/check/alone-groups", response_model=AloneGroupsReport)
def check_alone_groups(db: Session = Depends(get_db)):
    # Franchises and series holding exactly one entry, less those whose lone
    # entry is the one recorded as reviewed (alone_groups.py).
    return find_alone_groups(db)


@router.post(
    "/check/alone-groups/{kind}/{system_id}/reviewed",
    response_model=AloneGroupReviewed,
)
def review_alone_group(
    kind: AloneGroupKind, system_id: UUID, db: Session = Depends(get_db)
):
    # Records the group's CURRENT lone entry, so the group returns by itself
    # once that entry is replaced. 409 when the group no longer holds exactly
    # one entry: the page was showing something that has since changed.
    try:
        return mark_alone_group_reviewed(db, kind, system_id)
    except GroupNotFound:
        raise HTTPException(status_code=404, detail=f"No such {kind}.")
    except NotAlone:
        raise HTTPException(
            status_code=409,
            detail=f"This {kind} no longer holds exactly one entry.",
        )
