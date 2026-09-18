"""Structural invariants of the deploy scripts.

Same bind as tests/unit/test_prod_compose.py and tests/unit/test_backup_scripts.py,
and the same answer: these run on a machine CI cannot reach, so structure is the
only thing checkable here - which is exactly what makes it worth checking.

Each assertion below is a property that is cheap to break, invisible in review,
and expensive at the moment it matters, which for these scripts is a failed
deploy with nobody watching.
"""

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
DEPLOY = ROOT / "deploy"

SCRIPTS = ["deploy.sh", "health.sh", "rollback.sh"]


def code(name: str) -> str:
    """The script with comment lines removed.

    These scripts carry long comments that quote the very strings the
    assertions below look for - "media.cg1618.com" in the note explaining why
    the probe does NOT use it, "alembic downgrade" in the note explaining what
    it is not. Searching the raw text finds the prose and passes, or finds the
    prose and fails, in both cases saying nothing about the code.

    Both halves happened while writing this file, which is the same failure this
    project has now hit three times: a loose search matching a comment that
    means the opposite of the match.
    """
    lines = (DEPLOY / name).read_text(encoding="utf-8").splitlines()
    return "\n".join(line for line in lines if not line.lstrip().startswith("#"))


@pytest.mark.parametrize("name", SCRIPTS)
def test_every_script_fails_fast(name):
    # Without -e a failing step is skipped past and the script exits 0, which
    # for rollback.sh means reporting a recovery that did not happen.
    assert "set -euo pipefail" in (DEPLOY / name).read_text(encoding="utf-8"), name


def test_health_probes_the_endpoint_and_not_the_catch_all():
    # "/" returns 200 with the database down, because the catch-all route serves
    # the SPA for any path. A probe against it is the lying healthcheck this
    # whole endpoint exists to replace, and the difference is one path segment.
    body = (DEPLOY / "health.sh").read_text(encoding="utf-8")
    assert "/api/health" in body


def test_health_probes_from_inside_the_container():
    # Going out through the tunnel would make Cloudflare's availability part of
    # the deploy's success condition, so a tunnel hiccup would roll back
    # perfectly good code - and the tunnel is the one thing a deploy cannot fix.
    body = code("health.sh")
    assert "exec -T app" in body
    assert "media.cg1618.com" not in body


def test_ci_mode_refuses_a_checkout_that_is_not_on_main():
    # deploy.sh pulls whatever branch is checked out rather than naming one, so
    # the branch is the whole of the decision about what production runs. The
    # box was cloned from dev once already, which is how it spent its early life
    # running unreleased code.
    body = (DEPLOY / "deploy.sh").read_text(encoding="utf-8")
    assert "--abbrev-ref HEAD" in body
    assert 'Refusing to deploy' in body


def test_ci_mode_recovers_from_the_detached_head_a_rollback_leaves():
    # rollback.sh checks out the revision the dump belongs to, leaving a
    # detached HEAD at a commit main already contains. Refusing that outright
    # means one rollback disables automatic deploys permanently and silently -
    # observed on the box, where the deploy after a successful rollback died on
    # "On 'HEAD', not main" and nothing said so until the drift check would have
    # noticed hours later.
    #
    # The recovery must be narrow: a detached HEAD that main CONTAINS, and
    # nothing else. A feature branch or an unrelated commit still refuses.
    body = code("deploy.sh")
    assert "merge-base --is-ancestor HEAD origin/main" in body
    assert "git checkout --quiet main" in body
    # The ancestry test needs origin/main to be current, so the fetch has to
    # come first. Checking against a stale remote ref would refuse a legitimate
    # recovery, or accept a commit main no longer contains.
    assert body.index("git fetch origin main") < body.index("merge-base --is-ancestor")


def test_ci_mode_rechecks_for_migrations_against_the_box_head():
    # The workflow classifies from one push range; if the runner was offline
    # across two merges that range misses the earlier one. Only the box's own
    # HEAD is true about the box.
    body = (DEPLOY / "deploy.sh").read_text(encoding="utf-8")
    assert "alembic/versions" in body
    assert "MIGRATION_APPROVED" in body


def test_deploy_records_the_schema_revision_beside_the_dump():
    # rollback.sh's downgrade target. A git sha is not an alembic revision id,
    # so it has to be recorded from the database rather than derived afterwards.
    body = (DEPLOY / "deploy.sh").read_text(encoding="utf-8")
    assert "alembic_version" in body
    assert "${dump}.alembic" in body


def test_deploy_prunes_every_file_it_writes_beside_a_dump():
    # The prune deletes old dumps to keep five. A sidecar left behind by the
    # prune is a file naming a downgrade target for a dump that no longer
    # exists - which reads as a usable rollback option and is not one.
    body = (DEPLOY / "deploy.sh").read_text(encoding="utf-8")
    prune = body[body.index("Pruning dumps") :]
    for sidecar in (".revision", ".alembic"):
        assert f'"${{old}}{sidecar}"' in prune, sidecar


def test_deploy_exits_distinctly_when_unhealthy():
    # The workflow must tell "the deploy ran and is unhealthy" - where the
    # database may be migrated and rollback.sh must run - from "the script
    # refused to start", where nothing was touched and rolling back would be
    # wrong. One exit code for both would collapse them.
    assert "exit 2" in (DEPLOY / "deploy.sh").read_text(encoding="utf-8")


def test_rollback_never_restores_production_data():
    # Tier 2 reverses SCHEMA, never content. A pg_restore here would discard
    # every write since the pre-deploy dump, unattended, to recover from a
    # failure that usually did not touch data at all. That trade is a human's.
    assert "pg_restore" not in (DEPLOY / "rollback.sh").read_text(encoding="utf-8")


def test_rollback_refuses_to_downgrade_an_irreversible_revision():
    # The marker is declared by the person who knows the migration cannot be
    # reversed. Running downgrade() anyway would execute a body its author
    # disclaimed. The literal spelling is pinned by
    # tests/api/test_migration_round_trip.py, on the other side of the contract.
    body = (DEPLOY / "rollback.sh").read_text(encoding="utf-8")
    assert "^irreversible = True$" in body


def test_rollback_downgrades_from_the_new_image():
    # media-app:previous does not contain the revision files being reversed, so
    # swapping the image first crash-loops: entrypoint.sh's `alembic upgrade
    # head` cannot locate a revision its own files do not hold. Verified against
    # a scratch database - the error is "Can't locate revision identified by".
    # Matched on the target rather than on "alembic downgrade": the correct
    # command separates those two words with the service name
    # (`--entrypoint alembic app downgrade`), so a predicate looking for them
    # adjacent finds only the BROKEN form. It raised StopIteration against the
    # fix, which is the same shape as the bug - a check that only recognises the
    # thing it was meant to reject.
    downgrade_line = next(
        line
        for line in code("rollback.sh").splitlines()
        if 'downgrade "${target}"' in line
    )
    assert "run --rm --no-deps" in downgrade_line, downgrade_line

    # --entrypoint is the whole correctness of this line, and its absence was
    # invisible. The image's ENTRYPOINT is entrypoint.sh, which took no
    # arguments and hardcoded `alembic upgrade head`, so
    # `run ... app alembic downgrade <target>` discarded the command and RE-RAN
    # THE UPGRADE THAT HAD JUST FAILED, then froze at tier 3 with the site still
    # on the broken container. Observed on the box.
    #
    # This assertion previously read `"run --rm --no-deps app" in line` and
    # passed against exactly that broken command: it pinned the flags and not
    # the thing the flags were there to do.
    assert "--entrypoint alembic" in downgrade_line, downgrade_line
    assert "app downgrade" in downgrade_line, downgrade_line


def test_the_entrypoint_does_not_discard_a_command():
    # The second guard against the same silence. A command passed to the
    # container must run INSTEAD of the server rather than vanishing.
    # rollback.sh passes --entrypoint explicitly and does not depend on this;
    # both exist because the failure mode was that nothing said anything.
    body = (ROOT / "entrypoint.sh").read_text(encoding="utf-8")
    assert 'if [ "$#" -gt 0 ]; then' in body
    assert 'exec "$@"' in body
    # Before the migrate-then-serve path, or it never gets the chance.
    assert body.index('exec "$@"') < body.index("alembic upgrade head")


def test_rollback_takes_its_target_from_the_recorded_file():
    # Not from the git sha, and not from asking an image for its head - the
    # first is a different namespace, the second answers what the image KNOWS
    # rather than what the schema WAS, and those diverge exactly when a rollback
    # is happening.
    body = (DEPLOY / "rollback.sh").read_text(encoding="utf-8")
    assert 'target="$(cat "${dump}.alembic")"' in body


def test_rollback_freezes_with_a_distinct_exit_code():
    # "Rolled back, verify your data" and "frozen, you are needed" are reported
    # to the owner very differently.
    assert "exit 3" in (DEPLOY / "rollback.sh").read_text(encoding="utf-8")


# drift.sh lives in deploy/backup/ because of what it IS - a scheduled job
# sourcing lib.sh and taking the shared lock, like the other four - but it
# belongs to the deploy pipeline, so its assertions live here with the rest of
# it rather than among the backup jobs' own.
DRIFT = ROOT / "deploy" / "backup" / "drift.sh"


def test_drift_validates_its_ping_url_through_the_shared_check():
    # hc_ping() returns 0 on an empty URL - right for an optional ping, wrong as
    # a config check - so an unvalidated HC_DRIFT_URL would make this job report
    # success forever while alerting nobody, which is the exact false belief of
    # coverage it exists to prevent. load_backup_env is where that check lives,
    # and it runs BEFORE start_job installs the reporting trap, which is the
    # half a bespoke check in this file would get wrong.
    assert "load_backup_env HC_DRIFT_URL" in DRIFT.read_text(encoding="utf-8")


def test_drift_compares_the_box_against_main():
    body = DRIFT.read_text(encoding="utf-8")
    assert "origin/main" in body
    assert "rev-parse HEAD" in body


def test_drift_measures_age_from_the_commit_not_from_first_notice():
    # A box that was off for a week must report the true age on its first run
    # back. Measuring from when this check first noticed would restart the clock
    # at boot and hide exactly the outage the check exists to surface.
    assert "git log -1 --format=%ct" in DRIFT.read_text(encoding="utf-8")


def test_drift_ages_the_oldest_undeployed_commit_not_the_newest():
    # The question is "how long has this box been missing something", not "how
    # new is main". Ageing the newest commit resets the clock on every merge, so
    # a box that has stopped deploying never alerts as long as somebody merges
    # more often than the grace window - active development masking a dead
    # runner, which is the exact failure this job exists to catch.
    #
    # Measured on real history: with the box three commits behind, ageing the
    # newest commit gave 0h and stayed silent; ageing the oldest missing commit
    # gave 7h and alerted.
    body = DRIFT.read_text(encoding="utf-8")
    assert "rev-list --reverse" in body, (
        "drift.sh must find the oldest commit the box is missing"
    )
    assert 'git log -1 --format=%ct "${remote_rev}"' not in body, (
        "ageing remote_rev ages the newest commit on main; every merge resets it"
    )


def test_drift_alerts_when_the_box_is_not_behind_but_still_differs():
    # A checkout that has wandered off main - or was rolled back and never
    # brought back - holds commits main does not, so there is no "oldest
    # missing" commit and no grace window that could ever expire. Different
    # fault, same consequence: what is serving is not what main says.
    assert 'if [ -z "${oldest_missing}" ]; then' in DRIFT.read_text(encoding="utf-8")


def test_rollback_tells_the_owner_data_was_not_restored():
    # The single most dangerous thing this pipeline could do is report a
    # successful rollback in a way that implies the data came back with it.
    body = (DEPLOY / "rollback.sh").read_text(encoding="utf-8")
    assert "DATA was NOT restored" in body
