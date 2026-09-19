"""Structural invariants of what this repository still owns of its deploy.

Deploying, health-checking and rolling back are the platform's: they are
`bin/deploy`, `bin/health` and `bin/rollback` in `cg1618-apps/platform`, they
are the same code for every app on the box, and they are tested there.

What is left here is the part that cannot be generic, because it is Alembic's:
`deploy/migrations`, the hook the platform calls to ask this app about its own
schema. Three questions - what revision is the database at, what would this
deploy add, and reverse to this one - and the third of them is the only part
of the deploy pipeline that can destroy data.

Same bind as tests/unit/test_prod_compose.py and tests/unit/test_backup_scripts.py:
this runs on a machine CI cannot reach, so structure is mostly what is
checkable - which is exactly what makes it worth checking. The exception is the
irreversible refusal below, which is executed rather than asserted about,
because a safety marker nobody has ever made fire is not a safety marker.
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEPLOY = ROOT / "deploy"
HOOK = DEPLOY / "migrations"

# The literal line deploy/migrations looks for, and the one
# tests/api/test_migration_round_trip.py pins the spelling of from the other
# side of the same contract. One fact, declared once by the person who knows,
# consumed by both.
MARKER = "irreversible = True"


def code(name: str) -> str:
    """The script with comment lines removed.

    These scripts carry long comments that quote the very strings the
    assertions below look for - the marker itself appears in the prose
    explaining what the refusal is for, and "docker compose" appears in a note
    explaining which arm must NOT clear the project name. Searching the raw
    text finds the prose and passes, or finds the prose and fails, in both
    cases saying nothing about the code.

    This project has hit that three times: a loose search matching a comment
    that means the opposite of the match.
    """
    lines = (DEPLOY / name).read_text(encoding="utf-8").splitlines()
    return "\n".join(line for line in lines if not line.lstrip().startswith("#"))


def arm(name: str) -> str:
    """One `case` arm of the hook, comments stripped.

    An assertion about what `added` does must not be satisfied by something
    `downgrade` does forty lines further down. The arms are what the platform
    calls separately, so they are what gets asserted about separately.
    """
    body = code("migrations")
    start = body.index("    {})".format(name))
    return body[start : body.index("        ;;", start)]


# --- the hook's shape -------------------------------------------------------


def test_the_hook_fails_fast():
    # Without -e a failing step is skipped past and the script exits 0. On the
    # downgrade arm that would report a reversal that did not happen.
    assert "set -euo pipefail" in HOOK.read_text(encoding="utf-8")


def test_the_hook_is_executable_in_git():
    # `migrations` carries no extension - the platform calls it by that exact
    # path - so the .sh sweep in tests/unit/test_backup_scripts.py does not
    # reach it and it is asserted here instead.
    #
    # `git ls-tree HEAD`, NOT `git ls-files -s`: the first reads the COMMIT,
    # the second reads the index, and they diverge exactly when this bug is
    # present. core.fileMode is off on both development machines, so a chmod
    # there is invisible to git, and `git commit -- <paths>` re-reads those
    # paths from the working tree and discards an index-only mode change.
    #
    # What a lost bit costs here is specific: apps.yml declares
    # `migrations: true` for media, and the platform's bin/deploy refuses when
    # the registry declares migrations and the commit being deployed carries
    # no runnable hook. So the symptom is not a broken rollback - it is every
    # deploy refusing.
    out = subprocess.run(
        ["git", "ls-tree", "HEAD", "deploy/migrations"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    assert out.startswith("100755 "), out or "deploy/migrations is not in HEAD"


def test_the_hook_answers_exactly_the_three_subcommands():
    # The contract in the platform's docs/registry.md. A missing arm is a
    # question the pipeline asks and gets no answer to.
    body = code("migrations")
    for name in ("current", "added", "downgrade"):
        assert "    {})".format(name) in body, name


def test_an_unknown_subcommand_fails_rather_than_succeeding_silently():
    # `*)` must exit non-zero. The platform reads a zero exit from `added` as
    # "this deploy adds no migrations", so a hook that shrugged at a
    # subcommand it did not recognise would send a schema change down the
    # unattended lane.
    assert "exit 1" in code("migrations").split("    *)")[1]


# --- `added` runs where there is no database --------------------------------


def test_added_answers_from_the_git_checkout_alone():
    # `added` is asked on a GITHUB-HOSTED runner as well as on the box, by the
    # platform's classify job, where there is no PostgreSQL, no compose project
    # and no .env. A hook whose `added` shelled into compose would fail there
    # on every push - and classify gates on a hook that fails, so every deploy
    # of this app would need an approval, for good, in a green run.
    body = arm("added")
    assert "git diff --name-only" in body
    assert "docker" not in body
    assert "psql" not in body


def test_added_ignores_a_deleted_revision_file():
    """`added` means added, not \"changed\".

    Plain `git diff --name-only` reports a deletion exactly like an
    addition, so the release that REMOVED art's rollback-rehearsal
    revision was classified as adding one and took the approval gate.

    The gate is the mild half: rollback reads a non-empty answer as
    \"this deploy changed the schema\" and attempts a downgrade, so a
    release that only deletes an old revision file - squashing a chain -
    would try to reverse toward a revision the new code may no longer
    contain. M stays on purpose: editing an already-applied revision
    should demand an approval."""
    assert "--diff-filter=AM" in arm("added")


def test_added_names_the_revision_directory():
    # A diff of the whole tree would report a frontend change as a migration
    # and gate every deploy on an approval.
    assert "alembic/versions/" in arm("added")


# --- `current` asks the database, in the platform's compose project ---------


def test_current_reads_the_version_table_and_not_the_image():
    # Asking the running image answers what that image KNOWS, which is exactly
    # what changes during a rollback. The recorded downgrade target has to be
    # what the schema WAS.
    body = arm("current")
    assert "alembic_version" in body
    assert "psql" in body


def test_current_answers_base_when_the_database_has_never_been_migrated():
    # A database with no alembic_version table is every app's FIRST deploy,
    # and a hook that errored there would refuse the very deploy that creates
    # the schema. `base` is Alembic's own name for the point before the first
    # revision and a real downgrade target.
    #
    # Two queries rather than one is the whole of why this is worth pinning: a
    # statement naming a table that does not exist fails to PARSE, so no
    # coalesce or CASE can rescue it from inside a single query.
    body = arm("current")
    assert "to_regclass" in body
    assert "echo base" in body


def _compose_definition() -> str:
    return next(
        line for line in code("migrations").splitlines() if line.startswith("COMPOSE=(")
    )


def test_current_reaches_postgres_through_the_platform_checkout():
    # PostgreSQL belongs to the platform's compose project, not this app's.
    # PLATFORM_DIR is exported by bin/deploy, bin/rollback and the classify
    # job; guessing a path instead is right until the checkout moves.
    assert "PLATFORM_DIR" in _compose_definition()


def test_the_shared_postgres_compose_clears_the_project_name():
    """The hook sources this app's .env, which EXPORTS COMPOSE_PROJECT_NAME=media.

    PostgreSQL lives in the platform's project, so a plain `docker compose -f
    ~/cg1618/docker-compose.prod.yml exec db` then looks for service `db` in
    project `media` and reports "service db is not running" - with the
    database running perfectly well one container away. The environment beats
    a compose file's own .env, so clearing the variable is what lets the
    platform's .env name its own project.
    """
    definition = _compose_definition()
    assert "env -u COMPOSE_PROJECT_NAME" in definition, definition


def test_the_downgrade_arm_does_not_clear_the_project_name():
    """The mirror, and the reason the test above is not the whole story.

    Do not read `COMPOSE=` here as meaning what it means in
    deploy/backup/lib.sh. There the cleared array is DB_COMPOSE and the kept
    one is COMPOSE; here the single COMPOSE array IS the shared-PostgreSQL one,
    and this app's own compose is written out inline in the downgrade arm. The
    same fix applied to the wrong one would send `run app` to a project derived
    from the directory name, which is how a stack comes up on a brand-new empty
    volume while the real data sits untouched in the old one.
    """
    for line in arm("downgrade").splitlines():
        if "docker compose" in line:
            assert "env -u COMPOSE_PROJECT_NAME" not in line, line


# --- `downgrade` ------------------------------------------------------------


def test_downgrade_runs_alembic_from_the_new_image():
    # media-app:previous does not contain the revision files being reversed,
    # so swapping the image first crash-loops: entrypoint.sh's `alembic upgrade
    # head` cannot locate a revision its own files do not hold.
    #
    # --entrypoint is the whole correctness of this line, and its absence was
    # invisible. The image's ENTRYPOINT is entrypoint.sh, which hardcoded
    # `alembic upgrade head`, so `run ... app alembic downgrade <target>`
    # discarded the command and RE-RAN THE UPGRADE THAT HAD JUST FAILED, then
    # froze with the site still on the broken container. Observed on the box.
    #
    # Matched on the target rather than on "alembic downgrade": the correct
    # command separates those two words with the service name, so a predicate
    # looking for them adjacent finds only the BROKEN form.
    line = next(
        line
        for line in arm("downgrade").splitlines()
        if 'downgrade "${target}"' in line
    )
    assert "--entrypoint alembic" in line, line
    assert "app downgrade" in line, line


def test_the_entrypoint_does_not_discard_a_command():
    # The second guard against the same silence. A command passed to the
    # container must run INSTEAD of the server rather than vanishing. The hook
    # passes --entrypoint explicitly and does not depend on this; both exist
    # because the failure mode was that nothing said anything.
    body = (ROOT / "entrypoint.sh").read_text(encoding="utf-8")
    assert 'if [ "$#" -gt 0 ]; then' in body
    assert 'exec "$@"' in body
    # Before the migrate-then-serve path, or it never gets the chance.
    assert body.index('exec "$@"') < body.index("alembic upgrade head")


# --- the refusal, executed rather than asserted about -----------------------
#
# This is the one part of the platform's hook contract that protects DATA
# rather than availability, and the platform cannot test it: only this app
# knows what its marker is. Reversing a revision whose author declared it
# irreversible does not restore what it removed, it invents something in the
# shape of it - unattended, on the box, in the minute after a failed deploy.


def _marker_scan() -> str:
    """The Python the downgrade arm runs, lifted out of the hook itself.

    Extracted rather than copied. A copy would keep passing while the hook it
    is supposed to be about changed underneath it, which is the failure this
    whole file exists to catch in other people's scripts.

    On the box this runs inside the app image, because the image is what holds
    Alembic and the revision files. Here it runs against a scratch Alembic
    chain built below, so that a revision carrying the marker actually exists
    for it to find.
    """
    match = re.search(r"<<'PY'\n(.*?)\nPY\n", HOOK.read_text(encoding="utf-8"), re.S)
    assert match, "could not find the embedded marker scan in deploy/migrations"
    return match.group(1)


def _chain(tmp_path: Path, marked: bool) -> Path:
    """A three-revision Alembic chain, with the newest optionally marked.

    THIS FIXTURE IS LOAD-BEARING, NOT DECORATION. The scan answers by listing
    the revisions between the head and the target that carry the marker, and
    on a chain where none does it lists nothing - so a refusal test written
    against this repository's real revisions, none of which is marked today,
    would pass because there was nothing to refuse, and would keep passing
    through the change that broke the scan. `marked=True` is what makes the
    refusal possible; `marked=False` is the mirror asserted on the same
    fixture, so that a green means the scan did the refusing rather than
    something incidental.
    """
    versions = tmp_path / "alembic" / "versions"
    versions.mkdir(parents=True)
    (tmp_path / "alembic.ini").write_text(
        "[alembic]\nscript_location = {}\n".format(versions.parent.as_posix()),
        encoding="utf-8",
    )

    def revision(name, down, mark):
        text = 'revision = "{}"\ndown_revision = {!r}\n'.format(name, down)
        if mark:
            text += MARKER + "\n"
        text += "\n\ndef upgrade():\n    pass\n\n\ndef downgrade():\n    pass\n"
        (versions / "{}.py".format(name)).write_text(text, encoding="utf-8")

    revision("r1base", None, False)
    revision("r2mid", "r1base", False)
    revision("r3head", "r2mid", marked)
    return tmp_path


def _scan(chain: Path, target: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-", target],
        input=_marker_scan(),
        cwd=chain,
        capture_output=True,
        text=True,
    )


def test_the_scan_finds_a_revision_that_declares_the_marker(tmp_path):
    result = _scan(_chain(tmp_path, marked=True), "r2mid")
    assert result.returncode == 0, result.stderr
    # Non-empty output is what makes the hook refuse - see
    # test_the_hook_refuses_before_it_reverses_anything for the other half.
    assert "r3head.py" in result.stdout, result.stdout


def test_the_scan_passes_an_unmarked_revision_through(tmp_path):
    # The mirror, on the same fixture. Without it, a scan that printed a path
    # for every revision would satisfy the test above and refuse every
    # rollback this app will ever attempt.
    result = _scan(_chain(tmp_path, marked=False), "r2mid")
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "", result.stdout


def test_a_marked_revision_below_the_target_does_not_veto_the_rollback(tmp_path):
    # Only the revisions being REVERSED matter. A marked revision the downgrade
    # does not touch - here the target itself, which is staying - must not
    # block a rollback that never reaches it.
    result = _scan(_chain(tmp_path, marked=True), "r3head")
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "", result.stdout


def test_the_scan_checks_every_revision_being_reversed_not_only_the_newest(tmp_path):
    # A deploy can add more than one. Marking the middle revision and
    # downgrading past both must still refuse.
    chain = _chain(tmp_path, marked=False)
    path = chain / "alembic" / "versions" / "r2mid.py"
    path.write_text(path.read_text(encoding="utf-8") + MARKER + "\n", encoding="utf-8")

    result = _scan(chain, "r1base")
    assert "r2mid.py" in result.stdout, result.stdout


def test_the_hook_refuses_before_it_reverses_anything():
    # The scan above answers the question; this is the half that acts on the
    # answer. A refusal printed after the downgrade ran would be a report, not
    # a refusal.
    body = arm("downgrade")
    refusal = body.index('if [ -n "${marked}" ]; then')
    assert body.index("exit 1", refusal) < body.index('downgrade "${target}"'), body
    assert "Refusing to downgrade" in body


def test_the_hook_spells_the_marker_the_way_the_revisions_do():
    # The other side of this contract is
    # tests/api/test_migration_round_trip.py, which fails a revision spelling
    # it `IRREVERSIBLE = True` or `irreversible=True`. A hook looking for a
    # different string would attempt a downgrade its author had forbidden - a
    # safety marker failing silently, which is the worst shape a safety marker
    # can take.
    assert '== "{}"'.format(MARKER) in code("migrations")


# --- drift ------------------------------------------------------------------
#
# drift.sh lives in deploy/backup/ because of what it IS - a scheduled job
# sourcing lib.sh and taking the shared lock, like the other four - but it
# belongs to the deploy pipeline, so its assertions live here rather than
# among the backup jobs' own. It stays this app's: it watches THIS
# repository's checkout against THIS repository's main.

DRIFT = ROOT / "deploy" / "backup" / "drift.sh"


def test_drift_validates_its_ping_url_through_the_shared_check():
    # hc_ping() returns 0 on an empty URL - right for an optional ping, wrong
    # as a config check - so an unvalidated HC_DRIFT_URL would make this job
    # report success forever while alerting nobody, which is the exact false
    # belief of coverage it exists to prevent. load_backup_env is where that
    # check lives, and it runs BEFORE start_job installs the reporting trap,
    # which is the half a bespoke check in this file would get wrong.
    assert "load_backup_env HC_DRIFT_URL" in DRIFT.read_text(encoding="utf-8")


def test_drift_compares_the_box_against_main():
    body = DRIFT.read_text(encoding="utf-8")
    assert "origin/main" in body
    assert "rev-parse HEAD" in body


def test_drift_measures_age_from_the_commit_not_from_first_notice():
    # A box that was off for a week must report the true age on its first run
    # back. Measuring from when this check first noticed would restart the
    # clock at boot and hide exactly the outage the check exists to surface.
    assert "git log -1 --format=%ct" in DRIFT.read_text(encoding="utf-8")


def test_drift_ages_the_oldest_undeployed_commit_not_the_newest():
    # The question is "how long has this box been missing something", not "how
    # new is main". Ageing the newest commit resets the clock on every merge,
    # so a box that has stopped deploying never alerts as long as somebody
    # merges more often than the grace window - active development masking a
    # dead runner, which is the exact failure this job exists to catch.
    #
    # Measured on real history: with the box three commits behind, ageing the
    # newest commit gave 0h and stayed silent; ageing the oldest missing
    # commit gave 7h and alerted.
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


# --- deploy/backup/lib.sh's two compose arrays ------------------------------
#
# The same hazard as the hook's, in the script the scheduled jobs source. Kept
# here because the pair only means anything read together.

LIB = "backup/lib.sh"


def test_lib_db_compose_clears_the_project_name():
    """DB_COMPOSE must not inherit COMPOSE_PROJECT_NAME from the app's .env.

    lib.sh sources the application's .env with `set -a`, which EXPORTS
    COMPOSE_PROJECT_NAME=media into the environment - and the environment beats
    a compose file's own .env, so the platform's project name would never
    apply. Observed on the box during the split: "service db is not running",
    with the database running perfectly well one container away.
    """
    definition = next(
        line for line in code(LIB).splitlines() if line.startswith("DB_COMPOSE=(")
    )
    assert "env -u COMPOSE_PROJECT_NAME" in definition, definition


def test_lib_app_compose_keeps_the_project_name():
    """COMPOSE must NOT clear it - `media` is exactly the project it means.

    The mirror of the test above, and the reason it exists: the same fix
    applied to the wrong variable would send `up`, `ps` and `run app` to a
    project derived from the directory name, which is how a stack comes up on a
    brand-new empty volume while the real data sits untouched in the old one.
    """
    definition = next(
        line for line in code(LIB).splitlines() if line.startswith("COMPOSE=(")
    )
    assert "env -u COMPOSE_PROJECT_NAME" not in definition, definition
