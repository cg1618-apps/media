"""
scripts/pr_tests.py: what a pull request's own CI run tests.

The failure that matters is a selection that quietly skips a test the change
needed, so each case below names the test it must keep, not just the count.
"""

import importlib.util
from pathlib import Path

_PATH = Path(__file__).resolve().parents[2] / "scripts" / "pr_tests.py"
_spec = importlib.util.spec_from_file_location("pr_tests", _PATH)
pr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pr)

API = [
    "tests/api/test_book_units_api.py",
    "tests/api/test_migration_round_trip.py",
    "tests/api/test_migrations_build_the_schema.py",
    "tests/api/test_upcoming_volumes.py",
]

FILES = {
    "alembic/versions/z9new_thing.py": 'revision: str = "z9new"\ndown_revision = "u1p2coming3"\n',
    "tests/api/test_upcoming_volumes.py": "covers u1p2coming3",
    "tests/api/test_book_units_api.py": "THIS = 'z9new'",
}


def _select(changed):
    return pr.select(changed, FILES.get, API)


def test_a_frontend_change_runs_the_fast_tiers_only():
    assert _select(["frontend/src/App.jsx"]) == ["tests/unit", "tests/services"]


def test_an_edited_api_test_file_runs():
    selection = _select(["app/routers/book.py", "tests/api/test_upcoming_volumes.py"])
    assert "tests/api/test_upcoming_volumes.py" in selection
    assert "tests/api/test_migration_round_trip.py" not in selection


def test_a_new_revision_runs_the_guards_and_its_own_tests():
    selection = _select(["alembic/versions/z9new_thing.py"])
    assert "tests/api/test_migrations_build_the_schema.py" in selection
    assert "tests/api/test_migration_round_trip.py" in selection
    # Mentions the new revision's id - the revision's own test.
    assert "tests/api/test_book_units_api.py" in selection
    # Mentions only an older revision, so it is the merge queue's to run.
    assert "tests/api/test_upcoming_volumes.py" not in selection


def test_a_model_change_runs_the_schema_guards():
    selection = _select(["app/models/book.py"])
    assert "tests/api/test_migrations_build_the_schema.py" in selection


def test_a_harness_change_runs_everything():
    for path in ("tests/api/conftest.py", "tests/databases.py", "requirements.txt"):
        assert _select([path, "frontend/src/App.jsx"]) is None, path
