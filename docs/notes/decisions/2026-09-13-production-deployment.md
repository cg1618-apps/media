# Production: what the app's half of the box looks like, and why

What runs is `deployment-selfhost.md`; deploying and rolling back is
`deploy/README.md`. The shared PostgreSQL, the tunnel and the deploy scripts
are the platform's.

- **The box builds its own image** from a git checkout. Rejected: `docker save
  | ssh docker load`, which pushes about 1 GB per deploy over the box's worst
  link and leaves it unable to rebuild itself. Deferred: building in CI and
  pulling from GHCR — the conventional answer, but every pull request would
  build a multi-stage image for a box one person deploys. Three constraints
  keep that switch small: no environment-specific values in the image, no
  build args, and an explicit `image:` name beside `build:`.
- **`docker-compose.prod.yml` sits at the repository root.** Compose takes its
  project directory from the compose file's location and loads `.env` from
  there; under `deploy/` every `${...}` interpolated to an empty string and
  the database came up with a blank password while `env_file:` kept working
  and the app looked fine. `tests/unit/test_prod_compose.py` fails if it
  moves.
- **Data reaches production by `pg_dump`, never through the Sheets
  pipeline.** Sheets moves data between the two development machines and is
  lossy where that is safe — it re-resolves database-local ids and skips the
  authorization tabs without `admin.authz`. And the sheet holds exactly one
  version of the data, so a third participant would turn a two-way handover
  into a three-way sync with no merge.
- **Production has its own sheet and never reads the development one.**
  Backup overwrites every tab, so a production that knew the development
  sheet's id could destroy the development backup. The spreadsheet *name* is
  cosmetic (`open_by_key` is the only way one is opened); the tab names are
  not.
- **Migrations run in `entrypoint.sh` on every start.** Rejected: taking them
  out into a separate deploy step — the textbook separation, but it makes
  every deploy two commands with a window where code and schema disagree.
  `entrypoint.sh` runs a command when given one (`exec "$@"`), so
  `docker compose run app alembic downgrade <target>` does not silently
  re-run the upgrade.
- **The healthcheck probes `/api/health`, never `/`.** The catch-all route
  serves the SPA for any path and so returns 200 with the database down; a
  healthcheck that lies is worse than none. `/api/health` opens a session,
  reads `alembic_version` and compares it with the head the running code
  expects, so it also fails when schema and image disagree — the state a
  half-rolled-back deploy leaves. The public body is a bare status; the
  revisions are gated on `manage.pipelines`, because the tunnel routes every
  path to the app and there is no internal path.
- **`restart: unless-stopped`**, not `always`, so a deliberate
  `docker compose stop` survives a daemon restart.
- **`COMPOSE_PROJECT_NAME=media`, and no `container_name:` anywhere.** The
  project name decides the volume and so which database the stack sees; a
  checkout cloned under another name would otherwise come up on an empty
  volume. Container names derive from it, so a name is written in one place.
