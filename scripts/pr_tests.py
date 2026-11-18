"""
Which backend tests a pull request's own CI run executes.

    python scripts/pr_tests.py <base-sha> <head-sha>

Prints the pytest arguments, one per line, or the single word `FULL`.

A pull request into `dev` is tested twice: once on its own, and again in the
merge queue on `dev` plus everything queued ahead of it - and only the second
run tests the tree that lands. So the full API suite runs in the merge queue
and on a release into `main`, and the pull request's own run is the fast
feedback: every unit and services test, every API test file the pull request
adds or edits, and - when it touches the schema - the migration guards and the
tests of each revision it adds. See docs/testing.md, "What CI runs".

Anything the selection cannot reason about runs everything: a change to the
test harness, the dependencies or the workflow itself.
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

ALWAYS = ["tests/unit", "tests/services"]

# The guards every schema change needs: the chain builds from zero and matches
# the models, and the release comes back.
MIGRATION_GUARDS = [
    "tests/api/test_migrations_build_the_schema.py",
    "tests/api/test_migration_round_trip.py",
]

# A change here changes what every test means, so nothing can be skipped.
FULL_TRIGGERS = (
    "tests/conftest.py",
    "tests/api/conftest.py",
    "tests/databases.py",
    "pytest.ini",
    "requirements.txt",
    "requirements-dev.txt",
    ".github/workflows/ci.yml",
    "scripts/pr_tests.py",
)

SCHEMA_PREFIXES = ("alembic/", "app/models/")
VERSIONS_PREFIX = "alembic/versions/"

_REVISION = re.compile(r"^revision(?:\s*:\s*[^=]+)?\s*=\s*['\"]([^'\"]+)['\"]", re.M)


def select(changed: list[str], read, api_test_files: list[str]) -> list[str] | None:
    """The pytest arguments for these changed paths, or None for the full suite.

    `read(path)` returns a file's text at the head; `api_test_files` is every
    test file under tests/api at the head. Both are parameters so the decision
    can be tested without git.
    """
    if any(path in FULL_TRIGGERS for path in changed):
        return None

    selected = list(ALWAYS)
    existing = set(api_test_files)

    for path in changed:
        if path in existing and path not in selected:
            selected.append(path)

    if any(path.startswith(SCHEMA_PREFIXES) for path in changed):
        for guard in MIGRATION_GUARDS:
            if guard not in selected:
                selected.append(guard)
        revisions = set()
        for path in changed:
            if path.startswith(VERSIONS_PREFIX) and path.endswith(".py"):
                text = read(path)
                match = _REVISION.search(text) if text is not None else None
                if match:
                    revisions.add(match.group(1))
        for test_file in sorted(existing):
            if test_file in selected:
                continue
            body = read(test_file) or ""
            if any(revision in body for revision in revisions):
                selected.append(test_file)

    return selected


def _git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout


def main(base: str, head: str) -> int:
    changed = _git("diff", "--name-only", "--diff-filter=d", f"{base}...{head}").split()

    def read(path: str) -> str | None:
        file = ROOT / path
        return file.read_text(encoding="utf-8") if file.is_file() else None

    api_test_files = sorted(
        p.relative_to(ROOT).as_posix() for p in (ROOT / "tests" / "api").glob("test_*.py")
    )
    selection = select(changed, read, api_test_files)
    print("FULL" if selection is None else "\n".join(selection))
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:3]))
