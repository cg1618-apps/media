#!/usr/bin/env bash
# Deploy the current branch to this box, reversibly.
#
# The dump is the point of this script. entrypoint.sh runs `alembic upgrade
# head` on every start, so by the time a bad migration is visible it has
# already run - and `alembic downgrade` is not a restore: reversing a dropped
# column recreates it empty. Dumping before the pull is what makes a migration
# reversible at all.
#
# Rollback is in deploy/README.md, and it is three steps rather than two: the
# code has to be reverted along with the data, or the next start re-applies the
# migration that caused the problem. That is why the revision is recorded
# beside each dump.

set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml)

# PostgreSQL belongs to the platform's compose project (cg1618-apps/platform),
# so every database call reaches it through THAT file rather than this one. Two
# variables, not one: `up`, `ps` and `run app` still mean this repository's
# project, and conflating them would deploy the shared stack from here.
PLATFORM_DIR="${PLATFORM_DIR:-${HOME}/cg1618}"
DB_COMPOSE=(docker compose -f "${PLATFORM_DIR}/docker-compose.prod.yml")
BACKUP_DIR="${HOME}/backups"
KEEP=5

# --ci: invoked by .github/workflows/deploy.yml on the self-hosted runner.
# Non-interactive, and guarded in ways a person standing at the keyboard does
# not need because they can see what branch they are on.
CI_MODE=0
if [ "${1:-}" = "--ci" ]; then
    CI_MODE=1
fi

if [ ! -f .env ]; then
    echo "No .env in $(pwd). See deploy/README.md for the template." >&2
    exit 1
fi

if [ "${CI_MODE}" -eq 1 ]; then
    # This checkout IS the deploy target, and deploy.sh pulls whatever branch is
    # checked out rather than naming one - so the branch here is the whole of
    # the decision about what production runs. A --ci run against a feature
    # branch would dump production, pull that branch and build it: a deploy of
    # unreviewed code that nothing in GitHub would show as a deploy.
    git fetch origin main --quiet

    branch="$(git rev-parse --abbrev-ref HEAD)"
    if [ "${branch}" != "main" ]; then
        # A detached HEAD at a commit main already contains is the state
        # rollback.sh leaves behind: it checks out the revision the dump belongs
        # to, which is by definition an ancestor of main. Refusing that outright
        # means ONE rollback disables automatic deploys permanently, silently,
        # until a person notices - observed on the box, where the deploy after a
        # successful rollback died on "On 'HEAD', not main".
        #
        # Returning to main is the whole recovery, and this deploy was about to
        # pull main anyway.
        #
        # Everything else still refuses. A feature branch, or a detached HEAD
        # main does not contain, is a checkout nobody should be deploying from.
        if [ "${branch}" = "HEAD" ] && git merge-base --is-ancestor HEAD origin/main; then
            echo "Detached at $(git rev-parse --short HEAD), which main contains -"
            echo "the state a rollback leaves behind. Returning to main."
            git checkout --quiet main
        else
            echo "On '${branch}', not main. Refusing to deploy." >&2
            exit 1
        fi
    fi

    # The workflow classifies the deploy from one push range. If the runner was
    # offline across two merges, that range misses the earlier one - so re-check
    # against this box's own HEAD, which is the only revision that is actually
    # true about this machine. A migration reaching production unapproved is the
    # one failure this pipeline must not have.
    incoming="$(git diff --name-only HEAD origin/main -- alembic/versions/)"
    if [ -n "${incoming}" ] && [ "${MIGRATION_APPROVED:-0}" != "1" ]; then
        echo "Incoming commits add Alembic revisions:" >&2
        echo "${incoming}" >&2
        echo "This deploy was not approved as a migration deploy. Refusing." >&2
        exit 1
    fi
fi

mkdir -p "${BACKUP_DIR}"

set -a
# shellcheck disable=SC1091  # runtime file; not present at lint time
. ./.env
set +a

stamp="$(date +%Y%m%d-%H%M%S)"
dump="${BACKUP_DIR}/pre-deploy-${stamp}.dump"

echo "==> Dumping to ${dump}"
"${DB_COMPOSE[@]}" exec -T db \
    pg_dump -U "${POSTGRES_USER}" -Fc -d "${POSTGRES_DB}" > "${dump}"

# A truncated or empty dump is worse than none, because it looks like a
# rollback option right up until it is needed.
if [ ! -s "${dump}" ]; then
    echo "Dump is empty. Refusing to deploy." >&2
    rm -f "${dump}"
    exit 1
fi

# The revision this dump belongs to. Rolling back means checking this out
# before restoring, so it travels with the dump rather than in someone's head.
git rev-parse HEAD > "${dump}.revision"
echo "    dump belongs to $(cat "${dump}.revision")"

# The ALEMBIC revision this dump belongs to, which is what rollback.sh passes to
# `alembic downgrade`. Recorded here, from the database, rather than derived
# later: a git sha is not a revision id and the two share no namespace, and
# asking an image for its head answers what that image KNOWS rather than what
# the schema WAS - which diverge exactly when a rollback is happening.
"${DB_COMPOSE[@]}" exec -T db \
    psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tA \
    -c "SELECT version_num FROM alembic_version" \
    | tr -d '[:space:]' > "${dump}.alembic"

# Same reasoning as the empty-dump guard above: a missing downgrade target looks
# like a rollback option right up until tier 2 needs it.
if [ ! -s "${dump}.alembic" ]; then
    echo "Could not read alembic_version. Refusing to deploy." >&2
    rm -f "${dump}" "${dump}.revision" "${dump}.alembic"
    exit 1
fi
echo "    schema was at $(cat "${dump}.alembic")"

echo "==> Tagging the outgoing image as media-app:previous"
if docker image inspect media-app:local >/dev/null 2>&1; then
    docker tag media-app:local media-app:previous
else
    echo "    no current image - first deploy"
fi

echo "==> Pulling"
git pull --ff-only

echo "==> Building and starting"
"${COMPOSE[@]}" up -d --build

echo "==> Pruning dumps, keeping ${KEEP}"
# shellcheck disable=SC2012
ls -1t "${BACKUP_DIR}"/pre-deploy-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) \
    | while read -r old; do rm -f "${old}" "${old}.revision" "${old}.alembic"; done

"${COMPOSE[@]}" ps

echo "==> Waiting for health"
if ! ./deploy/health.sh 180; then
    echo "Deploy is unhealthy." >&2
    echo "Recover with ./deploy/rollback.sh - see deploy/README.md." >&2
    # Exit 2, not 1, and the distinction is load-bearing: the workflow reads it
    # to tell "the deploy ran and the result is unhealthy" - where the database
    # may have been migrated and rollback.sh must run - from "the script refused
    # to start", where nothing was touched and rolling back would be wrong.
    exit 2
fi

echo
echo "==> Done and healthy."
