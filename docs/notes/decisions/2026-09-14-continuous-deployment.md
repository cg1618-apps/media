# A merge to main deploys itself, through a runner on the box

The pipeline now lives in the platform repository (`bin/deploy`,
`bin/rollback`, the reusable workflow); this app supplies `deploy/migrations`.
The reasoning below still binds the pipeline this app deploys through.

- **A self-hosted GitHub Actions runner on the box, long-polling outbound.**
  No service publishes a port and the box has no public address, so GitHub
  cannot push, `ssh` or webhook in. Rejected: a `git ls-remote` poll loop on a
  timer — deploy logs would live only on the box and there is no approval
  mechanism, which the migration gate needs. Rejected: a signed webhook
  through the tunnel — a publicly reachable endpoint that runs deploys, whose
  safety rests on getting HMAC verification right.
- **The workflow is a trigger; the logic is shell.** Rejected: expressing the
  steps as workflow steps, which reads better in the GitHub UI and makes the
  unattended path diverge from the path a person walks during an incident.
  The rollback script is the same for a human and for the workflow.
- **Never from the runner's workspace**, which has no `.env`, no bind mounts
  and no project name, so a deploy from there comes up on an empty volume.
- **Two lanes, split on whether the merge adds a migration.** A migration is
  the only change that can destroy data, and a downgrade is not a restore, so
  it waits for approval in the `production` environment. An unclassifiable
  push takes the gated lane: a needless approval costs one tap.
- **Classification is checked twice, against two truths.** GitHub compares one
  push range; the box re-checks against its own `HEAD`, because a runner
  offline across two merges leaves GitHub's range covering only the later one.
- **The rollback ladder reverses schema and never restores data.** Rejected:
  restoring the pre-deploy dump automatically, which discards every write since
  the dump to recover from a failure that usually did not touch data. The
  message says *"verify your data"*, never *"all good"*.
- **The downgrade runs from the NEW image and targets a revision recorded at
  dump time.** Only the new image holds the revision files being reversed.
  Rejected: deriving the target from the git sha (a different namespace), or
  asking the previous image for its head (what it *knows*, not what the schema
  *was* — and those diverge exactly during a rollback).
- **`downgrade()` is proven in CI.** `tests/api/test_migration_round_trip.py`
  walks upgrade → downgrade → upgrade on a scratch database and compares the
  schema object for object, because exit codes alone pass for a pair that
  runs cleanly and lands somewhere else. A revision that cannot be reversed in
  principle declares `irreversible = True`, and `deploy/migrations downgrade`
  refuses it, so the rollback freezes instead. Rejected: an opt-out marker for
  a `downgrade()` that is merely wrong — that is a defect to fix, and a waiver
  invisible in review gets used the first time somebody is in a hurry.
- **A drift timer, not a dead-man's switch on deploys.** A runner offline when
  a merge lands queues the job silently. Deploys are irregular, so there is no
  period for a dead-man's switch; a daily comparison of the box's `HEAD` with
  `origin/main` has one. The window ages the **oldest** commit the box is
  missing: ageing the newest reset the clock on every merge, so active
  development would have masked a dead runner.
