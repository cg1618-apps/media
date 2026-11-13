# Plan — the account lifecycle (P4)

Branch `feat/account-lifecycle`, off `dev`. Design: the account-system
spec, "Settled" → "Identity and recovery", "Sessions", "Account status",
"Self-registration by invite link"; the user-facing side `docs/account.md`;
the pending-registrations row of `docs/viewers.md`. Working scaffolding —
deleted when this lands.

**Implemented after media-fd's P3 role and status pieces land**, and
written from today's code (`dev` at `a38b27d`): every name below was read,
not recalled. Where P3 owns a piece, the plan says so and builds on it.

## Proposed split: two pull requests

The spec says the hardening ships *with* registration, not after it. That
binds the order, not the PR count, so:

- **P4a — accounts that can be recovered and protected.** Status
  (`disabled`), the session counter, the password and username policies,
  `account_code`, reset links and the box CLI, changing your own password,
  rate limiting on login and reset. Needs from P3 only the `shared` role
  (to refuse reset links on shared accounts); everything else stands on
  today's code.
- **P4b — invite links and registration.** Invites, `/register`, `pending`,
  the approval form and reject, rate limiting on register, and seeding the
  two shared accounts if P3 has not. Needs P3's mode **ceiling** — the
  approval form sets one — so it cannot start before P3 lands.

P4a merges first; the registration endpoint therefore never exists
without the policy, the counter and the limiter. **If you would rather one
PR, the plan is unchanged** — it becomes two commits on one branch.

## What already holds and needs only a test and a doc

- **Logins are 30 days flat.** `access_token_expire_minutes = 43200`
  (`app/config.py`), the cookie's `max_age` matches, and nothing reissues
  the login token — `create_access_token`'s docstring already forbids a
  reissue minting a fresh month. A test pins the 30 days and "no refresh".

## Data

### `users` (P4a)

| Column | Type | Notes |
| --- | --- | --- |
| `status` | string, not null, default `active` | `pending` / `active` / `disabled`, CHECK-constrained. **If P3 adds it, P4 uses P3's column** — see question 1 |
| `session_version` | integer, not null, default 0 | the revocation counter; never travels on Sheets |

Index **`uq_users_username_lower`** — `UNIQUE (lower(username))`. Checked
against the company database: 2 accounts, 2 distinct lowercased names,
none outside `[a-z0-9_-]{3,32}`. The migration still asserts it and aborts
with the offending names rather than failing on the index.

### `account_code` (P4a; invites used in P4b)

| Column | Type | Notes |
| --- | --- | --- |
| `system_id` | uuid pk | |
| `purpose` | string | `invite` / `reset`, CHECK |
| `code_hash` | string, unique | **SHA-256** hex of the code. The code is 32 random bytes (`secrets.token_urlsafe(32)`) — high-entropy, so a fast hash is the standard choice and lets the row be found by hash; bcrypt is for low-entropy passwords |
| `user_id` | uuid → `users.id`, `CASCADE`, nullable | reset: the target. invite: null until spent, then the account it created, `SET NULL` on that account's deletion so a rejected invite stays spent |
| `created_by_id` | uuid → `users.id`, `SET NULL`, nullable | null from the CLI |
| `created_at`, `expires_at`, `spent_at` | datetime | `expires_at = created_at + 24 h` |

CHECK: a reset row has a `user_id`. A new reset link **deletes** the
target's unspent reset rows in the same transaction ("a newer link stops
an older one working"). Spent and expired rows are kept — a spent invite
must stay spent — and are tiny.

**Spending** is one function, `spend_code(db, code, purpose)`, in
`app/services/domain/account_codes.py`: `SELECT … FOR UPDATE` on the row by
hash, refuse when missing, wrong purpose, expired or spent, set
`spent_at`. The caller's work happens in the same transaction, so a failed
password or username rolls the spend back. One generic error for every
refusal: `"This link is not valid. Ask the admin for a new one."`

## Rules

### Username policy — `validate_new_username(name)`

`app/services/security.py` beside the password helpers:
`^[a-z0-9_-]{3,32}$`; refuse if `"admin"` or `"guest"` is a substring of
the lowercased name; uniqueness via the lower-index. Applied to every
**new** name: `/users` create, `/users` rename, register. **Not** to
existing rows, so the `admin` account keeps its name. Login lowercases the
submitted username before the lookup — every stored name is lowercase.

### Password policy — `validate_new_password(password)`

Minimum length `PASSWORD_MIN_LENGTH` (question 2 — default **8**), and
**refuse past 72 UTF-8 bytes** with a 422 that says so. Applied to
register, reset, self-change, `/users` create and `/users` set-password.
`get_password_hash` stops truncating (it is now only ever handed a valid
password); **`verify_password` keeps the `[:72]` slice**, because bcrypt
5 raises on longer input and an existing account may have been set with a
longer password before the policy.

### Status and the session counter

- The login token carries **`sv`** = `users.session_version` at minting.
  `resolve_viewer` resolves to the guest unless the user is `active` **and**
  the token's `sv` equals the column — a token with no `sv` (every one
  minted before this) reads as 0, which is every account's starting value,
  so nobody is signed out by the deploy.
- **Increments**: a reset spent, disabling, and **the admin setting a
  password on `/users`** — the spec's "revoking sessions on an admin
  reset", which matters most for a leaked shared login. Not a self-change,
  not logout. Every increment goes through one function,
  `revoke_sessions(user)`, and the admin-set case is one constant,
  `ADMIN_SET_PASSWORD_REVOKES_SESSIONS = True`, beside it — the owner has
  not answered yet, so the PR says this is provisional.
- **Login**: a wrong password is the ordinary generic 401 whatever the
  status. After a correct one: `pending` → 403 `"Your account is waiting
  for the admin's approval."`; `disabled` → 403 `"This account is
  disabled."` No token in either case.
- **`/users`**: `PATCH` takes `status` `active` / `disabled` (whether a
  shared account may be disabled is question 3), and increments the
  counter on disable. A pending account is not edited here; it goes through approval.
  The admin cannot disable itself (409), as it cannot delete itself.

### Reset links (P4a)

- `POST /api/users/{id}/reset-link` (`admin.authz`) — `active`, non-shared
  accounts only (409 otherwise). Returns `{link, expires_at}` once; the
  code is not stored.
- `GET /api/auth/reset?code=` — `{username}` without spending, or the
  generic 404.
- `POST /api/auth/reset` `{code, password}` — spends, sets the password,
  increments `session_version`, in one transaction; clears the caller's
  login cookie. Returns `{username}` so the SPA can pre-fill sign-in.
- **CLI** — `app/cli.py`, `python -m app.cli reset-link <username>`
  (argparse, one subcommand). Same service call, `created_by_id` null;
  prints the link and expiry. Exit 1 with a message for an unknown or
  non-active account. Documented in `docs/authentication.md` with the
  spec's exact `docker compose exec media-app …` line.
- **The link's base URL**: new setting `public_base_url`
  (`PUBLIC_BASE_URL`), default `https://media.cg1618.com`, so production
  needs no new variable; `.env.example` documents it and the dev machines
  set `http://localhost:5173`. Used by both the route and the CLI, which
  has no request to read a host from.

### Changing your own password (P4a)

- `PUT /api/account/password` `{current_password, new_password}` on the
  existing `app/routers/account.py`. Wrong current → **400**
  `"Your current password is not right."`, not 401, which the SPA reads
  as a lost session. Does not touch `session_version`.
- Gate: a new permission **`self.password`**, held by `user` and `super`.
  `self.*` again excludes root admin and guest by construction; P3's
  `shared` role does not get it — the same seam as `self.requests`.

### Rate limiting (P4a login and reset, P4b register)

- **`app/services/rate_limit.py`** — an in-process fixed-window counter
  keyed by string, behind `check(key, limit, window)` / `hit(key)` /
  `reset(key)`. In-process is enough: the box runs one uvicorn process
  (`entrypoint.sh` has no `--workers`), and uvicorn runs with
  `--proxy-headers`, so `request.client.host` is the visitor, not the
  tunnel. No library: slowapi keys per route, and login needs a
  per-username key as well; the counter is ~40 lines. The docstring says
  that a second worker process would need a shared store.
- **Limits** (question 4), 429 with `Retry-After`:
  - login: 5 **failed** attempts per username per 15 min, and 20 failed per
    IP per 15 min; a success clears the username's count;
  - reset and register, GET and POST: 10 per IP per 15 min.
- Tests reset the limiter in an autouse fixture.

### Invites, registration and approval (P4b)

- `POST /api/users/invites` (`admin.authz`) → `{link, expires_at}` once.
- `GET /api/auth/register?code=` → `{valid: true}` or the generic 404.
- `POST /api/auth/register` `{code, username, password}` — spends, creates
  the account `pending` with no role grant beyond `user` and **no modes**,
  in one transaction. Username and password refusals are 422 and roll the
  spend back, so a typo does not burn the link.
- `GET /api/users?status=pending` on the existing list route.
- `POST /api/users/{id}/approve` `{role_id, ceiling_mode, default_mode}` —
  `role` is `user` or `super` (default `user`); ceiling and default from
  `safe` / `normal` / `borderline` (default `normal` / `normal`), never
  `unrestricted`; sets `active`, the role's request limit (P6's
  `default_request_limit`) — by calling P3e's
  `set_mode_ceiling(db, user, ceiling_key, default_key)` in
  `app/services/rbac/modes.py`, which raises `ValueError` when default >
  ceiling (→ 422). Not reimplemented here.
- `POST /api/users/{id}/reject` — deletes a `pending` account only (409
  otherwise), logs one line with the username; the invite row stays spent.
- **Sheets**: Backup skips `pending` accounts; `account_code` has no tab.
  `status` travels for `active` / `disabled` (question 5).
- **Seeding** `shared-normal` and `shared-borderline` — **if P3 has not
  already**: role `shared`, their fixed mode, request limit 10, the
  unusable password hash (`UNUSABLE_PASSWORD_HASH`), so no credential is in
  code and the admin sets their passwords on `/users`. In
  `app/services/rbac/seed.py`, idempotent like the rest.

## Frontend

P4a:
- **Login** — "Forgot your password or username?" toggles a short note
  (ask the admin for a reset link); no form, no link to `/reset`. The two
  403 messages shown as they come. `?username=` pre-fills.
- **`/reset`** — `pages/public/ResetPassword.jsx`, in no menu. Generic
  message without a valid code; otherwise "Setting a new password for
  <username>", the password twice, save → `/login?username=`.
- **Settings → Password** card, when `has("self.password")`: current, new,
  new again.
- **`/users`** — per row, **Reset link** (active, non-shared) opening a
  modal with the link, a copy button and the expiry, shown once; **Disable /
  Enable**; a status column.

P4b:
- **`/register`** — `pages/public/Register.jsx`, in no menu: generic
  message without a valid code, else username and password twice, with the
  rules stated; on success, "waiting for the admin's approval".
- **`/users`** — **Invite link** button, same once-shown modal.
- **Pending registrations** panel on `/system` (`admin.authz`): each
  pending account with the approval form (role, ceiling, default) and
  Decline with `ConfirmModal`.

All from existing components: the modals and the `/users` and `/system`
card layouts; copying uses `navigator.clipboard` unless an existing helper
turns up when this is built. The once-shown
link modal and the approval form are the nearest to new layout — say if
the owner wants to design them.

## Tests (failing first)

- **Policies**: each username rule both ways, including the spec's
  examples (`admin1`, `qadminqe` refused; `adamin`, `adm1in` allowed;
  `gUesT` refused); `Kai` vs `kai` clash; min length; 73-byte password
  refused with a multi-byte example; an existing 80-byte-password account
  still logs in.
- **Revocation — refusals that bite**: a token minted, then a reset spent →
  that token resolves as guest (mirror: an unrelated account's token still
  works); disable → same; a self-change → the old token still works; a
  token with no `sv` claim still works at version 0 and stops working at 1;
  an admin set-password on `/users` → the old token resolves as guest.
- **Codes**: expired, spent, wrong purpose, unknown → one message;
  newer reset voids the older; a register with a bad username leaves the
  code unspent; a rejected account's invite stays spent.
- **Login**: pending / disabled with the right password → 403 and no
  cookie; with a wrong one → the generic 401 (so status leaks only after the
  password).
- **Rate limits**: the sixth failed login for one username is 429 while a
  different username from another IP is not; a success resets.
- **CLI**: `reset-link` prints a link whose code spends on `/reset`.
- **Approval**: `unrestricted` refused on the form; role other than
  user/super refused; defaults applied.
- 30-day flat login pinned.

Vitest: Login (forgot note, 403 messages, pre-fill), ResetPassword,
Register, Settings password card, Users row actions, the pending panel.

## Migrations

P4a: `a1c2codes345` — `users.status`, `users.session_version`, the
lower-unique index (with the pre-check), `account_code`, the
`self.password` grant to `user` / `super`. P4b adds none unless P3 has not
given `status` a `pending` value. **Parents taken from `alembic heads` at
the moment each is written**; media-db, media-fd and P6 all add revisions,
so reparent, never renumber.

## Docs, in the same commit as the behaviour

- `docs/account.md` loses each "not available yet" as its piece lands.
- `docs/authentication.md` — the technical side: token claims including
  `sv`, status, codes and their hashing, the limiter and its single-process
  assumption, the CLI.
- `docs/viewers.md` — the pending-registrations row (P4b).
- `docs/api.md`, `docs/data-model.md`, `docs/authorization.md`
  (`self.password`), `.env.example`, `docs/setup-local.md` for
  `PUBLIC_BASE_URL`.
- `docs/to-do-next.md` item 2's sentence "sessions are a flat 30 days with
  no revocation and there is no password reset" goes when P4a lands.

## Decided (media-00, 2026-11-13)

- **Two PRs**, P4a first; P4b waits for P3's ceiling. P4a starts once
  P6's backend is in review, in parallel with P3 — media-fd is told which
  functions P4a changes before it starts; whoever lands second rebases.
- **P4 owns `users.status`** — it is lifecycle; P3 does not add it.
- Built to these defaults, owner's answers pending: minimum password
  length 8, no composition rules; shared accounts may be disabled; the
  rate limits above; `disabled` travels on the Users tab; an admin
  set-password revokes sessions (above). Modals and the approval form from
  existing components.

## Questions as asked

1. **For media-fd:** does P3 add `users.status`, or is it P4's? "after
   media-fd's role/status pieces land" reads as P3's. I build on whichever
   column exists and add it only if none does.
2. **Owner:** the password minimum length. The spec says "a minimum
   length". Recommend **8** (NIST's floor for user-chosen passwords), with
   no composition rules.
3. **Owner:** may a shared account be disabled? The spec says the admin
   cannot delete them; disabling is reversible. Recommend **yes**.
4. **Owner:** the rate limits above — 5 failed logins per username and 20
   per IP per 15 min; 10 per IP per 15 min on register and reset.
5. **Owner:** does `disabled` travel on the Sheets Users tab? Recommend
   **yes** — otherwise a disabled account comes back active on the other
   machine after a Pull.
6. **For you:** two PRs (P4a, P4b) or one?
