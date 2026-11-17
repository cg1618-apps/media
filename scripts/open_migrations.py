"""
Every open pull request that adds an Alembic revision, and which ones collide.

Run it before creating a revision:

    venv/Scripts/python.exe scripts/open_migrations.py

Two revisions parented on the same `down_revision` merge cleanly in git and
only collide in Alembic's revision graph, where they make two heads. A session
that knows another open pull request already claims the head it is about to
build on knows from the start that it merges second and reparents onto that
revision (CLAUDE.md, "Migrations and branches"). The merge queue would catch
the collision anyway; this is for seeing it coming.

Reads GitHub through the `gh` CLI, so it needs `gh auth status` to pass. The
revision files are read at each pull request's head commit, not from a local
checkout, so it sees branches that were never fetched here.
"""

import base64
import json
import re
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass

REPO = "cg1618-apps/media"
VERSIONS_PREFIX = "alembic/versions/"

_REVISION = re.compile(r"^revision(?:\s*:\s*[^=]+)?\s*=\s*['\"]([^'\"]+)['\"]", re.M)
_DOWN = re.compile(r"^down_revision(?:\s*:\s*[^=]+)?\s*=\s*['\"]([^'\"]+)['\"]", re.M)


@dataclass(frozen=True)
class OpenRevision:
    pr: int
    branch: str
    path: str
    revision: str | None
    down_revision: str | None


def parse_revision(source: str) -> tuple[str | None, str | None]:
    """The `revision` and `down_revision` ids a revision file declares."""
    rev = _REVISION.search(source)
    down = _DOWN.search(source)
    return (rev.group(1) if rev else None, down.group(1) if down else None)


def collisions(revisions: list[OpenRevision]) -> dict[str, list[OpenRevision]]:
    """
    Parents claimed by more than one open revision, from different pull
    requests. Two revisions of one pull request sharing a parent are that
    pull request's own business and are not reported.
    """
    by_parent: dict[str, list[OpenRevision]] = defaultdict(list)
    for r in revisions:
        if r.down_revision:
            by_parent[r.down_revision].append(r)
    return {
        parent: claims
        for parent, claims in by_parent.items()
        if len({c.pr for c in claims}) > 1
    }


def _gh(*args: str) -> str:
    return subprocess.run(
        ["gh", *args], check=True, capture_output=True, text=True, encoding="utf-8"
    ).stdout


def fetch_open_revisions() -> list[OpenRevision]:
    prs = json.loads(
        _gh(
            "pr", "list", "-R", REPO, "--state", "open", "--limit", "100",
            "--json", "number,headRefName,headRefOid,files",
        )
    )
    found: list[OpenRevision] = []
    for pr in prs:
        for f in pr.get("files") or []:
            path = f["path"]
            if not (path.startswith(VERSIONS_PREFIX) and path.endswith(".py")):
                continue
            if "/" in path[len(VERSIONS_PREFIX):]:
                continue  # __pycache__ and the like, never a revision
            try:
                blob = json.loads(
                    _gh("api", f"repos/{REPO}/contents/{path}?ref={pr['headRefOid']}")
                )
            except subprocess.CalledProcessError:
                continue  # deleted by the pull request: nothing to parent
            source = base64.b64decode(blob["content"]).decode("utf-8")
            rev, down = parse_revision(source)
            found.append(OpenRevision(pr["number"], pr["headRefName"], path, rev, down))
    return found


def main() -> int:
    revisions = fetch_open_revisions()
    if not revisions:
        print("No open pull request adds an Alembic revision.")
        return 0
    for r in sorted(revisions, key=lambda r: r.pr):
        print(f"#{r.pr} {r.branch}: {r.revision} <- {r.down_revision}  ({r.path})")
    clashes = collisions(revisions)
    if not clashes:
        print("\nNo two open pull requests claim the same parent.")
        return 0
    print("\nShared parents - whichever merges second reparents onto the other:")
    for parent, claims in clashes.items():
        names = ", ".join(f"#{c.pr} ({c.revision})" for c in claims)
        print(f"  {parent}: {names}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
