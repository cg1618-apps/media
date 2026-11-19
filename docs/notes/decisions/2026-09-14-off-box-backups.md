# Off-box backups: host-side scripts, R2 as a copy, and a dead-man's switch

The schedule and behaviour are `deployment-selfhost.md`, "Backups"; restoring
in a disaster is `deploy/README.md`.

- **R2 is the backup target, not the primary store.** Local disk stays the
  source of truth for every read the application does; R2 only ever receives
  copies.
- **Uploaded images stay on local disk rather than moving to object
  storage.** A script copying ordinary files with `rclone sync` needs no
  application code and works even when the app is broken — which is exactly
  when a restore is needed.
- **Host-side scripts, not an app pipeline**, for the same reason. `sheets.sh`
  is the one job that calls into the app, because Sheets access lives behind
  that pipeline; the dump and the file syncs do not.
- **The stamp is written INSIDE the dump**, as a row in its own `backup`
  schema. Rejected: a JSON file uploaded beside it — a fresh metadata file
  pairs happily with a stale dump, and the freshness check then passes on data
  that proves nothing.
- **`source_tables` is read from `pg_tables`** at dump time rather than
  compared with the models, so a partial dump is detected from the dump's own
  contents with no healthy app container needed.
- **The verify drill's throwaway database runs with `--network none`.**
  Rejected: a scratch database inside the live container, where only a
  correctly set shell variable stands between a drill restore and `--clean`
  against the real data. `--network none` makes the throwaway unable to reach
  production by construction.
- **One restore implementation, `restore.sh`, with two callers** — the weekly
  drill and a human in a disaster — differing only in their guards. A disaster
  procedure verified by different code from what runs it is verified by
  nothing.
- **Row counts are reported in the drill's ping, not asserted.** A write
  landing between the count and the snapshot would fail the drill for a
  reason unrelated to backup correctness, and a backup system that cries wolf
  gets ignored.
- **Covers sync weekly, uploaded images nightly**, split by recoverability on a
  metered link: a cover is re-fetchable from the metadata APIs, an upload is
  not recoverable from anywhere else.
- **The Sheets Backup is scheduled and deliberately unverified.** The R2 dump
  is the backup of record and is restore-verified weekly; the sheet is a
  current, independent second copy whose only check is that the pipeline
  reported success. The asymmetry is stated in `deployment-selfhost.md` so it
  cannot become a false belief.
- **A dead-man's switch (Healthchecks.io), not an error reporter.** A job that
  never runs — box off, link down, timer disabled — can report nothing about
  itself; only something outside the box can notice an absence.
- **Healthchecks' OnCalendar schedule type, not Simple.** Simple measures its
  deadline from the last ping, so a late catch-up run pushes every later
  deadline later; OnCalendar anchors to the wall clock.
- **Sheets and the drill declare `After=media-backup.service` with no
  `Requires=`.** The shared `flock` serialises the jobs but does not order
  them, so a boot catch-up could let Sheets or the drill run before the
  night's dump. `Requires=` was rejected: the three are independent failure
  domains reporting to independent alerts.
- **Backup secrets live in `.env.backup`, not `.env`.** The app container
  loads `.env`, so anything there is injected into the running web
  application — including write credentials for the bucket holding its own
  backups.
- **A guard must fail closed.** A command substitution is judged by what the
  script concludes when the command *fails*, not when it returns empty:
  `restore.sh`'s production guard once read a broken `docker compose` as "the
  app is stopped".
