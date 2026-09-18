# Switching between development environments

Last verified: 2026-09-18

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
| Project path | `C:\Users\q601513\Documents\anime_site` | `C:\Users\cgent\Documents\cg1618\media` |
| OS | Windows 11 Pro (10.0.26200) | Windows 11 Home (10.0.26200) |
| PostgreSQL | **docker-compose** (`postgres:17`, container `anime_site_postgres_db`, `5432:5432`, volume `postgres_anime_data`), identical on both machines. Start it with `docker-compose up -d`. | **docker-compose**, identical. Native PostgreSQL 17 and 18 are also installed here, with their services set to **Manual** start so they cannot claim 5432 ahead of the container. If the container will not bind the port, check that neither native service has been started by hand. |
| Database | `anime_site_db` as `postgres` on `127.0.0.1:5432` | same — `anime_site_db` as `postgres` on `127.0.0.1:5432` |
| Python | `venv/Scripts/python.exe` — **3.11.9** (the project targets 3.13; this machine runs 3.11) | `venv/Scripts/python.exe` — **3.13.6**, the version the project targets |
| Node / npm | v24.18.0 / 11.16.0 | v24.14.1 / 11.11.0 |
| Google Sheet | `GOOGLE_SHEET_ID=1d-rh8joD3xHhG58KdFyBDQ-g99xDfMnHNiBu7ECFemU` — the same sheet on both machines, and the only channel data travels through | same sheet |
| Remote | `origin` → `https://github.com/cgentle1618/anime_site.git` — archived, and still what this machine's clone points at | `origin` → `https://github.com/cg1618-apps/media.git` |

> Both columns are recorded from the machine itself. Keep it that way — record
> from the machine rather than from memory, and bump the `Last verified` line.

**The pre-migration tree is kept on each machine rather than deleted** — home's
is `C:\Users\cgent\Documents\anime_site`, and the company machine's stays at
`C:\Users\q601513\Documents\anime_site` when it migrates. Nothing runs from
either: `origin` is the archived `cgentle1618/anime_site`, `frontend_dist/` goes
stale the moment anything is built in the live tree, and the only irreplaceable
things in it — `.env` and `credentials.json` — have been copied into
`cg1618\media`.

What makes it worth a note rather than a silent second copy: it shares the same
PostgreSQL and the same `COMPOSE_PROJECT_NAME`, so a command run there reaches
the **real** development database while its remote is a repository that can no
longer be pushed to. Be deliberate about which directory a session is in. What
it is good for is `static/covers/`, which is gitignored and did not travel.

**The company machine has not been migrated**, and nothing can be pushed from
it until it is: it holds a clone of `cgentle1618/anime_site`, which is archived
and therefore read-only. Migrate it before the first edit, not after.

It migrates the same way the home machine did — a clone alongside, not a
replacement. Clone `cg1618-apps/media` into
`C:\Users\q601513\Documents\cg1618\media`, copy `.env`, `credentials.json` and
`CLAUDE.local.md` across from `C:\Users\q601513\Documents\anime_site`, build a
`venv` (`python -m venv`, `pip install -r requirements-dev.txt`), then
`npm install` and `npm run build`. The old directory stays where it is.

Two things that are easy to lose in a fresh clone:

- **`.env` must keep `COMPOSE_PROJECT_NAME=anime_site`.** The new directory is
  named `media`, so without the pin compose mounts a new empty volume while the
  real database sits untouched in `anime_site_postgres_anime_data` — which looks
  exactly like data loss. Nothing else in `.env` changes; that machine keeps
  `STEAM_ENABLED=false`.
- **`static/covers/` is not in the clone.** It is gitignored and per-machine —
  about 2,000 files, 284MB on the home machine. Copy it from the old directory,
  which is quick and is why keeping that directory is useful; failing that,
  `/system` → Calculate → **download missing covers** rebuilds it from the
  APIs.

Run **Backup** from whichever machine holds the newer data before touching the
other.

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
| **Home** | `s1e2asonalix` — head, as of 2026-09-16 | Moved off native PostgreSQL 17.6 into the container on 2026-09-08 by dump and restore, all 43 non-empty tables verified row-for-row |
| **Company** | `m5b2memefks` — **behind** | Needs `git pull`, then `alembic upgrade head`, then Pull All, in that order. The order matters: see the company-machine entries in [open-items.md](open-items.md#the-two-machines-and-the-backup-sheet) |

Read it from the machine rather than from memory:

```bash
docker exec anime_site_postgres_db psql -U postgres -d anime_site_db \
  -tAc "SELECT version_num FROM alembic_version"
```

**`.env` travels nowhere**, so each machine needs its own filled in. Home has
every key set, `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` and `STEAM_API_KEY` /
`STEAM_ID` included; a machine missing the Steam pair cannot run the Steam
import.

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
| `~/anime_site_pre_games_20260906_134907.sql` | company | the games migration |

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

> ### One-time on the company machine: the Postgres 15 -> 17 volume
>
> `docker-compose.yml` pins `postgres:17`. **A `postgres:17` container refuses
> to start on a `postgres_anime_data` volume holding an older data directory**
> — the log says *"database files are incompatible with server"* and the
> container exits. The volume has to be recreated once, which means the
> database in it is destroyed, so take the data out first:
>
> 1. On the machine with the newer data, run **Backup**.
> 2. `docker-compose down -v` — this **deletes** the local database volume.
> 3. `docker-compose up -d`, then `alembic upgrade head`.
> 4. **Pull All** from `/system` to refill from the sheet, then **Calculate All**.
>
> To avoid the sheet, dump first instead: with the image temporarily set back
> to the older major version, run `pg_dump -U postgres -h 127.0.0.1
> anime_site_db -f dump.sql`, then do steps 2-3 and `psql -U postgres -h
> 127.0.0.1 -d anime_site_db -f dump.sql` in place of the Pull.


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
   > docker exec anime_site_postgres_db psql -U postgres -d anime_site_db    >   -c "UPDATE alembic_version SET version_num = '4832c83905a3'"
   > alembic upgrade head
   > ```
   >
   > The upgrade then applies `b1n2amealign`, which renames 31 constraints and
   > indexes, adds five indexes and eleven column defaults, and swaps the
   > `access_mode.key` uniqueness onto a unique index. **It changes no rows** —
   > verified on the home machine by comparing every table's count before and
   > after — but take a dump first anyway: `docker exec
   > anime_site_postgres_db pg_dump -U postgres --no-owner anime_site_db >
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
