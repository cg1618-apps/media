"""
Backup streams its progress, outlives the request that started it, and runs
one at a time.

Production reaches the app through a Cloudflare Tunnel, which answers 524 to
any request that sends nothing for ~100 seconds. A Backup writes ~47 tabs at a
few seconds each, so a single blocking request outlived that window: the
browser reported "Backup failed" while the server finished and logged Success.
Those three properties are what close it.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import json
import threading

import pytest

import app.routers.data_control as dc
from app import models
from app.services.pipelines import backup
from app.services.pipelines.tabs import SHEET_TABS


def _events(body: str) -> list[dict]:
    return [
        json.loads(line[len("data: "):])
        for line in body.split("\n\n")
        if line.startswith("data: ")
    ]


def _backup_rows(db):
    return (
        db.query(models.DataControlLog)
        .filter(models.DataControlLog.action_main == "Backup")
        .order_by(models.DataControlLog.id)
        .all()
    )


@pytest.fixture
def written(monkeypatch):
    tabs: list[str] = []
    monkeypatch.setattr(
        backup, "bulk_overwrite_sheet", lambda name, matrix: tabs.append(name) or True
    )
    return tabs


@pytest.fixture
def worker_uses_test_session(db_session, monkeypatch):
    # The worker opens its own session because the request's is closed when
    # the response ends. Here it is handed the test transaction instead, and
    # must not close it under the test.
    monkeypatch.setattr(db_session, "close", lambda: None)
    monkeypatch.setattr(dc, "SessionLocal", lambda: db_session)


def test_backup_streams_one_progress_event_per_tab_then_success(
    admin_client, db_session, written, worker_uses_test_session
):
    res = admin_client.post("/api/data-control/backup")

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    events = _events(res.text)
    progress = [e for e in events if e["status"] == "processing"]
    assert [e["current_entry"] for e in progress] == [t.name for t in SHEET_TABS]
    assert progress[-1]["processed"] == progress[-1]["total"] == len(SHEET_TABS)
    assert events[-1]["status"] == "success"
    assert written == [t.name for t in SHEET_TABS]
    assert [r.status for r in _backup_rows(db_session)] == ["Success"]


def test_backup_streams_an_error_event_when_a_tab_fails(
    admin_client, db_session, monkeypatch, worker_uses_test_session
):
    def fail_on_anime(name, matrix):
        if name == "Anime":
            raise RuntimeError("quota")
        return True

    monkeypatch.setattr(backup, "bulk_overwrite_sheet", fail_on_anime)

    events = _events(admin_client.post("/api/data-control/backup").text)

    assert events[-1] == {"status": "error", "message": "quota"}
    assert [r.status for r in _backup_rows(db_session)] == ["Failed"]


def test_a_second_backup_is_refused_while_one_is_running(admin_client, written):
    claim = backup.claim_backup()
    try:
        res = admin_client.post("/api/data-control/backup")
    finally:
        claim.release()

    assert res.status_code == 409
    assert "already running" in res.json()["detail"]
    assert written == []


def test_the_claim_is_released_after_a_run(admin_client, written, worker_uses_test_session):
    admin_client.post("/api/data-control/backup")

    # Would raise BackupAlreadyRunning if the worker had leaked the claim.
    backup.claim_backup().release()


def test_the_claim_is_released_after_a_failed_run(
    admin_client, monkeypatch, worker_uses_test_session
):
    def always_fail(name, matrix):
        raise RuntimeError("down")

    monkeypatch.setattr(backup, "bulk_overwrite_sheet", always_fail)
    admin_client.post("/api/data-control/backup")

    backup.claim_backup().release()


def test_the_claim_holds_across_connections():
    """The nightly sheets.sh runs execute_backup in a process of its own, so a
    lock only one process can see would not stop the two overlapping."""
    claim = backup.claim_backup()
    try:
        with pytest.raises(backup.BackupAlreadyRunning):
            backup.claim_backup()
    finally:
        claim.release()

    backup.claim_backup().release()


def test_execute_backup_refuses_while_another_backup_runs(db_session, written):
    """Fill All / Replace All call execute_backup directly; a manual Backup in
    flight must not be joined by a second writer on the same sheet."""
    claim = backup.claim_backup()
    try:
        with pytest.raises(backup.BackupAlreadyRunning):
            backup.execute_backup(db_session, action_type="Auto")
    finally:
        claim.release()

    assert written == []
    assert _backup_rows(db_session) == []


def test_a_started_backup_finishes_with_nobody_listening(db_session, written):
    """The page reloading, or the tunnel dropping the connection, must not stop
    a Backup halfway: a sheet with some tabs new and some old is a worse
    restore point than either. The worker never depends on its listener."""
    worker = backup.start_backup(lambda: db_session, emit=lambda event: None)
    worker.join(timeout=30)

    assert not worker.is_alive()
    assert written == [t.name for t in SHEET_TABS]
    assert [r.status for r in _backup_rows(db_session)] == ["Success"]


def test_the_stream_sends_keepalives_while_a_tab_is_slow(
    admin_client, monkeypatch
):
    """A Sheets 429 pauses one tab for 60-120 s; with no bytes in that window
    the tunnel would 524 the request all over again."""
    monkeypatch.setattr(dc, "BACKUP_KEEPALIVE_SECONDS", 0.05)
    release = threading.Event()

    def slow_start(session_factory, emit, action_type="Manual"):
        def run():
            release.wait(timeout=5)
            emit({"status": "success", "message": "done"})

        worker = threading.Thread(target=run, daemon=True)
        worker.start()
        threading.Timer(0.3, release.set).start()
        return worker

    monkeypatch.setattr(dc, "start_backup", slow_start)

    res = admin_client.post("/api/data-control/backup")

    assert ": keepalive" in res.text
    assert _events(res.text)[-1]["status"] == "success"


def test_a_failed_unlock_does_not_leave_the_lock_held(monkeypatch):
    """The lock lives on a pooled connection; handed back to the pool still
    holding it, every later Backup would be refused as 'already running'."""
    claim = backup.claim_backup()

    def broken_execute(*args, **kwargs):
        raise RuntimeError("connection reset")

    monkeypatch.setattr(claim._connection, "execute", broken_execute)
    claim.release()

    backup.claim_backup().release()
