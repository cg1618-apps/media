# P3f — exactly five fixed roles, and the shared accounts

Built on one branch with the other two plans (`feat/fixed-roles-and-switches`, per media-00), in order P3f → P3g → P3h. Originally planned as its own branch, `feat/five-fixed-roles`, cut off dev **after P3e merges** (it needs
`users.mode_ceiling`/`mode_default` and `set_mode_ceiling`) and after P4a
(it builds on P4a's `SHARED_ROLE_NAME`, `self.password` and status). Spec:
`docs/superpowers/specs/2026-11-03-account-system-design.md`, "Roles",
"Shared accounts", "Roles and modes", "Fixed and adjustable settings",
"The named accounts", differences 3–5. Read on dev at 84d5a4a plus P4a at
714f64e; re-grep every line reference at execution.

## What changes

### Roles: five, all fixed

- `ROLE_NAMES = (admin, super, user, guest, shared)` in
  `app/services/rbac/permissions.py`, beside the existing name constants
  (`SHARED_ROLE_NAME` comes from P4a).
- `POST /api/roles/` and `DELETE /api/roles/{id}` are deleted
  (`roles.py` `create_role`, `delete_role`), with `schemas.RoleCreate`.
  `PATCH` (label, description) and `PUT …/permissions` stay.
- `locked_permissions`: the "every custom role" fallthrough goes. Each of
  the five has an explicit branch; an unknown name gets **everything locked
  off** (fail-closed — such a row cannot exist after the migration, but a
  lock table must not hand a stranger the free choices).
- `role.is_system` is dropped: every role is a system role, so the column
  says nothing. `RoleResponse` loses it; `Roles.jsx` loses the badge and
  the delete button. `is_root` stays until P3h.
- `seed.py` `ensure_rbac_seed` also creates `shared` (sort order between
  `guest` and `user`) and tops it up like the others.

### The `shared` role's grants

| | locked on | locked off | free |
| --- | --- | --- | --- |
| `shared` | `self.requests` | `admin.*`, `manage.*`, `self.list`, `self.personal_notes`, `self.password`, `view.extras` | `media_type.*`, the other `view.*` |

- Seeded with guest's grants (`default_guest_permissions()`) plus
  `self.requests` — media-65's P6 seam.
- **`view.extras` is locked off** because it is what opens quotes and memes
  today (`quote.py`, `meme.py`), and shared accounts never get them, not
  even by switch. The same permission also gates the random picker, future
  releases and completions; shared's customised Random Picker and Future
  Releases arrive with P3g's switch split, not here. Until then a shared
  account reads what a guest reads, plus requests.
- **Gated types**: shared is seeded with every `media_type.*`, as guest is;
  its fixed mode (`normal` / `borderline`) already hides them through their
  label. P3g makes "never" a lock.
- `self.password` locked off: one person changing it locks out everyone
  else using the login (spec, "Shared accounts").

### `user` loses `manage.catalog`

- `viewers.md`: "`manage.catalog` is not grantable to a `user`: writing the
  catalogue is what makes an account `super`." So `manage.catalog` joins
  `user`'s locked-off set, and `_enforce_locks` drops it from a stored
  grant set on boot. Company: `user` does not hold it (check at execution
  and say what prod holds is unknown).

### The two shared accounts

- `ensure_shared_accounts(db)` in `seed.py`, called from the lifespan after
  `ensure_rbac_seed`:
  - creates `shared-normal` and `shared-borderline` if missing, role
    `shared`, **an unusable password** (`UNUSABLE_PASSWORD_HASH`, the hash
    Pull already uses — nothing verifies against it), ceiling and default
    their own mode via `set_mode_ceiling`, `open_request_limit` 10, status
    `active`. **The admin sets each password on `/users` when handing the
    account out; no password in `.env` or code** (owner decision).
  - **on every boot, re-asserts what is fixed**: role `shared` and
    ceiling = default = its own mode, whatever a Pull or a hand edit left.
    The password, status and request limit are left alone.
- `DEFAULT_REQUEST_LIMITS` gains `shared: 10` (`services/domain/requests.py`).
  Adjustable per account, as `user`'s 15 is.
- Shared accounts travel on the Users tab like any account (P3e: with their
  ceiling and default). A Pull onto a database whose seed has not run skips
  the row, as an unknown role does today, and reports it.

### `/users` guards (`app/routers/users.py`)

All refusals are explicit, none relies on the last-admin guard:

| Action | Answer |
| --- | --- |
| create with a role other than `user` / `super` | **422** |
| change an account's role to anything but `user` / `super` | **422** |
| change the role of an `admin` or `shared` account — the admin's own included | **409**, "The admin account's role is fixed." / "A shared account's role is fixed." |
| delete a `shared` account | **409** (disabling stays allowed — P4a) |
| `PUT /{id}/access-modes` on a `shared` account | **409**, its mode is fixed |
| set a password on a `shared` account | allowed — only the admin does it |

- The last-admin guard (`_can_administer`, `_admin_count`) stays as it is;
  P3h removes it with `is_root`. P4a edits `_admin_count`, so leaving it
  untouched here avoids a needless rebase.
- `Users.jsx`: both role selects offer only `user` and `super`; an `admin`
  or `shared` row shows its role as text, no select, no delete for
  `shared`, no mode panel for `shared` (its mode is shown as fixed).

### Migration (`f1i2veroles45`, parented on the head at execution)

1. Every role whose name is not one of the five:
   - holding no user → deleted (`role_permission` cascades);
   - **holding a user → the migration raises**, naming the role and how
     many accounts hold it. Nothing is deleted; the admin moves those
     accounts first. Company has none (check at execution).
2. Drop `role.is_system`.
3. The `shared` role and its accounts are **not** created here — the
   lifespan seed does it, as for the other roles, because the API tests
   build their schema with `create_all` and never run Alembic.
4. Downgrade: re-adds `is_system` (true for every remaining role). Deleted
   custom roles are not restored; they held nothing.

### SPA

- `pages/admin/Roles.jsx`: the create form, the delete button and the
  `is_system` badge go; five rows, each editable only in its free cells.
- `pages/admin/Users.jsx`: as above.
- Navigation and route permissions: unchanged.

### Docs, in the same commit

- `docs/authorization.md`: the role matrices gain `shared` and lose "a
  custom role"; "Locked grants"; "Guards on users"; `role.is_system` out of
  Tables. Grep "custom role", "is_system", "create roles" across `docs/`.
- `docs/viewers.md`: the "not available yet" note no longer covers the five
  viewers or the shared accounts' existence; what P3g/P3h build stays
  marked.
- `docs/account.md`: shared accounts exist; the admin sets their password.
- `docs/api.md`: the deleted role routes, the new `/users` refusals.
- `docs/data-model.md`: `role.is_system` gone.
- `docs/notes/decisions.md`: custom roles abandoned (spec reason), why the
  migration refuses rather than reassigns, why the shared accounts are
  re-asserted on boot, why `view.extras` is locked off for `shared` now.
- Delete this plan.

## Tests, written first

Refusal tests make their set non-empty and assert the mirror case.

- `tests/api/test_fixed_roles.py` (new)
  - `POST` and `DELETE /api/roles` are 405 / gone.
  - The seed creates exactly the five roles; `locked_permissions` for an
    unknown name locks everything off.
  - `shared`'s locks: saving its grants without `self.requests` is 409,
    adding `view.extras`, `manage.catalog` or `self.password` is 409;
    **mirror**: toggling a free `view.*` saves.
  - `user` with `manage.catalog` is 409; **mirror**: `super` holds it.
  - Boot drops a stored `manage.catalog` from `user`.
- `tests/api/test_shared_accounts.py` (new)
  - The seed creates both accounts with role `shared`, their own fixed
    mode, limit 10, an unusable password (login refused until the admin
    sets one; **mirror**: after `PATCH` with a password, login works).
  - A hand-edited ceiling or role on a shared account is restored on the
    next seed run; its password, status and limit are not touched.
  - A shared account files a request; it cannot read quotes or memes
    (**mirror**: a user with `view.extras` can), cannot change its own
    password.
- `tests/api/test_users_router.py` (extended)
  - create with `admin`, `guest`, `shared` → 422; **mirror**: `user`,
    `super` → 201.
  - role change on the admin's own account → 409 with the explicit
    message; on a shared account → 409; **mirror**: `user` → `super` works.
  - delete a shared account → 409; **mirror**: disabling it works.
  - access-modes on a shared account → 409; **mirror**: on a user works.
- `tests/api/test_fixed_roles_migration.py` (new): scratch database; an
  empty custom role is deleted, one holding a user makes `upgrade` fail
  with the role's name in the error and leaves everything in place.
- `test_admin_handles_requests` stays green, untouched.
- SPA: `RolesLock.test.jsx` updated; a Users test that the role select
  offers only `user` and `super`.

## Visible change

1. `/roles` has no create or delete; five fixed rows.
2. Two new accounts on `/users`, unusable until the admin sets a password.
3. `/users` refuses roles outside `user` / `super` and fixed-role changes
   with explicit errors.
4. A `user` holding `manage.catalog` loses it on boot (none known).
5. The release is **gated** (it adds a migration), and **can fail on a
   database with a custom role holding accounts** — by design, loudly.
</content>

## Settled in review (media-00)

- All three calls kept: `view.extras` locked off for `shared`; `manage.catalog`
  locked off for `user` (owner: "user will never be given catalogue
  writing"); shared accounts re-asserted on boot, `is_system` dropped, the
  last-admin guard kept until P3h.
- `viewers.md`'s "not available yet" note gains a line: shared lacks Random
  Picker and Future Releases until P3g splits the switches.
- **The PR body and `docs/notes/decisions.md` say plainly that the deploy
  refuses if production has a custom role holding accounts, and that the
  fix is to move those accounts at `/users` first.**
- Cut after P3e and P4a merge; reparent onto `alembic heads` at execution.
- **Production checked by the owner: exactly `admin`, `super` (`cg1618`)
  and the guest role — no custom role holds an account**, so the refusal
  will not fire on deploy; a user-less custom role is simply deleted. The
  refusal stays in the code. The PR body and `decisions.md` say
  "production holds only admin, super and guest, checked by the owner"
  instead of "unknown"; Visible change 5 is worded the same way.
