"""Backup pipeline: dump the database to Google Sheets."""

import logging
import threading
from typing import Callable, Optional

from sqlalchemy.orm import Session

from app.database import get_taipei_now
from app.services.domain.character_tags import (
    character_tag_sheet_headers,
    character_tag_sheet_rows,
)
from app.services.domain.credits import sheet_link_headers, sheet_link_rows
from app.services.integrations.sheets import bulk_overwrite_sheet
from app.services.pipelines.tabs import SHEET_TABS
from app.services.pipelines.worker import (
    BACKUP_LOCK_KEY,
    PULL_LOCK_KEY,
    AlreadyRunning,
    Claim,
    Progress,
    claim,
    start_worker,
)
from app.utils.data_control_utils import log_data_control
from app.utils.formatter import (
    format_for_sheet,
    format_model_for_sheet,
)

logger = logging.getLogger(__name__)

# One Backup at a time, across every process on the database: the web app and
# the nightly `deploy/backup/sheets.sh`, which runs execute_backup in a
# process of its own. Two writers on one sheet each trim what the other wrote
# and share one per-minute Sheets quota, so a second run only makes the first
# slower. Nor while a Pull runs: the database is half restored, and writing it
# over the sheet the Pull is reading from would lose the rest. See worker.py.


class BackupAlreadyRunning(AlreadyRunning):
    """Another Backup, or a Pull, holds the sheet; this one was refused before writing."""


def claim_backup() -> Claim:
    return claim(
        BACKUP_LOCK_KEY,
        BackupAlreadyRunning,
        "A backup is already running. Its result will appear in the Data Control log.",
        excludes=[(
            PULL_LOCK_KEY,
            "A pull is running. Back up once it has finished.",
        )],
    )


def execute_backup(
    db: Session,
    action_type: str = "Manual",
    on_progress: Optional[Progress] = None,
    log_ids: Optional[list] = None,
) -> dict:
    """
    Retrieves the entire PostgreSQL database and permanently overwrites
    the target tabs in Google Sheets dynamically based on the DB schema.

    `log_ids`, when given, receives the id of the row this Backup logs, so a
    batch run that ends in a Backup (Fill All, Replace All) can link it.

    Raises BackupAlreadyRunning, and writes and logs nothing, while another
    Backup or a Pull is in flight.
    """
    held = claim_backup()
    try:
        return _write_backup(db, action_type, on_progress, log_ids)
    finally:
        held.release()


def start_backup(
    session_factory: Callable[[], Session],
    emit: Callable[[dict], None],
    action_type: str = "Manual",
) -> threading.Thread:
    """
    Claim the Backup, then run it on a thread of its own, reporting through
    `emit` as SSE-shaped events (`processing` per tab, then `success` or
    `error`).

    The claim is taken HERE, synchronously, so a refusal reaches the caller as
    BackupAlreadyRunning before anything starts. The thread opens its own
    session and never waits on its listener: a reloaded page or a dropped
    connection must not stop a Backup halfway, because a sheet with some tabs
    new and some old is a worse restore point than either.
    """
    held = claim_backup()

    def progress(tab_name: str, done: int, total: int) -> None:
        emit({"status": "processing", "current_entry": tab_name,
              "processed": done, "total": total})

    def run() -> None:
        db = session_factory()
        try:
            result = _write_backup(db, action_type, progress)
            emit({**result, "processed": len(SHEET_TABS), "total": len(SHEET_TABS)})
        except Exception as e:  # already logged and recorded by _write_backup
            emit({"status": "error", "message": str(e)})
        finally:
            db.close()

    return start_worker("backup", held, run)


def _write_backup(
    db: Session,
    action_type: str,
    on_progress: Optional[Progress],
    log_ids: Optional[list] = None,
) -> dict:
    sink = log_ids if log_ids is not None else []
    logger.info("Starting Google Sheets Backup Pipeline (%s)...", action_type)
    started_at = get_taipei_now()

    try:
        # One block per tab, driven by the registry Pull restores from, so the
        # two can never disagree about a tab's name, columns or order. Entry
        # tabs append their credit/tag columns AFTER the plain model columns
        # (Pull matches by header NAME, never position - see
        # credit_roles.LEGACY_SHEET_COLUMN for why the headers never change).
        total = len(SHEET_TABS)
        for index, tab in enumerate(SHEET_TABS, start=1):
            if on_progress:
                on_progress(tab.name, index, total)
            rows = tab.rows(db)
            # ONE filtered column-name list drives both the header row and
            # every value row (format_model_for_sheet's `columns` argument),
            # so a column dropped here (Media Source's option_id) can never
            # go missing from only one of the two and misalign every row.
            kept_columns = [
                c.name
                for c in tab.model.__table__.columns
                if c.name not in tab.drop_columns
            ]
            headers = kept_columns + [name for name, _fn in tab.extra_columns]
            matrix = []
            for r in rows:
                row_values = format_model_for_sheet(r, columns=kept_columns)
                row_values += [
                    format_for_sheet(fn(r, db)) for _name, fn in tab.extra_columns
                ]
                matrix.append(row_values)
            if tab.media_type:
                headers += sheet_link_headers(tab.media_type)
                for row, links in zip(matrix, sheet_link_rows(db, tab.media_type, rows)):
                    row.extend(links)
            if tab.character_tags:
                headers += character_tag_sheet_headers()
                for row, tags in zip(matrix, character_tag_sheet_rows(db, rows)):
                    row.extend(tags)
            bulk_overwrite_sheet(tab.name, [headers] + matrix)

        logger.info("Backup Pipeline completed successfully.")
        sink.append(log_data_control(
            db, "Backup", "Backup", action_type, "Success", started_at=started_at
        ))
        return {"status": "success", "message": "All tabs backed up to Google Sheets"}
    except Exception as e:
        logger.error("Backup failed: %s", e)
        sink.append(
            log_data_control(
                db, "Backup", "Backup", action_type, "Failed", error_message=str(e),
                started_at=started_at,
            )
        )
        raise e
