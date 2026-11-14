# P7 — the rest of `view.extras`, and the per-viewer pages

Its own branch, `feat/per-viewer-pages`, cut off dev **after P3g merges**,
and **merged into dev last**: after P3g, P3h, P4b and P5 (#354). The
order is #353 → P3f → P3g → P3h → P4b → #354 → P7 (see
`docs/to-do-next.md`). Spec:
`docs/superpowers/specs/2026-11-03-account-system-design.md`, "Fixed and
adjustable settings"; `docs/viewers.md`, which is the authority —
"At a glance", "Track and Insights pages", "Guest", "Shared" and every
section of "Customised pages". Origin: the role-and-account-switches plan,
"Settled in review" item 2. Read on dev at 9edc345; re-grep every line
reference at execution, because P3f, P3g, P3h, P4b and P5 all land in
between.

**Labels in fixtures.** After #353, `normal` shows the `nsfw` label, so a
refusal test that hides an entry from a `normal` viewer labels it `erotica`.
The credits PUT refuses (422) dropping NSFW from `tags.label` while
輕微色情/擦邊肉番 stays, and the Label option 肉番 is called 擦邊肉番. A
fixture or test that writes labels follows both.

**Split into sub-branches (manager, 2026-11-14).** Part D's frontend is on
`feat/per-viewer-pages-explore` (media-fb) and Part E's on
`feat/per-viewer-pages-dashboards` (media-48), both cut from 60f76b1, each PR
based on `feat/per-viewer-pages` and merged into it by this branch's owner -
never into dev. **Both must be merged here before #360 leaves draft**: GitHub
does not retarget a child PR when its base merges, so a sub-PR still open then
would never reach dev. Before saying #360 is ready, prove each with
`git merge-base --is-ancestor origin/<sub-branch> origin/feat/per-viewer-pages`.
Ownership: D owns the Seasonal, Statistics, Random Picker, Future Releases
and Completions pages, `lib/randomPicker.js`, `lib/pickerWeights.js`,
`hooks/usePickerData.js`, `components/picker/*`, and only the Seasonal and
Statistics rows of `App.jsx` / `navigation.js`; E owns `pages/public/Index.jsx`
and `components/dashboard/*`. This branch keeps Part A, Part C, the backend
and everything else. A third, `feat/per-viewer-pages-genre` (media-fb), adds the
picker's catalogue `genre` filter after #366 merges; the same merge-before-
ready rule holds for it. Sub-PRs: #365 (E), #366 (D), and the genre PR.

**Fixtures after P3h (#362).** `admin_client` becomes the real admin: no
mode, only its fixed set (`admin.authz`, `manage.pipelines`,
`manage.requests`, `manage.announcements`, `manage.options`,
`manage.images`, `manage.resources`), no catalogue, no personal data.
Catalogue work moves to `owner_client` / `owner_user` (`aaa_testowner`, a
`super` in `unrestricted`); `list_row`, `sample_anime` and `mode_client` hang
on `owner_user`. When dev with #362 is merged in: take c157426's side of
conflicting hunks wholesale, then in every P7 test move `admin_client` →
`owner_client`, `admin_user` → `owner_user`, `"aaa_testadmin"` →
`"aaa_testowner"` - **except** a test calling an `admin.authz` route
(`/api/users*`, `/api/roles*`, `/api/access-modes*`) or asserting what the
admin itself is refused or allowed. A wrong move into a refusal test can pass
for the wrong reason: check each admin-refusal test by hand. P7's files using
the fixtures: `test_view_random_picker.py` (`configured_mode` → owner; the
`/api/roles` saves stay on admin), `test_view_permissions.py`,
`test_seasonal_api_per_user.py`. The admin's SPA has no `isRoot`, `has()` is
plain membership, and the Library tab needs a `media_type.*` key it lacks.
Part E's admin page may settle the open item on `/options` Tier 3 showing
zero counts for the admin (it cannot read `/api/person/role-counts` or
`/api/studio/`).

**What this branch does not do**, because another branch owns it:
quotes and memes (P3g's `feature_quotes_memes`), `/resources` and the
admin's fixed permission set (P3h's `manage.resources`), the entity
switches and search (P3g), every personal value — ratings, expectations,
highlights, personal note fields, mixed rows, favourites (P5), and the
pending-registrations panel itself (P4b). It builds on all of them.

**General versions only.** viewers.md settles each page's general version
per viewer; the detail (columns, defaults, layout, wording) is
`docs/open-items.md`, "Per-viewer page detail", taken up after the
rework. Every new surface here is built from existing components and the
design system and called **provisional UI** in the PR body — see question 1.

## What the code does today (surveyed, not recalled)

- **`view.extras` gates** `GET /api/random-picker-defaults/{mode}`
  (`random_picker_defaults.py:118`) besides quotes, memes and resources,
  and in the SPA the Future Releases, Completions and every `/random`
  route (`App.jsx:140,159,178,250`) and their nav rows
  (`navigation.js:202-217`). Future Releases and Completions have no
  backend routes of their own: they read the `get_viewer` catalogue lists.
  `random_picker_defaults.py`'s docstring ("Reading is open to everyone")
  is stale.
- **Every personal write in the SPA goes through the catalogue PATCH.**
  Status, progress and plan flags are sent to `PATCH /api/<type>/{id}`
  (`_factory.py:459`), which requires `manage.catalog`; `useStatusToggle`,
  the dashboard steppers (`Index.jsx:700,719,744`) and Seasonal's
  `ep_fin` (`SeasonalOverall.jsx:382`) all use it.
  `GET`/`PUT /api/me/list/{media_id}` (`me_list.py`, `self.list`,
  visibility-checked) exists and **the SPA never calls it**. So a `user`
  cannot change its own list today; the library table even offers the
  control (`canTrack = has("self.list")`, `LibraryLayout.jsx:43`) and gets
  a 401.
- **The UI gates on personal controls disagree**: `self.list` in the
  library table, `isAdmin` (= `manage.catalog`) on MediaCard's status
  button (`MediaCard.jsx:595,690`), the dashboard cards'
  steppers (`DashboardCard.jsx:80,192`, `NovelDashboardCard.jsx:181`),
  Seasonal's rating select (`SeasonalOverall.jsx:194`) and
  `SeasonalDetail.jsx:295,318`. Movie and anime-movie hide the chip from
  non-admins (`ADMIN_ONLY_STATUS`, `MediaCard.jsx:577`).
- **Libraries** show every personal filter, sort and column to everyone
  (status group, ownership, my rating, usefulness, progress, status button,
  plan-flag columns, in `pages/library/configs/*.jsx`); a guest reads
  defaults. Only the franchise and collection libraries strip their
  `view.personal` fields.
- **Seasonal** (`/seasonal`, `/seasonal/:id`) and **Statistics** are
  `self.list` routes. Seasonal groups the season's anime by the viewer's
  status and reads the per-user `seasonal` rows (router-level `self.list`,
  `seasonal.py:35`); Statistics is computed entirely client-side from full
  lists, the per-user seasonal rows and the viewer's game copies
  (`pages/statistics/useStatisticsData.js`). No catalogue-count endpoint
  exists; `/api/credits/usage` counts per option value but only Add/Modify
  read it.
- **Future Releases** reads `GET /api/system/config/current_season`,
  which is `manage.pipelines` (`system.py:27`), inside its page-wide error
  (`FutureReleases.jsx:107,194,355`), so it should fail for a `user`. A
  `self.list` copy, `GET /api/seasonal/current-season`, exists. It has no
  on-your-list or plan markers.
- **Completions** is built from `completed_at`, `my_rating` and the status
  (`StatsCompletions`), all personal.
- **Random Picker**: catalogue lists plus the defaults above; the status
  group, my rating, ownership and the plan-based weights
  (`lib/randomPicker.js`, `lib/pickerWeights.js`) are personal. It asks
  `/api/plan-next/` whenever someone is signed in (`RandomPicker.jsx:93`),
  not on `self.list`, so an account without the list gets a 401.
- **Dashboard** (`Index.jsx`): a guest gets announcements and the
  broadcast schedule (`GUEST_TOC_IDS`, :172); a `self.list` holder also
  gets its watch schedule, Coming Next, followed orders and the tracker
  divisions. No library links, no recently-added, no summary, no admin
  page. No cross-type "recently added" endpoint exists; each type's list
  sorts `created_at desc` (`_factory.py:346`).
- **Header** (`Nav.jsx`): `visibleSections` drops empty tabs already; the
  search box asks `view.search`; Requests sits beside sign out on
  `self.requests`; the mode switcher hides itself below two modes. The tabs
  are still Track and Insights, and the tab is still called Pipelines.
- **Settings** is `self.list`; its password card asks `self.password`.

## Parts, in build order, on one branch

**P5 edits the same files first.** `MediaCard.jsx`, `useStatusToggle`,
the library configs and the franchise and collection libraries' personal
stripping all change on `feat/personal-data` before Parts A and C touch
them. So before building A or C, **merge `feat/personal-data` in
sideways** rather than building on those files from dev and conflicting
later. The PR's base stays `dev`, and it stays a draft until #354 lands;
then merge `dev` in again so the diff shows only P7. If P5 changes after
it was merged in, merge it again before relying on it.

One branch and one draft PR, opened early so CI runs on every push. Each
part is its own commit(s) with its own docs, and leaves the app working.
Only Part A has a migration.

| Part | What | Migration |
| --- | --- | --- |
| **A** | `view.extras` goes; the Random Picker key; personal writes through `/api/me` | yes |
| **B** | The header: Track, Explore, Extras, System | no |
| **C** | Catalogue-only libraries, cards and detail pages for viewers without a list | no |
| **D** | Seasonal, Statistics, Random Picker, Future Releases and Completions per viewer | no |
| **E** | The dashboards | no |

A before everything, because it settles the one rule the others stand on:
**a viewer without `self.list` gets the catalogue version** — guest and
shared alike, and the admin, which holds no `self.*` — so "catalogue
only" is one test, `has("self.list")` — in the SPA, P5's
`useViewScope().ownData` — everywhere in C–E.

## Part A — `view.extras` goes; personal writes through `/api/me`

### Permissions (`app/services/rbac/permissions.py`)

After P3g and P3h, `view.extras` gates only the Random Picker, Future
Releases and Completions, and those three are opened differently per
viewers.md:

| Page | Gate after this branch | Why |
| --- | --- | --- |
| Future Releases | none beyond the catalogue reads (`get_viewer`); open to every viewer that reads the catalogue | guest, shared, user and super all have it; the admin reads no catalogue after P3h |
| Completions | `self.list` | it is built from the viewer's own completions; super and user only |
| Random Picker, and `GET /api/random-picker-defaults/{mode}` | **`view.random_picker`**, new | super, user and shared, never guest; no other existing key draws that line |

- `VIEW_PERMISSION_KEYS` loses `extras` and gains `random_picker`, with a
  label in `VIEW_PERMISSION_LABELS`. `PERM_VIEW_EXTRAS` and
  `require_view_extras` go; `require_view_random_picker` replaces it on
  `random_picker_defaults.py`'s read, whose docstring is corrected.
- Locks (`locked_permissions`): `view.random_picker` **locked on** for
  `super`, `user` and `shared`, **locked off** for `guest` and `admin`.
  viewers.md's "Everything else … fixed", so no cell is a free choice.
  `_enforce_locks` reconciles on boot.
- P3f locked `view.extras` off for `shared` because it opened quotes and
  memes; after P3g it no longer does, so nothing of that reason survives
  and `shared`'s lock row simply loses the key.

### Migration (`v1i2ewextras3`, parented on the head at execution)

**Done**, parented on `f1a2vourites3`. The downgrade re-grants
`view.extras` to `user` and `super` only (the earlier code held it locked off
for `shared`). No `is_root` filter: P3h dropped the column. Future Releases'
gate is any ordinary media type (`LIBRARY_MEDIA_TYPE_PERMISSIONS`), not
"none", so the admin is not offered a page of catalogue it cannot read.

1. Grant `view.random_picker` to `super`, `user` and `shared`; never to
   `guest` or `admin`.
2. Delete every `view.extras` grant row, and the permission row if
   permissions are stored.
3. Downgrade re-grants `view.extras` to every role holding
   `view.random_picker` and drops the new key.

### Personal writes through `/api/me`

- The SPA's status, progress and list-field writes move from
  `PATCH /api/<type>/{id}` to `PUT /api/me/list/{media_id}`:
  `useStatusToggle`, the dashboard steppers, Seasonal's episode stepper and
  MediaCard's status button.
  P5 moves none of these: its Part A leaves entry list writes on the
  catalogue PATCH and does not touch `useStatusToggle`, so this part owns
  the move.
- **Plan flags**: nothing under `/api/me` writes them, so add
  `PUT /api/me/plan-flags/{media_id}` `{kind, planned}` under the
  router's `self.list`, calling `set_entry_flag` with the caller's id, and
  visibility-checked through `_media_or_404` like the list routes.
- **The shape to mirror is P5's `app/routers/me_ratings.py`**:
  `PUT /api/me/ratings/{owner_type}/{owner_id}` and
  `PUT /api/me/novel-units/{unit_id}`, under `self.list`, with the admin
  refused 401. Every new personal write in P7 lives under `/api/me/...` in
  that shape.
- The catalogue PATCH's personal half (`pop_plan_flag`,
  `split_list_payload`'s personal side, `_write_list`) stays only while a
  caller still sends it. Grep every caller at execution (the Modify form
  first). If none is left, the PATCH refuses personal keys with **422**
  rather than dropping them, as `/api/me/list` refuses a foreign key. If
  one is left, say which in the PR body rather than leave it silently.
  **Checked 2026-11-14: callers remain, so no 422.** The Add and Modify forms
  (`pages/admin/Add.jsx`, `Modify.jsx`, `pages/add-tabs/*`, through
  `lib/payloads.js`'s `*FieldsPayload` and `buildAnime*Payload`) send the
  editor's own status, `my_rating`, progress counters and plan flags in the
  same body as the catalogue fields, on POST, PUT and PATCH. They are
  catalogue editors' forms (super holds `self.list` too), so the personal
  half stays on those routes for them; the PR body lists them. Every
  self-service control a viewer without `manage.catalog` is offered writes
  through `/api/me`.
- UI gates: every personal control asks P5's
  `useViewScope().ownData` (= `has("self.list")`), not `isAdmin`. Nothing
  here builds on `useViewScope().personal`: `view.personal` survives only
  until P5 Part C removes it. That covers MediaCard's status button (and
  `ADMIN_ONLY_STATUS` goes), the dashboard steppers, Seasonal's rating
  select and episode stepper. `SeasonBulkActions` writes the catalogue
  (anime PATCH, data-control replace), so it stays on `manage.catalog`.
- `RandomPicker.jsx` asks `/api/plan-next/` only with `has("self.list")`.
- **Remarks on every detail page.** Each detail page's own Remark textarea
  (for example `Novel.jsx` near :628, saved through `performPatch({remark})`,
  so the catalogue PATCH) is gated on `isAdmin`, and while a remark exists it
  hides the notes page's remark section. So a plain `user` with a remark on an
  entry sees only a disabled textarea. Every detail page's remark moves to a
  `/api/me/...` write under `self.list` in the `me_ratings.py` shape (or the
  list route, if the remark is already one of `/api/me/list`'s fields; check
  at execution), gated on `ownData`. Grep every `performPatch` and `remark`
  use across `pages/detail/` and list them in the PR; Novel is only the
  example.

## Part B — the header

`frontend/src/config/navigation.js`, with `App.jsx` asking the same keys
(both permission surfaces; see this repository's `CLAUDE.md`):

| Tab | Rows | Each row asks |
| --- | --- | --- |
| **Track** | Plan, Completions | `self.list` |
| **Explore** | Seasonal, Future Releases, Random Picker, Statistics | none, none, `view.random_picker`, none (Part D gives each a catalogue version) |
| **Extras** | Quotes, Memes, Resources ┃ Relations, Watch Orders | P3g's feature, P3g's feature, P3h's `manage.resources` ┃ `manage.catalog` |
| **System** (was Pipelines) | unchanged rows | unchanged |

- The `insights` key goes; `track` loses Seasonal, Future Releases and
  Random Picker; `explore` and `extras` are new; `pipelines` is relabelled
  **System**, with its key renamed to match and its tests following.
- **Settings** leaves Insights for the account strip, beside Requests and
  sign out, on `self.list`. That is where viewers.md puts the other
  per-account link, and the page's only content is the account's own
  password. Provisional (question 1).
- An empty tab is not drawn (already true through `visibleSections`).
- After P3h the admin holds no `view.*`, no `media_type.*` and no
  `self.*`, so its Library, Restricted, Track, Explore and search box
  disappear without new code. A nav test pins it.

## Part C — catalogue-only libraries, cards and detail pages

- **Libraries** (`pages/library/configs/*.jsx`, `LibraryLayout.jsx`): every
  personal filter, sort and column — status group, ownership, my rating,
  usefulness, progress, the status button, the plan-flag columns — is
  marked `personal: true` in its config, and `LibraryLayout` drops those
  without `ownData`. One flag in the configs, not a check per page. P5
  already moves the Collection, Franchise, Character, Person, Studio and
  Publisher libraries' rating and expectation columns and sorts onto
  `ownData` (and `lib/entityFilters.js`, `lib/randomPicker.js`,
  `hooks/usePickerData.js`), and deletes `personal_gate.py`: responses
  keep their field names, filled with the viewer's own value or null. So
  those six are already right after the sideways merge. Part C brings the
  media-type configs to the same test through the flag, and folds P5's
  per-page `ownData` checks into it where they are the same columns.
- **Cards** (`MediaCard.jsx`): no status chip and no personal badge
  without `self.list`; the external score stays (viewers.md, "Libraries").
- **Entry, group and watch-order pages**: the My tracker card, the follow
  toggle and every personal control ask `self.list` and are absent without
  it. Report a problem asks `self.requests` (P6, already). Personal notes,
  fields and rows are P5's; entity names as plain text are P3g's. Check
  each detail page's tracker gate at execution and list them in the PR.
- **Watch orders and relations whose group is hidden.** #353 records an open
  item: `routers/watch_order.py` filters the entries inside an order but
  never asks whether its owning collection, franchise or series is visible,
  and `media_relation`'s `/graph` and scope listing behave the same. Nothing
  in P7 may widen that. A surface this branch adds or opens to a new viewer
  that lists watch orders or relations (the guest's and shared account's
  watch-order pages, the dashboard's followed orders) gates each owner on
  `tier_visible` and answers a hidden one as missing. **Done at the route
  level**: `watch_order.py` and `media_relation.py` gate every read on the
  owner (`apply_owner_visibility`, `tier_visible`,
  `visible_scope_franchise_ids`), so the pages P7 opens inherit it, and the
  open item is deleted. Writes stay on `manage.catalog` without the owner
  gate: an editor's write is not a new viewer surface. Built-in orders'
  steps are still generated unfiltered (`build_release_items` takes no
  viewer, documented in `systems/watch-orders.md`); an entry hidden there
  is hidden through its group, which the owner gate now covers, unless it
  carries its own label.

## Part D — Seasonal, Statistics, Random Picker, Future Releases, Completions

- **Current season, readable by every catalogue reader.**
  `GET /api/seasonal/current-season` moves off the seasonal router's
  `self.list` onto a route that only needs `get_viewer`. Future Releases and
  Seasonal read it there, not the `manage.pipelines`
  `/api/system/config/current_season`, which stays the Control Center's.
- **Seasonal**: the routes leave the `self.list` block. With the list,
  the page is today's. Without it, the season's anime **without a status
  split** — what aired or airs that season, with external scores — and
  the **All Seasons** table built from the catalogue: one row per season
  present in `anime.airing_season`, with its entry count, from a new
  `GET /api/seasonal/catalogue` (`get_viewer`, visibility-filtered). No
  rating column.
- **Statistics**: the route leaves the `self.list` block. With the list,
  today's page. Without it, **counts of the catalogue**: entries per type,
  per season and per genre, from a new `GET /api/statistics/catalogue`
  (`get_viewer`; counts over the viewer's visible object set, so a mode
  never learns what it hides). Server-side because the counts are
  aggregates and a catalogue-only viewer should not download every list to
  count it. The personal sections (ratings, favourites, game spend,
  seasonal overview) are absent, not empty.
- **Random Picker** (`view.random_picker`): with the list, today's page.
  Without it, the shared account's version, **catalogue filters only** —
  type, genre, season or decade, external score — and unweighted picking.
  `lib/randomPicker.js`'s filters and `pickerWeights.js`'s inputs carry the
  same `personal` flag as the library configs. Add the external-score
  filter if it is missing; that is a catalogue filter, not new data.
- **Future Releases**: open route. With the list: today's sort, plus an
  **on-your-list** marker (a status other than none) and a **plan**
  marker (any plan flag) on each card, from the fields
  `attach_entry_list_fields` already returns. Without it: catalogue only,
  sorted by release date, no status sort and no expectation badge.
- **Completions**: `self.list`, in Track. Nothing else changes.

## Part E — the dashboards (`Index.jsx`)

One page, choosing its sections by permission, not by role name:

| Viewer | What it chooses on | Shows |
| --- | --- | --- |
| super | `self.list` and `manage.requests` | today's member dashboard, plus the **summary**: counts of pending registrations and open requests and reports, a few words each, linking to where they are handled; **hidden entirely when both are zero** |
| user | `self.list` | today's member dashboard |
| guest | neither, no account | announcements, broadcast schedule, **a way into each library** — one link per library row the viewer's nav already shows (`visibleSections`' Library and Restricted rows), so the two never disagree |
| shared | `view.random_picker` without `self.list` | the guest's dashboard plus **recently added**: the newest entries across every type the viewer may see |
| admin | `admin.authz` without any catalogue read | its own page: pending registrations, open requests and reports, recent pipeline runs, and announcements to edit; no catalogue |

- **Summary**: `GET /api/dashboard/summary` → `{pending_registrations,
  open_requests}`, gated `manage.requests` (super and admin both hold it).
  The pending count is accounts with P4b's `pending` status, which is on
  dev before P7 merges.
- **Recently added**: `GET /api/media/recent?limit=` over the `media`
  table, `created_at desc`, visibility-filtered through the viewer's object
  set, returning card data. Check at execution that `media` carries
  `created_at`; if it does not, merge the per-type lists client-side
  instead and say so.
- **The admin's page** stands on P3h, which is on dev before P7 merges:
  a root admin would pass every test above. Recent pipeline runs come from the Data History
  endpoint (`manage.pipelines`); announcement editing uses the existing
  announcement components, asking P3h's `manage.announcements`.

## Docs, in the same commit as each part

- `docs/viewers.md`: each section this branch makes true loses its "not
  available yet" coverage. That is the at-a-glance rows for Random Picker,
  Plan/Completions, Seasonal/Statistics and Future Releases, "Track and
  Insights pages" (renamed for the three tabs), "Header and menus",
  "Libraries", the general versions in "Entry detail pages", "Seasonal and
  Statistics", "Random Picker and Future Releases", "Settings" and
  "Dashboard". If every part of the rework has landed, the note itself
  goes.
- `docs/authorization.md`: the view family table and the role matrices
  (`view.extras` → `view.random_picker`, its locks); the route table rows
  at :984-988; the `require_view_extras` paragraph. Grep `view.extras` and
  `extras` across `docs/`, including `api.md:13`, `systems/resources.md`,
  `systems/quotes-memes.md` and `frontend/admin-pages.md`.
- `docs/api.md`: the new routes, `/api/me` plan flags if added, the moved
  current-season read, the PATCH's 422 on personal keys.
- `docs/frontend/pages.md` (routes, nav tabs, "The guest scope"),
  `docs/frontend/components.md` (`useViewScope`, the config `personal`
  flag).
- `docs/notes/decisions.md`: why one test (`self.list`) decides "catalogue
  version"; why `view.random_picker` rather than reusing an existing key;
  why personal writes left the catalogue PATCH; why Statistics' catalogue
  counts are server-side.
- `docs/to-do-next.md`: delete the P7 row.
- Delete this plan.

## Tests, written first

Every refusal test makes its set non-empty and asserts the mirror.

- **A, permissions**: `GET /api/random-picker-defaults/{mode}` with a
  configured mode is 401 for guest; **mirror**: 200 for shared and user.
  Saving `guest` with `view.random_picker`, or `shared` without it, is 409;
  boot reconciles both. `view.extras` is absent from `/api/roles` and
  `/me`.
- **A, migration** on a scratch database: roles holding `view.extras` end
  holding `view.random_picker` exactly per the locks, guest and admin
  never; downgrade restores. `test_migrations_build_the_schema.py` passes.
- **A, writes**: a `user` sets its own status, progress and a plan flag
  through `/api/me` with an entry present, and a second account's row is
  untouched (**mirror** of the refusal: a guest is 401, and a hidden
  entry is 404). The catalogue PATCH with a personal key is 422 for
  super, if Part A removes the personal half.
- **D**: `/api/seasonal/current-season` answers a guest; **mirror**: the
  pipelines route still refuses it. `/api/statistics/catalogue` and
  `/api/seasonal/catalogue` count only what the viewer's mode shows. Give
  the database a gated entry and assert `safe` does not count it while
  `unrestricted` does, so the refusal bites.
- **E**: `/api/dashboard/summary` is 401 for a `user` with an open request
  present; **mirror**: super reads the count. `/api/media/recent` omits an
  entry the mode hides, with one present; **mirror**: a wider mode returns
  it.
- **Remarks**: a `user` saves its own remark on an entry that already has
  one, and a second account's remark is untouched; **mirror**: a guest is
  401. In the SPA, the remark textarea is enabled for `ownData`, and is not
  drawn without it.
- **Hidden owners**: a watch order whose franchise the viewer's mode hides is
  absent from every surface this branch adds or opens (a gated group present,
  so the refusal bites); **mirror**: a wider mode lists it.
- **SPA**: nav per viewer: guest (no Track, no Extras, Explore without
  Random Picker), shared (Explore with it, no Track), user, super, and
  admin after P3h (only its own tabs, no search box). A library config
  column flagged `personal` is absent without `self.list` and present with
  it. MediaCard's status chip follows `self.list`, not `isAdmin`. Each page
  in D renders its catalogue version without the list. The dashboard
  summary hides when both counts are zero. The guest dashboard's library
  links equal the nav's library rows.

## Visible change

1. A `user` can change its own status, progress and plan flags, from the
   library, cards, dashboard and Seasonal. Today it is shown controls that
   fail.
2. The header becomes Track, Explore, Extras and System; Settings moves
   beside Requests.
3. Guests and shared accounts get Seasonal, Statistics and Future Releases
   in catalogue versions, with libraries and cards without personal
   columns. Shared accounts get the Random Picker; guests lose nothing
   they have today.
4. The dashboards differ per viewer as in Part E.
5. Gated release (migration).

## Questions for review

1. **Settled (owner): plain now, refined later.** Every P7 surface is
   built functional and plain from existing components and the design
   system, and marked **provisional UI** in the PR body, as P5's
   question 6. That covers the catalogue versions of Seasonal, Statistics
   and the Random Picker, the Future Releases markers, the dashboard
   summary, library links and recently added, the admin's dashboard, and
   Settings' place in the header. The owner reviews on the preview and
   sends designs afterwards.
2. **Settled (manager): merge order.** P7 merges after P3g, P3h, P4b and
   #354, so the admin's page (Part E) is built against a non-root admin
   and the summary's pending count against P4b's `pending`.
3. **Settled (manager): shared files with P5.** P5 goes first, and P7
   merges `feat/personal-data` in sideways before Parts A and C (see
   "Parts"). P5's builder confirmed that P5 moves no entry list write to
   `/api/me`, so Part A owns it. It mirrors `me_ratings.py` and builds on
   `ownData`, never on `personal`. P5 does not touch
   `installation_owner_id`, and P7 does not use it.
