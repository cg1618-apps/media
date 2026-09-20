"""Every revision must come back, or say out loud that it cannot.

`test_migrations_build_the_schema.py` proves the chain builds FORWARD from an
empty database. Nothing proved it comes back, and no `downgrade()` in this
repository had ever been executed by anything - which stopped being an academic
gap the moment the deploy pipeline began leaning on `alembic downgrade` as tier
2 of its rollback ladder. A rollback that calls a function nobody has ever run
is not a safety net.

A revision that genuinely cannot be reversed - a data migration that deletes or
rewrites rows, where reversing it would invent data rather than restore it -
declares `irreversible = True` at module scope. `deploy/migrations` reads the
SAME marker and refuses to attempt a downgrade for that deploy, sending the
platform rollback straight to its freeze tier instead. One fact, declared once, by the person who
knows, consumed by both.

The marker is for migrations that cannot be reversed in PRINCIPLE. A
`downgrade()` that is merely wrong is a defect to fix, not to declare.
"""

import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

from tests.api.test_migrations_build_the_schema import (  # noqa: F401
    OBJECTS_SQL,
    _read,
    _server_url,
    scratch_databases,
)

ROOT = Path(__file__).resolve().parents[2]
VERSIONS = ROOT / "alembic" / "versions"

# The exact spelling deploy/migrations scans for. A revision writing
# `IRREVERSIBLE = True` or `irreversible=True` would be honoured by neither this
# test nor that hook, so the deploy would attempt a downgrade its author had
# tried to forbid - a safety marker failing silently, which is the worst shape a
# safety marker can take.
MARKER = re.compile(r"^irreversible = True$", re.M)

# Anything that ASSIGNS something called irreversible, however spelled and
# however indented. A line that is exactly MARKER_LINE is excluded by the
# caller rather than by this pattern.
#
# It was one regex with a negative lookahead - `irreversible\s*=\s*(?!True$)`
# - until the first revision actually declared the marker, at which point it
# flagged the correct spelling: `\s*` backtracks to empty, the lookahead then
# sees " True" instead of "True", and the negative lookahead succeeds. The
# check had never seen a true marker before (no shipped revision declared
# one), so it had been vacuously green since it was written - a refusal test
# with an empty set, which is why the positive case below is now asserted
# alongside it.
ASSIGNS_IRREVERSIBLE = re.compile(r"(?i)^\s*irreversible\s*=")
MARKER_LINE = "irreversible = True"


def _alembic(args: list[str], database: str) -> subprocess.CompletedProcess:
    """Alembic as a SUBPROCESS, for the reason given in the sibling module.

    `alembic/env.py` imports the URL from `app.database` at module scope and
    ignores alembic.ini's, so pointing it at another database means setting
    POSTGRES_DB before that import - which an already-running test process
    cannot do. A subprocess is also what a human runs.
    """
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=ROOT,
        env={**os.environ, "POSTGRES_DB": database},
        capture_output=True,
        text=True,
    )


def _revision_files() -> list[Path]:
    return sorted(p for p in VERSIONS.glob("*.py") if p.name != "__init__.py")


def _head_revision_file() -> Path:
    """The file declaring the current head, found by its own `revision =` line.

    Not `sorted(...)[-1]`: revision ids are not ordered by filename, and the
    head is whatever no other revision names as its down_revision.
    """
    heads = _alembic(["heads"], os.environ.get("POSTGRES_DB", "postgres"))
    match = re.search(r"^([0-9a-zA-Z_]+)\s+\(head\)", heads.stdout, re.M)
    assert match, f"could not read a single head from:\n{heads.stdout}\n{heads.stderr}"
    head = match.group(1)

    for path in _revision_files():
        if re.search(rf"^revision(?::\s*str)?\s*=\s*['\"]{head}['\"]", path.read_text(encoding="utf-8"), re.M):
            return path
    raise AssertionError(f"no revision file declares revision = {head!r}")


def test_the_chain_survives_a_downgrade_and_a_second_upgrade(scratch_databases):
    """upgrade head -> downgrade one -> upgrade head, against a real database.

    One step back rather than all the way to base: the baseline revision drops
    every table by design, so a full downgrade proves nothing about the
    revisions layered on top of it and costs far more time.
    """
    migrated_db, _ = scratch_databases

    up = _alembic(["upgrade", "head"], migrated_db)
    assert up.returncode == 0, f"{up.stdout[-2000:]}\n{up.stderr[-2000:]}"

    if MARKER.search(_head_revision_file().read_text(encoding="utf-8")):
        pytest.skip(f"{_head_revision_file().name} declares irreversible = True")

    before = _read(_server_url(migrated_db), OBJECTS_SQL)
    assert len(before) > 100, "the migrated schema is empty; this check is vacuous"

    down = _alembic(["downgrade", "-1"], migrated_db)
    assert down.returncode == 0, (
        "The head revision's downgrade() failed. Either fix it, or - only if the\n"
        "migration cannot be reversed in principle - declare\n"
        "`irreversible = True` at module scope in that revision, which also\n"
        "tells deploy/migrations not to attempt a downgrade for it.\n"
        f"{down.stdout[-2000:]}\n{down.stderr[-2000:]}"
    )

    again = _alembic(["upgrade", "head"], migrated_db)
    assert again.returncode == 0, f"{again.stdout[-2000:]}\n{again.stderr[-2000:]}"

    # Exit codes alone would pass for a downgrade/upgrade pair that runs cleanly
    # and lands somewhere else - a dropped index never recreated, a constraint
    # left behind. Tier 2 of the rollback ladder puts the box into exactly this
    # state and then serves traffic from it, so "it ran" is not the property
    # that matters; "it returned to where it was" is.
    after = _read(_server_url(migrated_db), OBJECTS_SQL)
    assert after == before, (
        "the round trip did not restore the schema.\n"
        f"lost: {sorted(before - after)}\n"
        f"gained: {sorted(after - before)}"
    )


@pytest.mark.parametrize("path", _revision_files(), ids=lambda p: p.name)
def test_the_irreversible_marker_is_spelled_the_way_rollback_reads_it(path):
    body = path.read_text(encoding="utf-8")
    near = [
        line
        for line in body.splitlines()
        if ASSIGNS_IRREVERSIBLE.match(line) and line != MARKER_LINE
    ]
    assert not near, (
        f"{path.name}: the marker must be exactly `irreversible = True` at module "
        f"scope - deploy/migrations scans for that literal line. Found: {near}"
    )


def test_a_revision_declaring_the_marker_is_read_the_way_the_hook_reads_it():
    """
    The positive half, and the one this check spent its life without.

    deploy/migrations compares `line.rstrip("\n") == "irreversible = True"`.
    Nothing asserted that a revision written the intended way satisfies that
    comparison, so the near-miss check above was vacuous until a revision
    finally declared the marker - and then it FAILED on the correct spelling.
    A refusal that has never seen the thing it refuses is not a refusal yet.
    """
    declaring = [
        path
        for path in _revision_files()
        if any(
            ASSIGNS_IRREVERSIBLE.match(line) for line in path.read_text(
                encoding="utf-8"
            ).splitlines()
        )
    ]
    assert declaring, (
        "no revision declares `irreversible = True`, so the near-miss check "
        "above is vacuous - delete this test only when that is deliberate"
    )
    for path in declaring:
        lines = path.read_text(encoding="utf-8").splitlines()
        # Exactly the hook's own comparison, on exactly its own literal.
        assert any(line.rstrip("\n") == MARKER_LINE for line in lines), path.name
