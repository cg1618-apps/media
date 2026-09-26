# Running this in production

The box is `homelab`, an HP ProDesk 600 G4 Desktop Mini. This app's checkout
lives at `~/media`, and everything below runs from there unless it says
otherwise.

```bash
docker compose -f docker-compose.prod.yml <command>
```

**Deploying and rolling back are the platform's, not this repository's.** They
are `bin/deploy`, `bin/health` and `bin/rollback` in `cg1618-apps/platform`,
checked out at `~/cg1618`, and they are the same code for every application on
the box. What lives here is what cannot be generic: `deploy/migrations`, the
hook the platform calls to ask this app about its own schema, and
`deploy/backup/`, the scheduled jobs that copy the data off the box.

- The pipeline, its two lanes and the app contract every app satisfies:
  `~/cg1618/docs/registry.md`.
- The scripts themselves, their exit codes and their ladder: the header
  comments of `~/cg1618/bin/deploy` and `~/cg1618/bin/rollback`, which are
  where that reasoning is kept.
- The machine itself: [docs/deployment-selfhost.md](../docs/deployment-selfhost.md).
- Why this shape: [docs/notes/decisions.md](../docs/notes/decisions.md).

**`docker-compose.prod.yml` lives at the repository root, not in this
directory.** Compose takes its project directory from the compose file's own
location and loads `.env` from there, so the same file under `deploy/` would
look for `deploy/.env` and interpolate every `${...}` to an empty string —
while `env_file:` kept working, so the app would still start, with a blank
database password. Nothing auto-loads it: Compose only picks up
`docker-compose.yml` by default, and this app no longer has one — the
development database is the platform's `docker-compose.dev-db.yml`.

## A deploy happens by itself

**Merging a release pull request to `main` deploys it.** Nobody logs into the
box. `.github/workflows/deploy.yml` in this repository is one decision —
`on: push: branches: [main]`, calling the platform's `deploy-app.yml` with
`app: media` — and everything else is the platform's. A self-hosted GitHub
Actions runner on the box long-polls GitHub outbound, which is the only shape
available: no service here publishes a port, the only ingress is an outbound
Cloudflare Tunnel, and the box has no public address to reach.

There are two lanes. Which one a merge takes is decided by the platform's
`classify` job, from `apps.yml` and from this app's own
`deploy/migrations added <before> <after>`:

| The merge | What happens |
| --- | --- |
| Adds no revision under `alembic/versions/` | Deploys immediately, unattended. Nothing here can lose data — the database is never modified. |
| Adds one | **Waits for your approval** in the `production` GitHub Environment, then deploys. |
| Cannot be classified — a zero `before`, an unreadable registry, a hook that fails | Takes the gated lane. An unnecessary approval costs one tap. |

The gate exists because a migration is the only class of change that can
destroy data, and because `alembic downgrade` is not a restore: reversing a
dropped column recreates it empty.

**The `production` environment must have you as a required reviewer**, and
nothing in this repository declares it. Referencing an environment that does
not exist does not fail — GitHub creates it with no protection rules and runs
the job — so the platform's `verify-gate` job asks the API whether the reviewer
is really there and refuses the deploy when it is not. Arming it is in
`~/cg1618/docs/registry.md`.

### Running it by hand

Still supported, still correct, and still what you do when the runner is down.
It runs from the platform checkout, not from this one, and it names the app:

```bash
cd ~/cg1618 && ./bin/deploy media
```

**The code has to be on `main` first.** `bin/deploy` pulls whichever branch the
app's checkout is on and never names one; the box is on `main`, so work reaches
it only after a release pull request promotes `dev`. Merging to `dev` deploys
nothing. The automatic path passes `--ci`, which additionally **refuses to run
unless the checkout is on `main`** — the by-hand path trusts you to look.

**Do not `git pull` or `git checkout` in `~/media` first.** The revision a
rollback returns to is recorded beside the dump *after* it is taken. Moving
`HEAD` beforehand records the version you are moving *to*, which is useless as
a rollback target — and the mistake is invisible until the rollback needs it.

What one run does: dumps this app's database and refuses to continue if the
dump is empty, records the git revision **and** the schema revision beside it,
tags the outgoing image `media-app:previous`, pulls, rebuilds and restarts,
waits for `/api/health`, then prunes to the last five dumps. Migrations apply
themselves, because `entrypoint.sh` runs `alembic upgrade head` on every start.
The frontend rebuilds, because that is the first stage of `dockerfile`.

**The dumps live in `~/backups/media/`**, one directory per app, and **two
files travel beside every dump**. `.revision` is the git sha; `.migration` is
what `alembic_version` held at dump time, read out of the database by
`deploy/migrations current`. They are not interchangeable: a git sha is not an
Alembic revision id, and the rollback's downgrade needs the second. It is read
from the database rather than worked out later from the first, because asking
an image for its head answers what that image *knows* rather than what the
schema *was* — and those diverge exactly when a rollback is happening.

## `deploy/migrations` — what this app answers about its own schema

The platform cannot read a version table, decide what a deploy adds, or reverse
a migration for an app whose tool it does not know. It asks instead, and this
hook answers in Alembic:

| Call | Answer |
| --- | --- |
| `current` | the revision the **database** is at, or `base` when there is no version table yet |
| `added <from> <to>` | the revision files that range adds, and nothing at all when there are none |
| `downgrade <target>` | reverse to that revision — **or refuse** |

`apps.yml` declares `migrations: true` for `media`, and `bin/deploy` refuses
outright when the registry says that and the commit being deployed carries no
executable hook. A lost `+x` bit therefore does not deploy an unapproved
migration; it stops every deploy.

**`added` answers from the git checkout alone.** It is asked on a
GitHub-hosted runner as well as on the box, where there is no PostgreSQL and no
`.env`, and a hook that failed there would gate every deploy of this app for
good, in a green run.

**`downgrade` refuses any revision on the path that declares
`irreversible = True`** — non-zero, having reversed nothing — and the platform
then freezes instead. Reversing such a migration does not restore what it
removed; it invents something in the shape of it, unattended, in the minute
after a failed deploy. The same marker is pinned from the other side by
`tests/api/test_migration_round_trip.py`, which fails a revision that spells it
any other way, and the refusal itself is executed against a scratch chain in
`tests/unit/test_deploy_scripts.py`.

**The downgrade runs from the NEW image**, with `--entrypoint alembic`. The
previous image does not contain the revision files being reversed, and without
the explicit entrypoint the container discards the command and re-runs the
upgrade that has just failed.

## When an automatic deploy fails

The platform's ladder, stopping at the first rung that works. The full account
is in `~/cg1618/bin/rollback`; what matters here is where each rung leaves this
app's data.

| | Situation | Where it leaves you |
| --- | --- | --- |
| 1 | The deploy **refused to start** — wrong branch, no `.env`, an unapproved migration, a registry and a repository that disagree | Production untouched and still serving the previous release |
| 2 | The deploy **ran** and `/api/health` did not come back | Site back up on the previous release. **Schema reversed; data NOT restored** |
| 3 | Tier 2 failed, or a revision declares `irreversible = True` | Frozen, with the dump path and both revisions printed |

**Tier 2 never restores data.** It reverses schema, not content. If the
migration dropped a column, that data exists only in the pre-deploy dump — so
restoring it is a decision a person makes, which is what tier 3 is for and what
[Rollback](#rollback) below is the procedure for.

**A rollback leaves this checkout detached**, at the revision the dump belongs
to. That is deliberate — the old code has to match the old schema — and
`bin/deploy --ci` recovers from it: a detached `HEAD` at a commit `main`
**contains** returns to `main` before deploying. Any other non-`main` checkout
still refuses.

### A merge that never deploys

The one failure GitHub cannot report. If the runner is offline when you merge,
the job queues silently — no failure appears, the site stays up on the previous
release, and nothing says the new code is not running.

A dead-man's switch on the deploy job cannot cover it: Healthchecks fires when a
ping fails to arrive within an expected period, deploys are irregular so there is
no period to configure, and a job that never started cannot ping. So the check is
daily and watches for **drift** instead — `deploy/backup/drift.sh` compares this
checkout's `HEAD` against `origin/main`. That also catches a deploy that failed
silently, and a checkout that has wandered off `main`.

**The six-hour window is measured from the oldest commit the box is missing**,
not from the newest commit on `main`. The difference decides whether the check
works at all: ageing the newest would restart the clock on every merge, so a box
that had stopped deploying entirely would never alert as long as somebody merged
more often than the window — active development hiding a dead runner, which is
the exact failure this job exists to catch.

If the box is **not behind** `main` but still differs — it holds commits `main`
does not — there is no oldest-missing commit and no window that could ever
expire, so that alerts immediately. It means the checkout has left `main`.

A run that cannot reach GitHub at all fails and pings nothing, which is correct:
the missing ping is what the dead-man's switch is for, and a network blip
self-corrects on the next run well inside the grace window.

### Two things a deploy does not do

**Systemd units are not reinstalled.** A deploy touches nothing under
`/etc/systemd/system`. A change to any file in `deploy/backup/units/` — a
schedule, an `After=`, a new job — arrives in the checkout and **does not reach
the running timers**. The live units keep the old definition, nothing errors,
and `systemctl cat media-backup.timer` and the file in the repository quietly
disagree. After any change under `deploy/backup/units/`, or to `install.sh`
itself:

```bash
sudo ./deploy/backup/install.sh
```

It is idempotent: the packages are already present, the units are overwritten,
`daemon-reload` runs, and timers already enabled stay enabled.

**New environment variables do not appear.** A deploy never writes `.env` or
`.env.backup`. A change that requires a new key needs it added by hand first, or
the job or container fails on the next start — `load_backup_env` refuses by
name, which is the loud case; a variable the application reads through
`settings` may simply be `None`, which is the quiet one.

## The services, across two projects

This repository runs **one** service. PostgreSQL and the tunnel are shared by
every application on the box and belong to `cg1618-apps/platform`, checked out
at `~/cg1618`.

| Project | Service | What it is |
| --- | --- | --- |
| `cg1618` | `db` | `postgres:17`, data in the named volume `cg1618_pgdata`, reachable on the shared network as `db` |
| `cg1618` | `cloudflared` | the outbound tunnel, and the only way in; its ingress is generated from `apps.yml` |
| `media` | `app` | built from this repository's `dockerfile`; FastAPI plus the built SPA, joined to the shared network as `media-app` |

`deploy/migrations` and the backup scripts reach the database through the
platform's compose file — `${PLATFORM_DIR}/docker-compose.prod.yml`, and with
`COMPOSE_PROJECT_NAME` cleared, because this app's `.env` exports `media` and
the environment beats a compose file's own `.env`. `up`, `ps` and `run app`
still mean this project and must keep the variable.

**Nothing is published to the host.** No service has a `ports:` entry, so the
database is not on the LAN and the app cannot be reached except through
Cloudflare. To reach PostgreSQL from a laptop, forward it over SSH:

```bash
ssh -L 5433:localhost:5432 homelab   # then psql -h localhost -p 5433
```

## What is on the box and not in git

| Thing | Where | Why not in git |
| --- | --- | --- |
| `.env` | `~/media/.env` | secrets; already gitignored |
| `.env.backup` | `~/media/.env.backup` | R2 write credentials and the Healthchecks ping URLs; kept out of `.env` so `env_file: .env` cannot hand them to the app |
| rclone remote | `~/.config/rclone/rclone.conf` | R2 access keys |
| Dumps | `~/backups/media/` | the last five pre-deploy dumps, with their `.revision` and `.migration` sidecars |

The tunnel's credential files and the platform's own `.env` belong to
`~/cg1618`, and are documented there.

## `.env`

**Write this by hand. Do not copy a development `.env`.** `DATABASE_URL` is
honoured verbatim by `app/config.py`, so a stale `localhost` value copied from a
dev machine silently breaks the container.

```
APP_ENV=production
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<generate>
POSTGRES_DB=media
DATABASE_URL=postgresql://postgres:<the same password>@db:5432/media
PORT=8000

JWT_SECRET_KEY=<generate; not the development one>
ADMIN_PASSWORD=<generate; not the development one>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

GOOGLE_SHEET_ID=<the App Database sheet; never the development one>
GOOGLE_CREDENTIALS_JSON=<service account JSON, on one line>

COMPOSE_PROJECT_NAME=media
```

`TUNNEL_ID` and `CLOUDFLARED_CREDENTIALS` are **not** here. They configure the
tunnel, which belongs to the platform, and they live in `~/cg1618/.env` — as
does the PostgreSQL superuser password. An application's `.env` is handed to its
container by `env_file:`, so anything left in this one is given to the web
application; the tunnel's identity and the database superuser have no business
there.

**`COMPOSE_PROJECT_NAME` names the volume**, so it decides which database the
stack sees. Compose otherwise derives it from the directory, and a checkout
moved or cloned under another name would come up on a brand-new empty volume
while the real data sat in the old one — which looks exactly like data loss.
It is `media` here, matching `media.cg1618.com`, and the development
machines pin the same value for the same reason.

Plus the third-party API keys, which are account credentials rather than
per-environment secrets and are reused from a dev machine: `TMDB_API_KEY`,
`OMDB_API_KEY`, `COMICVINE_API_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`,
`STEAM_API_KEY`, `STEAM_ID`, `ANIDB_CLIENT`, `ANIDB_CLIENTVER` (the last two
name a client registered at anidb.net; AniDB is off while either is unset).

Generate a secret with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

**`ADMIN_PASSWORD` is not what protects this box today.** `app/main.py` seeds
the admin account only when it is absent, and the account arrived with the
restored dump. The password in use was set by hand; `ADMIN_PASSWORD` is what
would apply to a rebuilt-empty database.

**`GOOGLE_SHEET_ID` decides which spreadsheet Backup overwrites, and Backup
overwrites every tab.** Production's sheet is named **App Database**. The
development sheet's id must never appear in this file, and production never runs
Pull All.

## Rollback

**This is the full manual procedure, including the data restore.** An automatic
deploy failure runs `~/cg1618/bin/rollback media` instead, which does tiers 1
and 2 of [the ladder](#when-an-automatic-deploy-fails) — code and schema — and
deliberately stops short of step 2 below. Come here when the ladder froze at
tier 3, or when you are rolling back by hand.

Three steps, in this order. **Restoring the data without reverting the code does
not work**: the next start runs `alembic upgrade head` and re-applies the
migration that caused the problem.

1. **Revert the code** to the revision the dump belongs to:

   ```bash
   cd ~/media
   git checkout "$(cat ~/backups/media/pre-deploy-<stamp>.dump.revision)"
   ```

2. **Restore the data:**

   ```bash
   docker compose -f ~/cg1618/docker-compose.prod.yml exec -T db \
     pg_restore -U postgres -d media --clean --if-exists --no-owner \
     < ~/backups/media/pre-deploy-<stamp>.dump
   ```

3. **Rebuild and start — `--build` is not optional:**

   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

   **Without `--build` the rollback does not roll anything back.** `git
   checkout` reverts the source on disk, but the application code the container
   runs is baked into `media-app:local`, and plain `up -d` happily reuses that
   image. You get old data running under new code — which is the exact failure
   the warning above describes, arrived at by following the procedure meant to
   avoid it.

   It fails silently: the site stays up, the row counts look right, nothing
   complains. On a rollback that mattered, `alembic upgrade head` would then
   re-apply the migration being escaped.

   **Verify it took**, because "the site is up" proves nothing about which code
   is serving. Pick a source file you know differs between the two revisions —
   `git diff <new> <old> --stat` names them — and compare it on disk with the
   copy inside the container:

   ```bash
   md5sum <path>
   docker compose -f docker-compose.prod.yml exec -T app md5sum /app/<path>
   ```

   They must agree. If the container still matches the newer revision, the
   rebuild did not happen.

**The fast path, when rolling back exactly one deploy:** a deploy tags the
outgoing image before it builds, so the previous one is still there and no
rebuild is needed:

```bash
docker tag media-app:previous media-app:local
docker compose -f docker-compose.prod.yml up -d
```

`media-app:previous` is a **single slot**, overwritten by every deploy. Rolling
back two deploys means it is the wrong image, and only `--build` is correct.
If only the code is bad and no migration ran, step 2 is unnecessary either
way.

## Disaster recovery from R2

**This is a different operation from rollback.** Rollback reverses a bad
deploy using a local dump that still exists on the box's own disk. This
rebuilds the box from copies that were never on it — the disk itself, or the
dumps in `~/backups/` alongside it, is gone or untrusted.

**Walked end to end**, against a scratch stack on the box: dump fetched from
R2, restored with the script below, application started against the restored
database and served real rows. What it has not been run against is an actual
loss, where the box itself is gone and `.env` is being retyped from a password
manager. Steps 1 and 8 are the parts that rehearsal cannot exercise.

To rehearse it again without touching production, see
[Rehearsing it](#rehearsing-it) below.

1. Get the two files this needs onto the box being recovered onto:

   - `~/.config/rclone/rclone.conf` with the `[r2]` remote (see
     [docs/setup-selfhost.md](../docs/setup-selfhost.md)), plus `rclone`
     itself — this is what reaches the dumps at all.
   - `~/media/.env`, written by hand per [`.env`](#env) above.
     `restore.sh` reads `POSTGRES_USER` and `POSTGRES_DB` from it, and the
     stack cannot start without it.

   **`.env.backup` is not needed for a restore.** `restore.sh` loads only
   `.env`; the R2 credentials for *this* procedure live in `rclone.conf`.
   Recreate `.env.backup` afterwards, when the scheduled jobs are put back —
   they will not run without it, and `install.sh` refuses to run without it.
2. Pick a dump:

   ```bash
   rclone lsf r2:<bucket>/db/daily
   ```

3. Bring it down:

   ```bash
   rclone copyto r2:<bucket>/db/daily/<name>.dump /tmp/<name>.dump
   ```

4. Stop the app so `create_all` at import cannot collide with the restore:

   ```bash
   docker compose -f docker-compose.prod.yml stop app
   ```

5. Restore with the same script the weekly drill runs, not a hand-typed
   `pg_restore`:

   ```bash
   deploy/backup/restore.sh --dump /tmp/<name>.dump --into production --confirm
   ```

6. Bring the images back:

   ```bash
   rclone copy r2:<bucket>/covers static/covers
   rclone copy r2:<bucket>/library static/library
   ```

7. Start everything:

   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

8. **Rotate both passwords afterwards**, the same as the [`.env`](#env) restore
   notes above require — the restored dump carries whatever credentials were
   live when it was taken.

### What the walk-through turned up

- **Step 4 stops `app` only.** `db` must stay up — it is what `restore.sh`
  executes `pg_restore` inside, and it belongs to the platform's project, so it
  is untouched by anything done in this one. Stopping the whole stack leaves
  nothing to restore into.
- **The guard prints what it is about to destroy before it acts**, as row
  counts. On a real recovery that line is how you confirm the target is the
  database you meant. Against an empty scratch database it printed `(0 rows)`,
  which is the shape to expect when recovering onto a fresh box.
- **`/api/system/health` answers 200.** It does not exist — the catch-all route
  serves the SPA for any unmatched path, which is also why no service in
  `docker-compose.prod.yml` has an app healthcheck. Do not use an HTTP 200 on an
  arbitrary path as evidence the application came up. Check `Content-Type`:
  the real API answers `application/json`, the catch-all answers `text/html`.
  `/api/health` — the path `apps.yml` registers — is the one the platform
  probes, and it opens a database session rather than serving a file.
- **`/openapi.json` is the honest liveness check** if you are looking by hand.
  It is served by FastAPI itself rather than the catch-all, so a route count
  coming back proves the application loaded rather than that a file was served.

### Rehearsing it

The whole procedure can be run against a scratch stack that is incapable of
touching production, because `lib.sh` honours `REPO_DIR`. Point it at a
directory holding its own compose file and `.env`:

```bash
mkdir -p ~/rehearsal/static/covers ~/rehearsal/static/library
cd ~/rehearsal
cp ~/media/docker-compose.prod.yml ~/media/.env .
sed -i 's/^COMPOSE_PROJECT_NAME=.*/COMPOSE_PROJECT_NAME=rehearsal/' .env
```

Then edit the copied compose file to bind the app to loopback,
`127.0.0.1:8001:8000`, so nothing reaches the LAN. The tunnel is not in this
file to remove — it belongs to the platform's project and a rehearsal never
starts a second one.

**Verify the project name before creating or destroying anything.** The project
decides which volume Compose uses, so a wrong one aims `down -v` at production's
data:

```bash
docker compose -f docker-compose.prod.yml config --format json \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])'
  # must print: rehearsal
```

Bring up its database, then run the ordinary steps 2, 3 and 5 above with
`REPO_DIR=$HOME/rehearsal` in front of `restore.sh`. Tear down with
`docker compose -f docker-compose.prod.yml down -v` after re-checking the
project name.

Restoring `covers/` is worth skipping in a rehearsal — it is 283 MB over a
metered connection and uses the same `rclone copy` the weekly sync already
proves. `library/` is worth restoring every time: it is small, and it is the
one store nothing can re-fetch.

## What this does not protect against

A migration that is wrong in a way nobody notices for a week. By then every
deploy dump either predates the damage uselessly or postdates it. That is what
the nightly off-box backup — see [Backups](../docs/deployment-selfhost.md#backups)
— is for.

## Rehearsing the deploy itself

Merging a working change proves only the happy path. Two rehearsals, and they
are not interchangeable:

- A deliberately broken **commit** — the app fails to start — should deploy,
  fail health, roll back to `media-app:previous`, and come back up.
- A deliberately broken **migration**. A deploy that adds no revision leaves the
  image's head and the database's `alembic_version` in agreement, so it
  exercises tier 2's mechanism while never asking the question tier 2 exists
  to answer. Only a deploy that *adds* a revision tests whether the right
  downgrade target was chosen.

Write whatever a rehearsal turns up into this file **as it actually ran**. The
rollback procedure here was wrong once in a way only executing it revealed, and
the backup work found four defects on this box that were invisible from a
Windows machine.
