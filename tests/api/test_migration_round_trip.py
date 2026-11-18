"""Every revision must come back, or say out loud that it cannot.

`test_migrations_build_the_schema.py` proves the chain builds FORWARD from an
empty database. This proves the RELEASE comes back: it downgrades to the
revision `origin/main` is at - what a rollback of the release does - and
upgrades again. Concurrent sessions put several revisions into one release, so
one step back would leave every earlier one in it unexercised until the day it
is needed. When the branch holds no revision beyond `main`, it falls back to
one step. Nothing proved it comes back, and no `downgrade()` in this
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

import re
import subprocess
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from tests.api.conftest import run_alembic
from tests.api.test_migrations_build_the_schema import OBJECTS_SQL, _read, _server_url

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


def _revision_files() -> list[Path]:
    return sorted(p for p in VERSIONS.glob("*.py") if p.name != "__init__.py")


def release_downgrade_target(
    head: str,
    parent: dict[str, str | None],
    on_main: set[str],
    irreversible: set[str],
) -> str | None:
    """Where a rollback of this release would downgrade to, or None for nowhere.

    Walks down from `head` through every revision `main` does not hold, and
    stops at the first one `main` does - main's head, the release's base. When
    `head` is itself on main the release adds nothing, and the range is the one
    step below it. A revision declaring `irreversible = True` cannot be stepped
    through, so the walk stops above it; if that is the head, there is nothing
    to round-trip and the answer is None.
    """
    if head in on_main:
        return None if head in irreversible else parent[head]
    revision = head
    while revision not in on_main:
        if revision in irreversible:
            return None if revision == head else revision
        below = parent[revision]
        if below is None:
            return None  # the whole chain is new - nothing on main to return to
        revision = below
    return revision


def _main_revision_files() -> set[str]:
    """Basenames of the revision files on `origin/main`.

    Loud rather than a quiet fallback: CI checks out the whole history, and a
    local clone has origin/main, so failing to read it means the check would
    otherwise test less than it says.
    """
    result = subprocess.run(
        ["git", "ls-tree", "--name-only", "origin/main", "alembic/versions/"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"cannot read origin/main ({result.stderr.strip()}); run `git fetch origin`"
    )
    return {Path(line).name for line in result.stdout.splitlines()}


def _release_range() -> tuple[str, str | None]:
    """(head, target) for this checkout against origin/main."""
    script = ScriptDirectory.from_config(Config(str(ROOT / "alembic.ini")))
    (head,) = script.get_heads()
    on_main_files = _main_revision_files()
    parent, on_main, irreversible = {}, set(), set()
    for rev in script.walk_revisions():
        assert not isinstance(rev.down_revision, tuple), f"merge revision {rev.revision}"
        parent[rev.revision] = rev.down_revision
        if Path(rev.path).name in on_main_files:
            on_main.add(rev.revision)
        if MARKER.search(Path(rev.path).read_text(encoding="utf-8")):
            irreversible.add(rev.revision)
    return head, release_downgrade_target(head, parent, on_main, irreversible)


def test_the_release_survives_a_downgrade_and_a_second_upgrade(migrated_head_copy):
    """head -> the release's base -> head, against a real database.

    To main's head rather than all the way to base: the baseline revision drops
    every table by design, so a full downgrade proves nothing about the
    revisions layered on top of it and costs far more time.
    """
    head, target = _release_range()
    if target is None:
        pytest.skip(f"{head} declares irreversible = True; there is nothing to round-trip")

    before = _read(_server_url(migrated_head_copy), OBJECTS_SQL)
    assert len(before) > 100, "the migrated schema is empty; this check is vacuous"

    down = run_alembic(migrated_head_copy, "downgrade", target)
    assert down.returncode == 0, (
        f"Downgrading from {head} to {target} failed. Either fix the failing\n"
        "revision's downgrade(), or - only if the migration cannot be reversed\n"
        "in principle - declare `irreversible = True` at module scope in it,\n"
        "which also tells deploy/migrations not to attempt a downgrade for it.\n"
        f"{down.stdout[-2000:]}\n{down.stderr[-2000:]}"
    )

    again = run_alembic(migrated_head_copy, "upgrade", "head")
    assert again.returncode == 0, f"{again.stdout[-2000:]}\n{again.stderr[-2000:]}"

    # Exit codes alone would pass for a downgrade/upgrade pair that runs cleanly
    # and lands somewhere else - a dropped index never recreated, a constraint
    # left behind. Tier 2 of the rollback ladder puts the box into exactly this
    # state and then serves traffic from it, so "it ran" is not the property
    # that matters; "it returned to where it was" is.
    after = _read(_server_url(migrated_head_copy), OBJECTS_SQL)
    assert after == before, (
        "the round trip did not restore the schema.\n"
        f"lost: {sorted(before - after)}\n"
        f"gained: {sorted(after - before)}"
    )


# A chain a <- b <- c <- d, with main holding a and b. Pure: no database.
CHAIN = {"a": None, "b": "a", "c": "b", "d": "c"}


@pytest.mark.parametrize(
    ("head", "on_main", "irreversible", "expected"),
    [
        # The release adds c and d: both downgrades run, back to main's head.
        ("d", {"a", "b"}, set(), "b"),
        # Nothing beyond main: one step, as before.
        ("b", {"a", "b"}, set(), "a"),
        # c cannot come back, so the walk stops above it and d alone runs.
        ("d", {"a", "b"}, {"c"}, "c"),
        # The head itself cannot come back: nothing to round-trip.
        ("d", {"a", "b"}, {"d"}, None),
        ("b", {"a", "b"}, {"b"}, None),
        # An irreversible revision already on main is never in the range.
        ("d", {"a", "b"}, {"b"}, "b"),
    ],
)
def test_the_release_range_is_what_a_rollback_would_undo(head, on_main, irreversible, expected):
    assert release_downgrade_target(head, CHAIN, on_main, irreversible) == expected


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
