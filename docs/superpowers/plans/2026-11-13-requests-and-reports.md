# Plan — requests and reports (P6)

Branch `feat/requests-and-reports`, off `dev`. Design: `docs/viewers.md`,
"Requests and reports" and "My requests, the inbox, and pending
registrations"; limits from the account-system spec, "Fixed and adjustable
settings" → "Per account". Working scaffolding — deleted when this lands.

Built against **today's** roles (`admin` is root, `super`, `user`, `guest`;
no `shared`), behind two named permissions, so P3 changes grants and locks
and nothing in this feature's routes or pages. See "The seam" at the end.

## The two gates

Both are new permissions in `app/services/rbac/permissions.py`, bound once
as dependencies in `resolver.py` beside the others, and asked by the SPA
with `has(...)` — one name per capability, so grepping finds every use.

| Permission | Means | Today held by | Why this family |
| --- | --- | --- | --- |
| `self.requests` | file a request, read and edit your own | `user`, `super` | `self.*` is "rows of your own", and `Viewer.has()` already refuses the whole family to the root role and the guest lock table locks it off — so admin and guest are excluded by construction, which is exactly the spec's "not guests, not the admin" |
| `manage.requests` | the inbox: read every request, mark done/declined with a remark, delete | `super` (locked on, as every non-authz permission is), `admin` via root | a handler capability, like `manage.catalog` |

`require_file_requests = require_permission(PERM_SELF_REQUESTS)` and
`require_handle_requests = require_permission(PERM_MANAGE_REQUESTS)` are
the only two gates any route in this feature uses.

Locks (`locked_permissions`): `self.requests` locked **on** for `user`
(the spec makes it fixed per role); `manage.requests` locked **off** for
`user` and `guest` (guest's whole `manage.*` already is). `super` needs no
edit — locked-on is "everything but `admin.authz`".

Seed: `default_user_permissions()` gains `self.requests` (so `super`
inherits it); `default_super_permissions()` gains `manage.requests`.
Migration grants both to the existing `user` / `super` role rows, the way
`v1i2ewperms34` granted the view family.

## Data

New table **`user_request`** (model `UserRequest`, `app/models/user_request.py`).
Not `request`: `fastapi.Request` is imported across the routers.

| Column | Type | Notes |
| --- | --- | --- |
| `system_id` | uuid pk | house convention |
| `author_id` | uuid → `users.id`, **`ON DELETE SET NULL`**, nullable | a deleted account's requests stay in the inbox as "deleted account" — nothing is removed automatically |
| `kind` | string | `new_entry` / `data_error` / `incomplete_data` / `bug` / `other`; a Python constant in `app/utils/constants.py`, served by `/api/constants`, CHECK-constrained |
| `target_type` | string, nullable | an `OWNER_TYPE_KEYS` value (12 media types + 3 tiers) or an entity key `studio` / `publisher` / `person` / `character` / `identity` |
| `target_id` | uuid, nullable | FK-less, the `(type, id)` convention `quote` / `meme` use; CHECK both-or-neither with `target_type` |
| `target_label` | string, nullable | the target's name **resolved server-side at filing**, so a request whose entry was later deleted still says what it was about |
| `page_path` | string, nullable | the page address — the SPA path a request was filed from, and the bug report's "page address" |
| `description` | text, not null | the filer's |
| `remark` | text, nullable | the filer's optional remark |
| `status` | string, default `open` | `open` / `done` / `declined`, CHECK-constrained |
| `response` | text, nullable | the handler's remark when marking done or declined |
| `handled_by_id` | uuid → `users.id`, `SET NULL`, nullable | |
| `handled_at`, `created_at`, `updated_at` | datetime | `get_taipei_now`, as everywhere |

Indexes: `(author_id, status)` for the limit count and My requests;
`(status, created_at)` for the inbox.

**`users.open_request_limit`** — integer, nullable; NULL is "no limit".
Backfill: accounts in the `user` role get 15; everyone else NULL. A new
account takes its role's default (`user` 15, `super` NULL) on `/users`
create; P4's approval form will use the same `default_request_limit(role)`
helper.

Target resolution: `app/utils/media_resolver.py` gains an `ENTITY_TABLES`
map (the five entity models, with their `nav_path`), and a
`REQUEST_TARGET_TABLES = {**OWNER_TABLES, **ENTITY_TABLES}` that only this
feature uses — so `meme` and `quote` stay on the maps they have. A target
that does not exist is 422; **visibility is not checked** ("requesting
something the filer's mode hides is allowed").

## Rules (the service, `app/services/domain/requests.py`)

- **Filing** counts the author's `open` rows; at or over a non-NULL limit →
  **409** naming the limit. Only open requests count, so a handled one frees
  a slot.
- **Editing** by the author: `description` and `remark` only, and only while
  `open` → otherwise **409**. Another account's request is **404** (writes
  follow reads). There is no author delete route.
- **Handling**: status to `done` or `declined` with an optional `response`,
  or back to `open` (a mistaken close; editing reopens with it). Records
  `handled_by_id` / `handled_at`.
- **Deleting**: inbox only, hard delete, 204.
- Every write logs one line (`logger.info`) with id, kind and actor — the
  record of a deletion.

## Routes — `app/routers/requests.py`, prefix `/api/requests`

| Method + path | Gate | Does |
| --- | --- | --- |
| `GET /api/requests/mine` | `self.requests` | the caller's own, newest first; `?status=` |
| `POST /api/requests` | `self.requests` | file; 201; 409 over the limit; 422 on a bad kind or target |
| `PATCH /api/requests/{id}` | `self.requests` | edit own open one |
| `GET /api/requests` | `manage.requests` | the inbox; `?status=open` (default) / `done` / `declined` / `all` |
| `GET /api/requests/summary` | `manage.requests` | `{open: n}` — for the dashboard summary when that page is built |
| `PUT /api/requests/{id}/status` | `manage.requests` | `{status, response}` |
| `DELETE /api/requests/{id}` | `manage.requests` | 204 |

Responses carry `author_username` (null → "deleted account"),
`handled_by_username`, the resolved target (`type`, `id`, `label`,
`nav_path`, `missing`), and `can_edit` on My requests.

`/users`: `ManagedUserResponse` / `ManagedUserUpdate` gain
`open_request_limit` (int ≥ 0, or null).

## Frontend

- `api/endpoints.js` + TanStack hooks `useMyRequests`, `useRequestInbox`,
  and mutations in `api/mutations/useRequestMutations.js`.
- **`RequestModal`** (`components/modals/`) — kind, description, remark, and
  the target shown read-only when it came from a page; the general form
  offers a page-address field for a bug. Used for filing and for editing.
- **My requests** — `/requests`, `pages/public/MyRequests.jsx`,
  `<ProtectedRoute permission="self.requests">`. A table: kind, target
  (linked), description, remark, status, response; Edit on open rows; a New
  request button.
- **Request inbox** — `/request-inbox`, `pages/admin/RequestInbox.jsx`,
  `permission="manage.requests"`. Status filter opening on Open; per row
  Done / Decline (a remark modal) and Delete (`ConfirmModal`).
- **Header**: a Requests link beside Log out, desktop and drawer, when
  `has("self.requests")`. **Inbox** in the Pipelines tab,
  `requires: "manage.requests"`.
- **Report a problem** on entry, collection / franchise / series and entity
  detail pages, when `has("self.requests")` — opens `RequestModal` with the
  target and `page_path` filled and kind `data_error`.
- `/users`: an "Open request limit" field on the edit form.

Existing components only — the table, filter pills, modals and
`ConfirmModal` patterns already on `/data-history`, `/review-queue` and
`/users`. **Placement of "Report a problem" on the detail pages is the one
open design question** — see below.

## Tests (failing first)

`tests/api/test_requests.py`:

- user files, reads own, edits own open one; super likewise.
- **Refusals that bite:** guest → 401; **admin → 401 on filing** (root, but
  `self.*` is not short-circuited — the mirror is the user filing with the
  same call); user → 401 on every inbox route (mirror: super 200).
- Another user's request: GET via mine excludes it, PATCH → 404.
- Edit after done / declined → 409; reopen → editable again.
- **Limit:** a fixture sets the user's limit to 2 and files two — the third
  is 409, and after one is marked done the third succeeds (so the 409 is the
  count, not something incidental). NULL limit (super) files past 15.
- Bad kind / unknown target → 422; a target hidden by the filer's mode is
  accepted (a `hidden_anime` fixture, so the case is non-empty).
- Delete → 204, and gone from the author's list.
- Author deleted → request survives with `author_username: null`.
- **`test_admin_handles_requests`** — admin reaches the inbox. Passes today
  through root; it is the test that fails if P3's fixed admin set forgets
  `manage.requests`.

Plus `test_permission_catalog.py` / lock-table tests for the two new names,
`test_rbac_admin_api.py` for `open_request_limit`, and the from-zero
`test_migrations_build_the_schema.py`. Vitest: `RequestModal`,
`MyRequests`, `RequestInbox`, `navigation.test.js`, `Nav.test.jsx`.

## Migration

One revision `r1e2quests34`: create `user_request`, add
`users.open_request_limit` with the backfill, grant the two permissions.
**Parent = `alembic heads` at the moment it is written** (`v1i2ewperms34`
today); re-checked before merge, reparented if media-db or media-fd landed
one first. Downgrade drops the table and column and the two grants — it
loses every request, so it is not `irreversible` but says so.

## Docs, in the same commit as the behaviour

- `docs/systems/requests.md` — new: what a request is, the rules, the gates.
- `docs/api.md`, `docs/data-model.md`, `docs/authorization.md` (the two
  permissions and locks), `docs/business-rules.md` (limit, edit lock).
- `docs/viewers.md` — the "not available yet" note excepts "Requests and
  reports" and the My requests / inbox rows, with the shared account's half
  still pending P3.
- `docs/account.md` — a short "Requests and reports" section for users.
- `docs/frontend/*` for the new pages; delete this plan.

## Not in this piece

- The dashboard summary (super's and the admin's) — `/summary` is ready;
  the dashboard is its own page in viewers.md.
- Pending registrations — P4.
- The inbox under the Admin tab for the admin — today one Inbox row under
  Pipelines serves both, since root sees that tab; the header rework moves
  it.

## The seam — what changes when P3 lands

1. **The `shared` role** is granted `self.requests`, locked on; and
   `manage.requests` locked off.
2. **`admin` stops being root**: its fixed permission set must include
   `manage.requests` (and nothing in `self.*`). `test_admin_handles_requests`
   fails if it does not.
3. **The two shared accounts are seeded with `open_request_limit = 10`**,
   and `default_request_limit` gains `shared: 10`.
4. **`/users` shows the limit** for `user` and `shared`, not for `super` /
   `admin`. Today it shows for every non-root account.
5. **Nothing else.** Routes, service, table, pages and nav ask only the two
   permission names.

Collision points with media-fd, both mechanical: `permissions.py` /
`seed.py` (lock table and defaults) and `users.py` / `Users.jsx` (one field).
Whoever lands second rebases.

## Questions for the owner (via media-00)

1. **Do requests travel on the Sheets backup?** The spec is silent. I
   recommend **no**: they are production-side messages, the box's `pg_dump`
   already holds them, and Pull would otherwise overwrite the box's inbox
   with a development machine's. The cost: a development database has none.
2. **Changing an account's role on `/users`** — does its limit reset to the
   new role's default (user 15 → super none)? I recommend yes, unless the
   same save sets the limit explicitly.
3. **Is super's "none" fixed or adjustable?** I recommend fixed (no field
   for super), matching "super none".
4. **Is the handler's remark required when declining?** I recommend
   optional for both, since viewers.md says only "with a remark".
5. **Where "Report a problem" sits on entry, group and entity pages** — a
   design. Without one I would put a small text button at the end of the
   page's existing header action row; say if the owner wants to supply it.
6. **May a handler reopen a closed request?** I recommend yes (it re-enables
   the filer's editing), for a request closed by mistake.
