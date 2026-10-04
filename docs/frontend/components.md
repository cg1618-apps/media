# Frontend Components, Data Layer and Theming

Last verified: 2026-10-04

**What this is for.** The building blocks under `frontend/src/` that pages are
assembled from: how data is fetched and cached, how auth and theme reach
components, the colour tokens that make light and dark mode work, the config
tables, the shared components by folder, the `lib/` utilities, and a checklist
for adding a media type. Page-by-page behaviour is in [pages.md](pages.md) and
[admin-pages.md](admin-pages.md).

## Directory layout

```
src/
  main.jsx            React root; the single QueryClient
  App.jsx             providers (Theme → Auth → Toast → Router) and routes
  index.css           Tailwind v4 import, theme tokens, light/dark palettes
  api/                client.js (fetchJson), endpoints.js (every URL)
  hooks/              react-query and UI hooks
  contexts/           AuthContext, ThemeContext, RestrictedPrefillContext
  config/             registries and vocab tables (see "Config catalog")
  lib/                pure helpers (naming, dates, layout, payloads…)
  utils/              media.js barrel, planNext.js, statsUtils.js
  components/         cards, hub, layout, forms, modals, plan, relations, tracker, info, charts
  pages/              public, detail, library (+configs), admin, add-tabs, modify-tabs,
                      defaults-tabs, notes (+sections), plan, statistics
  theme-tokens.test.js  guard against hard-coded greys
```

## Data layer

| Piece | What it does |
|---|---|
| `api/client.js` `fetchJson(url, init)` | `fetch` with `credentials: "include"`; parses JSON; **throws** on `!res.ok` with the server `detail`. There is no automatic redirect on 401 — a stale session surfaces as a thrown error. |
| `api/endpoints.js` | The only place URLs are spelled. `resource(type)` gives `list/detail/create/update/patch/remove/complete` for every `MEDIA_CONFIG` key; named groups for auth, options, roles, users, contentLabels, seasonal, announcements, watchOrder, mediaRelation, formDefaults, person, studio, credits, system, quotes, memes, resources (the Resources tree - plural, because `resource` is the media builder), dataControl. |
| `api/mutations/useResourceMutations.js` | `useCreateResource`, `usePatchResource`, `useDeleteResource`, `useReorderResources`: `useMutation` wrappers for `/api/resources` that invalidate `RESOURCES_QUERY_KEY` (`["resources"]`) when they settle. The reorder one also applies the move to the cache first (`applyReorder`) and restores the previous tree on failure. |
| `hooks/useApiQuery(key, url, {params})` | `useQuery` wrapper; key becomes `[...key, params]` when params exist. |
| `hooks/useMediaList(type, {params})` | List query keyed `["media-list", type, params]`; `LIST_OPTIONS = { params: { limit: 2000 } }` is the full-table convention. |
| `hooks/useMediaItem(type, id)` | Detail query keyed by `mediaItemQueryKey`. |
| `hooks/useMediaCacheUpdate(type, id)` | `setMediaItem`, `fetchMediaItem`, `invalidateMedia` for optimistic detail updates. |
| `hooks/useStatusToggle(type)` | PATCHes one field and writes through to both the item and every `["media-list", type]` cache entry (it maps over lists, which is why the plan-next query must live under its own key). |
| `hooks/useLibraryState` | Search/filter/sort/view state for `LibraryLayout`; nothing is persisted. |
| `hooks/useFilterState(filterDefs, data, initial?)` | The chip/toggle values for a list of FilterDefs, opened on `initial` (else empty), plus `toggleFilter`, `clearFilters` (all empty), `resetFilters` (back to `initial`), `activeFilterCount` and the derived options of `set-dynamic` defs. Shared by `useLibraryState`, the random picker and Picker Defaults; the defs and `initial` are read once, so a caller whose defs change remounts. `useEntityFilterState(filterDefs, data)` beside it is the entity libraries' (character, person, studio, publisher) form: `initial` is `defaultEntityFilters(filterDefs)`, and it adds `isDefault` (`sameFilters` against that default) so the page hands `FilterPanel` its `resetFilters` only once the state has moved off it. |
| `hooks/usePickerData(mode, typesKey)` | One random picker mode's entries (`{type, item}` over the types' lists, on the library pages' cache keys), its FilterDefs, its stored default filters resolved against them (`["random-picker-defaults", mode]`; unreadable defaults count as none), and `defaultWeighted` (true unless saved off). Shared by the picker and Picker Defaults. |
| `hooks/useFormDefaults` | Loads and applies `/api/form-defaults/<type>` to a fresh form (`resolveDefaults`, `coerceToShape`). Repeater defaults (source rows, game copies) arrive as arrays with any `system_id` stripped — a default row is a template that must insert, never update. The restricted source rows come from the picked prefill instead (`prefillPicks`, `startingSources`), and on h-comic from the region the form starts on. |
| `hooks/useGlobalMediaSearch(query)` | Debounced `/api/search/?q=&limit=10`, flattened to entry hits for pickers. |
| `pages/plan/usePlanData` | The Plan page's lists (franchise, series and the twelve entry types - `h-comic`, `h-game` and `hentai` each fetched only for a session that can see it) plus `["plan-next"]`. |

Query defaults (`main.jsx`): `staleTime` 30 s, `retry` 1, no refetch on window
focus. Query keys in use: `["media-list", type(, params)]`, media item keys,
`["plan-next"]`, `["quotes-grouped"]`, `["memes-grouped"]`, `["resources"]`, `["announcements"]`,
`["api","search",{q,scope}]`.

Two data idioms still coexist: react-query hooks (libraries, detail pages,
statistics, plan, quotes/memes, resources, search) and raw `fetch` in `useEffect`
(hub pages, Collection/Franchise libraries, seasonal pages, most admin
pages). Writes in the raw-fetch pages update local state only, so a status
toggled inside a hub does not update the library cache until it goes stale.

## Contexts

- **`AuthContext`** — `GET /api/auth/me` on mount; exposes `isAdmin`,
  `username`, `role`, `isRoot`, `permissions`, `visibleGatedTypes` (read
  through `lib/gatedTypes.js`, never directly), `loading`, `has(permission)`
  (root short-circuit) and `refetchAuth()`. `ProtectedRoute` and the nav
  gate on `has("admin")`; page controls gate on `isAdmin`. `refetchAuth()` is
  *not* how an identity change is applied: sign-in, sign-out and an
  access-mode switch each call `hardNavigate()` (`lib/hardNavigate.js`) and
  load the page again, because the cached answers around them belong to the
  outgoing identity. See `docs/authentication.md`.
- **`ThemeContext`** — `theme` (`"light"|"dark"`, what is on screen),
  `preference` (`"light"|"dark"|"system"`), `setTheme`, `toggle`. The choice is
  stored in `localStorage["cg1618:theme"]`; `"system"` follows
  `prefers-color-scheme` live. Its only DOM effect is
  `<html data-theme="…">`. `index.html` stamps the same attribute before the
  first paint (no flash). `useThemeOrLight()` returns `"light"` when no
  provider is mounted (leaf components rendered in isolation, e.g. the
  relations canvas).
- **`RestrictedPrefillContext`** — the form-defaults config, provided by the
  Add and Modify pages, so the Sources editors deep inside each tab prefill
  the names picked on `/defaults`. `usePrefillPicks(mediaType)` returns the
  type's `restricted_prefill`, or `null` (the built-ins) with no provider.

## Theming: light and dark mode

Colours are **semantic tokens** defined in `src/index.css` as Tailwind v4
`@theme` entries that reference runtime variables. Components use the token
utilities; the palette flips by `data-theme`.

**The hex values in the table below are the original pre-archive palette and
are no longer what `index.css` holds** — the archive redesign repainted every
token (bone paper, wisteria accent) without changing a single token *name*.
[design-system.md](design-system.md) is authoritative for the values; the table
here is still the right map of which token plays which role, and the conversion
table under it is still the rule for new code.

| Token (utility) | Role | Light | Dark |
|---|---|---|---|
| `canvas` (`bg-canvas`) | page background | `#f9fafb` | `#0b0f19` |
| `surface` | cards, tables, panels | `#ffffff` | `#111827` |
| `surface-2` | inset, hover, stripes, sticky sub-headers | `#f3f4f6` | `#1f2937` |
| `surface-3` | pressed / active pills | `#e5e7eb` | `#374151` |
| `text` | primary text | `#111827` | `#f3f4f6` |
| `text-muted` | secondary text | `#4b5563` | `#9ca3af` |
| `text-faint` | placeholders, icons, "None" | `#9ca3af` | `#6b7280` |
| `border` / `border-strong` | hairlines / inputs | `#e5e7eb` / `#d1d5db` | `#1f2937` / `#374151` |
| `brand`, `brand-hover`, `brand-soft` | accent | `#2563eb`, `#1d4ed8`, 6 % tint | same, 12 % tint |
| `ink`, `ink-text` | the nav bar (dark in both themes) | `#0f172a`, white | `#020617`, `#f8fafc` |
| `danger`, `success`, `warning`, `info` | state hues; tint with `/15` etc. | fixed | fixed |

Mapping used when converting existing markup (and the rule for new code):

| Old utility | Use instead |
|---|---|
| `bg-white` | `bg-surface` |
| `bg-gray-50` | `bg-canvas` on sticky headers that mask scroll-under; `bg-surface-2` elsewhere |
| `bg-gray-100` / `bg-gray-200` | `bg-surface-2` / `bg-surface-3` |
| `text-gray-900`, `-800` | `text-text` |
| `text-gray-700`, `-600` | `text-text-muted` |
| `text-gray-500`, `-400` | `text-text-faint` (`-300` → `text-text-faint/60`) |
| `border-gray-50/100/200` | `border-border`; `border-gray-300` → `border-border-strong` |
| `bg-brand/5` | `bg-brand-soft` |
| `bg-green-50 text-green-600 border-green-200` and similar tints | keep the hue; prefer `bg-success/15 text-success` for new code |

`src/theme-tokens.test.js` scans `src/` and fails on any
`(bg|text|border|divide|ring|placeholder)-(gray|slate|zinc|neutral)-N`
outside the allowlist: `Nav.jsx` / `NavSearch.jsx` (they sit on the ink
surface) and `bg-gray-900/800/700` (deliberate dark overlays over cover art).
The relations canvas passes `colorMode={theme}` to ReactFlow. `--font-sans`
is Noto Sans TC / Roboto, `--font-mono` Fira Code.

## Config catalog (`src/config/`)

| File | Holds |
|---|---|
| `mediaRegistry.js` | `MEDIA_CONFIG`: per type `statusField`, `apiEndpoint`, `navPath`, `statusType` (incl. collection/franchise/series). `statusType` is the status axis — `watch`, `read` or, for `game` and `h-game`, `play` (`statusField: "playing_status"`). `h-comic` (`read` axis), `h-game` (`play` axis) and `hentai` (`watch` axis) are registered like any other type; where they are drawn is decided by the gate below. Source for `endpoints.resource`. `MEDIA_TYPE_LABELS` / `mediaTypeLabel(type)` name a bare type key for display (the character page's groups, the entity libraries' Entry type chips). |
| `navigation.js` | `NAV_SECTIONS` (Library mega-panel, Restricted, Track, Insights, then Entry, Note and Admin with `requires: "admin"`), `activeItem`, `visibleSections(sections, has, canSeeType)` (filters rows as well as sections — Insights carries two `requires: "admin"` rows, and the Restricted section's H-Comic, H-Game and Hentai rows carry `gatedType: "h-comic"` / `"h-game"` / `"hentai"`, each dropped unless `canSeeType` says yes for its own type; left out, every gated row is dropped, and with them the Restricted tab, which holds nothing else). |
| `statusGroups.js` | `WATCHING_STATUS_GROUP`, `READING_STATUS_GROUP`, `PLAYING_STATUS_GROUP`, `AIRING_STATUS_CLS`; plus the picker groups (`STATUS_PICKER_GROUP`, `groupStatusOptions()`) that `components/ui/StatusOptions.jsx` renders as `<optgroup>`s. Filter buckets and picker groups are separate splits of the same vocabulary — and one `STATUS_PICKER_GROUP` map covers all three status axes, because no value means something different between them (Paused is Paused whether you watch, read or play). |
| `planNextGroups.js` | Size buckets and labels — a hand-kept copy of `app/utils/plan_next_kinds.py`; keep them in sync. `game` and `h-game` have **no** `SIZE_GROUPS` entry (as `anime-movie` has an empty one): there is no count a game groups by, so each Plan tab renders one ungrouped list. Their `ALLOWED_SCOPES` are entry/series/franchise for both `next` and `rewatch`. `h-comic` and `hentai` are absent from `SIZE_GROUPS` the same way, and are queued at entry scope only for both kinds. |
| `fieldOptions.js` + `useConstants.js` | Fallback enum arrays, overwritten in place by `/api/constants` once on mount — but only the arrays listed in `CONSTANTS_FALLBACK`. The seven game vocabularies (`GAME_TYPES`, `COMPLETION_LEVELS`, `GAME_RELEASE_STATUSES`, `GAME_STOREFRONTS`, `GAME_OWNERSHIP_KINDS`, `GAME_COPY_FORMATS`, `GAME_ACQUISITION_KINDS`) are **not** in that map, so they stay hand-maintained literals that must be kept matching `app/utils/constants.py` by hand — even though `/api/constants` does serve all nine game keys now. `PLAYING_STATUSES` and `GAME_IS_MAIN` (key `game_is_main`, game and h-game's own `is_main` vocabulary - Main, Remake, Remaster - beside the shared `IS_MAIN`) are the game lists that are a real fallback. `PRICE_CURRENCIES` is frontend-only: `game_copy.price_currency` is a free string on the backend. The seven h-game vocabularies (`H_GAME_PLAYSTYLES`, `H_GAME_LANGUAGE_AVAILABILITY`, `H_GAME_AUDIO_AVAILABILITY`, `H_GAME_H_PRESENTATIONS`, `H_GAME_ART_STYLES`, `H_GAME_H_ART_STYLES`, `H_GAME_PLATFORMS`) **are** in the map, under the `h_game_*` keys `/api/constants` serves only to a session that can see the type, and so is hentai's own `HENTAI_SOURCE_MATERIALS`, under `hentai_source_material`; a hentai also reads h-comic's originality and usefulness lists and anime's `AIRING_STATUSES`. `GENDERS` (a character's or person's gender, `/api/constants` key `gender`) is in the map; `CHARACTER_ROLES` (Main, Core, Supporting, Other; `/api/constants` key `character_role`) is in the map too, and serves both a casting's role and a character's own role; `castRoleRank(role)` is the cast-list sort every ACG detail page uses (that order, no role last). `NEW_CAST_CHARACTER_GENDER` is the per-media-type gender `CastEditor` gives a character it mints (女 for h-comic and hentai, unset otherwise). |
| `formFactories.js` | `freshForm(type)` defaults per form. `defaultGame` and `defaultHGame` start `is_main` on `"Main"` (`GAME_IS_MAIN`, where the other types start on `本傳`). `defaultHComic` starts with `region: ""`, so the form shows no region-only field until one is chosen. `defaultHGame` starts its six multi-choice fields (`dialogue_audio`, `sound_effect`, `h_presentation`, `art_style`, `h_art_style`, `platform`) at `null` - "not recorded", distinct from `[]` - and its nullable boolean `steam_progress_sync` at the `""` tristate. `defaultHentai` carries cartoon's `ep_total` / `ep_fin` pair and no typed `mal_id`: the write hook derives it from `mal_link`. |
| `formFields/fieldMeta.js`, `formFields/index.js` | Field metadata (label, control, option source, coerce) for defaults and autofill. |
| `mediaTypeColors.js`, `namingConfigs.js`, `adminTabs.js`, `weekdays.js`, `broadcastTimes.js` | Media-type chip classes (one ink chip for every type — colour never encodes a category); name-field order per type; the Add/Modify tab bar; schedule constants. |

## FilterPanel

`components/layout/FilterPanel.jsx` draws a list of FilterDefs (the shape is
documented in `hooks/useLibraryState.js`) as rows of chips, one row per def,
with **Clear all** when the caller passes `clearFilters` and a chip is on,
and **Reset** beside it when the caller passes `resetFilters` — the entity
libraries do while their state is off its default. Clear all empties every
group; Reset puts the caller's opening state back. Within a def the
chosen values OR; across defs they AND (`applyFilterDefs` in
`lib/libraryFilters.js`).

A `set` def may carry a **parent chip**:

```js
{ key, label, type: "set", options: [...], parent: { label, children: [...] }, match }
```

The parent is drawn after `options`, boxed with its children, which are
ordinary values of the same Set and are not repeated in `options` — so
`match` never needs to know the parent exists. Clicking the parent applies
`toggleParentValues(active, children)`: none or some children on → all on;
all on → all off; values outside `children` are untouched. A child chip
toggles only itself, and the parent shows active only while every child is on
(`isParentActive`). The panel reaches that state through the caller's own
`toggleFilter`, one call per child that changes, so any `useFilterState`
caller gets parent chips with no extra wiring. A parent with no children is
not drawn. The character, person and studio libraries use it for
**Restricted** over the gated media types.

## Shared components by folder

- **`components/layout`** — `Layout` (canvas shell: Nav, outlet, footer, toast,
  scroll buttons), `Nav` + `NavSearch`, `ProtectedRoute`, `Toast`,
  `MediaLoadingState`, `LibraryLayout` (search / sort / filters / grid-table
  scaffold), `FilterPanel` (the chip panel for a list of FilterDefs, used by
  `LibraryLayout`, the random picker, Picker Defaults and the entity
  libraries; see [FilterPanel](#filterpanel)) with its
  `FilterToggleButton` (the "Filters" button and active-chip count), `libraryColumns.jsx` (column and sort factories:
  `franchiseColumn`, `airingStatusColumn`, `myRatingColumn`, `malRatingColumn`,
  `imdbRatingColumn`, `watchButtonColumn`, `readButtonColumn`,
  `planFlagColumn`, `myRatingSort`, `malRatingSort`, `imdbRatingSort`,
  `usefulnessSort`),
  `GroupedEntryPage`, `CollapsibleCardGrid`, `CollapsiblePillRow`,
  `AdminTabBar`, `FittedName`, `TierBadge`.
- **`components/hub`** — `HubChrome` (`HubShell`, `GRID_CLS`, `Crumbs`,
  `AdminStrip`, `HeroCover`, `Field`, `HubTabs`, `Section`, `SELECT_CLS`,
  `pillCls`) and `HubStates`: the franchise/series/collection hub chrome in
  the archive look. `HeroCover` takes `cover`, the `{ url, focus }` a group
  resolver in `lib/covers.js` returns.
- **`components/cards`** — `MediaCard` (one card for all twelve types,
  `variant="future"`; its status button comes from `getCardStatusConfig(type,
  status)`, which dispatches on the watch / read / **play** axis, and its
  progress line for a game is `hours_played` against `hltb_main`, rendered
  only when at least one of the two exists; for an h-comic it is
  `progressFor(entry)` - pages on JP, chapters on KR, nothing without a
  region; for an h-game, which records no playtime, it is achievements
  earned against the total, drawn only when there is a total, and its meta
  line is the play style and language; a hentai, one entry being one
  episode, has no progress line, and its meta line is the release year and
  airing status. On `variant="future"` the status
  select comes from `FUTURE_STATUS_OPTIONS`, keyed on the same axis, and the
  bolt from `BOLT_RELEASE`, which names the column that says a title is still
  unreleased — `airing_status` for the watched types, `release_status` for a
  game. Its outside-score slot — the meta-line figure on anime, manga and
  novel, the cover stamp on an anime movie — reads whichever column
  `scoreField` names, defaulting to `mal_rating`, so a library sorted by an
  AniList figure can point every card at `anilist_rating` instead),
  `PlatformIcons` (an entry's available `main` access platforms — 動畫瘋,
  Netflix, Disney+ and the rest — drawn as their `lib/sourceIcons.js` icons on
  `MediaCard`'s poster and `DashboardCard`'s chip row; a row with a url links
  to it, one without is faded, and a value with no icon is skipped),
  `FranchiseCard` and `CollectionCard` (each takes `cover`, a resolved
  `{ url, focus }`), and `StaffCard`
  (`PersonCard` / `StudioCard` / `PublisherCard` over one shared body — the
  person, studio and publisher libraries and the `/search` staff sections all
  draw it; each carries the entity's `my_rating` as a `RatingStamp`, as the
  franchise and collection cards do; `PersonCard` shows `display_photo_file`,
  the server-resolved photo or fallback cover, positioned by
  `display_photo_focus`, the focus of whichever source won). Every card crops
  its image at the image's focal point (design-system.md, rule 9).
- **`components/tracker`** — `DashboardCard`, `NovelDashboardCard`,
  `NovelTrackerBlock` (the detail-page reading-progress widget; both drive
  the novel two-stage arc/chapter cursor via `arcStep` in `lib/novelUnits.js`),
  `ComicDashboardCard`, `GameDashboardCard`, `DashboardTable`,
  `MyTrackerCard`, `GameCompletionBlock` (the game detail page's four
  completion selects — game-only columns, so deliberately not folded into
  `MyTrackerCard`, which serves nine types. It takes its rows as `axes`:
  `GAME_COMPLETION_AXES` by default, and the h-game page passes
  `H_GAME_COMPLETION_AXES` - Completion Level, All Endings, All CG and
  usefulness, the other personal answer about a playthrough), `WeeklySchedule`,
  `ComingNext` (the dashboard's next-season block; its selection is the pure
  `selectComingNext` in `lib/comingNext.js`),
  `RelationsSection` (its optional `onRows` prop is handed every row the card
  loads, so the h-comic page names the hentai its derived animation status
  comes from without a second request), `WatchOrderSection`, `WatchOrderGuide`,
  `WatchOrderEditor` (steps and parts dragged by a grip, plus a typed
  position box; its move arithmetic is the pure `watchOrderLayout.js` beside
  it, which flattens the drawn blocks into a token stream - one token per step
  and per *empty* part - and turns every move into one `PUT /reorder` body:
  `item_ids`, `section_ids` and every part's `section_positions`).
  The four dashboard cards take a `view` prop (`"card"` | `"list"`). In
  `"list"` they reuse every derivation above their return and render one
  `<EntryRow>` from `DashboardTable` instead of a tile, so the dashboard's
  list view adds no second data path — a media type that gets its progress
  wrong gets it wrong in both views, which is the point. `DashboardTable`
  defines the five columns (Title, Type, Status, Rating, Progress) exactly
  once; a type writing its own `<td>`s would drift out of alignment with the
  others the first time a column changed. Because the four types measure
  different things, every row carries its unit in the Progress cell
  (`12/28 ep`, `97/364 ch`, `4/12 vol`, `44/144 iss`, `62/55 h`) — the column
  is five honest measurements rather than one dishonest one. There is no
  stepper in list view: a one-line row has nowhere to put a control without
  becoming a card again, so tracking stays in card view and on the entry
  page. The mode is chosen in the dashboard's one type-filter bar, is one setting
  for the whole dashboard, and persists per browser through
  `lib/dashboardView.js` (`cg1618:dashboard-view`) — never server-side.
  `MyTrackerCard` renders its −/input/+ stepper **only when the caller passes
  an `onEpChange`**; a game passes none, so its card shows status, rating and
  the To Replay checkbox alone rather than an inert `0 / undefined` counter
  (`statusLabel` and `rewatchLabel` are what relabel it "Playing Status" /
  "To Replay"). The stepper itself is the exported `EpisodeStepper`, so the
  hentai page, whose tracker fields are its own, puts the same control in
  its own slip.
  `GameDashboardCard` is a fourth dashboard card rather than a third arm
  inside `DashboardCard`: that file's `isReading` ternaries serve the
  watch/read pair, and a game's bar is read-only playtime against `hltb_main`
  (achievements when the game reports a total and no estimate exists), so
  there is no progress callback to thread through.
- **`components/info`** — `InfoCard` (+`InfoRow`), `NamingCard`, `ScoreBlock`,
  `SourcesCard`, `RatingDistributionBlock`, `AnnouncementBoard`,
  `ClubMembership` (see [Entity components](#entity-components-person-studio-and-character)).
  `NamingCard` shows an h-comic's own region's name only (JP or KR), and a
  character's, person's, studio's or publisher's four unprefixed names —
  the displayed one included — (`NAMING_CONFIGS.character` / `.person` /
  `.studio` / `.publisher`).
  `SourcesCard` reads the entry's `sources` array (server-ordered — access
  rows in `sort_order`/insertion order, never re-sorted client-side), splits
  it into `access`/`reference` sections by `row.kind`, titles the access
  section by media type through `accessHeading(mediaType)` — "Where to Watch",
  "Where to Read", or **"Where to Play"** for a game or an h-game — and renders the
  column-backed
  `malLink`/`anidbLink`/`ehentaiLink`/`imdbLink`/`comicvineLink`/`openLibraryLink`/`igdbLink`
  props beside the reference rows (`anidbLink` is a hentai's AniDB page, drawn after MyAnimeList as
  "AniDB"; `ehentaiLink` is an h-comic's gallery,
  drawn after MyAnimeList as "E-Hentai"), `steamLink` (a storefront, not a reference
  database) beside the **access** rows instead — the access section renders
  for a `steamLink` alone, so a game whose only place to play is its Steam
  page still gets one; an h-game's `dlsiteLinkJp` / `dlsiteLinkTw` render
  beside it the same way, as "DLsite (JP)" / "DLsite (TW)" — and the tag-field props (`originalSource`,
  `exclusiveSource`, `serializationPlatform`) as `Tag` chips above them — one
  component composing from both the `media_source` table and the surviving
  columns/tag fields, per the guiding rule in
  [business-rules.md](../business-rules.md#18-media-sources-appservicesdomainsourcespy-apputilscredit_rolespy).
  An `available === false` row still renders (muted, no link) — that state
  means "known not to be there", not "hide this row".
  Each row leads with its site's icon, looked up by exact name in
  `lib/sourceIcons.js` — the favicons are files under
  `src/assets/source-icons/`, bundled with the SPA and never fetched from the
  sites. Only `main` rows and the column-backed links are looked up: an
  Other or Restricted row's name is typed text, so it never gets an icon even
  when it matches one. `Official site` is the one exception to the map: every
  work has its own, so its icon is the entry's cover, passed in as `coverUrl`
  by each detail page — the same `/api/covers/` URL the page already shows,
  cropped to the square, so nothing is stored or fetched twice. An entry with
  no cover leaves the slot empty rather than shrinking the "No Image"
  placeholder into it. A name with no entry — `Cinema`, `Other`, or a
  vocabulary value added later — keeps an empty 16 px slot, so the names in a
  section stay aligned. A new `Platform` or `Reference Source`
  value gets an icon by saving its favicon there and adding its name to the
  map. The icon is what names the site, so no source link carries a `Tag`
  box beside it — the `Tag` chips are only the tag-field row above.
- **`components/forms`** — `FormField`, `ComboBox` (`onSelect(id, label)`;
  `rankMatches` orders what the typed text matches exact, then prefix, then
  contains, each tier in the order `items` came in — off by default, where
  matches keep the order of `items`; ten results at most),
  `MultiSelect` (two caps that read alike: `limit` is how many options the
  dropdown *shows* — `null` for all — and `max` is how many values can be
  *selected*, a pick past it replacing the oldest; single-value tag fields
  such as `exclusive_source` pass `limit={null} max={1}`),
  `SuggestInput` (a free-text input over a list of strings: opens on focus,
  narrows as you type through `lib/suggest.js` — prefix matches first, then
  contains, the option already typed left out — and keeps whatever is typed;
  ArrowUp/ArrowDown highlight, Enter or a press picks, Enter with nothing
  highlighted keeps the typed text, the first Escape closes the list and the
  next reaches the caller's `onKeyDown`; it is what replaces a `<datalist>`,
  and the app has none), `SuggestList` (see "Dropdown lists" below),
  `ReleaseDateInput`, `ScopePicker`, `OptionSubTabBar`,
  `OptionCategorySelect`,
  `ContentLabelPicker` (one owner-agnostic control for both Add and Modify —
  it takes `owner={{kind, mediaType?, id}}` and reads and writes an entry's or
  a **franchise's** label set through the one URL builder, so the two pages
  cannot drift; `LABELLABLE_TABS` exported beside it is the one list of tabs
  that carry labels, which is what closed the gap where `game` was missing
  from Add's list while Add's submit wrote labels anyway. Its `required` prop
  draws a gated type's required label checked and locked, and
  `saveEntryLabels` / `saveFranchiseLabels(id, keys, franchiseType)` add it
  back to the set they send),
  `SourcesEditor` (the one shared editor for every Add
  and Modify tab's `sources` field, replacing eight copy-pasted
  `source_other` editors; produces `access` rows for `main`/`other`/
  `restricted` platform pickers and always-`{kind:"reference", bucket:"main"}`
  rows for the Reference Source dropdown - which never takes a `usage` filter,
  since `usage` is Platform-only; `showAccess={false}` drops the access group
  outright, which is how a game gets a Sources card with references only;
  `restrictedSources` - `{ prefill, suggestions }`, looked up from
  `mediaType` and the picked prefill (`RestrictedPrefillContext`) in
  `lib/restrictedSources.js` unless passed, which h-comic does for its
  region - offers `suggestions` on the restricted rows through `SuggestInput` and a
  **Prefill suggested** button that adds the missing `prefill` names, without
  restricting what may be typed; `showRestricted={false}` drops the
  restricted group, which `/defaults` does since it picks those names
  separately. The same file exports `RestrictedPrefillEditor`, one prefill
  pick on `/defaults`: a list of names edited as restricted rows, every
  available name offered),
  `DefaultValueControl` (one field's editor on `/defaults`; for the repeater
  fields — `sources` everywhere, `copies` on game — it renders `SourcesEditor`
  and `GameCopiesEditor` themselves, so the default rows are built in the same
  UI that will show them on the Add form), `NovelUnitsEditor` (replaced `BelongingNovelsEditor`
  — edits the `novel_unit` rows the Add/Modify novel tabs send as `units`;
  kind choices come from `kindsForType(novel.type)` in `lib/novelUnits.js`,
  and previews each row's `unitDisplayKey` placeholder before save. The
  two-stage reading cursor stepper (`arcStep`, same module) lives in the
  tracker components below, not here), `QuoteForm`,
  `QuoteEntryPicker`, `MemeForm`, `MemeOwnerPicker`, `FamilyLineageFields`
  (the franchise and series pickers of the h-comic and hentai forms: it
  offers only the franchises of one franchise family, through
  `inFranchiseFamily`, so an h-comic and its hentai adaptation can share a
  franchise; retyping the franchise drops the series), `ChoiceChips` (a
  multi-choice field over a fixed vocabulary as toggle chips, for the h-game
  form's six lists: the value is a list or `null`,
  and two state chips, None and Unknown, set `[]` and `null` outright, so
  "none of these" and "not recorded" stay two answers; the list is rebuilt in
  vocabulary order on every toggle), `GameCopiesEditor`
  (the `game_copy` rows a game's or an h-game's Add/Modify tab sends as `copies`; controlled
  exactly like `NovelUnitsEditor` — the parent owns the array, every add /
  remove / edit / reorder goes out through `onChange` with `position`
  renumbered 1..n, and the array handed in is never mutated), `ImagePicker`
  (an inline "upload or choose from the library" control: upload
  (`POST /api/images`) and attach (`POST /api/images/{id}/attach`) are two
  separate calls made in sequence, since an image can exist in the library
  with no owner. A brand-new quote or meme has no `ownerId` until first
  saved, so attach is silently skipped in that one case — the upload still
  succeeds and hands back a storage key for the form to persist on save; once
  an `ownerId` exists, an attach failure (an unsupported owner type, or the
  content-label 404) is surfaced rather than swallowed. **Remove** is the
  inverse, with the same split: given an `ownerId` it clears the owner's image
  on the server at once (`DELETE /api/images/owners/{type}/{id}/{role}` —
  attachment, mirror column and the file downloaded for the owner) and only
  then empties the form, so the next Replace downloads a fresh cover; without
  one it only empties the form. A downloaded cover's URL belongs to the owner,
  not the picture, and the browser holds it for a day, so when a removed cover
  is replaced the picker refetches it with `cache: "reload"` and versions its
  preview URL. `compact` draws the same three actions on one line - a
  thumbnail and three icon buttons with the same accessible names - for a
  picker that sits among other cells. Given `onFocusChange` (and the current
  `focus`), it also offers **Adjust position** while it holds an image - an
  outline button in the full picker, a crosshairs icon button with that
  accessible name in the compact one - which opens `FocusPicker`; and every
  way of changing the picture (upload, choose, remove) calls
  `onFocusChange(null)`, because a focus belongs to the picture it was set on
  and the server resets it on every attach and clear for the same reason - a
  form that kept the old value would stamp it onto the new picture on save.
  The compact thumbnail is cropped, so it applies the focus; the full
  picker's preview is uncropped. Used by every entry Add/Modify tab, the
  person, character, publisher and studio forms (all with a focus),
  `QuoteForm` and `MemeForm` (without one: those images are drawn uncropped)
  and, compact and without an owner, each `CastEditor` row. No image field is
  typed by hand anywhere), `FocusPicker` (the modal behind Adjust position,
  in `LibraryModal`'s chrome: the whole image, uncropped, with a marker on
  the focal point; a click or a drag on the image moves it, and the arrow
  keys nudge it by 1% - 10% with Shift - while the marker has focus. Beside
  it, live previews of the image cropped to a 2:3 card and a square. **Reset
  to centre**, **Cancel** and **Done**; Done hands back `"X% Y%"`, or null
  for the centre, through `formatFocus`; Escape or the backdrop cancels).
- **`components/ui`** — `primitives.jsx` (see
  [design-system.md](design-system.md#primitives-componentsuiprimitivesjsx)) and
  `Sortable.jsx`, the one reorder control every list uses: `SortableList`
  (`ids`, `onMove(from, to)`, `disabled`, `layout="grid"` for a tile grid,
  otherwise the drag is locked to the vertical axis), `SortableItem` (one row,
  rendered as `as`, carrying the drag transform), `DragHandle` (the grip a row
  is picked up by, labelled `Reorder <label>`; ArrowUp / ArrowDown on it move
  the row one place and keep focus on it), `useDragSensors` (the shared
  pointer sensor - a press must travel 4 px before it is a drag) and a
  re-exported `arrayMove`. Built on dnd-kit's pointer events, not native HTML5
  drag - see [design-system.md](design-system.md#reordering-a-list).
  `CastEditor`, `NovelUnitsEditor`, `GameCopiesEditor`, `ClubMembership`,
  `NameEntriesSection` and `StructuredSection` use it directly; `ResourceTree`,
  `WatchOrderEditor` and the Fav 3x3 ranked list are not one flat list, so they
  build on dnd-kit's `useDraggable` / `useDroppable` with `useDragSensors` and
  the same ArrowUp / ArrowDown keys - the first two with the same grip and
  label, the ranked list by its whole row, which holds no inputs.
- **`components/modals`** — `AnnouncementModal`, `RemarkModal`,
  `MarkAiringModal`, `ReleaseDetailsModal` (the optional release date /
  broadcast slot / watch day prompt the detail pages' release button opens -
  see `pages.md`, Detail pages), `CreateNewEntityModal`, `FranchiseCreateModal`,
  `ConfirmModal` (a yes/no question in the same chrome - `title`, body as
  children, `confirmLabel`, `danger` for a destructive confirm, Escape
  cancels; the Resources page's delete prompt).
- **`components/plan`** — `PlanKindToggles`, `SizeGroupControls`.
- **`components/resources`** — `ResourceTree` (the `/resources` tree: nested
  collapsible groups, items, and for a manage.catalog holder every add, edit,
  delete and move control, sharing drag state through a context) and
  `ResourceMarkdown` (one item body through `react-markdown` + `remark-gfm`,
  no raw HTML, links to a new tab, prose styled with token classes only).
- **`components/picker`** — `ModeStrip` (the random picker's All-plus-types strip: links on `/random`, buttons with an unsaved dot on `/random-defaults`) and `PickerWeights` (the picker's Weights tab, rendered from the tables in `lib/pickerWeights.js`).
- **`components/relations`** — `RelationGraph`, `RelationNode`, `FanEdge`,
  `ConnectPopup`, `EdgeInspector`, `NodePanel`, `RelationForm`,
  `RelationTypeFilter`.
- **`components/charts`** — `BarChart` (div-based, vertical).
- **`pages/notes`** — `NotesContext.jsx` holds the data (`NotesProvider`,
  `useNotes`): it fetches the registry and the rows, owns the mutations, and
  dispatches a section on its shape. `NotesTemplate.jsx` holds the layout —
  `NotesBlocks` (every card, minus `hideSections` / `hideGroups`), `NotesGroup`
  (one group's sections with no card, for a screen placing it elsewhere) and
  the default export that wraps a provider around blocks. The split exists for
  the game detail page, which renders 待辦 Todo in its Progress slip and the
  rest at the bottom: two `NotesTemplate`s would be two fetches of the same two
  endpoints on one page.
- **`pages/notes/sections`** — one component per note shape (`TextSection`,
  `TextLinksSection`, `EpisodeTextSection`, `NameLinksSection`,
  `MusicTrackSection`, `QuoteSection`, `MemeSection`,
  `NameEntriesSection`, `StructuredSection`) plus `ui.jsx` chrome. The hidden
  `music_status` shape has no component: `NotesProvider` drops every section
  the registry marks `hidden` before layout, counting or rendering sees it.
  `MusicTrackSection` serves all four song lists (OP, ED, 插入曲, OST): song
  name; Song Type on OP and ED only, a `SuggestInput` over the section's
  `kind_category` values ("Song Type") starting on `default_kind`; the
  per-song status as a closed select; the episode; link pairs; and a remark.
  Save stays inert on a row carrying nothing but its prefilled type, and on a
  link label with no URL - the server's rules, mirrored. The **list status**
  sits in the card header (`SectionCard`'s `actions`), so it shows even while
  an empty list is collapsed: a compact mono `<select>` over
  `type_statuses` for an admin, a `brandTagCls` tag for anyone else. Its value
  is the `music_status` row whose `kind` is the section's key, which the
  provider hands in as `typeStatusNote`; with no row it reads
  `type_status_default`, and the first change POSTs the row, every later one
  PATCHes it. The provider also fetches the values of every category a
  section names (`kind_category`, `link_text_category`) from
  `GET /api/options/{category}?scope=<owner type>` once per page and passes
  them as `optionValues`; a category that fails to load is an empty list.
  **Link pairs** (`LinkPairs.jsx`, pure helpers in `linkPairValues.js` - not
  `linkPairs.js`, which Windows would resolve for `./LinkPairs`):
  `LinkPairsEditor` is a repeatable row of label and URL, the label a
  `SuggestInput` when the caller passes `textOptions` (a song's "Song
  Source") and a plain input otherwise (彩蛋's `link_pairs` field);
  `LinkPairPills` draws each stored pair as a `LinkPill` labelled with its
  text, falling back to the host. Stored URL strings read as pairs with no
  text. `NameEntriesSection` renders the `name_entries` shape — a titled
  list whose items are each `{type: "text" | "link", value, label}` stored in
  the note's own `entries` column, never in `links` — and offers a kind
  dropdown built from `section.kinds` when the registry declares any. **No
  section uses it today** — `side_quests` was the last and moved into 劇情列表
  Story List — but the component stays, because rows written before that are
  still in the database and a later section may want the shape.
  `StructuredSection` renders the `structured` shape, and is the one
  component here that does not know its own fields: it builds both the form
  and the read view from `section.fields`, the spec the backend registry
  serves. A field naming a `column` is sent at the top level of the payload
  and one naming none inside `fields`, which `fromNote` and `toPayload` are
  the only places to know. A `singleton` section loses its Add button once
  it holds its row, so that row changes by Edit; no structured section is a
  singleton today, but the rule stays with the component. It owns its own
  drag-to-reorder, because it orders a tree and groups rather than a flat
  list, and an inline
  `quick_edit` input that saves on blur without opening the row. For a
  `hierarchical` section it also draws the tree: an Add button per row opening
  a draft that carries that row's id as `parent_id`, children indented behind
  a rule, and a move - among a row's own siblings only - that flattens the
  whole tree depth-first (the reorder
  endpoint takes ids naming exactly the section, so a sibling-only payload is
  refused). Its owners are thirteen 攻略 sections, both 劇情 plot sections, the
  four 劇情列表 strands, the standalone `guide_resources` card and 亮點
  Highlights; `docs/systems/notes.md` lists each one's spec. Two registry
  features are rendered here and named nowhere else: a `names` field gets
  `NamesInput` (several free-text names, suggesting `nameSuggestions`), and a
  section with `group_by` reads as one group per name (`groupedRows.js`), the
  groups reorderable by the grip on each header (drag, or ArrowUp / ArrowDown)
  through `onGroupOrderChange` - every group grip disabled until the owner's
  save settles. A row there can sit in two groups, so the rows are not
  reorderable in the grouped view; a **Group by** toggle in the card header
  (remembered per section in the browser, like the one below) switches to the
  flat list, where they are. The
  provider passes both in from the owner page; `NotesContext` also drops a
  section whose `owner_where` the owner row fails (`ownerMatches`). A section
  with `groupable_by` gets a **Group by type** toggle (`SectionCard`'s
  `actions`) over the same grouped view, one group per `select` value; its
  groups and rows move by their grips - a row only within its own group
  (`movedRow` in `groupedRows.js`) - and each move goes to `onReorder` as the
  section's whole row order, grouped - nothing else stores the group order.
  `NotesTemplate`'s `SHAPES` map covers every stored shape but the hidden `music_status`.
  Every list section shows its first three rows and folds the rest behind
  "Show all (N)" - `useEntryCap` and `ShowAllToggle` in `ui.jsx`, one hook
  and one control shared by all of them rather than a copy per shape. The row
  being edited and the draft row are never folded away; `StructuredSection`
  caps top-level rows, or each group of a grouped section. Every list section
  is also reorderable by an admin, the same way: a `DragHandle` per row (none
  on the row being edited, none while there is only one row), each move sent
  to `onReorder` as the section's whole order for `PATCH /api/notes/reorder`,
  applied on screen at once through the provider's pure `withSectionOrder`,
  and the section's grips disabled until the save settles. The flat shapes
  share `useRowReorder`, `ReorderList`, `ReorderRow` and `ReorderHandle` in
  `ui.jsx`; a grip is labelled by `noteLabel` (the row's name, locator, text
  or first link). The rules are in `docs/systems/notes.md`.

## Dropdown lists

Every type-or-choose input opens the same list: `SuggestList`, with
`SuggestItem` for an option and `SuggestNote` for a line that is not one
("No matches found", "Loading entries to search from…", a "will be created
as new" hint), all from `components/forms/SuggestList.jsx`. Its users are
`SuggestInput` (among others, the notes Song Type and song-link label
inputs), `ComboBox`, `MultiSelect`, the notes `NamesInput`
(`pages/notes/sections/`), `EntryAutofillSearch` and the older Add tabs'
inline auto-fill boxes, the Add tabs' external search (`ExternalSearchBox`), and the
title search on Modify and on Delete. A new dropdown under an input uses it
too rather than drawing its own.

- **Portaled and fixed.** The list renders into `document.body`, placed
  under its anchor (`anchorRef`: the input, or the box around it), at least
  as wide as the anchor and 240 px tall at most, flipping above when there is
  no room below. It is placed again on every scroll (capture phase, since
  forms scroll inside their own containers) and resize, so no modal or
  scroll box clips it. `z-[95]` puts it over the modals (`z-50`) and the
  expanded relation graph (`z-[90]`), under the toasts (`z-[100]`).
- **A press picks on mousedown** and cancels its default, so the input never
  blurs before the pick lands — which matters to inputs whose blur commits
  the typed text (`NamesInput`, the cast editor's seiyuu line). The list also
  stops mousedown from reaching `document`, so the "click outside closes it"
  listener every one of these components keeps still treats a press on the
  portaled list as inside.
- **Keyboard.** `SuggestInput`, `ComboBox`, `MultiSelect` and `NamesInput`
  move a highlight with ArrowUp/ArrowDown (`stepActive`), keep it in view,
  and take it on Enter; with nothing highlighted, Enter does what it did
  before — `SuggestInput` and `NamesInput` keep the typed text, `MultiSelect`
  adds it, and `ComboBox` leaves it to the form. The search pickers are
  pointer-only.
- **Look.** `rounded-md border border-border bg-surface p-1 shadow-lg`;
  an option is `rounded-sm px-3 py-1.5 text-sm`, one line and truncated, and
  the highlighted or hovered one is `bg-brand-soft text-brand`. A rich row
  (title over subtitle, a cover) passes `truncate={false}`.

## The access-mode admin pages (`pages/admin/`)

`AccessModes.jsx` and the panel inside `Users.jsx` edit the **object axis** -
which entries and fields a session can reach. Both are shaped on their role
equivalents so the pair read the same way, and both carry one control whose
shape is a guarantee rather than a style choice.

| Control | Shape | Why it cannot be a checkbox / free field |
|---|---|---|
| Guest default (`AccessModes.jsx`) | **no control at all** | A logged-out visitor always resolves the `safe` mode, which is what that mode means rather than something an administrator picks. There is no column to store a choice, so the page offers none; `safe`'s own description carries the fact. |
| Per-account denials (`Users.jsx`) | **the mode's own list, tick-to-deny** | Denials only subtract - an account's reach is always a subset of its mode's - so showing the ceiling and letting you remove from it is structurally incapable of naming something outside it. |
| Login default (`Users.jsx`) | a radio among the modes that account **holds** | It cannot drift out of the granted set, which is the same guarantee the partial unique index gives in the database. |

**`homelessLabelKeys` is exported for its tests**, and is the one piece of
logic on either page that can be wrong in a way nobody would notice. A content
label carried by no mode hides its entries from everyone, the owner included;
the warning computes from the **draft**, so it appears the moment the last
mode carrying a label is unticked - while it can still be reconsidered -
rather than after a save and a reload, by which point it is a record rather
than a warning.

An account holding **no** mode is called out in red on the users table. It
reaches nothing, which is fail-closed and correct and looks exactly like a
broken site.

Both pages sit behind `admin.authz` on **both** SPA permission surfaces -
`App.jsx`'s route gate and `navigation.js` - and the nav link inherits the
admin section's `requires` rather than declaring its own.
`navigation.test.js` asserts that inheritance, because a second declaration
is a second place to keep in step.

## `lib/` utilities

| File | Purpose |
|---|---|
| `naming.js` | `getDisplayName`, `getSortName`, `cleanString`, name-field lists |
| `releaseDate.js` | `releaseYear`, `releaseScore` for truncated-ISO dates |
| `suggest.js` | What a type-or-choose input offers for the typed text: `rankByMatch(items, typed, keyOf)` (exact, then prefix, then contains, each tier in the given order) and `suggest(options, text)`, `SuggestInput`'s matcher (case-insensitive, the option already typed left out) |
| `peopleOrder.js` | `byRatingThenAppearances(people)`: a person picker's best-first order before typed-text matching — `my_rating` by `getRatingWeight` (unrated last), then `credit_count`, most first; stable. The cast editor's seiyuu box uses it |
| `formatters.js` | `getSourceValues(sources, source)` (filters the `fetchAllSources()` bag by category/scope/**usage** for a `ComboBox`) and display formatters |
| `payloads.js` | form state → request body for every media type, including mapping the `SourcesEditor` array into the `sources` write-payload key. `hComicFieldsPayload` and `hGameFieldsPayload` never send `highlight_group_order`: the detail page's drag owns that column, and a form save leaves it alone. `hGameFieldsPayload` sends a multi-choice list through `choiceList(value, vocabulary)` - `null` stays `null`, a list (`[]` included) goes in vocabulary order. `hComicFieldsPayload` leaves `animation_status` out while `animation_status_source` is `"derived"`, since the server refuses (422) any value but the served one. `hentaiFieldsPayload` and `hComicFieldsPayload` send `mal_id` only beside a `mal_link` - the write hook derives the id from the link. Every entry body's `sources` goes through the one `sourcesPayload` |
| `autofill.js`, `ensureSourceValues.js` | fill a form from a picked row; keep option sources consistent |
| `covers.js` | `getCoverUrl`, `FALLBACK_SVG` (`/api/covers/<key>` on every host — the route applies the same visibility gates the API does — except a `library/`-prefixed key — an uploaded image — which resolves to `/static/<key>` instead, since a library file's content-hash name says nothing about an entry. The app serves its own images off local disk, so there is no hostname switch and no bucket URL). `withMediaType` for tagging a fetched list so the convention-filename fallback knows which folder to look in — an untagged entry falls back to the placeholder rather than a broken URL plus the grouping-tier resolvers `getFranchiseCover` / `getSeriesCover` / `getCollectionCover`, which return `{ url, focus }` (`NO_COVER` is the centred placeholder): a borrowed cover keeps the focal point of the entry it came from, and a convention-filename cover is centred. The focal-point helpers: `focusStyle(focus)` (the `objectPosition` style a cropped `<img>` takes, undefined when centred), `entryCover(entry)` (an entry's own `{ url, focus }`), and `parseFocus` / `formatFocus` (`"X% Y%"` to `{ x, y }` and back, whole percentages clamped to 0..100, the centre stored as null). `getSeriesCover` takes one flat combined list and its caller must pass **every** entry list the page loaded: a series whose `cover_entry_id` points at a type left out silently falls back to the placeholder. Passing fewer lists than the page loaded is the standing bug here, and it fails silently. Also `isLocalHost` and `getQuoteImageUrl`: quote images live under `static/quotes/`, and a `library/`-prefixed key (an uploaded quote or meme image) resolves the same way `getCoverUrl` resolves one — off the localhost hold, which only ever existed because there was no way to get a file onto the machine at all |
| `status.js` | status button configs (`getStatusButtonConfig`, `getReadingButtonConfig`, `getPlayingButtonConfig`) and `getCardStatusConfig(type, status)`, which picks between them from two `Set`s (`READ_TYPES`, `PLAY_TYPES`) rather than a chain of `||` — a tenth media type is one entry, not another ternary arm |
| `sources.js` | **not** related to `media_source`/`SourcesCard` despite the name — `fetchAllSources()` is the generic `{options, studios, publishers, people}` suggestion bag every Add/Modify dropdown (`ComboBox`, `SourcesEditor` included) draws from. `people` and `publishers` are **maps**, not flat lists: people fan out by `{role, scope}` and publishers by media type, one `/api/publisher/?scope=` request per scope, because a publisher is offered only where its `publisher_scope` rows say — a games publisher must not be suggested as an anime distributor. Studios stay a single flat list; they have no scope concept. Same naming collision as "label" - see [`CLAUDE.md`](../../CLAUDE.md) |
| `enrich.js` | `enrichEntry(type, id)`: POST replace, re-read the entry, `null` on failure |
| `relationLayout.js`, `relationHandles.js`, `relationUndo.js` | pure graph layout (union-find contraction, dagre), handle geometry, undo stack |
| `textFit.js` | width measurement for `FittedName` |
| `clipboardImage.js` | copy an image to the clipboard (quotes/memes) |
| `resourceTree.js` | The Resources tree's move arithmetic, pure: `findNode`, `parentIdOf`, `childrenOf`, `countDescendants`, `countByKind`, `flattenGroups`, `canDropInto` (refuses a group into itself or any descendant, and an item as a parent), `moveAmongSiblings` and `moveInto` (each returns the reorder body `{parent_id, ordered_ids}` - the complete new child list - or `null`), and `applyReorder` for the optimistic cache update |
| `gatedTypes.js` | The gated-type question - see [Gated media types](#gated-media-types). `GATED_TYPES`, `canSeeGatedType`, the list filters, and `REQUIRED_LABEL_FOR_TYPE` (mirrors the backend's) with `requiredLabelsForType` / `requiredLabelsForFranchiseType`. `FRANCHISE_FAMILY_FOR_TYPE` mirrors the backend's franchise families - `H-Comic` and `Hentai` are one family, `h-comic` - and `inFranchiseFamily(franchiseType, family)` asks whether a comma-joined `franchise_type` names a type of it |
| `hComicAnimation.js` | An h-comic's animation status, hand-set or derived. `isDerivedAnimationStatus(entry)` (`animation_status_source === "derived"`: a hentai adapts it) and `adaptingHentai(rows)` (the stored, reverse-direction `adaptation` rows of a relation card whose far end is a hentai, as their `other` endpoints) |
| `hComicRegion.js` | Which h-comic fields a region uses, the novelUnits pattern for a variant-dependent form. `REGION_ONLY_FIELDS` (JP: `h_comic_name_jp`, originality, animation status, series number, page total and `page_fin`; KR: `h_comic_name_kr`, chapter total, `ch_behind`, `ch_fin`, author, official source, `highlight_group_order` - the catalogue and reader columns mirror the server's `REGION_CLEARS` / `LIST_REGION_CLEARS`), `showsField(region, field)` (a region-only field shows on its region and on none while the region is unset), `clearedForRegion(form)` (blanks the other region's fields before a save; names are kept, and the KR-only author and official source - credits the server does not clear - are cleared here), `progressFor(entry)` (pages on JP, chapters on KR) |
| `restrictedSources.js` | The restricted sources each media type offers, fixed in code, per variant (`all`, or h-comic's `JP` and `KR`), with each variant's built-in prefill - the table is in [Admin Pages](admin-pages.md#add-addjsx). `picks` below is the type's `restricted_prefill` from `/defaults` (null for the built-ins). `prefillVariants(mediaType)` (`[{ key, label, names, builtIn }]`, for `/defaults`), `restrictedSourcesFor(mediaType, region, picks)` (`{ prefill, suggestions }`: the picked names, then those plus every other name; `region` matters only to h-comic, where an unset region gets what both regions prefill), `withRestrictedSources(rows, names)` (adds the missing ones), `defaultRestrictedSources(mediaType)` (the built-in rows every `formFactories.js` factory with a list starts from), `startingSources(mediaType, rows, region, picks)` (a configured `sources` default with its restricted rows replaced by the pick), `followRegion(rows, from, to, picks)` (h-comic's Add form region change: drops the old region's prefilled names only while untouched - no url - and adds the new region's) and `mergeHComicAutofill(form, patch, picks)` |
| `hComicForm.js` | `hComicSourceFields(form, split)`: the credit and tag fields the h-comic Add and Modify saves hand to `ensureSourceValues`, each person source with its role and `h-comic` scope |
| `hGameForm.js` | `hGameSourceFields(form, split)`: the same for h-game - the developer (a studio) and the five tag fields, every option source scoped to `h-game` |
| `hentaiForm.js` | `HENTAI_SOURCES` and `hentaiSourceFields(form, split)`: the same for hentai - the studio (unscoped), the director (role and `hentai` scope) and h-comic's three H genre vocabularies asked for under the `hentai` scope. `fieldMeta.js` reads `HENTAI_SOURCES` too, so the defaults page suggests from the lists the form does |
| `novelUnits.js` | `NOVEL_UNIT_KINDS_BY_TYPE` (hand-mirrored from `app/utils/constants.py`, pinned by `config/novelUnitKinds.test.js`), `kindsForType`, `unitDisplayKey`, `arcStep` (frontend mirror of `normalize_arc_progress`) |

## Testing conventions

Vitest + Testing Library under `src/**/*.test.{js,jsx}` (setup in
`src/test-setup.js`). Components that read a context need its provider in
the test (`ThemeProvider` for `Nav`, `ToastProvider` + `AuthProvider` for
`LibraryLayout`). Prefer `fireEvent.click` for ReactFlow nodes (d3-drag reads
`event.view`, which jsdom leaves null on user-event's mousedown). Run with
`npm run test:run`; `npm run lint` must report 0 errors.

## Detail-page URLs

Every detail page is addressed `/<type>/<public_id>/<slug>` - `/anime/47/cowboy-bebop`.

- **`public_id`** is the short per-table integer from the API (see
  [../data-model.md](../data-model.md)). The route param is `publicId`; each
  page passes it straight to its initial fetch, and the endpoint accepts it or
  a UUID. **Everything after that lookup still uses the row's own
  `system_id`**, which the pages take off the fetched entity - writes, nested
  `/entries` calls and `franchise_id` / `series_id` / `collection_id` list
  filters all still speak UUIDs. A bare-UUID URL therefore still loads; the
  address bar simply corrects itself.
- **The slug is decorative** - nothing reads it. It is Latin-first
  (`name_en`, then `_roman`, then `_alt`) and **omitted entirely** for an
  entry with only a CJK name, because a CJK slug percent-encodes to mush the
  moment it is copied out of the address bar. Capped at 60 characters on a
  word boundary.
- **`lib/entityPath.js` is the only place allowed to build one.**
  `entityPath(type, entity)` returns `""` when the entity has no `public_id`,
  so a call site must render plain text rather than an empty `to=""`. The
  guard test `src/lib/noUuidLinks.test.js` walks `src/` and fails the build on
  any inline `` `/type/${...}` `` construction.
- **`hooks/useCanonicalPath.js`** rewrites the bar to the canonical path once
  the entity loads - adding a missing slug, replacing a stale one after a
  rename. It uses `navigate(..., { replace: true })`, so the back button still
  leaves the page in one press.

## Gated media types

A **gated type** is a media type whose every entry carries a required content
label - today `h-comic`, `h-game` and `hentai`
([authorization.md](../authorization.md#gated-types)). A session whose access
mode lacks the label is not told the type exists: the server withholds its
entries, vocabularies and constants, and `GET /api/auth/me` names in
`visible_gated_types` only the gated types the session may see.
`AuthContext` exposes that list as `visibleGatedTypes` (empty until
`/api/auth/me` answers, so nothing gated flashes on screen first).

**One helper asks the question: `lib/gatedTypes.js`.** `canSeeGatedType(auth,
type)` is true for an ungated type and, for a gated one, only when the server
named it. `visibleMediaTypes`, `visibleByType` (any list of objects naming a
type) and `visibleFranchiseTypes` (drops `H-Comic`, `H-Game` and `Hentai` with
their types) filter lists through it. Every surface of a gated type goes
through one of them, never a literal `"h-comic"`, `"h-game"` or `"hentai"`
test, and each type is asked about on its own - a session may see one and not
another:

| Surface | How it asks |
|---|---|
| `App.jsx` routes `/library/h-comic`, `/h-comic/:publicId/:slug?`, `/random/h-comic`, `/library/h-game`, `/h-game/:publicId/:slug?`, `/random/h-game`, `/library/hentai`, `/hentai/:publicId/:slug?` and `/random/hentai` | `<ProtectedRoute gatedType="h-comic">` / `gatedType="h-game"` / `gatedType="hentai"`, declared before `/library/:type` and `/random/:type` - a signed-in narrow session is sent home, a signed-out visitor to login |
| Nav rows (Restricted → H-Comic, H-Game, Hentai) | `gatedType` on each item in `config/navigation.js`; `visibleSections(sections, has, canSeeType)` drops it, and drops the Restricted tab once no gated row is left in it. Both permission surfaces ask the same helper, and `navigation.test.js` pins the pair |
| Add / Modify / Delete / Form Defaults tab | `AdminTabBar` filters every tab list through `visibleByType` |
| Nav search scope, Plan tabs, Completions tabs, Random Picker mode strip and media-type chips, Quotes filter, image owner-type filter, watch-order type filter, Control Center Fill (and, for h-game and hentai, Replace) button, `PersonSubTabBar` Club tab, Franchise Library filter chip | `visibleByType` / `canSeeGatedType` at the list |
| Favourite grids (the h-game franchise and entry grids) | `gatedType` on the grid in `config/favoriteGrids.js`; `visibleFavoriteGrids(auth)` filters them for the statistics page and the admin 3x3 editor, and the statistics sidebar drops their links the same way |
| Options scope picker (`ScopePicker`, both Options tabs) | `visibleMediaTypes` over the list it is handed, so the `MEDIA_TYPES` fallback drawn before `/api/constants` answers does not name a hidden gated type either |
| Lists fetched only when visible | `usePlanData`, `Completions`, `RandomPicker`, `useStatisticsData` (the h-comic, h-game and hentai rating cards and the h-game favourite grids), `SeriesPage` (h-games only under an `H-Game` parent franchise, hentai only under one of the h-comic family) and `FranchiseLibrary` (which waits for `/api/auth/me`) |
| Club membership on the person page | `ClubMembership` renders, and fetches, nothing for a narrow session |

What a gated type's surface does **not** filter is what the server already
answers empty for a narrow session: the `h-comic`, `h-game` and `hentai` search buckets
(left out altogether, and read as `results[type] ?? []`), the profile groups,
a franchise hub (only a franchise of the h-comic family, `H-Comic` or
`Hentai`, asks for h-comics and hentai, and only an `H-Game` one for h-games;
each is hidden with its label). Hiding in the SPA is
cosmetic in every case.

A gated type's **required label** is locked on in `ContentLabelPicker`
(`required` prop, from `requiredLabelsForType` / `requiredLabelsForFranchiseType`)
and added back by `saveEntryLabels` / `saveFranchiseLabels`, because the
content-label endpoints refuse (422) a set that drops it.

## Adding a media type on the frontend

1. `config/mediaRegistry.js` — add the key (hyphenated), `apiEndpoint`, `navPath`, `statusField`, and its `MEDIA_TYPE_LABELS` label.
2. `config/namingConfigs.js`, `mediaTypeColors.js`, `statusGroups.js` if it needs its own name order, chip key or status group.
3. `pages/library/configs/<type>.jsx` + register in `configs/index.js` — filters, sorts, columns (reuse `libraryColumns`).
4. `pages/detail/<Type>.jsx` (+ `<Type>Notes.jsx`) and the two routes in `App.jsx` (the detail one is `/<type>/:publicId/:slug?`); note sections in `app/utils/note_sections.py`. Give the model a `public_id` and its sequence, add it to the response schema, read the route's `publicId` for the initial fetch only, call `useCanonicalPath(type, data)`, and link to the new type through `entityPath` — the `noUuidLinks` guard fails the build otherwise.
5. `pages/add-tabs/<Type>AddTab.jsx`, `pages/modify-tabs/<Type>ModifyTab.jsx`, entries in `config/adminTabs.js`, `formFactories.js`, `formFields/fieldMeta.js`, `lib/payloads.js`, and the submit/save handlers in `Add.jsx` / `Modify.jsx`. Export the field body from the Add tab and render it from the Modify tab, the way `GameModifyTab` renders `GameAddTab`'s `GameFormBody` and `GameLineageFields` — the comic pair keeps two near-identical files and can drift.
6. `Delete.jsx` `MEDIA_KEYS`, `pages/plan/usePlanData.js`, `pages/statistics/useStatisticsData.js` (+ `StatsCompletions.jsx`, `utils/statsUtils.js`), `Index.jsx` divisions, `Completions.jsx`, `Search.jsx`, `NavSearch.jsx` scopes and quotas, `GroupedEntryPage.jsx` `MEDIA_TYPE_FILTERS`, `navigation.js`, `lib/status.js`, `lib/randomPicker.js` `PICKER_TYPES`, `libraryColumns.jsx`, `planNextGroups.js`, `mediaTypeColors.js`, and `scopeColors.js` plus the three `--c-scope-*` palettes in `index.css`.
7. Backend first: registry spec, pipeline spec, sheet tab — see [../entry-types.md](../entry-types.md).
8. A **gated** type (one naming a required label) also needs its key in `GATED_TYPES` (and a franchise type stamped only for it in `GATED_FRANCHISE_TYPES`) in `lib/gatedTypes.js`, its nav row given `gatedType`, its library, detail and `/random/<type>` routes wrapped in `<ProtectedRoute gatedType>`, and every list above that names it rendered through the helper - see [Gated media types](#gated-media-types). `h-comic` is the worked example, and `h-game` the second: a gated type that is another type's copy (Game's) reuses that type's components - `ExternalSearchBox` takes a `searchUrl`, `GameCompletionBlock` takes `axes`, `SourcesCard` takes the extra storefront links - rather than forking them. `hentai` is the third, and the first to share a franchise family with another type: a gated type whose franchise may hold another family member's entries lists its franchise type in `FRANCHISE_FAMILY_FOR_TYPE`, uses `FamilyLineageFields` for its pickers, and has the hubs ask `inFranchiseFamily` rather than test the franchise type.

## Entity components (person, studio and character)

| Component | What it is |
|---|---|
| `forms/PersonSubTabBar.jsx` | The seven person types (`PERSON_SUB_TABS`; the Club tab carries `gatedType: "h-comic"` and is drawn only for a session that can see the type), shared by the admin Modify / Delete pages and by the `/library/person` type filter, so one vocabulary drives all three. It filters a list; the Add page has no list and so no bar, and it never scopes the editor, because a person is one row that may hold several types. `withAll` puts `ALL_PEOPLE_TAB` first — the admin pages pass it so a person holding no type is reachable; it is not in `PERSON_SUB_TABS`, so the library filter and the form never see it. Renders through `SubTabBar`. |
| `forms/SubTabBar.jsx` | The underlined tab strip that splits an admin entity list by type: `PersonSubTabBar` renders through it, and the character Modify / Delete pickers pass it `characterRoleTabs(CHARACTER_ROLES)`. Filters what is listed, never the editor. |
| `forms/ScopeChips.jsx` | The media-type chip row over the person, studio, publisher and character pickers on Modify and Delete. OR match, none ticked means any scope, and fewer than two choices draws nothing. What a record's scopes are lives in `lib/entityScopes.js`: a person's (role, scope) rows, a publisher's stored `scopes`, a studio's or character's credited `media_types`; the choices are read off the list in `MEDIA_TYPES` order, so a type the server withheld is never offered. |
| `forms/OptionSubTabBar.jsx` | The Options / Tags halves of the System Option tab. People and studios were once entries here. |
| `forms/OptionCategorySelect.jsx` | The Tier 2 category dropdown on all three admin pages — Add's Category field, Modify's and Delete's "select a category" filter. A closed `<select>`, so Add can no longer coin a category by typing one; its `<optgroup>`s come from `groupTier2Categories` (`lib/optionsPageGroups.js`), the same arrangement `/options` reads, and a list yielding one section renders flat. |
| `add-tabs/PersonAddTab.jsx` | Exports `PersonFields` (the editor) and `useRoleScopes` (the legal role → media-type map from `GET /api/person/role-scopes`), both reused by `modify-tabs/PersonModifyTab.jsx`. |
| `forms/EntityProfileFields.jsx` | The profile inputs `CharacterFields` and `PersonFields` share: `GenderRatingFields` (Gender — "—" plus `GENDERS` — and My Rating — "Unrated" plus `MY_RATINGS` — as closed selects storing `""` for unset, which the savers send as null) and, on Modify only (an unsaved row has no entries), `PhotoFallbackField`: "— Auto (latest with cover) —" plus the row's entries from `GET /api/{character\|person}/{id}/entries`, once each (`uniqueGroupEntries`), labelled `name (year) [type]` like the franchise cover picker. Its hint follows `ownerType`: a character's chosen entry lends its casting photo before its cover, a person's only its cover. It writes `photo_fallback_entry_id`, which the Modify tab's `PUT` carries. |
| `info/EntityProfileControls.jsx` | The admin controls every entity detail page shares — character, person, studio and publisher: `AdminToolbar` (the dashed Admin strip with **Quick edit** to `/modify?id=<system_id>&type=<character\|person\|studio\|publisher>`), `RatingSelect` (Unrated plus `MY_RATINGS`, saving on change), `RemarkEditor` (a textarea saving on blur — emptied is null, untouched saves nothing) and `useEntityPatch(ownerType, systemId, onSaved)`, which PATCHes the partial body to `endpoints.{character\|person\|studio\|publisher}.patch(id)`, hands the response to `onSaved` and toasts. |
| `lib/entityFilters.js` | The entity libraries' FilterDefs and their shared default. `characterFilterDefs(auth)` (Entry type, Role — the character's own `role`, with Not set for null — My Rating, Gender); `personFilterDefs(auth, role?)` (Type — the `PERSON_SUB_TABS` roles — then Entry type, My Rating, Gender; with a `role`, as on `/library/seiyuu`, no Type group); `studioFilterDefs(auth)` and `publisherFilterDefs(auth)` (Entry type, My Rating, and **Country** — a `set-dynamic` def over the countries on record, plus Not set when a row has none). Entry type offers the entity's plain types, then **No entries**, which matches a row whose `media_types` is empty, then a **Restricted** parent over the gated types the entity can have — h-comic and hentai for a character, those and h-game for a person, hentai and h-game for a studio, none for a publisher — keeping only the ones `canSeeGatedType` allows. It matches `media_types`, and for a publisher `media_types` ∪ `scopes`, so one offered on a type but not yet credited on it is still found there. Rating, gender, role and country add Unrated / Not set for null. `defaultEntityFilters(defs)` is the state every entity library opens on: Entry type holds its plain options and No entries, so the restricted types start off, and every other group is empty. |
| `info/PersonLinks.jsx` | `creditValue(item, role, legacyValue)` for an InfoCard credit row: links built from `credit_refs` when the entry has them, the legacy comma-joined string when it does not — which is also what a viewer without the Credits permission sees. `creditLabel(item, role, fallback)` takes the heading from the ref, so 原作 / Author / Writer stays owned by `credit_label()` on the backend. |
| `info/StudioLinks.jsx` | The same pair for `studio_refs`, without a role key. Generalised over its detail route rather than copied for the third entity: `StudioLinks` takes a `base` prop (default `/studio`), `studioValue(item)` reads `studio_refs`, and `publisherValue(item)` reads `publisher_refs` with `base="/publisher"`. A game's Production card uses both — Developer through `studioValue` (a developer *is* a studio), the publisher row through `publisherValue`, and the same publisher row now appears on Anime, AnimeMovie, Manga, Novel and Comic. `publisherLabel(item, fallback)` beside them returns `publisher_refs[0].label` — the backend's `credit_label("publisher", media_type)` — so no page hard-codes 台灣代理商 or 發行商; the fallback literal is only reached on an entry with no publisher credited yet. The duplicate `info/PublisherLinks.jsx` was **deleted**: nothing imported it, and a second label mechanism beside this one is how the two drift apart. |
| `forms/PublisherScopePills.jsx` | One row of media-type pills (Anime, Anime Movie, Manga, Novel, Comic, Game) on the Publisher Add and Modify tabs, writing the `scopes` list the POST/PUT body carries. `PersonRoleMatrix`'s shape with no role axis to cross it against — a publisher holds exactly one role. Clicking a held pill removes it; this is the only path that *narrows* a publisher, since credit writes and `POST /api/publisher` are additive. The toggle rebuilds the list in the component's own order rather than appending, so the value posted does not depend on click order. Mirrors `legal_scopes("publisher")` in `app/utils/credit_roles.py`: a seventh media type added there must be added here. |
| `forms/EntryAutofillSearch.jsx` | The Add tab's "Auto-fill from existing entry" box, used by the game, h-comic, h-game and hentai tabs: filters `items` client-side on the names `names(item)` returns (up to ten hits, each titled by `title(item)`, badged by `badge(item)` and subtitled with its franchise from `franchises`), and hands the picked entry to `onPick`, clearing itself. Owns its query, dropdown and click-outside; which fields a pick copies is the caller's (`buildAutofillPatch`). `loading` disables it while the tab's list is still arriving. The older Add tabs inline the same markup. |
| `forms/ExternalSearchBox.jsx` | The Add tab's external search, under the auto-fill box on every media tab and alone on person and character: searches `searchUrl(q, limit)` (an `api/endpoints.js` builder) on MAL, TMDB, Open Library, Comic Vine or IGDB, all of which answer the same `ExternalSearchResult` rows, and hands the picked row to `onPick`, clearing itself. `source` names the source in the placeholder, the aria label (`Search <source>`) and the notes. As-you-type by default (350 ms debounce, two characters minimum, stale answers dropped); `submitOnEnter` searches only on Enter, for Comic Vine's 200-an-hour budget. Enter never submits the surrounding form. A failed search shows the server's `detail` (a 502) or a generic line for a network failure, never "No matches". Rows show the cover (`data-focus="none"`) or a placeholder block, title, `title_alt`, year and `detail`. `hint` puts a line under the box. Which form fields a pick writes is the caller's (`lib/externalPick.js`: `makeExternalPick`, and `makeTmdbPick`, which resolves a TMDB ref to the IMDb id before writing). |
| `forms/FranchiseRibbon.jsx` | The Modify editor's "Other entries in this franchise" ribbon for game, h-comic, h-game and hentai: the `entries` sharing `franchiseId`, minus `excludeId`, grouped by series from `allSeries` and sorted by display name, each a chip (badged by `badge(entry)`) that calls `onOpen`. Renders nothing without a franchise or siblings. The seven older types build the same markup inline in `Modify.jsx`. |
| `forms/CastEditor.jsx` | The anime/anime-movie/manga/novel/h-comic/hentai Add/Modify cast table. Controlled like `NovelUnitsEditor` — the parent owns `value` and gets every change through `onChange` — and never saves a cast list itself, only searches/creates the two entities its comboboxes reference: a character combobox (debounced `GET /api/character/?name=`, existing matches shown with the entries they already appear in, plus a synthetic "create new character named X" choice — never find-or-create, per Decision G; the POST carries the typed name as `name_cn` with `display_name_field: "cn"`, plus `gender: "女"` when `NEW_CAST_CHARACTER_GENDER` names one for the editor's media type — h-comic and hentai — and no gender otherwise) and a seiyuu combobox per voice line (find-or-creates through the existing `ensureSourceValues.js` path, same as every other person field). The seiyuu box does not keep the alphabetical order its list arrives in (`GET /api/person/?role=seiyuu&scope=`, shared with every person picker): `byRatingThenAppearances` (`lib/peopleOrder.js`) puts them by `my_rating`, best first and unrated last, then by `credit_count` (castings), most first, and the box's `rankMatches` then puts what the typed text matches exact, then prefix, then contains, keeping that order inside each tier — so the ten shown are the best matches, not the first ten of the alphabet. Renders **without** the seiyuu column on manga/novel/h-comic (`SEIYUU_MEDIA_TYPES` is anime, anime-movie and hentai), mirroring `ck_casting_voice_scope` so the UI cannot offer what the database will reject. One row per casting, on two lines so no cell is squeezed out on a narrow form: the first holds the character, role and photo, the second the seiyuu and the remark (which wraps beneath the seiyuu when there is no room beside it). The character and seiyuu pickers share one fixed width, 16rem — about a long CJK name — so their columns line up; neither stretches, each shrinks rather than overflow a narrow form, and the remark takes the rest of the second line. Its cells: character, seiyuu (when shown — a list of voice lines, each a seiyuu combobox, a "Voice remark" input such as `child` or `ep 13-`, and a remove button, with **+ Another seiyuu** below; a row with no voices shows one blank line, which adds nothing to the row until it is typed into), an optional `role` select over `CHARACTER_ROLES` — Main, Core, Supporting, Other — (the casting's role; the save fills the character's own from it when that is blank; "—" is no role: the row holds `""`, and `useReplaceCasting` — the one save path Add and Modify share, which also drops rows with no character — sends it as `null`; it likewise sends only the voices that name a person, and a blank voice remark as `null`), a photo (a `compact` `ImagePicker` with no owner: upload, choose from the library or remove, and the picked storage key rides in the row's `photo_file` with the cast `PUT`; its focal point rides beside it in `photo_focus`, set through the picker's Adjust position. The picker reports a new picture and its cleared focus as two changes before the parent re-renders, so each row patch applies to the rows the previous patch produced), a remark, and a drag grip (`DragHandle`) writing `position`. Given `franchiseId` (and `entryId` on Modify, which is left out), it offers **Import cast from…**: the other entries of the franchise that have a cast (`GET /api/casting/sources`), and choosing one appends that entry's cast after the rows already there — every field copied, voices included, photo and remark too, but not the casting id; voices are dropped on a type nobody voices, and a character this cast already has is skipped. Given `malLink` (the form's own `mal_link`), it offers **Import from MAL** beside **+ Add cast member** and **Import cast from…**: it `POST`s `{media_type, mal_link}` to `/api/casting/mal` (`endpoints.casting.fromMal`), which matches MAL's characters and Japanese seiyuu to existing rows, creates the missing ones and answers with cast rows; they are appended the same way, a character already in the cast skipped. The button reads "Importing from MAL…" and is disabled while the request runs. Nothing is saved until the form is: a status line counts what came in and what was skipped, and after a MAL import also how many characters and seiyuu were created and any warnings; a refused MAL import shows the server's `detail`. |
| `hooks/useCasting.js` | TanStack Query hook over `GET /api/casting/{media_type}/{entry_id}`, read by the ACG detail pages' Cast section and by the h-comic page, which also hands the cast's names to the Highlights `names` inputs. |
| `info/CastSection.jsx` | The read-only **Cast** slip every ACG detail page draws — Anime, AnimeMovie, Manga, Novel, HComic and Hentai — from the `useCasting` rows; renders nothing for an empty cast. Rows sort by `castRoleRank` (Main, Core, Supporting, Other, then no role), then `position`. Each row is a thumbnail, a role chip, the character link and, when the casting has voices, "voiced by" and every seiyuu as a person link, separated by "·", each with its voice remark in brackets. Collapsed it shows every Main character; **Show core cast (+N)** expands to Main and Core and **Show main cast only** collapses back; **Show full cast (N)** opens a dialog (`FullCastModal`, closed by Escape, Close or a press that starts on the backdrop) listing every row. With no Main character the collapsed view starts at Core; a cast with no Main or Core character is shown whole, with no controls. |
| `info/ClubMembership.jsx` | Club membership on the person page, over `GET`/`PUT /api/person/{id}/clubs` and `/members`. A club (a person holding the `club` role) lists its **Members** in the club's order; an admin edits them with a drag grip per member (a draft until Save), remove and a search to add, and Save PUTs the whole ordered `member_ids`. A person lists the **Clubs** they belong to (ordered by name, so no grips); an admin is offered that editor on anyone holding an `h-comic`-scoped role. Renders and fetches nothing for a session that cannot see h-comic. |

Neither entity detail page reuses `MediaCard`: it resolves its title through
`getDisplayName(data, type)` and reads status, franchise and admin props, none
of which the four keys an `/entries` endpoint returns can satisfy — the title
would render blank. Both pages carry a small local card instead.
