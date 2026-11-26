"""
A batch run's log row and the rows of the operations it ran.

Fill All, Replace All and Pull All each write one row for the run and one row
per operation inside it (Fill Anime, Fill Game, ..., the Backup at the end;
Pull Anime, Pull Franchise, ...). The operation rows carry the run's id in
`parent_id`, so the Control Center lists the runs and opens each one's
operations in its Details popup. These tests pin the link, the list that
leaves the operation rows out, the detail read that brings them back, and the
deletes that take a run's operations with it.

Requires PostgreSQL (the run's own database). See tests/api/conftest.py.
"""

import json

import pytest

from app import models
from app.database import get_taipei_now
from app.services import calculation
from app.services.pipelines import backup, pull
from app.services.pipelines.runner import PipelineSpec, run_all
from app.utils.data_control_utils import log_data_control


@pytest.fixture
def anyio_backend():
    return "asyncio"


class FakeRequest:
    def __init__(self, disconnect_after=None):
        self.calls = 0
        self.disconnect_after = disconnect_after

    async def is_disconnected(self):
        self.calls += 1
        return self.disconnect_after is not None and self.calls > self.disconnect_after


async def drain(gen):
    out = []
    async for message in gen:
        out.append(json.loads(message[6:]))
    return out


def movie_spec(label, **overrides):
    base = dict(
        key=label.lower(), label=label, model=models.Movies,
        extract_id=None,
        fill_eligible=lambda db, e: True,
        fill=lambda db, e: setattr(e, "imdb_rating", "9.0"),
        replace_select=lambda db: db.query(models.Movies).all(),
        replace=lambda db, e, bulk: None,
    )
    base.update(overrides)
    return PipelineSpec(**base)


def rows(db):
    return db.query(models.DataControlLog).order_by(models.DataControlLog.id).all()


@pytest.fixture
def no_sheet_backup(monkeypatch):
    """The Backup at the end of a run, minus Google: it still logs its row."""

    def fake_backup(db, action_type="Manual", log_ids=None):
        log_id = log_data_control(db, "Backup", "Backup", action_type, "Success")
        if log_ids is not None:
            log_ids.append(log_id)
        return {"status": "success"}

    monkeypatch.setattr(backup, "execute_backup", fake_backup)


# --------------------------------------------------------------- the runner


@pytest.mark.anyio
async def test_fill_all_links_each_operation_to_the_run(db_session, no_sheet_backup):
    db_session.add(models.Movies(movie_name_en="A"))
    db_session.flush()

    out = await drain(
        run_all("Fill", [movie_spec("Anime"), movie_spec("Game")], db_session, FakeRequest())
    )
    assert out[-1]["status"] == "success"

    logged = rows(db_session)
    (run,) = [r for r in logged if r.parent_id is None]
    assert run.action_specific == "Fill All" and run.status == "Success"
    children = [r for r in logged if r.parent_id == run.id]
    assert [c.action_specific for c in children] == ["Fill Anime", "Fill Game", "Backup"]
    assert [c.status for c in children] == ["Success", "Success", "Success"]
    assert [c.type for c in children] == ["Manual", "Manual", "Auto"]


@pytest.mark.anyio
async def test_a_failed_operation_is_failed_under_a_failed_run(db_session, no_sheet_backup):
    """The run turns red, and the operation that did it is the red child."""

    def crash(db):
        raise RuntimeError("Tenrai down")

    out = await drain(
        run_all(
            "Fill",
            [movie_spec("Anime", pre_run=crash), movie_spec("Game")],
            db_session,
            FakeRequest(),
        )
    )
    assert out[-1]["status"] == "error"

    logged = rows(db_session)
    (run,) = [r for r in logged if r.parent_id is None]
    assert run.status == "Failed"
    children = {c.action_specific: c for c in logged if c.parent_id == run.id}
    assert children["Fill Anime"].status == "Failed"
    assert children["Fill Anime"].error_message == "Tenrai down"
    assert children["Fill Game"].status == "Success"
    # A failed run stops before its Backup.
    assert "Backup" not in children


@pytest.mark.anyio
async def test_an_aborted_run_keeps_the_operations_it_finished(db_session, no_sheet_backup):
    db_session.add(models.Movies(movie_name_en="A"))
    db_session.flush()

    await drain(
        run_all(
            "Fill",
            [movie_spec("Anime"), movie_spec("Game")],
            db_session,
            FakeRequest(disconnect_after=2),
        )
    )

    logged = rows(db_session)
    (run,) = [r for r in logged if r.parent_id is None]
    assert run.status == "Aborted"
    children = [c for c in logged if c.parent_id == run.id]
    assert children, "the operations already run must stay with the run"
    assert children[-1].status == "Aborted"


def _fails_on(bad_name):
    """A fill that fails one named entry and fills the rest."""

    def fill(db, entry):
        if entry.movie_name_en == bad_name:
            raise RuntimeError("no match")
        entry.imdb_rating = "9.0"

    return fill


@pytest.mark.anyio
async def test_an_operation_that_lost_some_entries_is_partial(db_session, no_sheet_backup):
    """
    Two entries, one failing: the operation is Partial and names the one,
    and so is the run - which still finishes and backs up. The good entry is
    what makes this Partial rather than Failed; the mirror is below.
    """
    db_session.add_all([models.Movies(movie_name_en="Good"), models.Movies(movie_name_en="Bad")])
    db_session.flush()

    out = await drain(
        run_all("Fill", [movie_spec("Movie", fill=_fails_on("Bad"))], db_session, FakeRequest())
    )
    assert out[-1]["status"] == "success"

    logged = rows(db_session)
    (run,) = [r for r in logged if r.parent_id is None]
    children = {c.action_specific: c for c in logged if c.parent_id == run.id}
    fill = children["Fill Movie"]
    assert fill.status == "Partial"
    assert fill.rows_updated == 1 and fill.rows_failed == 1
    assert json.loads(fill.details_json) == {"failed": ["Bad"]}
    assert run.status == "Partial" and run.rows_failed == 1
    assert "Backup" in children


@pytest.mark.anyio
async def test_an_operation_that_lost_every_entry_is_failed(db_session, no_sheet_backup):
    db_session.add(models.Movies(movie_name_en="Bad"))
    db_session.flush()

    await drain(
        run_all("Fill", [movie_spec("Movie", fill=_fails_on("Bad"))], db_session, FakeRequest())
    )

    logged = rows(db_session)
    (run,) = [r for r in logged if r.parent_id is None]
    (fill,) = [c for c in logged if c.action_specific == "Fill Movie"]
    assert fill.status == "Failed" and fill.rows_failed == 1
    assert run.status == "Failed"


@pytest.mark.anyio
async def test_every_row_records_when_it_started(db_session, no_sheet_backup):
    db_session.add(models.Movies(movie_name_en="A"))
    db_session.flush()

    await drain(run_all("Fill", [movie_spec("Anime")], db_session, FakeRequest()))

    for row in rows(db_session):
        if row.action_specific == "Backup":
            continue  # the fake Backup above logs no start
        assert row.started_at is not None, row.action_specific
        assert row.started_at <= row.timestamp


# ------------------------------------------------------------- Calculate All


@pytest.fixture
def quiet_calculate(monkeypatch):
    """Every Calculate All step, minus walking every table and the covers."""
    monkeypatch.setattr(calculation, "run_post_processing", lambda db: None)
    monkeypatch.setattr(calculation, "run_derive_ep_previous", lambda db: None)
    monkeypatch.setattr(
        calculation, "run_seed_sequel_relations",
        lambda db: {"relations_created": 0, "franchises_seeded": 0, "groups_skipped_tied": 0},
    )
    monkeypatch.setattr(calculation, "run_sync_types", lambda db: {"owner_missing": 0})
    monkeypatch.setattr(calculation, "run_sync_cast", lambda db: {"counts": {"cast_role": 2}})
    monkeypatch.setattr(
        calculation, "run_sync_character_display_names", lambda db: {"counts": {}}
    )
    monkeypatch.setattr(
        calculation, "bulk_check_cover_image",
        lambda db: {"missing_count": 3, "should_use_count": 0},
    )
    return monkeypatch


CALCULATE_STEPS = [
    "Post-processing",
    "Seed Sequel Relations",
    "Sync",
    "Sync Cast",
    "Sync Display Names",
    "Check Cover Images",
]


def test_calculate_all_logs_each_step_under_the_run(db_session, quiet_calculate):
    calculation.run_calculate_all(db_session)

    logged = rows(db_session)
    (run,) = [r for r in logged if r.parent_id is None]
    assert run.action_specific == "Calculate All" and run.status == "Success"
    children = [r for r in logged if r.parent_id == run.id]
    assert [c.action_specific for c in children] == CALCULATE_STEPS
    assert {c.status for c in children} == {"Success"}
    covers = children[-1]
    assert json.loads(covers.details_json)["missing_covers"] == 3


def test_a_failed_step_names_itself_and_stops_the_run(db_session, quiet_calculate):
    def crash(db):
        raise RuntimeError("cast table locked")

    quiet_calculate.setattr(calculation, "run_sync_cast", crash)

    with pytest.raises(RuntimeError):
        calculation.run_calculate_all(db_session)

    logged = rows(db_session)
    (run,) = [r for r in logged if r.parent_id is None]
    assert run.status == "Failed"
    assert run.error_message == "Sync Cast: cast table locked"
    children = [r for r in logged if r.parent_id == run.id]
    assert [c.action_specific for c in children] == CALCULATE_STEPS[:4]
    assert [c.status for c in children] == ["Success", "Success", "Success", "Failed"]


# ------------------------------------------------------------------ Pull All


def test_pull_all_links_each_tab_to_the_run(db_session, monkeypatch):
    monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: [])

    pull.execute_pull_all(db_session)

    logged = rows(db_session)
    (run,) = [r for r in logged if r.parent_id is None]
    assert run.action_specific == "Pull All"
    children = [c.action_specific for c in logged if c.parent_id == run.id]
    assert "Pull Anime" in children and "Pull Franchise" in children


# ------------------------------------------------------------------- the API


def _run_with_children(db):
    run_id = log_data_control(db, "Fill", "Fill All", "Manual", "Success")
    child_ids = [
        log_data_control(db, "Fill", "Fill Anime", "Manual", "Success", parent_id=run_id),
        log_data_control(db, "Fill", "Fill Game", "Manual", "Failed",
                         error_message="IGDB down", parent_id=run_id),
    ]
    return run_id, child_ids


def test_the_log_list_leaves_out_the_operations_of_a_run(owner_client, db_session):
    run_id, child_ids = _run_with_children(db_session)
    single = log_data_control(db_session, "Calculate", "Sync Cast", "Manual", "Success")

    listed = [r["id"] for r in owner_client.get("/api/system/logs").json()]

    assert set(listed) == {run_id, single}
    body = {r["id"]: r for r in owner_client.get("/api/system/logs").json()}
    assert body[run_id]["child_count"] == 2
    assert body[single]["child_count"] == 0


def test_a_log_reads_back_with_its_operations(owner_client, db_session):
    run_id, child_ids = _run_with_children(db_session)

    response = owner_client.get(f"/api/system/logs/{run_id}")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["action_specific"] == "Fill All"
    assert [c["id"] for c in body["children"]] == child_ids
    assert [c["action_specific"] for c in body["children"]] == ["Fill Anime", "Fill Game"]
    assert body["children"][1]["error_message"] == "IGDB down"


def test_a_log_reads_back_its_start_and_failures(owner_client, db_session):
    log_id = log_data_control(
        db_session, "Fill", "Fill Anime", "Manual", "Partial",
        rows_failed=2, details_json=json.dumps({"failed": ["A", "B"]}),
        started_at=get_taipei_now(),
    )

    body = owner_client.get(f"/api/system/logs/{log_id}").json()

    assert body["status"] == "Partial"
    assert body["rows_failed"] == 2
    assert body["started_at"] is not None


def test_an_unknown_log_is_a_404(owner_client):
    assert owner_client.get("/api/system/logs/999999").status_code == 404


def test_deleting_a_run_deletes_its_operations(owner_client, db_session):
    run_id, child_ids = _run_with_children(db_session)

    assert owner_client.delete(f"/api/system/logs/{run_id}").status_code == 200

    db_session.expire_all()
    assert db_session.query(models.DataControlLog).filter(
        models.DataControlLog.id.in_([run_id, *child_ids])
    ).count() == 0


def test_clear_old_keeps_ten_runs_not_ten_rows(owner_client, db_session):
    """
    The operation rows must not count toward the ten kept, or one Fill All
    of fifteen operations would push every other run out - and the run kept
    must keep its operations. The run is the newest, so it is kept.
    """
    for i in range(12):
        log_data_control(db_session, "Calculate", f"Old {i}", "Manual", "Success")
    run_id, child_ids = _run_with_children(db_session)

    owner_client.delete("/api/system/logs")

    db_session.expire_all()
    left = db_session.query(models.DataControlLog).all()
    runs = [r for r in left if r.parent_id is None]
    assert len(runs) == 10
    assert run_id in {r.id for r in runs}
    assert {r.id for r in left if r.parent_id == run_id} == set(child_ids)
