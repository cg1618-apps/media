# CLAUDE.md — the media tracker

**The generic rules are not in this file.** Git workflow, branch and pull
request discipline, concurrent sessions, the machine-wide test lock, the
credentials rule, worktrees and documentation discipline live in
`cg1618-apps/platform`'s `CLAUDE.md`, one directory up. Claude Code loads it
first and this file second, so everything there applies here unless this file
says otherwise.

What belongs here is what names this application: its stack, its commands, its
schema vocabulary and the mistakes that are specific to it.

## Project Overview

**CG1618 Media Tracker & Database** — a FastAPI web application for tracking a personal media collection. Data is organized in a three-tier relational hierarchy: `Collection → Franchise → Series → entry`. Media entry types: Anime, Anime Movie, Movie, TV Show, Cartoon, Manga, Novel, Comic, Game, H-Comic, H-Game (all implemented; H-Comic and H-Game are gated types, seen in the `unrestricted` access mode only - H-Game has no SPA pages yet). Access: guests browse (subject to role permissions and content labels), admins manage everything.

## Documentation Map

Start at **`docs/README.md`** — it indexes every doc. Docs are written for humans first and describe the code as it is; each carries a `Last verified` line. When to read what:

- Schema or column change → `docs/data-model.md`, then `docs/options.md` if a vocabulary moves.
- New or changed media type → `docs/entry-types.md`, `docs/data-actions.md`, `docs/frontend/components.md` ("adding a media type").
- Auth or visibility → `docs/authentication.md`, `docs/authorization.md`.
- Pipelines (Backup/Pull/Fill/Replace/Calculate) → `docs/data-actions.md`, `docs/external-apis.md`.
- Rules and derivations → `docs/business-rules.md`; per-subsystem detail → `docs/systems/*.md`.
- Endpoints → `docs/api.md`. UI → `docs/frontend/*.md`; any visual change → `docs/frontend/design-system.md` first. Tests → `docs/testing.md`. Production: what runs → `docs/deployment-selfhost.md`, deploying and rolling back → `deploy/README.md`, building a box from scratch → `docs/setup-selfhost.md`; `docs/deployment-gcp.md` is history.
- Known defects and unmade decisions → **`docs/open-items.md`**. Machine state — which database is at which revision, where the recovery dumps are → `docs/switching-environments.md`.

When you change behaviour, update the matching doc in the same change and bump its `Last verified` line.

**Docs describe the present. They are not a changelog.** A doc says what the
code does today, in the present tense, with the reasoning that is still load-
bearing — never how it got here. Delete on sight, in any doc you are editing:
phase and step names (`Since Phase B…`, `Step 3 made both tables per-user`),
dated announcements (`Added 2026-09-12`, `changed on 2026-09-12`), commit
shas, and the whole "it used to be X, and that was wrong because Y" shape. If
the old behaviour genuinely explains a constraint that still binds, state the
constraint and drop the history: write "`role_id` is minted per database, so
the role name travels instead", not "`role_id` used to travel until Step 4
broke the arriving machine". A reader of these files wants the system as it
is; the version they are reading is the only version there has ever been.

The record of how things changed lives in exactly one place: **`docs/notes/`**
(decision rationales, migration history, investigation notes —
`docs/README.md` defines it as material that explains the past). What shipped
and why lives in git history — the commits and the pull request. Those docs
keep their history. **Nothing under `docs/superpowers/` survives the task
that created it** — see "Finishing a plan" below. Everything else in `docs/` —
including `docs/authorization.md`,
`docs/data-model.md`, `docs/api.md` and every `systems/` and `frontend/`
page — is present-tense only.

One standing exception: **`docs/deployment-gcp.md`** deliberately records that
a GCP deployment existed, was removed, and could be rebuilt. Leave it as it is.
`docs/deployment-selfhost.md` used to be a second exception, written in the
future tense because it described something not built yet; the box is running,
so it is present-tense like everything else.

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL, Python 3.13. All backend code lives under the `app/` package (run `uvicorn app.main:app`); services are split into `app/services/{domain,pipelines,integrations,rbac}`. Media routers come from `app/registry.py` + `app/routers/_factory.py`; pipelines from `app/services/pipelines/{runner,specs,tabs}.py`.
- **Config**: pydantic-settings — every env var is read once in `app/config.py` (`settings`); see `.env.example`.
- **Frontend**: React + Vite (SPA); pages call `/api/...` via `api/endpoints.js` + TanStack Query hooks. Tailwind CSS v4 with semantic colour tokens (`bg-surface`, `text-text-muted`, …) that drive light/dark mode — never add hard-coded grey utilities (`src/theme-tokens.test.js` fails the build on them).
- **Auth**: JWT in an HTTP-only cookie; RBAC via `Depends(get_current_admin)` / `get_viewer` in `app/dependencies.py`.
- **Migrations**: Alembic (single head; run on container start).
- **External services**: Tenrai v1 API (MAL metadata), TMDB, OMDb, Comic Vine, Google Sheets (backup/restore). Cover images are local disk under `static/covers/` — there is no object storage.
- **Deployment**: self-hosted. The app runs on a mini PC at home (`homelab`), in **two compose projects**: `cg1618` (checked out at `~/cg1618` from `cg1618-apps/platform`) runs the shared `postgres:17` and `cloudflared` for every application on the box, and `media` (at `~/media`) runs only the app built from `dockerfile`. They meet on the external docker network `cg1618`, where PostgreSQL answers to the alias `db` and the app to `media-app`; the tunnel serves `media.cg1618.com` with **no inbound port open anywhere**, from an ingress generated out of the platform's `apps.yml`. What runs and how it recovers is `docs/deployment-selfhost.md`; deploying and rolling back is `deploy/README.md`; building the box from scratch is `docs/setup-selfhost.md`. **CI deploys nothing**: `.github/workflows/ci.yml` (name `Tests`) runs ruff + shellcheck + pytest + eslint + vitest + the frontend build on **every pull request and nothing else** — a push to any branch, `main` included, runs nothing, which is why the PR is the gate — enforced, not conventional: a repository ruleset makes `test` a required check on `main` and `dev` and requires a branch to be up to date before merging, so a green tick cannot refer to a base that has moved. **A merge to `main` deploys itself, through the platform's pipeline**: `.github/workflows/deploy.yml` is one job that calls `cg1618-apps/platform/.github/workflows/deploy-app.yml@main` with `app: media`, which runs `~/cg1618/bin/deploy media --ci` on a self-hosted runner on the box — dumping the database before it pulls, waiting for `/api/health`, and calling `~/cg1618/bin/rollback media` if it does not answer. **Deploying, health-checking and rolling back are not in this repository.** What is, is `deploy/migrations`, the hook the platform calls to ask this app about its own schema — `current`, `added <from> <to>`, `downgrade <target>`, the last of which refuses any revision declaring `irreversible = True`. The contract is the platform's `docs/registry.md`. A merge that adds an Alembic revision waits for the owner's approval in the `production` environment first. `docker-compose.yml` at the root is **development only** (a bare Postgres); production is `docker-compose.prod.yml`, and it sits beside `.env` at the root because Compose loads `.env` from the compose file's own directory. A GCP Cloud Run + Cloud SQL deployment did work until 2026-09-02; its code was removed on 2026-09-08, so reviving GCP means building it again — the record is `docs/deployment-gcp.md`.

## Development Commands

```bash
docker-compose up -d                # PostgreSQL 17 in a container (both machines)
cd frontend && npm run dev          # Vite dev server on :5173 (hot reload)
cd frontend && npm run build        # writes frontend_dist/ for uvicorn on :8000
uvicorn app.main:app --reload --reload-dir app   # (dev.ps1 does this + vite in one window)
alembic upgrade head
alembic revision --autogenerate -m "describe change"

venv/Scripts/python.exe -m pytest -q             # backend (api tests need media_test DB)
venv/Scripts/ruff.exe check .                    # backend lint
cd frontend && npm run test:run && npm run lint  # frontend tests + ESLint
```

**The backend suite takes ~5.5 minutes**, and that dominates the cost of any
backend change. Three rules follow:

- **Run it before every commit, not at checkpoints.** A scoped run
  (`-k something`) cannot see a test three directories away that your change
  invalidated. Five such failures once accumulated across five task reviews
  that were each clean against their own diff.
- **Never run two pytest processes at once.** Both trees and both suites share
  one PostgreSQL and one `media_test`, so a concurrent run produces
  spurious "relation role does not exist" and unique-constraint failures that
  look like real breakage.
- **When estimating work, quote minutes and include the suite runs.** Any
  backend change has a ~12 minute floor because it needs at least two. Sizing
  the diff ("small — about 15 lines") is not sizing the task.

## Frontend Ports and Rebuilds

- **:5173** — the Vite dev server; source edits show up immediately.
- **:8000** — uvicorn serves the prebuilt bundle in `frontend_dist/`, which only changes when `npm run build` runs.

**After any frontend change, run `cd frontend && npm run build`** so the change works on both ports. Do this before claiming a frontend change is done. If a change appears missing on one port only, suspect a stale build first. `frontend_dist/` is gitignored.

**Build and notify me BEFORE the slow suite, then keep going.** I review changes
in the running app on :8000 while the backend suite runs, so a build that waits
until the end wastes the whole ~5.5 minute window. The order is: write the code
→ fast checks (`npm run build`, `npm run test:run`, `npm run lint`, `ruff`,
~40s) → send me a push notification saying it is viewable → start `pytest` →
carry on with tests, docs and the commit proposal. The notification is a signal,
not a question: **do not pause for my reply.** The fast checks come first
because notifying before anything is verified hands me a page that may not even
compile; 40 seconds buys that.

**If that order does not suit the task, say so and ask.** It is the default,
not a law. A change with no frontend half, a spike whose output is an answer
rather than a page, or work where the backend decides whether the UI is even
right — tell me that building and notifying early would waste the notification,
and ask whether to do it anyway, rather than following the sequence into
something useless.

## Required Environment Variables

See `.env.example` (authoritative) and `docs/setup-local.md`. Three things to know:

- `DATABASE_URL` is honoured **verbatim** when set (`app/config.py`); otherwise the URL is built from `POSTGRES_*` against localhost. A stale `DATABASE_URL` in a machine's `.env` will be used and will break that machine.
- `APP_ENV` (`development` or `production`) names the runtime, and **unset means production** — deliberately, so that forgetting it fails loudly on a dev machine rather than quietly on a public one. It drives the login cookie's `Secure` flag. Both dev machines need `APP_ENV=development` in `.env`.
- The app **refuses to start** while `JWT_SECRET_KEY` or `ADMIN_PASSWORD` still holds the value `.env.example` ships, in every environment. Fill both in before a fresh machine will boot.

## Common Points of Confusion

- Anime Movie (table `anime_movies`, route `/api/anime-movie`) is not the same as an Anime with `airing_type = "Movie"` (table `anime`).
- "Reality" refers to franchises of type `TV` or `Movie`.
- "Group" refers to the grouping tiers collectively: collection, franchise, series.
- The Google Sheets tab for anime movies is named **"Anime Movie"** (singular); every tab name lives in `app/services/pipelines/tabs.py`.
- **"Superuser" means the `super` ROLE.** The everything-short-circuit in
  `Viewer.has()` is `role.is_root`, and it is held by **`admin`**, not by
  `super`. `super` is an ordinary role that holds `manage.catalog` and
  `manage.pipelines` by explicit grant. The flag was called `is_superuser`
  until it was renamed for exactly this reason: it named the wrong role.
  Say "the root flag" for the column and "the super role" for the role.
- Media-type keys: the registry uses underscores (`anime_movie`, `tv_show`) for router files; the data layer uses hyphens (`anime-movie`, `tv-show`, see `app/utils/media_resolver.py`). Use `spec.owner_type` when in doubt.

## Data travels by Google Sheets

The platform's `CLAUDE.md` says code travels by git and each app defines its own
channel for data. This is that channel.

- Admin `/system` → **Backup** writes the local database to the sheet; **Pull
  All** writes the sheet back into the local database.
- **The sheet holds exactly one version of the data.** Backup overwrites every
  tab; Pull All overwrites every table. So back up *from* the machine whose
  database is newer, before touching the other one, and never Pull All over
  unsaved local changes. If both databases moved since the last backup, stop and
  reconcile by hand — there is no merge.
- **Passwords do not travel.** The `Users` tab carries who exists and what role
  they hold, but not the password hash. An account Pull created on this machine
  cannot be logged into until an admin sets a password at `/users`.
- `alembic upgrade head` always runs **before** a Pull: the sheet's columns
  follow the newest schema, and Pull matches columns by header name.

Full procedure, and the per-machine state that is not derivable from the code:
`docs/switching-environments.md`.

## Worktrees here

The doctrine is in the platform's `CLAUDE.md`. What is specific to this
repository:

- **`.\worktree.ps1 -Topic <topic> [-Type feat] [-From dev]`** does the whole
  setup: creates the tree, copies `.env` and `credentials.json`, pins
  `COMPOSE_PROJECT_NAME=media`, builds the venv from the root one, runs
  `npm install`, gives the tree its own `POSTGRES_DB`, runs `alembic upgrade
  head`, and prints the port to run on.
- **`dev.ps1` hard-codes `:8000`** and aborts if it is taken — deliberately, a
  second uvicorn would fail to bind and surface only as Vite proxy errors. A
  tree that has to *run* needs `uvicorn --port 8001` and Vite pointed at it.
- **A fresh database is built by `alembic upgrade head`.** That is only true
  since the chain was squashed onto a baseline; the old initial revision aborted
  its transaction on an empty database and rolled back to zero tables, for 145
  revisions, unnoticed because `tests/api/conftest.py` builds its schema with
  `create_all` and never ran Alembic.
  `tests/api/test_migrations_build_the_schema.py` now runs the real command
  against a scratch database and compares the result to the models.

## Migrations and branches

The generic hazard - two branches creating two heads - is in the platform's
`CLAUDE.md`. This is the Alembic version, with the commands that are true
here and the incidents that produced them.

- **A branch carrying a migration needs `alembic heads` checked before it
  merges — a clean git merge proves nothing about it.** Two migrations that
  never touch the same file still collide, because both name the same
  `down_revision`. Two children of one revision is two heads, and
  `alembic upgrade head` refuses to run with more than one.

  **Nothing warns you.** The files do not overlap, so git merges them cleanly,
  GitHub reports no conflict, and `git merge-tree` says clean. Merging `dev`
  into your branch does not fix it either — the merge has nothing to resolve.
  The collision lives in the revision DAG, which only alembic can see:

  ```bash
  venv/Scripts/python.exe -m alembic heads     # more than one line = broken
  venv/Scripts/python.exe -m alembic history   # and this shows the fork
  ```

  Run it after rebasing or merging `dev` in, whenever your branch adds a
  revision and any other branch has landed since you branched. On 2026-09-12
  #147 landed `g1u2i3d4e5s6` while #145 was open; both claimed
  `b1n2amealign`, and #145 failed CI on
  `test_migrations_build_the_schema.py` — which is the safety net working,
  but only after a merge, a conflict fixed by hand on GitHub, and a full CI
  run had all said the branch was fine.

  **Fix by reparenting, not renumbering**: point `down_revision` at the new
  head. The revision *id* may already be applied to a database, and changing
  it strands that row in `alembic_version`.

  **`alembic heads` does not catch every version of this.** One evening
  produced three, and the command above only sees the first:

  1. **A revision file parented on a stale head** — the case above. `heads`
     catches it.
  2. **A stale `down_revision` written in PROSE** — a spec or plan naming the
     head it was drafted against. `heads` reads revision *files*, so a wrong
     id sitting in a plan is invisible to it, and the two heads appear later,
     when somebody executes the plan as written. Found on 2026-09-12 in an
     image-upload plan that still named `b1n2amealign`. **So when a plan
     names a `down_revision`, re-read it against `alembic heads` at the
     moment you execute it, not when you wrote it.**
  3. **`heads` plus an incremental `upgrade` is not proof the chain builds.**
     Both run against a database that already has the earlier revisions. The
     from-zero proof is `tests/api/test_migrations_build_the_schema.py`,
     which runs the real command against a scratch database and compares the
     result to the models. Say which of the two you actually ran — "I checked
     `heads` and upgraded incrementally" and "the chain builds from zero" are
     different claims, and the weaker one is worth stating honestly rather
     than rounding up.

  Same shape as the stacked-PR rule above: the failure is silent, so the
  cheap habit is to run the check rather than to trust that nothing
  complained.

## Rules specific to this repository

- Write a failing test before a bug fix or a behaviour change; keep
  `pytest`, `ruff`, `vitest` and `eslint` green. CI runs all four **on the
  pull request**.
- **The SPA has two independent permission surfaces.** `App.jsx`'s
  `<ProtectedRoute permission=...>` blocks and `frontend/src/config/navigation.js`,
  which calls `has(...)` directly. Changing what a permission means reaches the
  first and not the second.
