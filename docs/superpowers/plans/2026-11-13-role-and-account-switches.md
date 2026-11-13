# P3g — per-role and per-account switches

Its own branch, `feat/role-and-account-switches`, second of P3f → P3g → P3h (each its own branch — see `docs/to-do-next.md`), cut off dev **after P3f merges**
(it needs the `shared` role). Spec:
`docs/superpowers/specs/2026-11-03-account-system-design.md`, "Fixed and
adjustable settings"; `docs/viewers.md`, "At a glance", "Entity pages,
shown per kind", "Search". Read on dev at 84d5a4a plus media-fd's survey;
re-grep every line reference at execution.

## What changes

### 1. `view.entities` becomes four switches

- `VIEW_PERMISSION_KEYS` loses `entities` and gains `studio`, `publisher`,
  `person` (the people and seiyuu libraries — a seiyuu opens a person page)
  and `character` (characters and identities). Labels in
  `VIEW_PERMISSION_LABELS`.
- Locks (`locked_permissions`): `super` → all four locked on (already true:
  super locks on everything but `admin.authz`); `user`, `guest`, `shared` →
  free. Seed default for those three: **off**. Admin stays root until P3h.
- Route gates: `require_view_entities` is replaced by
  `require_view_studio` / `_publisher` / `_person` / `_character` at the
  call sites media-fd listed (`studio.py`, `publisher.py`, `person.py`,
  `character.py`, `character_identity.py`). The seiyuu library is
  `/api/person?role=seiyuu`, under `view.person`.
- SPA: `useEntityHref` (`lib/entityPath.js`) takes the entity kind and
  asks that kind's key; the raw `entityPath` calls media-fd listed
  (`StaffCard.jsx`, `CastingCard.jsx`, `ClubMembership.jsx`,
  `IdentityCard.jsx`, `VoicedPartCard.jsx`) go through it. `App.jsx`'s
  entity routes and `navigation.js`'s library rows ask the per-kind key
  (both surfaces). `FranchisePage`/`SeriesPage`'s Characters tab asks
  `view.character`; `useViewScope` exposes the four.

### 2. Search follows every switch that can be off

- `services/domain/search.py`: the `person`, `studio`, `publisher` and
  `character` buckets are filled only when the viewer holds that kind's
  key; otherwise the key is absent, exactly as a hidden gated type's bucket
  is today (`_drop_absent`). A media-type bucket is absent for a type the
  role does not hold (check at execution whether `search()` already asks
  `media_type.*`; if it only filters rows, make it drop the key).
- `Search.jsx`: no tab for an absent bucket, and its staff cards link
  through `useEntityHref`.
- Coordinate with media-fd: P3c may add the collection/series label filter
  to the group buckets in the same function. Whoever is second rebases.

### 3. The nine ordinary types: adjustable, on by default; gated types fixed

- The nine ordinary `media_type.*` stay free choices for `user`, `guest`
  and `shared`, and the seed grants all nine (already so for a fresh
  database).
- The three gated types become **locked**: on for `user` and `super`,
  **off for `guest` and `shared`**. `_enforce_locks` adds and drops them on
  boot. A gated type still shows only in `unrestricted`, through its label,
  so this changes nothing a guest or shared account sees today.
- Role editor (`Roles.jsx`): the gated rows render as locked through the
  existing `locked_on`/`locked_off`; nothing new on the page.

### 4. Per-account feature switches

- Storage: four boolean columns on `users`, default false:
  `feature_quotes_memes`, `feature_favourites`, `feature_music_status`,
  `feature_mod_status`. Columns rather than a table so they travel on the
  Users tab like the mode ceiling and the request limit — account settings
  a Pull must not reset; an older sheet without them leaves the local
  values alone.
- Who may hold them: `user` and `super` only. `/users` refuses switching
  one on for `admin`, `guest`-less (no account), or `shared` with **409**;
  `shared` never gets quotes or memes, not even by switch. A role change
  away from `user`/`super` clears them.
- `PATCH /api/users/{id}` accepts them; `ManagedUserResponse` and `/me`
  carry them (`/me` as `features: [...]`, named, so the SPA asks
  `hasFeature("quotes_memes")`).
- Gates now:
  - **quotes and memes reads** (`quote.py`, `meme.py` read routes) and the
    Quotes and Memes sections on detail pages ask the account's
    `feature_quotes_memes` in place of `view.extras`. The SPA's quote/meme
    routes, nav rows and `NotesContext.jsx` sections follow (both
    surfaces). Search's quote/meme results, if any, follow too.
  - favourites, music status, mod status: storage and the switch on
    `/users` only. They are catalogue data today and gain teeth in P5.
- Migration: `cg1618` gets all four on (spec, "The named accounts"); every
  other account starts off. **This removes quotes and memes from every
  other `user` account**, which reads them today through `view.extras`.

### 5. A shared account's mode is fixed for switching too

Added at execution (the manager's routing of a gap P3f left): P3f fixes a
shared account's ceiling = default = its own mode, but the switch rule still
lets any account move to a mode at or below its ceiling, so `shared-normal`
can drop to `safe` and the mode switcher appears for it. `viewers.md`'s
design says the switcher never shows for a shared account.

- `POST /api/auth/access-mode` refuses a `shared` account with **409**,
  "A shared account's mode is fixed."; **mirror**: a `user` switching
  within its ceiling still works.
- `/me` (or whatever the switcher reads) offers a shared account no other
  mode, so `ModeSwitcher.jsx` does not render for it; a test asserts it.
- `viewers.md`'s caveat about the switcher appearing for shared accounts
  goes.

### Migration (`s1w2itches345`, parented on the head at execution)

1. Users: the four feature columns; `cg1618` set on.
2. Roles: each role holding `view.entities` → see question 1; the old
   grant rows are deleted.
3. Gated-type grants reconciled to the locks (also done on boot; the
   migration does it so the release diff is visible in one place).

### SPA

- `Users.jsx`: four feature toggles per `user`/`super` row.
- `Roles.jsx`: the four entity rows replace "View Entities".

### Docs, in the same commit

- `docs/authorization.md`: the view family table, the role matrices, "What
  a guest sees", the search section. Grep `view.entities` across `docs/`.
- `docs/viewers.md`: the entity switches, the media-type switch, the
  gated-type row, quotes/memes per account, search — no longer "not
  available yet".
- `docs/api.md`, `docs/data-model.md`, `docs/frontend/*` where the entity
  link helper is described.
- `docs/notes/decisions.md`: columns vs a feature table; why search drops
  keys rather than returning empty lists.
- Delete this plan.

## Tests, written first

Every refusal test makes its set non-empty and asserts the mirror.

- Each entity kind: a role without the key gets 401 on that kind's routes
  and the other three kinds still answer (one kind on, three off, so the
  refusal bites); **mirror**: with the key, 200.
- Search: with `view.person` off and a matching person present, the
  `person` key is absent; **mirror**: on, present and non-empty. Same for
  each kind and for a media type the role does not hold.
- Gated types: saving `guest` or `shared` with `media_type.hentai` is 409;
  saving `user` without it is 409; boot reconciles both.
- Features: quotes read with the switch off is refused, with a quote
  present; **mirror**: on, the quote is returned. Switching a feature on
  for a shared account is 409; **mirror**: for a user, 200. Pull from a
  sheet without the columns leaves them alone.
- Migration test on a scratch database for steps 1–2.
- SPA: `useEntityHref` per kind; a nav test that a library row hides when
  only its kind is off.

## Visible change

1. Entity pages follow four switches; their starting state is question 1.
2. Quotes and memes leave every account but `cg1618` until the admin
   switches them on.
3. Search results follow the switches.
4. Gated-type grants on `guest`/`shared` are dropped (invisible: their
   modes never showed them).
5. Gated release (migration).

## Settled in review (media-00)

1. **Entity switches: carry `view.entities` onto all four kinds** for any
   role holding it, so the migration changes no behaviour. "Off by default"
   applies to roles and accounts created from now on; `shared`'s four are
   seeded off and stay adjustable (only quotes and memes are never shared's).
2. **The rest of `view.extras` / `view.personal` is its own PR after P3g**,
   with P7 (the per-viewer pages). `viewers.md`'s "not available yet" note
   gains a line recording the gap.
3. **The migration grants any missing ordinary `media_type.*` once** to
   `guest`, `user`, `shared` (and `super` if missing) — owner: "the 9 usual
   media types should be available for everyone except admin". Never the
   three gated types. Idempotent; `decisions.md` says it repairs a seed
   accident.
4. **`view.personal` is not touched on this branch** — media-db's P5
   removes the permission entirely (media-00). The stale label goes with it.
