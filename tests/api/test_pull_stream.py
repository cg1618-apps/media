"""
Pull streams its progress, outlives the request that started it, and runs one
at a time - and never alongside a Backup.

The same tunnel window that made Backup stream applies here: a Pull All reads
every tab of the sheet, longer than the ~100 s a silent request survives behind
Cloudflare. See test_backup_stream.py for the Backup half.

Requires PostgreSQL (media_test DB). See tests/api/conftest.py.
"""

import json
import threading

import pytest

import app.routers.data_control as dc
from app import models
from app.services.integrations.sheets import SheetsUnavailableError
from app.services.pipelines import backup, pull


def _events(body: str) -> list[dict]:
    return [
        json.loads(line[len("data: "):])
        for line in body.split("\n\n")
        if line.startswith("data: ")
    ]


def _pull_all_rows(db):
    return (
        db.query(models.DataControlLog)
        .filter(models.DataControlLog.action_specific == "Pull All")
        .all()
    )


@pytest.fixture
def read(monkeypatch):
    """Every tab reads as empty, and the names read are recorded."""
    tabs: list[str] = []
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda name: tabs.append(name) or [])
    return tabs


@pytest.fixture
def worker_uses_test_session(db_session, monkeypatch):
    # As in test_backup_stream: the worker's own session is the test
    # transaction, which it must not close under the test.
    monkeypatch.setattr(db_session, "close", lambda: None)
    monkeypatch.setattr(dc, "SessionLocal", lambda: db_session)


def test_pull_all_streams_one_progress_event_per_tab_then_its_result(
    owner_client, db_session, read, worker_uses_test_session
):
    res = owner_client.post("/api/data-control/pull")

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    events = _events(res.text)
    progress = [e for e in events if e["status"] == "processing"]
    assert [e["current_entry"] for e in progress] == list(pull.TABS_IN_ORDER)
    assert progress[-1]["processed"] == progress[-1]["total"] == len(pull.TABS_IN_ORDER)
    # The last event is the result the JSON response used to carry.
    final = events[-1]
    assert final["status"] == "success"
    assert set(final["details"]) <= set(pull.TABS_IN_ORDER)
    assert final["unresolved_refs"] == []
    assert read == [t for t in pull.TABS_IN_ORDER if t not in pull.AUTHZ_TABS]
    assert [r.status for r in _pull_all_rows(db_session)] == ["Success"]


def test_pull_all_streams_an_error_event_when_a_tab_is_unreadable(
    owner_client, db_session, monkeypatch, worker_uses_test_session
):
    def outage_on_comic(tab_name):
        if tab_name == "Comic":
            raise SheetsUnavailableError("[503] unavailable")
        return []

    monkeypatch.setattr(pull, "get_all_raw_rows", outage_on_comic)

    events = _events(owner_client.post("/api/data-control/pull").text)

    assert events[-1]["status"] == "error"
    assert "Tabs not pulled: Comic" in events[-1]["message"]
    assert [r.status for r in _pull_all_rows(db_session)] == ["Failed"]


def test_one_tab_streams_its_progress_then_its_counts(
    owner_client, read, worker_uses_test_session
):
    events = _events(owner_client.post("/api/data-control/pull/System Options").text)

    assert events[0] == {
        "status": "processing", "current_entry": "System Options",
        "processed": 1, "total": 1,
    }
    assert events[-1] == {
        "status": "success", "processed": 0, "rows_added": 0, "rows_updated": 0,
    }
    assert read == ["System Options"]


def test_a_type_shortcut_streams_the_same_way(owner_client, read, worker_uses_test_session):
    events = _events(owner_client.post("/api/data-control/pull/manga").text)

    assert events[0]["current_entry"] == "Manga"
    assert events[-1]["status"] == "success"


def test_a_failing_tab_ends_the_stream_with_its_error(
    owner_client, monkeypatch, worker_uses_test_session
):
    def outage(tab_name):
        raise SheetsUnavailableError("[503] unavailable")

    monkeypatch.setattr(pull, "get_all_raw_rows", outage)

    events = _events(owner_client.post("/api/data-control/pull/System Options").text)

    assert events[-1]["status"] == "error"
    assert events[-1]["reason"] == "sheet_unavailable"
    assert "503" in events[-1]["message"]


def test_an_unknown_tab_is_refused_before_anything_starts(owner_client, read):
    res = owner_client.post("/api/data-control/pull/Bogus")

    assert res.status_code == 400
    assert "Unknown tab" in res.json()["detail"]
    pull.claim_pull().release()  # nothing was left holding the claim


@pytest.mark.parametrize("path", ["/api/data-control/pull", "/api/data-control/pull/Anime"])
def test_a_second_pull_is_refused_while_one_is_running(owner_client, read, path):
    claim = pull.claim_pull()
    try:
        res = owner_client.post(path)
    finally:
        claim.release()

    assert res.status_code == 409
    assert "pull is already running" in res.json()["detail"]
    assert read == []


def test_a_pull_is_refused_while_a_backup_runs(owner_client, read):
    """A Pull reading tabs a Backup is rewriting would restore from a sheet
    half old and half new."""
    claim = backup.claim_backup()
    try:
        res = owner_client.post("/api/data-control/pull")
    finally:
        claim.release()

    assert res.status_code == 409
    assert "backup is running" in res.json()["detail"]
    assert read == []


def test_a_backup_is_refused_while_a_pull_runs(owner_client, monkeypatch):
    """A Backup during a Pull would write the half-restored database over the
    very sheet the Pull is reading from."""
    written: list[str] = []
    monkeypatch.setattr(
        backup, "bulk_overwrite_sheet", lambda name, matrix: written.append(name) or True
    )
    claim = pull.claim_pull()
    try:
        res = owner_client.post("/api/data-control/backup")
        with pytest.raises(backup.BackupAlreadyRunning, match="pull is running"):
            backup.claim_backup()
    finally:
        claim.release()

    assert res.status_code == 409
    assert "pull is running" in res.json()["detail"]
    assert written == []
    # The mirror: with the Pull gone, the same claim succeeds - so the refusal
    # above was the Pull's lock and not something incidental.
    backup.claim_backup().release()


def test_a_refused_claim_leaves_its_own_lock_free(owner_client, read):
    """Pull takes its own lock before it looks at Backup's; refused there, it
    must give its own back or every later Pull would be 'already running'."""
    claim = backup.claim_backup()
    try:
        owner_client.post("/api/data-control/pull")
    finally:
        claim.release()

    pull.claim_pull().release()


def test_the_claim_is_released_after_a_run(owner_client, read, worker_uses_test_session):
    owner_client.post("/api/data-control/pull")

    pull.claim_pull().release()


def test_the_claim_is_released_after_a_failed_run(
    owner_client, monkeypatch, worker_uses_test_session
):
    def broken(tab_name):
        raise RuntimeError("boom")

    monkeypatch.setattr(pull, "get_all_raw_rows", broken)
    events = _events(owner_client.post("/api/data-control/pull/System Options").text)

    assert events[-1] == {"status": "error", "message": "boom"}
    pull.claim_pull().release()


def test_a_started_pull_finishes_with_nobody_listening(db_session, read):
    """A dropped connection must not stop a Pull halfway: some tabs restored
    and some not is a worse state than either."""
    worker = pull.start_pull(lambda: db_session, emit=lambda event: None)
    worker.join(timeout=30)

    assert not worker.is_alive()
    assert [r.status for r in _pull_all_rows(db_session)] == ["Success"]


@pytest.mark.parametrize(
    "client_fixture,expected", [("owner_client", False), ("admin_client", True)]
)
def test_the_authz_tabs_restore_only_for_admin_authz(
    request, monkeypatch, client_fixture, expected
):
    seen = {}

    def fake_start(session_factory, emit, tab_name=None, **kwargs):
        seen.update(kwargs, tab_name=tab_name)
        emit({"status": "success"})

    monkeypatch.setattr(dc, "start_pull", fake_start)

    request.getfixturevalue(client_fixture).post("/api/data-control/pull/Users")

    assert seen["tab_name"] == "Users"
    assert seen["may_restore_authz"] is expected


def test_the_stream_sends_keepalives_while_a_tab_is_slow(owner_client, monkeypatch):
    monkeypatch.setattr(dc, "STREAM_KEEPALIVE_SECONDS", 0.05)
    release = threading.Event()

    def slow_start(session_factory, emit, tab_name=None, **kwargs):
        def run():
            release.wait(timeout=5)
            emit({"status": "success", "details": {}})

        worker = threading.Thread(target=run, daemon=True)
        worker.start()
        threading.Timer(0.3, release.set).start()
        return worker

    monkeypatch.setattr(dc, "start_pull", slow_start)

    res = owner_client.post("/api/data-control/pull")

    assert ": keepalive" in res.text
    assert _events(res.text)[-1]["status"] == "success"
