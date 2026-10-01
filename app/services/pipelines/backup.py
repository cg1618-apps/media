"""Backup pipeline: dump the database to Google Sheets."""

import contextvars
import logging
import threading
from typing import Callable, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import engine
from app.services.domain.credits import sheet_link_headers, sheet_link_rows
from app.services.integrations.sheets import bulk_overwrite_sheet
from app.services.pipelines.tabs import SHEET_TABS
from app.utils.data_control_utils import log_data_control
from app.utils.formatter import (
    format_for_sheet,
    format_model_for_sheet,
)

logger = logging.getLogger(__name__)

# (tab name, tabs written so far, total tabs)
Progress = Callable[[str, int, int], None]

# One Backup at a time, across every process on the database: the web app and
# the nightly `deploy/backup/sheets.sh`, which runs execute_backup in a
# process of its own. Two writers on one sheet each trim what the other wrote
# and share one per-minute Sheets quota, so a second run only makes the first
# slower. A SESSION-level advisory lock on a connection of its own: it spans
# the Backup's many commits, and PostgreSQL drops it with the connection if
# the process dies, so it can never be left stale.
BACKUP_LOCK_KEY = 1618_0001


class BackupAlreadyRunning(RuntimeError):
    """Another Backup holds the sheet; this one was refused before writing."""


class BackupClaim:
    """The held advisory lock. release() is idempotent."""

    def __init__(self, connection):
        self._connection = connection

    def release(self) -> None:
        connection, self._connection = self._connection, None
        if connection is None:
            return
        try:
            connection.execute(
                text("SELECT pg_advisory_unlock(:key)"), {"key": BACKUP_LOCK_KEY}
            )
        except Exception:
            # The lock lives on the pooled DBAPI connection. Returned to the
            # pool still holding it, it would refuse every Backup until that
            # connection happened to be recycled, so throw the connection away
            # instead - PostgreSQL releases the lock when it closes.
            logger.exception("Could not release the Backup lock; discarding its connection.")
            connection.invalidate()
        finally:
            connection.close()


def claim_backup() -> BackupClaim:
    connection = engine.connect().execution_options(isolation_level="AUTOCOMMIT")
    try:
        held = connection.execute(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": BACKUP_LOCK_KEY}
        ).scalar()
    except Exception:
        connection.close()
        raise
    if not held:
        connection.close()
        raise BackupAlreadyRunning(
            "A backup is already running. Its result will appear in the Data Control log."
        )
    return BackupClaim(connection)


def execute_backup(
    db: Session, action_type: str = "Manual", on_progress: Optional[Progress] = None
) -> dict:
    """
    Retrieves the entire PostgreSQL database and permanently overwrites
    the target tabs in Google Sheets dynamically based on the DB schema.

    Raises BackupAlreadyRunning, and writes and logs nothing, while another
    Backup is in flight.
    """
    claim = claim_backup()
    try:
        return _write_backup(db, action_type, on_progress)
    finally:
        claim.release()


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
    claim = claim_backup()

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
            claim.release()

    # copy_context: the worker's log lines keep the request_id of the request
    # that started it, so one Backup reads as one run in the log viewer.
    worker = threading.Thread(
        target=contextvars.copy_context().run, args=(run,), name="backup", daemon=True
    )
    try:
        worker.start()
    except Exception:
        claim.release()
        raise
    return worker


def _write_backup(db: Session, action_type: str, on_progress: Optional[Progress]) -> dict:
    logger.info("Starting Google Sheets Backup Pipeline (%s)...", action_type)

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
            rows = db.query(tab.model).all()
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
            bulk_overwrite_sheet(tab.name, [headers] + matrix)

        logger.info("Backup Pipeline completed successfully.")
        log_data_control(db, "Backup", "Backup", action_type, "Success")
        return {"status": "success", "message": "All tabs backed up to Google Sheets"}
    except Exception as e:
        logger.error("Backup failed: %s", e)
        log_data_control(
            db, "Backup", "Backup", action_type, "Failed", error_message=str(e)
        )
        raise e
