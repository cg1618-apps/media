# Switching between development environments

Last verified: 2026-09-24

## What this is for

This project is developed on **two machines**: **company** and **home**. Work
often stops halfway on one of them and continues on the other, so both the
**code** and the **database contents** have to be handed over deliberately —
git carries the code, Google Sheets carries the data, and nothing carries the
local secrets.

Read this before you stop work on one machine and before you start work on the
other. Setup of a machine from scratch is [setup-local.md](setup-local.md); the
Backup and Pull actions themselves are [data-actions.md](data-actions.md).

---

## 1. The two environments

| | **Company** | **Home** |
|---|---|---|
| Project path | `C:\Users\q601513\Documents\personal\cg1618\media` | `C:\Users\cgent\Documents\cg1618\media` |
| OS | Windows 11 Pro (10.0.26200) | Windows 11 Home (10.0.26200) |
| PostgreSQL | the platform's `docker-compose.dev-db.yml` (`postgres:17`, container `cg1618-dev-db`, `127.0.0.1:5432`, volume `cg1618_dev_pgdata`). Start it with the platform's `.\dev-db.cmd`, or let any app's `dev.ps1` do it. Identical on both machines since company migrated on 2026-09-24. No native PostgreSQL is installed here. | **docker-compose**, identical. Native PostgreSQL 17 and 18 are also installed here, with their services set to **Manual** start so they cannot claim 5432 ahead of the container. If the container will not bind the port, check that neither native service has been started by hand. |
| Database | `media` as `postgres` on `127.0.0.1:5432` | `media` as `postgres` on `127.0.0.1:5432` |
| Python | `venv/Scripts/python.exe` — **3.13.15**, built with `py -3.13`. 3.11 and 3.14 are also installed; neither is used here | `venv/Scripts/python.exe` — **3.13.6**, the version the project targets |
| Node / npm | v24.18.0 / 11.16.0 | v24.14.1 / 11.11.0 |
| Google Sheet | `GOOGLE_SHEET_ID=1d-rh8joD3xHhG58KdFyBDQ-g99xDfMnHNiBu7ECFemU` — the same sheet on both machines, and the only channel data travels through | same sheet |
| Remote | `origin` → `https://github.com/cg1618-apps/media.git`. Git's **global** identity on this machine is the work account, which has no write access to `cg1618-apps`, so this clone sets `user.name`, `user.email` and a `credential.helper` in its **local** config — see below | `origin` → `https://github.com/cg1618-apps/media.git` |

> Both columns are recorded from the machine itself. Keep it that way — record
> from the machine rather than from memory, and bump the `Last verified` line.

**The pre-migration tree was kept on home and deleted on company.** Home's is
still `C:\Users\cgent\Documents\anime_site`; the company machine's
`C:\Users\q601513\Documents\anime_site` was deleted on 2026-09-24, once the new
tree was verified, along with its `anime_site_postgres_db` container and its
`anime_site_postgres_anime_data` volume.

Keeping one is only worth it for `static/covers/`, which is gitignored and does
not travel. Once those have been copied across, what remains is a clone of the
archived `cgentle1618/anime_site` that nothing can be pushed to, a stale
`frontend_dist/`, and copies of `.env` and `credentials.json` that now live in
the app.

The reason to be deliberate about it while it exists: it shares the same
PostgreSQL and the same `COMPOSE_PROJECT_NAME`, so a command run there reaches
the **real** development database while its remote is read-only.

**Both machines are migrated.** Company migrated on 2026-09-24, into
`C:\Users\q601513\Documents\personal\cg1618\media`, as a clone alongside the
old tree rather than a replacement of it.

Its database was not rebuilt from the sheet. The old container's volume was
copied into the platform's with `.\dev-db.cmd -Migrate`, which leaves the source
untouched as the rollback, and the copy was then renamed and brought to head:

```bash
# from the platform checkout, with nothing connected to either database
docker stop anime_site_postgres_db
.\dev-db.cmd -Migrate
.\dev-db.cmd
docker exec cg1618-dev-db psql -U postgres -d postgres -c "ALTER DATABASE anime_site_db RENAME TO media"
docker exec cg1618-dev-db createdb -U postgres media_test
venv/Scripts/alembic.exe upgrade head          # s1e2asonalix -> h1c2o3m4i5c6
```

**Pull All was deliberately not run**, so the 2,081 media rows on that machine
are its own rather than the sheet's. See
[open-items.md](open-items.md#the-two-machines-and-the-backup-sheet) for why
that is the safe order rather than an oversight.

Two things that are easy to lose in a fresh clone:

- **`.env` keeps `COMPOSE_PROJECT_NAME=media`**, but no longer for the
  reason it used to. It was pinned because this app owned the development
  database: the new directory is named `media`, so without the pin compose
  mounted a new empty volume while the real data sat untouched — which looked
  exactly like data loss. **That cannot happen any more**: the development
  database is the platform's `docker-compose.dev-db.yml`, which pins its own
  project and volume names, and this app has no `docker-compose.yml` at all.
  What the variable still does is name this app's production compose project on
  the box. Nothing else in `.env` changes; that machine keeps
  `STEAM_ENABLED=false`.
- **`static/covers/` is not in the clone.** It is gitignored and per-machine —
  about 2,000 files, 284MB on the home machine; 1,883 files, 235MB on company.
  Copy it from the old directory, which is quick and is the one thing that
  directory is still good for; failing that, `/system` → Calculate → **download
  missing covers** rebuilds it from the APIs.

  **It belongs at `static/covers/<owner_type>/`, not under `static/library/`.**
  `image_manager.py` sets `COVER_DIR = "static/covers"`; `static/library/` is
  content-addressed upload storage and `static/quotes/` holds the pre-existing
  quote images. A copy that lands one level deep serves 404s for every cover
  while looking entirely plausible on disk, because the 13 owner folders are all
  there and all named correctly.

- **Git's identity and credentials are per-repository on company.** That
  machine's global `.gitconfig` is the work account, and it also serves an Azure
  DevOps remote and an internal Git server, so it must not be repointed. Each
  personal clone sets its own instead:

  ```bash
  git config --local user.name cgentle1618
  git config --local user.email cgentle1618@gmail.com
  git config --local --replace-all credential.helper ""
  git config --local --add credential.helper "!gh auth git-credential"
  ```

  Without the identity, commits are authored as the work account. Without the
  credential lines the Windows Credential Manager answers first with that
  account, and the push fails `403 Permission to cg1618-apps/... denied` naming
  an account that has nothing to do with this project. `--add` after
  `--replace-all ""` matters: a helper set with a plain `git config` is appended
  to the inherited list rather than replacing it, and the first helper to answer
  wins.

Run **Backup** from whichever machine holds the newer data before touching the
other.

**This repository is cloned inside the platform repository.**
`C:\Users\cgent\Documents\cg1618` on home, and
`C:\Users\q601513\Documents\personal\cg1618` on company, is itself a clone of
`cg1618-apps/platform`,
which holds `apps.yml` — the registry the box derives from — and, as the
platform sequence proceeds, the shared PostgreSQL, the tunnel ingress and the
deploy scripts. It ignores `/media/`, so the two histories never meet and a
`git status` in either one shows only its own files.

Which directory a session starts in is therefore a real choice: `cg1618\` for
infrastructure and cross-app work, `cg1618\media\` for the tracker. A session in
the tracker still loads the platform's `CLAUDE.md`, because Claude Code walks
the filesystem upwards rather than stopping at a repository boundary.

There is no shared server — local development is the only runtime on either
machine. (A GCP deployment existed once and could be rebuilt; the record is
[deployment-gcp.md](deployment-gcp.md).) Each machine has its **own local
database**, and the two diverge the moment either one is edited.

Production is a third thing entirely and never participates in this handover.
It is the homelab box, [deployment-selfhost.md](deployment-selfhost.md), it has
its own sheet, and it takes data from its own dumps rather than from the one
below.

### Where each database is

| | Revision | Notes |
|---|---|---|
| **Home** | `f1r2anlabel3` — head, as of 2026-09-20 | Moved off native PostgreSQL 17.6 into the container on 2026-09-08 by dump and restore, all 43 non-empty tables verified row-for-row. Two of the revisions it now holds declare `irreversible = True`, so it cannot be downgraded past them — going back before the notes rework means restoring a dump |
| **Company** | `h1c2o3m4i5c6` — head, as of 2026-09-24 | Volume-copied out of the pre-migration `anime_site_postgres_anime_data` on 2026-09-24, renamed `anime_site_db` → `media`, then upgraded from `s1e2asonalix`. 2,081 `media` rows, 833 `anime`, 2 accounts, 59 tables; the recovery dump taken before the upgrade is below. **Pull All has still not been run here**, so its rows are its own and not the sheet's — the sheet predates the notes rework, which is why that is the safe place to stop |

Read it from the machine rather than from memory:

```bash
docker exec cg1618-dev-db psql -U postgres -d media \
  -tAc "SELECT version_num FROM alembic_version"
```

**`.env` travels nowhere**, so each machine needs its own filled in. Home has
every key set, `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` and `STEAM_API_KEY` /
`STEAM_ID` included; a machine missing the Steam pair cannot run the Steam
import.

### The `anime_site` names, and the one-off each machine owed

On 2026-09-21 the last `anime_site` names were renamed to `media`: production's
checkout (`~/anime_site` → `~/media`) and live database (`anime_site_db` →
`media`), and, in this repository, the development database, the test database
(`anime_site_test` → `media_test`) and `COMPOSE_PROJECT_NAME`.

**All three are done** — production and home on 2026-09-21, company on
2026-09-24 — because a database is machine state and does not travel with the
branch that renames it. The procedure that was run, per machine, with nothing
connected to either database:

```bash
docker exec cg1618-dev-db psql -U postgres -d postgres -c "ALTER DATABASE anime_site_db RENAME TO media"
docker exec cg1618-dev-db createdb -U postgres media_test
# last, once every tree on the machine is on a branch that expects media_test
docker exec cg1618-dev-db psql -U postgres -d postgres -c "DROP DATABASE anime_site_test"
```

and then the two values in that machine's `.env`, which is per-machine and
gitignored: `POSTGRES_DB=media` and `COMPOSE_PROJECT_NAME=media`.

**The test database is created before the old one is dropped, not renamed in
place.** A rename takes the database out from under any other checkout on the
machine mid-suite, and what that produces is `relation "..." does not exist` —
which reads as real breakage rather than as somebody else's rename. Creating
the new one first makes the two coexist for as long as it takes every tree to
catch up.

On company this ran after its migration rather than before, because the
commands address `cg1618-dev-db` and that container did not exist there until
the migration created it. Seven stale `anime_site_test_step*` scratch databases
were dropped in the same pass — leftovers from worktrees whose branches had
merged, which `worktree.ps1` is supposed to drop and which nothing notices when
it does not.

### Recovery dumps

Taken by hand before a migration that could not be undone, and kept on the
machine named. They are **not** a backup system — production has one
([deployment-selfhost.md](deployment-selfhost.md#backups)); these two machines
have nothing beyond the Google Sheet.

| Dump | Machine | Taken before |
|---|---|---|
| `~/anime_site_pre_owner_flag_20260912.sql` | home | `o1a1ownerflag` moved every user row off `admin` |
| `~/anime_site_home_pre_step1_20260909.sql` | home | the `m0a*`..`m1b1anime` run, which deleted 2 orphaned `media_credit` and 10 orphaned `media_tag` rows by design |
| `~/anime_site_home_pre_docker_20260908.sql` | home | the move from native PostgreSQL 17.6 into the container |
| `~/media_company_pre_upgrade_20260924.sql` | company | the `s1e2asonalix` → `h1c2o3m4i5c6` upgrade that followed that machine's migration; two revisions in that range declare `irreversible = True` |
| `~/anime_site_company_pre_baseline_20260916.sql` | company | the baseline rework |
| `~/anime_site_company_pre_pull_20260910.sql` | company | a Pull All |
| `~/anime_site_pre_step3_20260910.sql` | company | the step-3 migration run |
| `~/anime_site_pre_publisher_20260907.sql` | company | the publisher migration |

Read from the machines rather than from memory. A row for
`anime_site_pre_games_20260906_134907.sql` on company was listed here and no
such file exists there — a dump the page asserts and the disk does not have is
worse than no row at all, because it reads as a rollback somebody has.

**Scratch test databases are not tracked.** Each worktree gets its own from
`worktree.ps1` and drops it when the branch merges, and
`tests/api/conftest.py` refuses any database whose name lacks `test`, because
its fixture runs `DROP SCHEMA public CASCADE`.

---

## 2. What travels, and how

| Thing | Channel | Notes |
|---|---|---|
| Code, migrations, docs | git (`origin`) | commit + push before leaving; pull on arrival |
| Database contents | Google Sheets | **Backup** writes local DB → sheet; **Pull All** writes sheet → local DB |
| `.env`, `credentials.json` | **nothing** | per-machine, gitignored; never commit them. Deliberately different per machine: **company** sets `STEAM_ENABLED=false` and leaves `STEAM_API_KEY` / `STEAM_ID` unset, because the company network inspects TLS to Steam's hosts and would log the key from the Web API's URL; **home** omits the line entirely (the default is `true`) so prices, Metacritic and playtime all fill. Nothing else about the two files should diverge — see [external-apis.md](external-apis.md#turning-steam-off-entirely) |
| `CLAUDE.local.md` | **nothing** | per-machine notes for Claude Code, gitignored. Each machine holds its own and each one names the machine it is on — home says home, company says company — so a copied file is worse than a missing one. Keep it to what identifies the machine; everything else about the pair belongs in this page |
| `venv/`, `node_modules/`, `frontend_dist/` | **nothing** | rebuilt locally on each machine |
| Cover images (`static/covers/`) | **nothing** | Local disk is the only cover storage there is, and the folder is gitignored, so each machine holds its own copy (a few hundred MB). They are not in the sheet either. Rebuild them where they are missing with `/system` → Calculate → **download missing covers**, which re-runs the autofills for every row whose file is gone |
| Accounts and everybody's list rows | Google Sheets | the `Users` and `User Media List` tabs. **Passwords do not travel** — an account restored here needs a password set at `/users` before it can be logged into |
| Roles and their grants | **nothing** | `ensure_rbac_seed` recreates guest, user and admin anywhere; a role added or a grant removed by hand is per-machine. Content *labels* do travel — see [data-actions.md](data-actions.md#2-sheet-tab-registry-tabspy) |

### The one hard rule

**The Note tab changed shape in the notes rework, and Pull cannot tell.** The
`note` table gained `parent_id` and `fields`, so the tab gained two columns;
and eleven sections changed shape, so the rows themselves are written
differently. Pull matches columns by header name and writes what it finds, so a
Pull from a sheet backed up **before** that release would put note rows back in
their old shape: `entries` values on sections that are `structured` now (which
validation refuses the next time anybody edits the row), and `side_quests` rows
under a section key the registry no longer has (which nothing renders).

Neither is loud. The rows restore, the page loads, and the damage shows up one
edit later. **Run a Backup from the machine holding the newer data before any
Pull**, which rewrites every tab in the current shape and is the only thing
that clears this.

**Google Sheets holds exactly one version of the data.** Backup overwrites every
tab; Pull All overwrites every table. So:

- Back up **from** the machine whose database is newer, *before* touching the
  other machine's database.
- Never run Pull All on a machine that holds unsaved data changes — it replaces
  them with the sheet.
- If both databases were edited since the last backup, stop and reconcile by
  hand. There is no merge.

---

## 3. Leaving an environment (handoff out)

1. **Finish or park the code.** Stage only the files belonging to your task (see
   the concurrent-sessions rule in `CLAUDE.md`), commit, and push the branch.
2. **Leave a trail for the next session, starting with the branch name.**
   Anything half-done goes into the relevant `docs/` file — the other machine
   starts with an empty conversation and only sees what is written down, and
   now that every task has its own branch, *which branch* is the first thing
   it cannot guess.
3. **Back up the database** if you changed any data: admin page `/system` →
   **Backup** (or `POST /api/data-control/backup`). Wait for the success log row;
   a failed write leaves the previous backup intact, so a failure means the sheet
   is still *old* and must not be pulled.
4. **Note in the commit that a backup was taken**, so the next environment
   knows the sheet is fresh.

## 4. Arriving in an environment (handoff in)



1. `git fetch origin`, then `git checkout <branch>` — the branch you left work
   on exists only on `origin` and on the other machine, so a plain `git pull`
   on whatever this machine last had checked out silently leaves you on the
   wrong branch with the right-looking history. Every task has its own branch
   (`CLAUDE.md`, "Git Branches"), so the branch name is part of the handover:
   write it down before leaving.
2. Start PostgreSQL: `docker-compose up -d`.
   **Check that `DATABASE_URL` is commented out in this machine's `.env`.**
   `app/config.py` uses `DATABASE_URL` verbatim whenever it is set, so a
   leftover line wins over the `POSTGRES_*` parts and the app dies with
   `password authentication failed`. `venv\Scripts\python.exe -c "from
   app.config import settings; print(settings.sqlalchemy_database_url)"`
   prints the URL actually in use.
3. Re-install dependencies **if they changed**: `pip install -r requirements.txt`,
   `cd frontend && npm install`.
4. `alembic upgrade head` — always, before any Pull. The sheet's columns follow
   the newest schema, and Pull matches columns by header name.

   > ### One-time, on any machine last used before the squash
   >
   > The revision chain was squashed onto a single baseline (`4832c83905a3`),
   > and the 145 revisions that preceded it moved to
   > `alembic/versions_archive/`. A database still pointing at one of those —
   > anything stamped `q3s4sysinfo` or earlier — makes **every** alembic
   > command fail before it starts, including `stamp`:
   >
   > ```
   > [ALEMBIC FATAL CRASH] Can't locate revision identified by 'q3s4sysinfo'
   > ```
   >
   > `alembic stamp` cannot fix it, because stamping resolves the *current*
   > revision first in order to work out the path. Set the row directly, then
   > upgrade as normal:
   >
   > ```bash
   > docker exec cg1618-dev-db psql -U postgres -d media    >   -c "UPDATE alembic_version SET version_num = '4832c83905a3'"
   > alembic upgrade head
   > ```
   >
   > The upgrade then applies `b1n2amealign`, which renames 31 constraints and
   > indexes, adds five indexes and eleven column defaults, and swaps the
   > `access_mode.key` uniqueness onto a unique index. **It changes no rows** —
   > verified on the home machine by comparing every table's count before and
   > after — but take a dump first anyway: `docker exec
   > cg1618-dev-db pg_dump -U postgres --no-owner media >
   > backups/pre-baseline.sql`. `backups/` is gitignored.
5. **Pull All** from `/system` if the data changed on the other machine, then
   run **Calculate All** if derivations matter for what you are about to do.

   > **Passwords do not travel.** The `Users` tab carries who exists and what
   > role they hold, and the `User Media List` tab carries
   > everybody's statuses, ratings and progress - but **not** the password
   > hash. It is credential material, and the sheet leaves this database's
   > trust boundary on every Backup. An account Pull created on this machine
   > cannot be logged into until an admin sets a password on it at `/users`.
   > Your own admin account is unaffected: Pull matches by `username` and
   > never overwrites an existing account's password.
   >
   > Check the `Pull All` row in the admin log afterwards. A red row saying
   > *"completed with N unresolved reference(s)"* means those rows did **not**
   > restore - a role, a username or an entry the sheet named that this
   > database does not have. See
   > [data-actions.md](data-actions.md#32-pull-all--execute_pull_alldb-action_type).
6. If `static/covers/` still holds loose `<uuid>.jpg` files rather than
   owner-typed folders, run
   `venv/Scripts/python.exe -m scripts.migrate_cover_layout` and then the same
   with `--apply`. `static/covers/` is gitignored, so each machine holds its own
   copy of the images and each has to be moved once; the column values arrive
   already migrated through Pull All, so the script only moves files here.
7. `cd frontend && npm run build` before checking anything on `:8000`.
8. Re-read the doc for the area you were in.

## 5. Quick checklist

**Before switching away**

- [ ] committed and pushed (only my files) on the task branch
- [ ] WIP state written into `docs/`, **branch name first**
- [ ] Backup run and succeeded (only if data changed)

**After switching to**

- [ ] `git fetch origin` and `git checkout <branch>` — not a bare `git pull`
- [ ] database up, and `DATABASE_URL` commented out in `.env`
- [ ] deps installed if `requirements.txt` / `package.json` moved
- [ ] `alembic upgrade head`
- [ ] Pull All (only if data changed elsewhere), then Calculate All if needed
- [ ] admin log checked: the `Pull All` row names no unresolved references
- [ ] a password set at `/users` for any account Pull restored here
- [ ] `scripts/migrate_cover_layout.py --apply` if the covers are still flat here
- [ ] `npm run build`
