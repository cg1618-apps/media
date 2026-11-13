# To do next

Last verified: 2026-11-13

**Decided work that is not built yet, in the order it is to be built.** An
item here has been settled with the owner — what to build is known — but
nobody has started it. Unmade decisions and known defects are
[open-items.md](open-items.md) instead.

Like that page, there is **no status column, no claiming and no
lifecycle**. Work starts by cutting a branch, and an item is closed by
deleting it in the same change that builds it; the commit and the pull
request are the record. If the order changes, the list is reordered.

Each item is a short statement and a pointer. The detail lives in the
design it points at — under `superpowers/specs/` while it is being built —
and the present-tense pages take over once it ships.

## 1. Account and authorization rework

Users, roles, access modes, content labels and authentication together,
including what becomes personal: highlights, personal fields on catalogue rows, mixed sections, granted
features, and the personal half of the notes rework — the amount
collected, the NG reset button, 下周目目標 — whose design is
[superpowers/specs/2026-11-12-notes-rework-design.md](superpowers/specs/2026-11-12-notes-rework-design.md).
**The design is complete.**
What each viewer sees is [viewers.md](viewers.md).

Design: [superpowers/specs/2026-11-03-account-system-design.md](superpowers/specs/2026-11-03-account-system-design.md).

### How the rest is built

**The goal is to finish all of it, in parallel, without lowering quality.**
The work is split into branches so that several sessions can build at once
and each pull request carries exactly one feature. It is not split to
change what gets built.

**One branch per feature. A branch merges into `dev` only when the whole
feature is finished.** Until then its pull request stays a **draft**, which
keeps CI running on every push and holds the handover. A draft is marked
ready only when every part of the feature is built, its docs are written
and CI is green.

The remaining branches, in the order they reach `dev`. Where a branch's
pull request is already open, its body says exactly where the work stopped
and what comes next, so read that before anything else.

| Branch | Feature | Plan | Waits for |
| --- | --- | --- | --- |
| `feat/labels-in-code` (#353) | P3b1–P3d: labels and modes in code, the `nsfw` rule, labels on collections and series, label ↔ 標籤 Label tag | the PR body; spec "Content labels" | nothing |
| `feat/five-fixed-roles` | P3f: exactly five fixed roles, and the shared accounts | [plans/2026-11-13-five-fixed-roles.md](superpowers/plans/2026-11-13-five-fixed-roles.md) | nothing |
| `feat/role-and-account-switches` | P3g: per-role and per-account switches | [plans/2026-11-13-role-and-account-switches.md](superpowers/plans/2026-11-13-role-and-account-switches.md) | P3f, for the `shared` role |
| `feat/admin-not-root` | P3h: admin stops being root | [plans/2026-11-13-admin-not-root.md](superpowers/plans/2026-11-13-admin-not-root.md) | P3g, because every permission and switch it relies on has to exist |
| `feat/invites-and-registration` | P4b: invite links and registration | [plans/2026-11-13-account-lifecycle.md](superpowers/plans/2026-11-13-account-lifecycle.md), "P4b" | P3f, which creates the shared accounts P4b would otherwise create too |
| `feat/personal-data` (#354) | P5: the personal data, Parts A → C → D → E → B | the PR body, and `docs/superpowers/plans/2026-11-13-personal-data.md` on the branch | Part B only: P3g's switch columns |
| not cut yet | The rest of `view.extras` and the per-viewer pages (P7) | **needs a plan first**: role-and-account-switches plan, "Settled in review" item 2 | P3g |

P3a (#350), P3e (#351), P4a (#352) and P6, requests and reports (#349),
are on `dev`.

**Waiting does not have to mean idle. A branch can merge another branch,
not only `dev`.** When a branch needs code from one that is not on `dev`
yet, it merges that branch in and carries on: P4b can merge
`feat/five-fixed-roles` once its shared accounts are committed, and P5 can
merge `feat/role-and-account-switches` to build Part B. Three rules keep
this from mixing features:

- **The pull request's base stays `dev`.** Never retarget it at the other
  branch, because that is a stacked PR, and the platform `CLAUDE.md` says
  how those fail silently.
- **The branch that merged another one merges into `dev` strictly after
  that one.** Merging it first would land the other feature unreviewed,
  inside the wrong pull request. Keeping it a draft enforces this.
- **Once the other branch lands, merge `dev` in again,** so the pull
  request's diff shows only its own feature. If the other branch changed
  after it was merged in, merge it again before relying on it.

Merge sideways only when there is genuinely nothing else to do on the
branch. While a branch has its own parts left, it builds those and waits
for `dev`.

**Shared files to coordinate.** Whoever edits one of these first tells the
manager, and the manager tells the others:

- `app/services/domain/search.py`: P3c (#353) adds the collection and
  series label filter, and P3g changes the entity buckets.
- `MODE_ORDER` / `mode_rank`: `dev` carries a stand-in from P3e. #353
  replaces it with the real one in `app/services/rbac/seed_modes.py` and
  updates its callers. Nobody defines a second order.
- `installation_owner_id` in `app/services/domain/user_list.py`: P3h
  changes it, and P5's old-backup Pull (`pull.py`) calls it. Check both
  callers when either one lands.

**Every one of these branches adds an Alembic revision.** Whenever any of
them lands, every other open branch merges `dev` in, runs `alembic heads`
and reparents its first revision onto the new head: `down_revision` and
`Revises:` only, never the id. Before a branch is marked ready, run
`tests/api/test_migrations_build_the_schema.py`. See this repository's
`CLAUDE.md`, "Migrations and branches".

**Sessions: one manager and four builders.**

- **Manager.** Started in the platform repository, and does no feature
  work. It merges each draft into `dev` once it is ready and CI is green.
  When `dev` moves, it tells every builder to merge `dev` in and reparent.
  It relays the shared-file handoffs above. It drafts the release pull
  request into `main` and shows it to the owner, and the owner merges it.
  Every branch here adds a migration, so **that release takes the gated
  lane** and waits for the owner's approval in `production` after the
  merge.
- **Builder 1:** `feat/labels-in-code` until it is merged.
- **Builder 2:** `feat/personal-data` until it is merged.
- **Builder 3:** P3f → P3g → P3h, one branch at a time. Cut each one off
  `dev` once the previous one has merged.
- **Builder 4:** P4b, starting once P3f has merged, or once its shared
  accounts are committed, by merging `feat/five-fixed-roles` in. After
  P4b, it writes the plan for the remaining `view.extras` and the
  per-viewer pages, and builds it once P3g is on `dev`.

More than four builders mostly queue: every tree on the machine shares one
PostgreSQL and the machine-wide pytest lock. Each builder runs only the
tests its change touches, and CI runs the full suite.

**Starting each builder on a machine.** Each builder works in a worktree of
its own. For a new branch, `.\worktree.ps1 -Topic <topic>` cuts it off
`dev` and does the whole setup. For a branch that already exists on
`origin` (#353, #354), the helper cannot create it, so run
`git worktree add ../media_<topic> <branch>` and do the setup the helper
would have done, by hand. The platform `CLAUDE.md`, "Concurrent Claude
Code Sessions", lists it. A worktree starts with its own empty database,
built by `alembic upgrade head`.
