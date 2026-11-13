# P3h — admin stops being root

Built on one branch with the other two plans (`feat/fixed-roles-and-switches`, per media-00), in order P3f → P3g → P3h. Originally planned as its own branch, `feat/admin-not-root`, cut off dev **after P3g merges** — last of the
four, because every permission it hands the admin must already exist and
every switch it stops short-circuiting must already be in place. Spec:
`docs/viewers.md`, "Admin"; account-system spec, "Fixed and adjustable
settings", "The named accounts". Read on dev at 84d5a4a plus media-fd's
survey; re-grep every line reference at execution.

## The problem with "a fixed permission set"

Every page the admin keeps except accounts, roles, modes and pipelines is
gated today on **`manage.catalog`** — announcements (`announcements.py`),
the Note pages (`options.py`: System Options, Alias Conversion, External
APIs), `/images` (`images.py`) and the `/resources` writes
(`resources.py`); `/resources` reads are `view.extras`. Granting the admin
`manage.catalog` would hand it catalogue **writes** (creating entries needs
no visibility), which viewers.md says it never has, and would make `/me`'s
`is_admin` — "may edit the catalogue", read by ~86 SPA files — true for it.
So those pages get their own permissions.

## What changes

### New permissions (`app/services/rbac/permissions.py`)

| Permission | Gates | Today |
| --- | --- | --- |
| `manage.announcements` | announcement writes | `manage.catalog` |
| `manage.options` | the Note pages — System Options, Alias Conversion, External APIs (`/api/options`, and whatever backs aliases and external APIs, checked at execution) | `manage.catalog` |
| `manage.images` | `/api/images` | `manage.catalog` |
| `manage.resources` | `/api/resources` **reads and writes** — the site-wide Resources page is admin's and super's alone | reads `view.extras`, writes `manage.catalog` |

`super` holds all four, locked on (it locks on everything but
`admin.authz`). `user`, `guest`, `shared`: locked off. Form defaults and
picker defaults (`form_defaults.py`, `random_picker_defaults.py`) stay on
`manage.catalog` — they are catalogue-editing tools, not Note pages.

### The admin's fixed set

`locked_permissions("admin")`: **locked on** `admin.authz`,
`manage.pipelines`, `manage.requests`, `manage.announcements`,
`manage.options`, `manage.images`, `manage.resources`; **locked off**
everything else — `manage.catalog`, every `media_type.*`, every `view.*`,
every `self.*`. Nothing on the admin row is a free choice. The label
reference (`require_label_reader`: `admin.authz` or `manage.catalog`) is
reached through `admin.authz`, unchanged.

### `is_root` goes, with every short-circuit

- `role.is_root` dropped. `Viewer.is_root` and `Viewer.has()`'s
  short-circuit go (`resolver.py`); `has()` is a set membership test.
- `locked_permissions(role_name)` loses its `is_root` parameter;
  `roles.py` (`_to_response`, `_enforce_locks`, the root 409 in
  `replace_permissions`) and `seed.py` (`_enforce_locks`'s root filter) are
  updated. The admin role now stores its grant rows like any other.
- **Known bypasses removed**:
  - `note.py` `_authorize_edit`: a personal note is edited by its author
    only — no account edits another's.
  - `media_relation.py` (~:460) and `watch_order.py` (~:226): the object
    axis applies to every viewer; no exemption.
- `user_list.py` `installation_owner_id`: keep the rule (flag holder, then the first eligible account, then the first account) — media-db's P5 relies on it — but "first non-root"
  becomes "first account whose role is not `admin`, `guest` or `shared`", by role name. Not deleted.
  It has a second caller on media-db's P5 branch: `pull.py`
  `restore_legacy_personal` → `_restore_owner_id`. The role-name rule is the
  same one P5's migrations freeze; check both callers when this lands.
- `users.py`: the last-admin guard (`_can_administer`, `_admin_count`)
  goes. The admin account's role is fixed (P3f) and **it cannot be
  deleted** — an explicit 409 replaces the guard's indirect protection.
- `/me`: `is_root` removed. `is_admin` keeps its meaning
  (`manage.catalog`), so it becomes false for the admin.

### The admin has no mode and no personal data

- Admin account: ceiling and default NULL (P3e's "no mode"), so it resolves
  the empty object set — no catalogue read even through a route that forgot
  a permission check. The mode switcher never shows. `/users` refuses a
  ceiling for the admin (409), as for a shared account.
- Feature switches stay off and are refused (P3g already limits them to
  `user` / `super`).
- `self.*` was never implicit for root; it stays locked off.

### SPA

- `AuthContext.jsx`: `has()` loses the root short-circuit; `isRoot` goes.
- `ProtectedRoute.jsx`: the no-permission fallback to `has("admin")` goes —
  its own comment says no call site relies on it; a route with no
  `permission` is open.
- `App.jsx`: `/options`, `/aliases`, `/external-apis` move to
  `manage.options`; `/images` to `manage.images`; `/resources` to
  `manage.resources`; announcement editing asks `manage.announcements`.
  `navigation.js` follows (both surfaces).
- The entry id on the poster spine (`{isRoot && …}` on 12 detail pages)
  asks `has("manage.catalog")` — see question 1.
- `Roles.jsx`: the admin row renders as fully locked from `locked_on` /
  `locked_off`; the `is_root` special cases go. `Users.jsx`: no mode panel
  for the admin row.

### Migration (`a1d2minroot45`, parented on the head at execution)

1. Grant the admin role its fixed set as rows; drop `role.is_root`.
2. Set the `admin`-role account's ceiling and default to NULL.
3. No data moves: production's `cg1618` is already `super` and the
   installation owner. The migration **logs** any personal row (list,
   plan, seasonal, notes with scope `personal`, …) owned by an `admin`-role
   account and leaves it — none are expected, since `self.*` was never
   implicit for root.
4. Downgrade restores `is_root` on `admin` and ceiling/default
   `unrestricted`.

### Docs, in the same commit

- `docs/authorization.md`: every "root", "implicit", "short-circuit" —
  grep them across `docs/`; the role matrices' admin column; "The admin
  account holds no user data"; Tables.
- `docs/viewers.md`: the Admin section and the at-a-glance admin column
  are now true; remove their "not available yet" coverage. The admin's
  own dashboard stays with P7.
- `docs/api.md`, `docs/frontend/*` (the spine, ProtectedRoute).
- `docs/notes/decisions.md`: why new `manage.*` keys rather than granting
  `manage.catalog`; why the object axis now applies to every viewer.
- Delete this plan.

## Tests, written first

Refusal tests make their set non-empty and assert the mirror.

- The admin is refused (401) on a catalogue read and a catalogue write
  with an entry present; **mirror**: super reads and writes it.
- The admin reaches each of its pages' APIs: users, roles, access modes,
  label reference, announcements write, options, images, resources,
  every pipeline route, the request inbox (`test_admin_handles_requests`
  stays green).
- A permission minted in a test (monkeypatched catalogue) does **not**
  reach the admin — the property root had and loses.
- `user` is refused `/api/resources` with a resource present; **mirror**:
  super reads it.
- Bypasses: the admin cannot edit a user's personal note (404/401), and a
  relation or watch order pointing at an entry hidden from the viewer is
  hidden from every viewer, admin included.
- `locked_permissions("admin")` leaves no free cell; saving the admin role
  with any change is 409.
- Smoke, at execution: each pipeline page (`/system`, `/data-history`,
  `/review-queue`, `/clean-orphans`, `/business-logic`) and `/images` used
  as the admin with an empty object set — any that reads the catalogue
  through a visibility-filtered route is a finding to report before
  merging, not to patch silently.

## Visible change

1. The admin login sees no library, entry, search, quotes or memes, and no
   mode switcher; its menus carry only its own pages (the dedicated admin
   dashboard is P7).
2. **`user` accounts lose `/resources` now, not at P7** (owner: "strictly admin/super only"; viewers.md: admin's and super's
   alone).
3. Gated release (migration).

## Settled in review (media-00)

1. **The poster-spine entry id is shown to `manage.catalog` (super)**, not
   dropped.
2. **`/resources` leaves `user` in P3h** — owner: "/resources should be
   strictly admin/super only". Stated under "Visible change" (item 2) and in
   the PR body.
3. **Before the PR**, grep the SPA for every `is_root` / `isRoot` /
   `is_admin` / `isAdmin` read — `App.jsx`'s `ProtectedRoute`s,
   `navigation.js`, and every `/me` consumer that relies on `is_admin`
   meaning "can do everything" — and list what each now asks in the PR.
4. **From media-fd (P3b1):** the label reference's nav row sits once under
   the Note section with `requires: ["admin.authz", "manage.catalog"]`
   (any-of, via `navigation.js` `meets()`), and its route uses
   ProtectedRoute's `anyPermission`. **The Note SECTION itself is gated on
   `manage.catalog`**, so a non-root admin would lose the section and the
   Content Labels link, though the route still works. P3h gates the Note
   section on any of `manage.catalog` / `manage.options` / `admin.authz`
   (whatever its rows need) and a nav test asserts the admin's header shows
   Content Labels, System Options, Alias Conversion and External APIs;
   mirror: a `user` sees none of them.
