# Requests and reports

Last verified: 2026-11-13

## What this is for

A member who finds something missing or wrong tells the people who keep the
catalogue by filing a **request**: a missing entry, wrong data, incomplete
data, a bug in the site, or anything else. Each is one row in `user_request`.
Its author reads it and edits it while it waits; a handler works through the
**inbox**, marking each one done or declined with an optional response, and
deletes what is no longer worth keeping. This page walks through the table,
the rules, the gates and the API, with the file that owns each.

## Model

Owner: `app/models/user_request.py` (model `UserRequest`), table
`user_request`; every column is in
[data-model.md](../data-model.md#user_request). Named `user_request` rather than
`request` because `fastapi.Request` is imported across the routers.

- **`kind`** is one of `REQUEST_KINDS` in `app/utils/constants.py`: `new_entry`,
  `data_error`, `incomplete_data`, `bug`, `other`. Served by `/api/constants` as
  `request_kind`, and CHECK-constrained, so a new kind is a constant and a
  migration together.
- **`status`** is one of `REQUEST_STATUSES`: `open`, `done`, `declined`. Served as
  `request_status`, CHECK-constrained, `open` by default.
- **The target** is an FK-less `(target_type, target_id)` pair, both or
  neither (`ck_user_request_target_pair`). `target_type` is a key of
  `REQUEST_TARGET_TABLES` in `app/utils/media_resolver.py` - the twelve media
  types, `series`, `franchise`, `collection`, and the five entities `studio`,
  `publisher`, `person`, `character`, `identity` (`ENTITY_TABLES`). No other
  table resolves against that map.
- **`target_label`** is the target's name copied when the request is filed, so
  a request whose target was later deleted still says what it was about.
- **`page_path`** is the SPA path the request was filed from: where a report
  was made, and a bug report's page address.
- **Both account references are `ON DELETE SET NULL`.** A deleted account's
  requests stay in the inbox, shown as from a deleted account, and whoever
  handled a request can be deleted without losing it. Nothing removes a
  request automatically.

`users.open_request_limit` (integer, NULL = no limit) is the per-account limit
the rules below read.

## Rules

Owner: `app/services/domain/requests.py`. The business-rules summary is
[business-rules.md](../business-rules.md#18a-requests-and-reports-appservicesdomainrequestspy).

### Filing

- **The open-request limit.** Filing counts the author's `open` requests; at or
  over a non-null `open_request_limit` it answers **409** with the count and
  the limit. Only open requests count, so a request marked done or declined
  frees a slot.
- **The limit is per role, then per account.** `default_request_limit(role)`
  gives the starting value from `DEFAULT_REQUEST_LIMITS` - 15 for `user`, none
  for every other role. `/users` applies it when it creates an account and
  whenever it changes an account's role, unless the same save sets the limit;
  an admin adjusts it per account on the Users page.
- **`super` is never limited.** `effective_request_limit` answers none for the
  super role whatever is stored, and `/users` refuses a non-null limit on a
  super account with **422** (`UNLIMITED_ROLES`, `limit_is_fixed`).
- **A target must exist, not be visible.** An unknown `target_type`, a
  `target_id` naming no row, or half a pair is **422**. The filer's access mode
  is not consulted: requesting something your mode hides is allowed.

### Editing your own

- The author edits **`description` and `remark` only**; any other key is
  **422**.
- **Only while open.** A done or declined request answers **409**.
- **Another account's request is 404**, exactly as a missing one: writes
  follow reads, and nothing says the id exists.
- There is no delete for the author.

### Handling

- A handler sets `status` to `done` or `declined` with a `response`, which is
  optional for both. Closing records `handled_by_id` and `handled_at`.
- **Reopening** sets `status` back to `open`, for a request closed by
  mistake. It clears `handled_by_id` and `handled_at`, and the author can edit
  the request again.
- **Deleting** is the inbox's only, a hard delete, **204**.
- The author always gets the handler's `response` back on their own list.

Every write - file, edit, status, delete - logs one line at INFO with the
request id, its kind and the acting username. For a deletion that line is the
only record left.

## Gates

Two permissions, bound once in `app/services/rbac/resolver.py`, and no route in
this feature asks anything else:

| Permission | Dependency | Means | Held by |
|---|---|---|---|
| `self.requests` | `require_file_requests` | file a request; read and edit your own | `user` (locked on), `super` (locked on). Never the root role: `Viewer.has()` does not short-circuit `self.*`, so the admin account files nothing. Locked off for `guest` |
| `manage.requests` | `require_handle_requests` | the inbox: read every request, set its status, delete it | `super` (locked on), `admin` through root. Locked off for `user` and `guest` |

A refusal is **401**, as everywhere. The locks are in
[authorization.md](../authorization.md#locked-grants); a custom role decides both
freely.

## API

`app/routers/requests.py`, prefix `/api/requests`. Full request and response
shapes are in [api.md](../api.md#requests--apirequests).

| Method + path | Gate | Does |
|---|---|---|
| `GET /api/requests/mine` | `self.requests` | the caller's own, newest first; `?status=` narrows to one status |
| `POST /api/requests` | `self.requests` | file one; **201** |
| `PATCH /api/requests/{id}` | `self.requests` | edit your own open one |
| `GET /api/requests` | `manage.requests` | the inbox, newest first; `?status=` `open` (default), `done`, `declined` or `all` |
| `GET /api/requests/summary` | `manage.requests` | `{open: n}` |
| `PUT /api/requests/{id}/status` | `manage.requests` | `{status, response}` |
| `DELETE /api/requests/{id}` | `manage.requests` | **204** |

Each request comes back with its author's and handler's usernames (null for a
deleted account), the target resolved to `{type, type_label, id, label,
nav_path, missing}` - the live name while the target exists, the stored
`target_label` once it does not - and `can_edit`, true when it is the caller's
own and still open.

## Not on the Sheets backup

`user_request` has no tab, so Backup and Pull never touch it. Requests are
messages to the people running the box, kept in its database and its dumps; a
Pull would otherwise overwrite the box's inbox with a development machine's.
A development database therefore has none. `users.open_request_limit` is an
account setting and does travel, on the `Users` tab.
