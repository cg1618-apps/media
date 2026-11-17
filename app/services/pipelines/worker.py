"""
Sheet pipelines that run on a worker of their own, one at a time.

Backup and Pull both outlast a request behind the Cloudflare Tunnel, so each
runs on a thread of its own and reports through an `emit` callback the router
relays as SSE. Both must also run alone: each holds a PostgreSQL session-level
advisory lock on a connection of its own, which spans the run's many commits
and is dropped by PostgreSQL with the connection if the process dies, so it can
never be left stale.

Every advisory lock key the app uses is declared here, so two can never collide.
"""

import contextvars
import logging
import threading
from typing import Callable, Iterable

from sqlalchemy import text

from app.database import engine

logger = logging.getLogger(__name__)

# Writing the database to the sheet: the web app's Backup, Fill All / Replace
# All's Auto Backup, and the nightly `deploy/backup/sheets.sh`.
BACKUP_LOCK_KEY = 1618_0001
# Writing the sheet into the database: Pull All and single-tab Pull.
PULL_LOCK_KEY = 1618_0002

Emit = Callable[[dict], None]
# (tab name, tabs done so far counting this one, total tabs)
Progress = Callable[[str, int, int], None]


class AlreadyRunning(RuntimeError):
    """A run this one may not overlap holds its lock; refused before it began."""


class Claim:
    """A held advisory lock. release() is idempotent."""

    def __init__(self, connection, key: int):
        self._connection = connection
        self._key = key

    def release(self) -> None:
        connection, self._connection = self._connection, None
        if connection is None:
            return
        try:
            connection.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": self._key})
        except Exception:
            # The lock lives on the pooled DBAPI connection. Returned to the
            # pool still holding it, it would refuse every run until that
            # connection happened to be recycled, so throw the connection away
            # instead - PostgreSQL releases the lock when it closes.
            logger.exception("Could not release advisory lock %s; discarding its connection.", self._key)
            connection.invalidate()
        finally:
            connection.close()


# A lock held by ANY session on this database, read without taking it - taking
# it to test it would refuse its rightful owner for that instant. A bigint key
# is stored split across classid (high 32 bits) and objid (low), objsubid 1.
_HELD = text(
    """
    SELECT EXISTS (
        SELECT 1 FROM pg_locks
        WHERE locktype = 'advisory' AND granted
          AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND classid::bigint = :high AND objid::bigint = :low AND objsubid = 1
    )
    """
)


def claim(
    key: int,
    refusal: Callable[[str], AlreadyRunning],
    message: str,
    excludes: Iterable[tuple[int, str]] = (),
) -> Claim:
    """
    Take advisory lock `key`, or raise `refusal(message)`.

    `excludes` names other locks this run may not overlap, each with the
    message to refuse with while it is held. They are checked AFTER this run's
    own lock is taken, so of two runs that start together each sees the other
    and both refuse - never both proceed.
    """
    connection = engine.connect().execution_options(isolation_level="AUTOCOMMIT")
    try:
        held = connection.execute(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": key}
        ).scalar()
    except Exception:
        connection.close()
        raise
    if not held:
        connection.close()
        raise refusal(message)
    taken = Claim(connection, key)
    try:
        for other, other_message in excludes:
            busy = connection.execute(
                _HELD, {"high": other >> 32, "low": other & 0xFFFFFFFF}
            ).scalar()
            if busy:
                raise refusal(other_message)
    except BaseException:
        taken.release()
        raise
    return taken


def start_worker(name: str, held: Claim, run: Callable[[], None]) -> threading.Thread:
    """
    Run `run` on a daemon thread and release `held` when it ends, however it ends.

    The thread never waits on a listener: a reloaded page or a dropped
    connection stops the events, not the run. copy_context: the worker's log
    lines keep the request_id of the request that started it, so one run reads
    as one run in the log viewer.
    """

    def guarded() -> None:
        try:
            run()
        finally:
            held.release()

    worker = threading.Thread(
        target=contextvars.copy_context().run, args=(guarded,), name=name, daemon=True
    )
    try:
        worker.start()
    except Exception:
        held.release()
        raise
    return worker
