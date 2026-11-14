# Frontend: public pages

Last verified: 2026-11-14

**What this is for.** This is the map of every page outside the admin
tabs — what a guest can open, what a member adds (see "The guest scope"
below), which route renders which file, what data it pulls and under which React Query key,
what sits on the screen from top to bottom, and which controls only appear for
an admin. Read it when a page misbehaves ("where does the dashboard get its
schedule from?"), when you add a page (copy a neighbour's pattern), or when you
change an endpoint (grep the query keys below). Admin routes live in
[admin-pages.md](admin-pages.md); shared components, hooks and theming in
[components.md](components.md).

## Route map

Routing is `react-router-dom` v6 in `frontend/src/App.jsx`. Every route is
nested under `<Layout />` (nav, `<main><Outlet/></main>`, footer, toasts,
scroll buttons). Admin routes sit inside an extra `<ProtectedRoute />` (see
admin-pages.md). Non-API paths on :8000 all return `frontend_dist/index.html`.

**Eager vs lazy.** Pages imported at the top of `App.jsx` ship in the main
bundle; the rest are `lazy(() => import(...))` route chunks fetched on first
navigation, inside one `<Suspense fallback="Loading…">`. The lazy set was
chosen because those pages (admin, the @xyflow relations canvas, statistics)
are a large share of the bundle and never needed on first paint.

| Route | Component (file under `frontend/src/pages/`) | Chunk |
|---|---|---|
| `/` | `Index` — `public/Index.jsx` | eager |
| `/login` | `Login` — `public/Login.jsx` | eager |
| `/reset` | `ResetPassword` — `public/ResetPassword.jsx`, in no menu | lazy |
| `/search` | `Search` — `public/Search.jsx` | eager, **`view.search`** |
| `/library/collection` | `CollectionLibrary` — `library/CollectionLibrary.jsx` | eager |
| `/library/franchise` | `FranchiseLibrary` — `library/FranchiseLibrary.jsx` | eager |
| `/library/studio` | `StudioLibrary` — `library/StudioLibrary.jsx` (matched before `/library/:type`) | lazy, **`view.studio`** |
| `/library/publisher` | `PublisherLibrary` — `library/PublisherLibrary.jsx` (matched before `/library/:type`) | lazy, **`view.publisher`** |
| `/library/person` | `PersonLibrary` — `library/PersonLibrary.jsx` (matched before `/library/:type`) | lazy, **`view.person`** |
| `/library/seiyuu` | `PersonLibrary role="seiyuu"` — same file, filtered server-side via `?role=seiyuu` (matched before `/library/:type`) | lazy, **`view.person`** — a seiyuu is a person |
| `/library/character` | `CharacterLibrary` — `library/CharacterLibrary.jsx` (matched before `/library/:type`) | lazy, **`view.character`** |
| `/library/h-comic` | `Library type="h-comic"` — same file, declared on its own inside `<ProtectedRoute gatedType="h-comic">` (matched before `/library/:type`) | eager, **gated** |
| `/library/h-game` | `Library type="h-game"` — the same, inside `<ProtectedRoute gatedType="h-game">` | eager, **gated** |
| `/library/hentai` | `Library type="hentai"` — the same, inside `<ProtectedRoute gatedType="hentai">` | eager, **gated** |
| `/library/:type` | `Library` — `library/Library.jsx` (anime, anime-movie, movie, tv-show, cartoon, manga, novel, comic, game; anything else redirects to `/under-development`) | eager |
| `/anime/:system_id` … `/game/:system_id` | `detail/Anime.jsx`, `AnimeMovie.jsx`, `Movie.jsx` (`/movie`), `TV.jsx` (`/tv-show`), `Cartoon.jsx`, `Manga.jsx`, `Novel.jsx`, `Comic.jsx`, `Game.jsx` | eager |
| `/h-comic/:system_id` | `detail/HComic.jsx`, inside `<ProtectedRoute gatedType="h-comic">` | eager, **gated** |
| `/h-game/:system_id` | `detail/HGame.jsx`, inside `<ProtectedRoute gatedType="h-game">` | eager, **gated** |
| `/hentai/:system_id` | `detail/Hentai.jsx`, inside `<ProtectedRoute gatedType="hentai">` | eager, **gated** |
| `/collection/:system_id` | `detail/Collection.jsx` → `CollectionPage.jsx` | eager |
| `/franchise/:system_id` | `detail/Franchise.jsx` → `FranchisePage.jsx` | eager |
| `/series/:system_id` | `detail/Series.jsx` → `SeriesPage.jsx` | eager |
| `/studio/:system_id` | `detail/Studio.jsx` | lazy, **`view.studio`** |
| `/publisher/:system_id` | `detail/Publisher.jsx` | lazy, **`view.publisher`** |
| `/person/:system_id` | `detail/Person.jsx` | lazy, **`view.person`** |
| `/character/:system_id` | `detail/Character.jsx` | lazy, **`view.character`** |
| `/identity/:public_id` | `detail/Identity.jsx` | lazy, **`view.character`** — an identity is a page of a character |
| `/watch-order/:system_id` | `detail/WatchOrder.jsx` → `WatchOrderPage.jsx` | lazy |
| `/seasonal` | `public/SeasonalOverall.jsx` — the viewer's own season with a list, the catalogue's without | lazy, **any ordinary `media_type.*`** (`anyPermission={LIBRARY_MEDIA_TYPE_PERMISSIONS}`, the list the Library tab asks) |
| `/seasonal/:seasonal_id` | `public/SeasonalDetail.jsx` — likewise | lazy, **any ordinary `media_type.*`** (`anyPermission={LIBRARY_MEDIA_TYPE_PERMISSIONS}`, the list the Library tab asks) |
| `/future-releases` | `public/FutureReleases.jsx` — reads the open `/api/seasonal/current-season` | lazy, **any ordinary `media_type.*`** (`anyPermission={LIBRARY_MEDIA_TYPE_PERMISSIONS}`, the list the Library tab asks) |
| `/statistics` | `public/Statistics.jsx` — the viewer's own numbers with a list, counts of the catalogue without | lazy, **any ordinary `media_type.*`** (`anyPermission={LIBRARY_MEDIA_TYPE_PERMISSIONS}`, the list the Library tab asks) |
| `/completions` | `public/Completions.jsx` | lazy, **`self.list`** |
| `/random` | `public/RandomPicker.jsx` — the general mode | lazy, **`view.random_picker`** |
| `/random/h-comic`, `/random/h-game`, `/random/hentai` | `RandomPicker type="…"` — the same file, each inside its type's `<ProtectedRoute gatedType>` and, within it, `<ProtectedRoute permission="view.random_picker">` (matched before `/random/:type`) | lazy, **gated**, **`view.random_picker`** |
| `/random/:type` | `RandomPicker` — one type's mode, or `/random/franchise`, the franchise mode; an unknown type redirects to `/random` | lazy, **`view.random_picker`** |
| `/plan` | `public/Plan.jsx` | lazy, **`self.list`** |
| `/quote` | `public/Quotes.jsx` | lazy, **feature `quotes_memes`** (`<ProtectedRoute feature>`) |
| `/meme` | `public/Memes.jsx` | lazy, **feature `quotes_memes`** |
| `/resources` | `public/Resources.jsx` | lazy, **`manage.resources`** — the admin's and super's alone |
| `/settings` | `public/Settings.jsx` — the account's username and role, a line saying the list, ratings and personal notes are visible to that account only, and the Password card for an account holding `self.password` | lazy, **`self.list`** |
| `/requests` | `public/MyRequests.jsx` | lazy, **`self.requests`** |
| `/under-development` | `public/UnderDevelopment.jsx` | eager |

**Gated routes.** The two h-comic routes sit inside
`<ProtectedRoute gatedType="h-comic">`, the two h-game routes inside
`<ProtectedRoute gatedType="h-game">`, and the two hentai routes inside
`<ProtectedRoute gatedType="hentai">`; each asks `canSeeGatedType`
(`lib/gatedTypes.js`) for its own type - the question its nav row asks too. A signed-in session
that cannot see the type is sent to `/`, as for a path that does not exist; a
signed-out visitor is sent to log in, since an account may bring a mode that
carries the label.

## The guest scope

A guest — a logged-out visitor, or any account on the `guest` role — browses
the media and the groups and nothing else: the dashboard's Announcements and
Broadcast schedule, the `/library/:type` lists, `/library/collection`,
`/library/franchise`, and the entry, collection, franchise, series and
watch-order pages they lead to. Everything else a member reads is behind a
`view.*` permission, which `super` holds, `guest` does not hold as seeded,
and the `admin` role never holds — the admin reads no catalogue at all. `user`
holds `view.search` and `view.random_picker` as seeded (a shared
account holds `view.random_picker` alone; it is locked off for `guest`); the four entity keys are each a switch on the role,
seeded off, so a fresh database shows a `user` entity names as plain text
until an admin ticks a kind on:

| Key | Route gate (`<ProtectedRoute permission>`) | Inside the open pages |
|---|---|---|
| `view.studio` | the studio library and studio pages | studio and developer names render as plain text (`useEntityHref`, components.md) |
| `view.publisher` | the publisher library and publisher pages | publisher names render as plain text |
| `view.person` | the person and seiyuu libraries and person pages | staff, author, club-member and seiyuu names render as plain text |
| `view.character` | the character library, character and identity pages | character and identity names render as plain text; the franchise and series hubs have no Characters tab |
| `view.search` | `/search` | `NavSearch` is not drawn — not the inline slot, the phone button or its sheet |
| `view.random_picker` | every `/random` route | the picker asks `/api/plan-next/` for plan marks only with `self.list` (`useViewScope().ownData`), so a shared account's picker draws no plan weight and never gets a 401 |

A personal note section is not behind a `view.*` key either: the registry
lists it for every viewer and the rows are only the viewer's own, so a guest
sees it empty and without write controls.

The viewer's **own** ratings and expectations are not behind a `view.*` key:
they are drawn for a holder of `self.list` (`useViewScope().ownData`), since
anyone else has none and the server sends null — the cards' rating stamps and
expectation chips, the franchise table's Expectation and My columns, the
rating and expectation sorts and filters, the hubs' hero stamp, chip and
rating editors, the entity pages' **My rating** select, the random picker's
franchise filters and a novel unit's rating and remark controls.

Each route block asks one key, and `navigation.js` asks the same key for the
rows that link there — the SPA's two permission surfaces have to agree, and
`App.routes.test.jsx` and `navigation.test.js` pin the two halves. The server
answers 401 on the gated endpoints and strips the personal fields, so the UI's
half is to draw nothing rather than an empty slot, and not to ask for what it
would be refused: `useViewScope()` (`hooks/useViewScope.js`) is where a
component reads the flags. A guest is sent to
`/login?next=<path>` from any member route.

**Quotes and memes are not a `view.*` key** but the account's
`quotes_memes` feature switch, which only a `user` or `super` account can
have on; no role holds it without the switch. `/quote` and `/meme` sit
inside `<ProtectedRoute feature="quotes_memes">`, their nav rows carry
`feature: "quotes_memes"`, and without it `NotesContext.jsx` drops the
Quotes and Memes note sections, so neither renders nor fetches. Each surface
asks `hasFeature("quotes_memes")` (`AuthContext`), which reads `/me`'s
`features`.

`App.jsx` also calls `useConstants()` once: it fetches `/api/constants` and
overwrites the bundled `config/fieldOptions.js` arrays in place so every
`<select>` in the Add/Modify tabs switches from the fallback to API values.

## The navigation model

Both the desktop tab strip and the mobile drawer render from one data file,
`frontend/src/config/navigation.js` (`NAV_SECTIONS`). Nothing in it knows
about styling.

| Section key | Label | Shape | Contents |
|---|---|---|---|
| `library` | Library | mega-panel (`columns`), `requires` any of the nine ordinary `media_type.*` keys (`LIBRARY_MEDIA_TYPE_PERMISSIONS`), so a role holding none — the admin — has no Library tab. Nav only: the `/library` routes themselves stay open | **Groups**: Collection `/library/collection`, Franchise `/library/franchise` · **Entities** (each row `requires` its own kind's key, so a row whose kind is off is dropped and a viewer holding none has no Entities column): Studio `/library/studio` (also matches `/studio`; `view.studio`), Publisher `/library/publisher` (also matches `/publisher`; `view.publisher`), Person `/library/person` (also matches `/person`; `view.person`), Character `/library/character` (also matches `/character` and `/identity`; `view.character`), Seiyuu `/library/seiyuu` (`view.person`) · **ACG**: Anime, Anime Movie, Manga, Novel, Game `/library/game` (also matches `/game`) · **Reality**: TV Show, Movie, Cartoon, Comic |
| `restricted` | Restricted | flat `items`, every row gated | H-Comic `/library/h-comic` (also matches `/h-comic`; `gatedType: "h-comic"`), H-Game `/library/h-game` (also matches `/h-game`; `gatedType: "h-game"`), Hentai `/library/hentai` (also matches `/hentai`; `gatedType: "hentai"`). Each is drawn only for a session that can see its type; a session that can see no gated type has every row dropped, so the tab itself is not drawn |
| `track` | Track | flat `items` | Plan `/plan` (`requires: "self.list"` — see below), Completions `/completions` (`requires: "self.list"`). The account's own progress; a guest holds no `self.*` key, so the tab is not drawn |
| `explore` | Explore | flat `items` | Seasonal `/seasonal`, Future Releases `/future-releases` and Statistics `/statistics`, each `requires: LIBRARY_MEDIA_TYPE_PERMISSIONS` (any ordinary media type, so a guest's and a shared account's Explore hold all three and the admin's none), and Random Picker `/random` (`requires: "view.random_picker"`; its `/random/<type>` pages light it too) |
| `extras` | Extras | flat | Quotes `/quote` and Memes `/meme` (each `feature: "quotes_memes"`), Resources `/resources` (`requires: "manage.resources"`, so the admin and super only) ┃ Relations `/relations`, Watch Orders `/watch-orders` — these two carry `requires: "manage.catalog"` on the row, inside a tab everyone may open |
| `entry` | Entry | flat, `requires` any of `manage.catalog` / `manage.images` | Add `/add`, Modify `/modify`, Delete `/delete`, Form Defaults `/defaults`, Picker Defaults `/random-defaults` — each `requires: "manage.catalog"` — and Images `/images` (`requires: "manage.images"`). The admin holds no `manage.catalog`, so Images is the one row it sees |
| `note` | Note | flat, `requires` any of `manage.options` / `admin.authz` / `manage.catalog` / `manage.pipelines` — whatever its rows ask, so the admin, holding no `manage.catalog`, still sees the whole section | System Options `/options`, Alias Conversion `/aliases`, External APIs `/external-apis` — the three read-only inventories of how the data is described, each `requires: "manage.options"` — Content Labels `/content-labels`, the read-only label reference, which carries `requires: ["admin.authz", "manage.catalog"]` (any of the two, the same either-of its route asks), and Business Logic `/business-logic`, what Calculate All changes step by step, which carries `requires: "manage.pipelines"` on the row, so only the super role and admin see it |
| `system` | System | flat, `requires: "manage.pipelines"` | Control Center `/system`, Data History, Review Queue, Clean Orphans, and **Inbox** `/request-inbox`, which carries `requires: "manage.requests"` on the row — the key its route asks |
| `admin` | Admin | flat, `requires: "admin.authz"` | Users, Roles, Access Modes |

Each item has `label`, `icon` (Font Awesome class), `to`, optional `matches`
(extra path prefixes that light the tab up — `/anime/123` highlights the Anime
library item; Franchise also owns `/series` and `/watch-order`), `dev` (routes
to `/under-development`), `divider` (a rule between item groups) and
`requires` (a per-row permission, or a list meaning any of them — `meets(has,
needed)` answers both) or `feature` (a per-row account feature switch, asked
through `hasFeature` in place of `requires`). Helpers:
`sectionItems`, `activeItem` / `activeSectionKey` (segment-aware prefix match,
so `/library/anime` does not claim `/library/anime-movie`),
`sectionRequirement` / `itemRequirement` (`adminOnly: true` is the legacy
spelling of `requires: "admin.authz"`) and `visibleSections(sections, has,
canSeeType, hasFeature)` — which drops both the sections and the individual
rows the viewer lacks the permission for, a row carrying `gatedType` unless
`canSeeType` answers yes (Nav passes `canSeeGatedType`), and a row carrying
`feature` unless `hasFeature` answers yes (left out, every such row is
hidden), then drops any section
left holding nothing but dividers. It
hands back the original item objects, since Nav marks the current row by
identity. Every gate is `has()` from `useAuth()`, a plain membership test,
so a tab or row is drawn only for a role that holds its key.

A guest is therefore shown two tabs: Library, holding Groups, ACG and
Reality, and Explore, holding Seasonal, Future Releases and Statistics. A
shared account's Explore adds the Random Picker. The admin is shown no
Library, Restricted, Track or Explore tab, Extras holding Resources alone,
Entry holding Images alone, and Note, System and Admin in full.

**`components/layout/Nav.jsx`** renders two rows: an "ink" row (logo → `/`,
`<NavSearch/>`, session controls) and a paper tab strip. `<NavSearch/>`, the
phone's search button and the sheet it opens are drawn only for a viewer
holding `view.search`, the key the `/search` route asks. Mega-panel behaviour:
click-outside closes, Escape returns focus to the trigger, ArrowUp/Down cycle
links inside `[data-nav-panel]`, any route change closes the panel, the
mobile drawer and the phone search. Session controls: a session indicator, the
access-mode switcher, and a theme toggle (moon/sun, `useTheme().toggle`,
`aria-pressed`). The indicator always renders: the
account's `username` when signed in, **Guest** when not. It is a value, so it
keeps the body face and its own casing - the mono uppercase treatment belongs
to labels. The **Admin** chip beside it is a capability and stays gated on
`isAdmin`, as does **Back up** (also behind `has("manage.pipelines")`). It
runs `runBackup` from `api/backup.js`, which reads the endpoint's event
stream: the button counts tabs ("Backing up 12/47…"), and the toast is
success, an error with the server's message, or a **warning** - never a
failure - when another Backup is already running (409) or the stream drops
before the Backup ends, since the Backup keeps running on the server and
its result lands in the Data Control log. The admin page's **Push All Data**
uses the same helper. **Log out** (POST `/api/auth/logout`, then a full
load of the page it is on, so nothing cached for the outgoing account
survives) follows the indicator rather than the chip: it renders for any
signed-in account, because a strip naming you with no way out is a dead end.
Guests get **Log in** → `/login?next=<current path>`.
**Requests** → `/requests` sits before log out, and in the drawer above
it, for a viewer holding `self.requests` — the key the route asks. It
is an account control rather than a tab, and the admin account, which files
nothing, is not offered it. **Settings** → `/settings` (an icon) sits
between it and log out, for a viewer holding `self.list`, the key its route
asks — user and super.

The nav narrows in three steps:

| Width | Ink row | Tab strip | Search |
| --- | --- | --- | --- |
| lg and up | everything | shown | inline slot |
| md to lg | everything, plus the menu button | drawer | inline slot |
| below md | mark, Log in (guests), search button, menu button; from sm up also the indicator, log out, mode switcher and theme | drawer | search button |

The **drawer** (`[data-nav-drawer]`) fills the screen under the bar, scrolls
on its own and locks the page scroll behind it. It closes when the viewport
grows past lg. Each section is one fold: opening the drawer unfolds only the
section the current route sits in, and the rest collapse to one row each.
Library's columns render as labelled two-up grids. Rows are taller than in the
desktop panels so they are easier to tap. Below the sections it repeats the
session controls, indicator first. On a phone that footer is the only place
log out, the mode switcher and the theme toggle appear.

The **search button** opens `<NavSearch variant="sheet"/>` as a full-width
overlay under the bar. It is an overlay rather than a nav row so `--nav-h`
stays true and sticky page headers do not move. Opening search closes the
drawer, and opening the drawer closes search. Escape closes it, and so does
any search that navigates.

**`components/layout/NavSearch.jsx`** is the universal search box. It
debounces 250 ms, discards stale responses by request id, and calls
`GET /api/search/?q=…&limit=8[&scope=…]` — the per-bucket `limit` is
`MAX_RESULTS`, the most rows the dropdown shows, so no bucket sends more than
can be used. Scopes: all, collection, franchise,
series, anime, anime-movie, movie, tv-show, cartoon, manga, novel, comic, game,
h-comic, h-game, hentai, seasonal, person, studio, publisher. A scope is
offered only when the server would send its bucket (`canSearchScope`, on the
rule in [api.md](../api.md#search--apisearch)): a media type needs
`media_type.<type>`, and a gated one also the mode (`canSeeGatedType`);
person, studio and publisher need `view.person`, `view.studio` and
`view.publisher`; all, the three groups and seasonal are always offered.
`mergeBuckets` builds the at most `MAX_RESULTS = 8` rows
in three passes. First, every bucket's exact matches (a name column equal to
the query after `cleanString`), so a whole-title hit is never cut by the cap
and always sits at the top. Then, with scope `all`, `TYPE_QUOTAS` give one
row to each title type in order — collection, franchise, series, anime,
anime-movie, movie, tv-show, cartoon, manga, novel, comic, game, h-comic,
h-game, hentai, seasonal — so a broad query shows as many types as fit before
any type shows a second; person, studio and publisher have no floor. Last,
the slots left over are filled round-robin from the buckets that still have
rows, so a query matching only movies gets eight movies. A scoped search has
one bucket, and it may fill all eight. The server leaves out altogether the
bucket of every type the viewer cannot see, and a missing bucket reads as
empty. Person, studio and publisher come last, with no floor, on
purpose: a query is usually about a title, so a name match on a credited
person, studio or publisher is the weaker answer and takes the slots the media
buckets left behind. Each row's type badge is a `Chip` coloured by its type
(`typeHue` in `config/scopeColors.js`) — one of the two places design rule 5
lets colour name a type, see
[design-system.md](design-system.md#rules). Enter navigates to
`/search?q=…[&scope=…]`; a
result click routes to the entry's page (`/seasonal/<encoded id>` for seasons,
`/person/:id`, `/studio/:id` and `/publisher/:id` for entities). An entity
row's path comes from `useEntityHref` (`lib/entityPath.js`), so without its
kind's `view.*` key the row is the name as plain text — an
`aria-disabled` option that goes nowhere — as every entity link is. Comic display
names are EN-first; a person, studio or publisher row shows the
server-resolved `display_name` and its credit count as the secondary line. The
dropdown has no characters: it does not send `characters=true`, so its
response carries no `character` bucket, and there is no character scope —
characters are found on the `/search` page's Characters tab. The `sheet` variant (the phone overlay) fills its
row, focuses itself, and uses a 16px input so iOS does not zoom the page on
focus. It calls `onDone` after any search that navigates.

Enter and a result click both close the dropdown and cancel the search
behind it: the debounce timer is cleared and the request id moves on, so a
response still in flight is discarded when it lands instead of reopening the
dropdown over the page the reader went to. Emptying the input cancels the same
way. Escape and a click outside dismiss rather than leave: they stop the
pending search the same way, so a late response cannot reopen the dropdown,
but keep the typed query and the results already held, which a refocus shows
again.

**Theme.** `ThemeContext` keeps `light | dark | system` in
`localStorage["cg1618:theme"]` and stamps `<html data-theme>`; `index.html`
stamps the same attribute before first paint. See components.md → Theming.

## Shared page plumbing

| Piece | File | Notes |
|---|---|---|
| `Layout` | `components/layout/Layout.jsx` | `<Nav/>`, `<Outlet/>`, footer, `<Toast/>`, `ScrollButtons` (to-top after 300 px, to-bottom when >300 px from the end) |
| `ProtectedRoute` | `components/layout/ProtectedRoute.jsx` | spinner while `auth.loading`; `has(permission)`, or with `anyPermission={[...]}` any one of a list, or `hasFeature(feature)` when a `feature` prop is passed, or `requireAuth` (anyone signed in), or `gatedType` (`canSeeGatedType`) → `<Outlet/>`, else `<Navigate to="/login?next=<path+search>" replace/>`. **With none of those props the route is open**: a page that needs a capability names its permission. A redirect, not a security boundary — the API enforces. |
| `MediaLoadingState` | `components/layout/MediaLoadingState.jsx` | spinner + `loadingText`, or red error card |
| Tab title | `contexts/PageTitleContext.jsx`, `lib/pageTitle.js` | the page's name alone: the nav row's label (`<label> Library` on a library row), a record page's displayed name via `usePageTitle`, and while that loads or fails the nav row it lights up ("Anime"). See [components.md](components.md#contexts) |
| Toasts | `hooks/useToast.jsx`, `components/layout/Toast.jsx` | `showToast(type, message)`, auto-dismiss 3.5 s, bottom-left stack |
| Data hooks | `hooks/useMediaList` (`["media-list", type, params]`), `useMediaItem` (`["media-item", type, id]`), `useApiQuery`, `useStatusToggle`, `useMediaCacheUpdate` | `LIST_OPTIONS = { params: { limit: 2000 } }` — every library-sized list uses it |

Pages that call `fetch()` directly instead of React Query: the two group
libraries, the three hubs, both seasonal pages, WatchOrderPage,
`RelationsSection` and `NotesTemplate`. Of those, only the hubs, WatchOrderPage,
RelationsSection and NotesTemplate carry a `cancelled` flag so a fast id change
cannot paint stale data.

## Pages

### Index (dashboard) — `/`

File `pages/public/Index.jsx`.

**Who sees what.** The page differs per viewer
([../viewers.md](../viewers.md#dashboard-)), and every choice is a permission,
never a role name, made in `components/dashboard/dashboardSections.js`.
Nothing is chosen until `/api/auth/me` has answered — the page shows its
loading state until then, because before it every viewer looks like a guest.

| Part | Asks | Who that is, as seeded |
|---|---|---|
| The admin's own page (`AdminDashboard`), **instead of** everything below | `has("admin.authz")` and none of `LIBRARY_MEDIA_TYPE_PERMISSIONS`, the Library tab's own question | admin |
| Tracker: My watch schedule, Coming Next, Followed orders, the type filter bar, Watching, Reading, Playing | `has("self.list")` | super, user |
| Summary (`DashboardSummary`) above Announcements | `has("self.list") && has("manage.requests")` | super |
| Libraries (`#libraries`, `LibraryLinks`) | `!has("self.list")`, and at least one library row visible | guest, shared |
| Recently added (`#recent`, `RecentlyAdded`) | `!has("self.list") && has("view.random_picker")` | shared |

Announcements and the Broadcast schedule are drawn for every viewer of the
catalogue dashboard. The tracker is built from the viewer's own statuses and
progress, and its controls write the viewer's own rows, so it is a member's
list, not catalogue, and `self.list` decides it rather than a `view.*` key.
The TOC, the scroll-spy and the schedule's "N scheduled" count cover only the
parts drawn.

**The summary** reads `GET /api/dashboard/summary` and is fetched only for a
viewer it is drawn for. It says, in a few words each, how many registrations
wait and how many requests and reports are open, and **draws nothing when
both are zero**. Open requests link to `/request-inbox`. Registrations link
to `/system` (its Pending registrations panel) for a viewer holding
`admin.authz`; for anyone else — super — they read "waiting for the admin to
approve", unlinked, since `/system` would not show that viewer the panel.

**The library links** are the nav's own Library and Restricted rows:
`useLibraryLinks()` calls `visibleSections(NAV_SECTIONS, has, canSeeGatedType,
hasFeature)` exactly as `Nav.jsx` does and keeps those two sections, one slip
per section with one link per row, so the dashboard and the header never
disagree about which libraries a viewer may open.

**Recently added** reads `GET /api/dashboard/recent?limit=12` — the newest
entries across every type the viewer may see, already narrowed by the
server — and draws each as a cover (`thumbUrl`, `focusStyle`), its type and
its name, linking through `entityPath`.

**The admin's page** fetches no catalogue at all — the admin's catalogue
reads answer 401. It has an **Overview** — the summary, drawn even when
nothing waits (`manage.requests`), and the five latest pipeline runs from
`GET /api/system/logs` with status and time, linking to the full log on
`/system` (`manage.pipelines`) — and **Announcements & notes**: the
`AnnouncementBoard`, with `AnnouncementEditor` (add, edit, delete) below it
for `manage.announcements`. Each part asks its own key, so a role edited on
`/roles` keeps only the parts it may read.

**Data** (the catalogue dashboard; the admin's page reads only what is listed
above): `useMediaList("anime")` and
`useApiQuery(["announcements"], "/api/announcements/")` for everyone — the
Broadcast schedule reads the anime list alone. For a member it also loads
`franchise`, `tv-show`, `cartoon`, `manga`, `novel`, `comic` and `game` (all
`LIST_OPTIONS`), which only the tracker divisions read, plus `anime-movie`,
`movie` and `/api/seasonal/current-season` for Coming Next. The combined
loading/error gate covers the anime list and, for a member, the seven tracker
lists; announcements, the three Coming Next queries, the summary and
recently added stay out of it so a failure there never blanks the dashboard.
The summary and recently added each show their own error in place.

**Type filter and view**: one `TypeFilterBar` sits above the Watching
division and is the sticky header for Watching, Reading and Playing together —
it pins below the nav from where Watching starts to where Playing ends, and
Announcements and Schedule above it keep their own sticky division headers.
The three tracker division titles (Watching, Reading, Playing) do **not** pin;
their sub-section headers (Active watching, Passive reading, …) pin below the
bar, which reports its measured height so they stack under it.

The bar's type filter is single-select over `MEDIA_TYPES` (All / Anime / TV
Show / Cartoon / Manga / Novel / Comic / Game); clicking the active type again
returns to All. Picking a type does two things: each section shows only that
type's entries, and every division that cannot hold the type is **not
rendered at all** (`DIVISION_TYPES`: Watching holds Anime · TV Show · Cartoon,
Reading holds Manga · Novel · Comic, Playing holds Game). So picking Game
leaves only Playing. The TOC drops the links of hidden divisions with them.

**Card or list**: the same bar carries a **View** toggle (Cards / List) at its
right end. It is one setting for the whole dashboard and it persists per browser in
`localStorage` through `lib/dashboardView.js`, never server-side. In list view
a section renders one `DashboardTable` holding every type it contains, instead
of a grid of tiles grouped by type: Type is a column, so the per-type
sub-headings would say the same thing twice. The columns are Title, Type,
Status, Rating and Progress; each row's Progress carries its own unit (`ep`,
`ch`, `vol`, `iss`, `h`) because the types do not measure the same thing. List
view has **no stepper** — tracking stays in card view and on the entry page.
The table scrolls sideways inside its own wrapper below ~640px so the page
itself never does.

**Layout** (an `xl:`-only sticky left TOC, the shared `TableOfContents`
with `useScrollSpy` - see
[components.md](components.md#in-page-table-of-contents) - tracks the active
section with a threshold at the bottom of whatever sticky header covers it —
the division header for Announcements and Schedule, the filter bar for the
tracker divisions):

| Anchor | Division | What it shows |
|---|---|---|
| `#announcements` | Announcement & Notes | `AnnouncementBoard` cards (`components/info/AnnouncementBoard.jsx`); a clipped body expands into `AnnouncementModal`. Read-only on the catalogue dashboard; written on `/system` and on the admin's own page. |
| `#schedule` | Weekly Schedule | two `WeeklySchedule` blocks: **My Watch Schedule** (`my_watch_day`, anime with `airing_status === "Airing"`; members only) and **Broadcast Schedule** (`broadcast_day` + `broadcast_time`, collapsible, collapsed by default). Only anime feed the schedule today. Sunday-first (`config/weekdays.js`), today highlighted and scrolled into the first visible column whenever a grid is drawn (on load, and on expanding a collapsed one), entries sort by `HH:MM` then name. Under them, **Coming Next** (`schedule-coming`, `components/tracker/ComingNext.jsx`), collapsed by default and drawn only for a viewer holding `self.list` — see below. Directly under it, **Followed watch orders (n)** (`schedule-follows`, `components/tracker/FollowedOrders.jsx`), gated and collapsed the same way: one row per followed order with its group, `done / total`, every step in progress and the step up next — see [../systems/watch-orders.md](../systems/watch-orders.md#following). |
| `#libraries` | Libraries | viewers without a list (guest, shared): one link per Library and Restricted nav row the viewer is shown. Not drawn when there are none. |
| `#recent` | Recently added | `view.random_picker` without a list (shared): the newest entries, newest first. |
| `#watching` | Watching (Anime · TV Show · Cartoon) | members only, like Reading and Playing and the filter bar above them. Sections `watching-active` Active Watching, `watching-passive` Passive Watching, `watching-paused` Paused, by `watching_status`. Each groups Anime → TV Show → Cartoon, sorted by rating weight (S…F, unrated last), rendering `DashboardCard`. Shown when no type is picked or the picked type is one of its three. |
| `#reading` | Reading (Manga · Novel · Comics) | `reading-active`, `reading-passive`, `reading-paused` by `reading_status`. Manga → `DashboardCard`, Novel → `NovelDashboardCard`, Comic → `ComicDashboardCard`. Shown when no type is picked or the picked type is one of its three. |
| `#playing` | Playing (Game) | `playing-active`, `playing-passive`, `playing-anytime`, `playing-paused` by `playing_status`, rendered by a local `PlayingSection` — simpler than `ReadingSection` because the division holds exactly one media type, so there is no per-type grouping and no progress callback. Cards are `GameDashboardCard`, whose playtime figure is read-only for everyone. Shown when no type is picked or the picked type is Game. |

**Coming Next** shows what the viewer is waiting on or has planned, in two
separate blocks that never share an entry:

1. **This season · not yet out** — the current season's entries that have not
   aired or released yet. The current season is the admin-set
   `system_configs.current_season`, or the calendar's while none is set.
2. **Next season** — every entry of the season after it.

Each block has the same two sub-sections, each grouped by media type (Anime,
Anime Movie, Movie, TV Show, Cartoon, Game; a type with nothing is omitted) and
sorted by release date:

- **Watch when airs** — `Watch When Airs`, and `Play When Released` for games.
- **Planned to** — `Plan to Watch`, and `Plan to Play` for games.

"Not out yet" (`isUnreleased`) reads the entry's `airing_status` —
`Not Yet Aired` or `Rumored` — or, for games, its `release_status` —
`Unreleased` or `Rumored`; any other set status means it is out. An entry with
no status falls back to its primary release date lying after today, a date
missing its day or month counting from the first of that period.

An entry's season is its `release_season` plus the year of its `release_date`
for anime, and for every other type the calendar quarter of its primary
release date (`primaryReleaseValue` in `lib/releaseDate.js`, mirroring
`RELEASE_PRIORITY`: anime movies prefer the Japanese date, movies the Taiwan
one). A date with only a year has no season, so that entry is left out.
Reading types have no "when released" status and are not included; gated
types are not shown on the dashboard. The selection lives in
`lib/comingNext.js`. Guests never see the section: statuses are the viewer's
own, so a guest's would always be empty.

**The steppers are the viewer's own** (cards read `canTrack`, which is
`has("self.list")`, not `isAdmin`): −/input/+ progress steppers. A viewer
without a list sees a read-only counter.

**Optimistic handlers.** Each handler patches every `["media-list", type]`
cache with `queryClient.setQueriesData`, writes the caller's own row through
`putMyListRow` (`api/myList.js`, `PUT /api/me/list/{id}`), folds the saved row
back in - its status may have moved, since reaching the total finishes it -
and on failure restores the previous value and toasts "Network error.
Progress reverted.":

| Handler | Body to `PUT /api/me/list/{id}` |
|---|---|
| `handleEpChange` (anime, TV show, cartoon; anime also recomputes `cum_ep_fin = ep_previous + ep_fin` locally) | `{ ep_fin }` |
| `handleChChange` (manga) | `{ ch_fin }` |
| `handleNovelProgressChange` | any of `{ vol_fin | ch_fin | arc_fin }` (the card picks by `progress_display`: `vol_tw`, `vol_original`, `arc_ch`, `ch`) |
| `handleComicProgressChange` | `{ issue_fin }` |

Cards cap at the total and toast "Cannot exceed total episodes/volumes/…".

### Search — `/search`

File `pages/public/Search.jsx`. Reads `?q`, `?scope` (default `all`) and
`?tab`.
`useApiQuery(["api","search"], "/api/search/", { params: { q, scope, characters: true }, enabled: hasQuery })`
→ effective key `["api","search",{q,scope,characters}]`. The response is
`results.{collection, seasonal, franchise, series, anime, "anime-movie", movie, "tv-show", cartoon, manga, novel, comic, game, "h-comic", "h-game", hentai, person, studio, publisher, character}`
plus `related_franchises` (the franchises of the matched anime — used as
filter pills, not name matches). Only `collection`, `franchise`, `series` and
`seasonal` are always present: the server leaves out the bucket of every type
the viewer cannot see (a media type the role does not hold, a gated type the
mode hides, an entity kind without its `view.*` key — see
[api.md](../api.md#search--apisearch)), and the page reads every bucket as
`results[type] ?? []`, so an absent bucket draws no section, no count and no
tab. The scope chip above the results names a scope only when
`canSearchScope` (NavSearch's rule) lets the viewer search it, so a
hand-typed `?scope=` for a type the viewer cannot see names nothing.
`characters: true` is what adds the `character` bucket, for a viewer
holding `view.character`; this page is the only caller that sends it.
Results are copied into local state so a card's `onUpdated` can replace a row
without a refetch.

Layout: a sticky header "Search Results for “q”" + scope pill + a count line
("n collections · n anime · …", non-empty buckets only), and under it a tab
bar — `HubTabs` (`components/hub/HubChrome.jsx`), the hub pages' underline
tabs, with one group labelled "Results" and a count on each tab:

- **Media** — in order, only when the scope allows and the bucket is
  non-empty: **Collections** (`TierCard` → `/collection/{id}`), **Seasonal**
  (pill buttons → `/seasonal/{id}`), a franchise pill row
  (`CollapsiblePillRow`, "All Results" + one per related franchise; filters
  franchises/series/anime by `franchise_id`), **Franchises** (`TierCard`
  labelled "{franchise_type} Franchise"), **Series**, **Anime** (sub-grouped
  TV / ONA, Movies, Other by `airing_type`), **Anime Movies**, **Movies**,
  **TV Shows**, **Cartoons**, **Manga**, **Novel**, **Comic**, **Game**,
  **H-Comic**, **H-Game**, **Hentai** — all `MediaCard` grids.
- **People & companies** — **People**, **Studios** and **Publishers**,
  `PersonCard` / `StudioCard` / `PublisherCard` grids
  (`components/cards/StaffCard.jsx`, the same cards the three libraries use)
  linking to `/person/:id`, `/studio/:id` and `/publisher/:id`.
- **Characters** — a `CharacterCard` grid (`components/cards/CharacterCard.jsx`,
  the character library's card) linking to `/character/:id`. One card per
  character: identities are not separate results.

Every link on the page comes from `useEntityHref` (`lib/entityPath.js`): an
entity card without its kind's `view.*` key renders as plain text, and the
tier cards, which no key gates, always open their page.

A tab with no results is not drawn, as on the hub pages, and nothing is
drawn when every tab is empty. The active tab is `?tab=` (`media`, `people`,
`characters`) when that tab has results, and otherwise the first tab that
does — Media unless it is empty — so a scope naming one staff type opens on
People & companies. Choosing a tab writes `?tab=` and keeps `q` and `scope`.
Characters are searched at scope `all` only, so any narrower scope leaves
that tab out. `SCOPE_LABELS` and `SEARCH_TABS` are module-level exports so a
test can assert the page and the API agree on the keys without rendering the
page. Empty query shows a "No Search Query" card. Admin-only behaviour comes
from `MediaCard` itself.

### Library — `/library/:type`

Files `pages/library/Library.jsx`, `pages/library/configs/index.js` +
`configs/{anime,animeMovie,movie,tvShow,cartoon,manga,novel,comic,game,hComic,hGame,hentai}.jsx`,
`components/layout/LibraryLayout.jsx`, `components/layout/libraryColumns.jsx`,
`hooks/useLibraryState.js`.

One page, one config per type. The type is the route's `:type`, or the
`type` prop of the three routes that name it - `/library/h-comic`,
`/library/h-game` and `/library/hentai`, declared separately so their gates
run first. The h-comic
config filters by region,
reading status, serialization status, originality, animation status and
usefulness, and its Progress column reads in the region's unit (pages on JP,
chapters on KR). The h-game config is Game's without playtime or Metacritic:
it filters by type, play status, play style, language, platform (an entry
matches when its list holds a chosen value), ownership, release status and
usefulness, and its columns add style, language and achievements. The
hentai config filters by watch status, airing status, source material,
originality and usefulness, sorts by title, release date and my rating, and
its columns are franchise, title, source, airing status, cartoon's EP column
(`ep_fin / ep_total`), usefulness, my rating, the watch button and the
watch-next / to-rewatch flags; its library card counts episodes as a
cartoon's does (`MediaCard`'s `ProgressDisplay`). All three also sort by usefulness
(`usefulnessSort`), in the vocabulary's order - 非常實用, 實用, 特定情況實用,
不實用 - with an unset value last; no other library offers it. `Library.jsx` looks up `LIBRARY_CONFIGS[type]`,
runs `useMediaList(type, LIST_OPTIONS)`, `useMediaList("franchise")` and
(when `config.usesSeries`) `useMediaList("series")`, and hands everything to
`LibraryLayout`. `useLibraryState` holds search text, sort, grid/table view,
the filter panel toggle and the filter values — **none of it is persisted**;
navigating away resets the page. Filtering is entirely client-side over the
≤2000 rows: search (`config.buildSearchString`, normalised by `cleanString`)
→ active `filterDefs` (`match(item, value, franchiseDict, seriesDict)`) →
`sortDefs[currentSort].compare`. The filter half is shared with the random
picker: `hooks/useFilterState.js` holds the chip and toggle values,
`lib/libraryFilters.js` applies them (`applyFilterDefs`), and
`components/layout/FilterPanel.jsx` draws them. A set-type def may carry
`optionLabel(value)` when its chip text should differ from the stored value,
and a `set` def may carry a **parent chip**, `parent: { label, children }` —
see `components.md`, "FilterPanel". The entity libraries — studio,
publisher, person (and seiyuu) and character — use the same machinery.

A sort may also name the figure a **grid card** shows in its score slot,
through `cardScoreField` on the sortDef: `LibraryLayout` reads it off the
active sort and passes it to `MediaCard` as `scoreField`, so an anime, anime
movie, manga or novel library sorted by either AniList figure shows the
AniList score on every card instead of the MAL one. Both AniList sorts point
at `anilist_rating` — a card has one score slot, and a popularity rank is
not the number worth reading in it. A sort that names nothing leaves the card
on its default, which is what the eight types with no AniList figure do.

Filter types: `set` (static `options`), `set-dynamic` (options derived from
the data), `set-grouped` (group labels mapped through `WATCHING_STATUS_GROUP`
/ `READING_STATUS_GROUP`), `boolean` (checkbox). Top bar: search, "Sort:"
select, Filters button with an active-count badge, grid/table toggle, result
count. Table rows link to `${config.navPath}/${id}`; table cells receive
`{ franchiseDict, seriesDict, canTrack, handleStatusToggle }`, and
`handleStatusToggle` goes through `useStatusToggle(type)` with toasts
("Added to Watch/Read Next", "Marked for rewatch/reread", "Status → X"); the
hook writes a status to `/api/me/list` and a plan flag to
`/api/me/plan-flags`.

**The viewer's own** in tables (`canTrack = has("self.list")`): the
watch/read/play status button advances the status on click
(`watchButtonColumn` / `readButtonColumn` / `playButtonColumn`), and the
plan-flag checkboxes (`planFlagColumn`) work.

**A viewer without a list is shown the catalogue parts only.** Every filter
def, sort def and table column whose value is the viewer's own carries
`personal: true`, and `LibraryLayout` drops all of them when
`useViewScope().ownData` (`self.list`) is false, before `useLibraryState`,
the filter panel, the sort select or the table read the config
(`libraryConfigFor` in `lib/libraryScope.js`). So guest and shared see no
status filter, no My Rating or Usefulness sort, and no status, my, progress,
usefulness or plan-flag column at all - not empty ones - while super and user
see every def, the personal ones holding their own values. A default sort
that names a dropped sort falls back to the first remaining one, and the body
is keyed on the scope, so a sort or filter chosen before the viewer's
permissions changed is not carried across. Grid cards are `MediaCard`, which
draws no status button or chip without `ownData` on its own.

The flag decides by the value, not the name: personal means a field in the
server's `LIST_FIELDS` (`app/services/domain/user_list.py`) or a per-user
table - status and its status-group filter, my rating, usefulness, every
`fin / total` progress column, the plan flags, and `ownership`, which is
derived from the viewer's own `game_copy` rows. Airing, serialization and
release status, the external ratings, game `hours_played` and h-game
achievements are catalogue columns on the entry's row and are shown to every
viewer. In the table below the personal defs are marked *(p)*.

| Type | Series? | Filters (key: type) | Sorts | Table columns |
|---|---|---|---|---|
| anime | yes | airingType: set (TV/Movie/ONA/OVA/Special) · airingStatus: set · watchingStatus: set-grouped *(p)* · bahaOnly: boolean | title (franchise→series→entry), release_date, my_rating *(p)*, mal_rating, anilist_rating, anilist_popularity_rank | franchise, title, type, season, status, ep (`cum_ep_fin/cum_ep_total`) *(p)*, my *(p)*, mal, studio, baha, watch *(p)* |
| anime-movie | no | airingStatus · watchingStatus *(p)* · bahaOnly | title (en→roman→alt→cn→jp), release_date (jp→tw), my_rating *(p)*, mal_rating, anilist_rating, anilist_popularity_rank | franchise, title, status, my *(p)*, mal, studio, director, baha, watch *(p)*, watch_next *(p)*, to_rewatch *(p)* |
| movie | no | airingStatus "Release Status" · movieType (Reality/Animation) · watchingStatus *(p)* | title, release_date (year of `release_date_usa` only), my_rating *(p)*, imdb_rating | franchise, title, status, my *(p)*, imdb, director, release, watch *(p)*, watch_next *(p)*, to_rewatch *(p)* |
| tv-show | no | airingStatus · watchingStatus *(p)* · region: set-dynamic | title, release_date, my_rating *(p)*, imdb_rating, imdb_series_rating | franchise, title, season, status, ep *(p)*, my *(p)*, imdb, imdb_show, watch *(p)*, watch_next *(p)*, to_rewatch *(p)* |
| cartoon | yes | airingStatus · airingType: set-dynamic · watchingStatus *(p)* · officialSource: set-dynamic | title, release_date, my_rating *(p)*, imdb_rating, imdb_series_rating | franchise, title_cn, title_en, type, season, airing, ep *(p)*, source, my *(p)*, imdb, imdb_show, watch *(p)* |
| manga | yes | serializationStatus: set-dynamic · readingStatus: set-grouped *(p)* · region: set-dynamic | title, release_date, end_date, my_rating *(p)*, mal_rating, anilist_rating, anilist_popularity_rank | franchise, title_cn, title_en, status, ch *(p)*, vol *(p)*, my *(p)*, mal, read *(p)*, read_next *(p)*, to_reread *(p)* |
| novel | yes | serializationStatus · readingStatus *(p)* · region · type: set-dynamic | title, release_date, end_date, my_rating *(p)*, mal_rating, anilist_rating, anilist_popularity_rank | franchise, title_cn, title_en, status, progress (`getNovelProgress`) *(p)*, my *(p)*, mal, read *(p)*, read_next *(p)*, to_reread *(p)* |
| comic | yes | comicType: set-dynamic · readingStatus *(p)* · era: set-dynamic · events: set-dynamic (multi-value via `parseTypes`) | title (EN-first), release_date, my_rating *(p)* | franchise, title_en, title_cn, volume_label, comic_type, era, progress (`issue_fin / issue_total ISS`) *(p)*, my *(p)*, read *(p)*, to_reread *(p)* |
| game | yes | gameType: set-dynamic · playingStatus: set-grouped (Playing / Planned / Completed / Dropped / Might Play, via `PLAYING_STATUS_GROUP`) *(p)* · ownership: set-dynamic *(p)* · releaseStatus: set-dynamic | title (CN-first), release_date, hours_played ("Playtime"), metacritic_score ("Metacritic", highest first, unscored last), my_rating *(p)* | franchise, title_cn, title_en, game_type, hours_played (`32.5 h`), my *(p)*, play (`playButtonColumn`) *(p)*, to_replay *(p)* |

All default to the `title` sort. `Library.test.jsx` pins the twelve config
keys, requires more than three table columns and a `my_rating` sort per
config, and checks the unknown-type redirect; it also renders one library
for a guest and for a `self.list` holder on the same data and checks the
personal filter, sort and columns are drawn for the second only.
`configs/personal.test.js` requires every config's status-group filter,
my-rating sort, status, my and plan-flag columns to carry `personal: true`,
and every config to keep a catalogue sort and columns. Search strings cover every name
field of the entry plus franchise/series names, release date/season (anime
also matches `SPR2024` / `Spring2024`), genres, studio, label, for comic the
writer and volume label, and for game the game type and release status.

The game row's `ownership` filter reads a plain string: it is derived
server-side from the viewer's own `game_copy` rows and stored nowhere, which is
why it is `personal`. `playButtonColumn` is the third
`statusToggleColumn` beside `watchButtonColumn` / `readButtonColumn`, driven by
`getPlayingButtonConfig`; every one of them now also echoes its `statusField`
and `fallback` back on the column object so a test can read which field it
toggles.

### CollectionLibrary — `/library/collection`

File `pages/library/CollectionLibrary.jsx`. Raw `fetch` in one `Promise.all`:
`/api/collection/`, `/api/franchise/` and eight entry lists
(`/api/anime/`, `/api/anime-movie/`, `/api/movies/`, `/api/tv-shows/`,
`/api/cartoon/`, `/api/manga/`, `/api/novel/`, `/api/comic/`), each
`?limit=2000`, purely to resolve a cover per collection. **Games are not among
them**, so a game can never supply a collection cover. Search over the five
collection names; sort `title | my_rating (default) | collection_expectation`
for a viewer holding `self.list`, the viewer's own values. Without it the
viewer has neither, so only `title` is offered and the list sorts by title
whatever was chosen. No filter panel, no table view, no admin controls.
Renders `CollectionCard` with member count; the card's rating stamp and
expectation chip are drawn only with `self.list`.

### FranchiseLibrary — `/library/franchise`

File `pages/library/FranchiseLibrary.jsx`. Raw `fetch` of `/api/franchise/`,
`/api/collection/` and **every** entry list the session may see, each
`?limit=2000`, driven by the `ENTRY_SOURCES` table at the top of the file
rather than by positional bindings - the gated `h-comic`, `h-game` and
`hentai` lists each only for a session that can see its type, which is why the load waits
for `/api/auth/me`. The
full set is a requirement, not a preference:
`getFranchiseCover()` falls back to the placeholder silently for any entry
type the caller leaves out, and the table's Entries column counts whatever
`ENTRY_SOURCES` lists, so a gap there undercounts it.

Filter panel "Type": Anime, Manga, Novel, Anime Movie, Movie, TV, Cartoon,
Comic, H-Comic, H-Game, Hentai (each drawn only for a session that can see the type), Other
(Anime/Manga only count when the type is ACG *and* the franchise actually has
such entries) — **there is no Game category**, so a Game-only franchise files
under "Other". Sort
`title (default) | my_rating | franchise_expectation`, shared by both views;
the last two are the viewer's own, offered only to a holder of `self.list`,
and without it the list sorts by title.

Grid renders `FranchiseCard`. Table view renders the file's `TABLE_COLUMNS`,
whose markup and class names mirror the table in `LibraryLayout.jsx` so the
two read as one component: Franchise (a `Link` built by `entityPath`, plain
text when the row carries no `public_id`), Collection (`md`), Type (`lg`),
Entries, Expectation (`lg`), My. Expectation and My carry `personal: true`
and are dropped for a viewer without `self.list`, as are the card's
rating stamp and expectation chip. The breakpoint in brackets is where that
column collapses, so Franchise, Entries and My are what survives at phone
width; the wrapper is `overflow-auto`, so a wider table scrolls inside itself
rather than widening the page. Clicking a row navigates to the franchise.

### StudioLibrary — `/library/studio`

File `pages/library/StudioLibrary.jsx`. A studio is a public **entity**, not a
media type, so this sits outside `LIBRARY_CONFIGS` as its own component,
alongside `CollectionLibrary` and `FranchiseLibrary`; its route is declared
before `/library/:type` so the generic library page never claims it.

Raw `fetch` of `/api/studio/` alone — the response already carries
`display_name`, `credit_count`, `logo_file`, `country`, `my_rating` and
`media_types`, so no per-studio request and no entry lists are needed, and
every filter runs client-side. Search runs over **all four** name fields
(`STUDIO_NAME_FIELDS`), not just the displayed one, so typing "Kyoto
Animation" finds a studio displayed as "KyoAni". Sort
`name (default) | credit_count | my_rating`, the last — the viewer's own
rating — offered only to a holder of `self.list` (without it the list sorts by
name). No table view.

The **Filters** button (`FilterToggleButton`, with the active-chip count)
toggles a `FilterPanel` over `studioFilterDefs(auth)` from
`lib/entityFilters.js`, open when the page loads:

- **Entry type** — anime, anime movie, game, **No entries**, then a
  **Restricted** parent chip over hentai and h-game, matched against
  `media_types` (the types of the visible entries the studio is credited
  on). No entries matches a studio credited on nothing the viewer can see.
- **My Rating** — `MY_RATINGS` plus Unrated (null), the viewer's own
  rating; only for a holder of `self.list` (`studioFilterDefs(auth,
  { ownData })`).
- **Country** — the countries the loaded studios carry, sorted, plus Not set
  when one has none.

Every entity library opens on the same default, `defaultEntityFilters`:
every plain entry type and No entries on, the restricted types off, every
other group empty. So a studio credited only on a gated type is hidden until
Restricted (or one of its children) is ticked, while a studio nobody has
credited yet is still listed. **Clear all** empties every group — everything
the viewer may see, restricted rows included — and **Reset**, drawn once the
state is off the default, puts the default back. The empty state's **show
everything** link clears the search and every filter.

Each `StudioCard` (`components/cards/StaffCard.jsx`, shared with `/search`)
shows the logo with the `my_rating` stamp in its corner (none when unrated),
the display name and the credit count, and links to `/studio/:system_id`.

### PublisherLibrary — `/library/publisher`

File `pages/library/PublisherLibrary.jsx`. Same shape and the same reasoning as
`StudioLibrary`: a publisher is a public **entity**, not a media type, so it
sits outside `LIBRARY_CONFIGS` with its route declared before `/library/:type`.

One raw `fetch`, but through `endpoints.publisher.list()` rather than the
literal URL `StudioLibrary` still hardcodes — the deliberate divergence, so the
route lives in one place. The response already carries `display_name`,
`credit_count`, `logo_file`, `country`, `my_rating`, `media_types` and
`scopes`, so there is no per-publisher request. Search reuses
`STUDIO_NAME_FIELDS` (`lib/naming.js`, shared by studio, person and
publisher) and runs over **all four** name fields, so a publisher displayed
as 木棉花 is still found by typing "Muse Communication". Sort
`name (default) | credit_count | my_rating`, the last as on the studio
library. No table view.

The filter panel is the studio library's, over `publisherFilterDefs(auth)`,
open on the same default, with the same Clear all and Reset. **Entry type**
offers the six publisher types — anime, anime movie, manga, novel, comic,
game — and No entries, with no Restricted parent (no publisher type is
gated), and matches `media_types` **or** `scopes`: a publisher offered on
manga but not yet credited on one is still found under Manga. No entries
still means no visible credits, whatever the scopes. **My Rating** and
**Country** are the studio library's.

Each `PublisherCard` (`components/cards/StaffCard.jsx`, beside `StudioCard`)
shows the logo with the `my_rating` stamp in its corner (none when unrated),
the display name and the credit count, and links to `/publisher/:system_id`.

### PersonLibrary — `/library/person`

File `pages/library/PersonLibrary.jsx`. Same shape and the same reasoning as
`StudioLibrary` — a person is a public **entity**, not a media type, so it sits
outside `LIBRARY_CONFIGS` with its route declared before `/library/:type`.

Raw `fetch` of `/api/person/` alone: the response carries `display_name`,
`credit_count`, `display_photo_file`, `media_types`, `my_rating`, `gender`
and the `roles` each person holds, which is what lets every filter run
client-side — one request serves every filter, where a per-filter request
would refetch on each click. Search runs over all four name columns
(`PERSON_NAME_FIELDS`), not just the displayed one. Sort
`name (default) | credit_count | my_rating`, the last as on the studio
library.

The **Filters** button opens a `FilterPanel` over `personFilterDefs(auth)`
from `lib/entityFilters.js`, open when the page loads and on the studio
library's default (every plain entry type and No entries on, the restricted
types off), with the same **Clear all** and **Reset**; OR within a group,
AND across groups:

- **Type** — the `PERSON_SUB_TABS` roles, matched against `roles`; the Club
  chip only for a session that can see h-comic.
- **Entry type** — every non-gated media type, **No entries**, then a
  **Restricted** parent chip over h-comic, hentai and h-game, matched against
  `media_types` (the types of the entries the viewer can see the person
  credited or cast on). A gated child the session cannot see is left out,
  and the parent with it once none is left.
- **My Rating** — `MY_RATINGS` plus Unrated (null); only for a holder of
  `self.list`, as on the studio library.
- **Gender** — `GENDERS` plus Not set (null).

Each `PersonCard` (`components/cards/StaffCard.jsx`, shared with `/search`)
shows `display_photo_file` — the photo, or the server-resolved fallback
cover — with the `my_rating` stamp in its corner (none when unrated), the
display name and credit count, and links to `/person/:system_id`.

`/library/seiyuu` renders the same component with `role="seiyuu"`, which adds
`?role=seiyuu` to the `/api/person/` fetch server-side rather than filtering
client-side — not a new page type. With a role the page is named after it:
the heading, the loading text, the search placeholder, the count ("12
seiyuu") and the empty state all say seiyuu, and the **Type** group is
dropped (`personFilterDefs(auth, role)`), since every row already holds the
role. The nav marks the Seiyuu item active, not Person, and a card still
opens `/person/:system_id`, whose breadcrumb leads to `/library/person`. A
person holding the `seiyuu` role but never yet cast is listed by default,
under No entries: `person_role` exists precisely so a seiyuu can show up
before their first casting, and hiding them here would defeat that.

### CharacterLibrary — `/library/character`

File `pages/library/CharacterLibrary.jsx`. Same shape as `PersonLibrary` and
`StudioLibrary` — a character is a public **entity**, not a media type, so it
sits outside `LIBRARY_CONFIGS` with its route declared before `/library/:type`.

Raw `fetch` of `/api/character/` alone (server-side `?name=` search is what
the cast editor's combobox uses instead; this page searches client-side over
all four name columns). Sort `name (default) | casting_count` ("Appearances")
`| my_rating`, the last as on the studio library.

**Cards.** The list is flattened by `characterCards` (`lib/characterCards.js`)
into one card per character and one per identity in the response's nested
`identities`, each identity emitted right after its character (the library's
sort then decides the order shown); the count line counts cards. An identity card
is drawn as one: a **dashed** border and a dashed divider between cover and
footer, and an outlined spine reading **Identity** where a character's is a
solid ink spine reading **Character**. Its cover is the identity's own
`display_photo_file`, with nothing laid over it (no rating stamp); its footer
is the identity's display name, then its character's face (an 18px circle,
`character_photo_file` / `character_photo_focus`) beside the character's name,
then a dashed **Identity** chip — no casting count. It links to the identity's
own page, `/identity/<public_id>/<slug>`: the card's `public_id` is the
identity's, with the character's beside it as `character_public_id`. It sorts by its **own**
name, and filters by the identity's resolved gender (`display_gender`) but the
**character's** tags, rating, role and entry types - it is the same character.
Search matches every card of a character on the names of the character and of
all its identities, so "Conan" finds the Shinichi card too.

The **Filters** button opens a `FilterPanel` over
`characterFilterDefs(auth)` (`lib/entityFilters.js`), the person library's
groups without Type: **Entry type** — anime, anime movie, manga, novel, No
entries, then a **Restricted** parent chip over h-comic and hentai (not
h-game: nobody is cast on an h-game) — then **Role** — Main, Core,
Important Supporting, Supporting, Other, plus Not set for null, matched against the character's
own `role` field and never against the roles its castings carry — then **My
Rating** and **Gender**, then **Appearance** and **Trait** — `set-dynamic`
groups over the values the loaded characters hold, sorted, plus Not set when a
character's list is empty; a character matches when it holds any ticked
value — with the same OR/AND rule — then **Card** (Characters, Identities:
tick one to show only that kind; empty shows both) and **Identities** (Has
identities, No identities: an identity card always counts as having them). The panel is open when
the page loads, on the shared default, with the same Clear all and Reset.

Each character `CharacterCard` shows `display_photo_file` — the photo, or the
server-resolved fallback — with the `my_rating` stamp in its corner (none
when unrated), the display name and casting count, and links to
`/character/:system_id`.

### Person — `/person/:system_id`

File `pages/detail/Person.jsx`. The public profile for one person, built the
same way as the studio page below: two raw fetches — `GET /api/person/{id}`
by the URL's public id, then `.../entries` by the `system_id` it returns —
where the profile call failing is the page's 404 while the entries call
failing is not.

Layout: breadcrumb → (admin) the dashed **Admin** strip with **Quick edit**,
linking to `/modify?id=<system_id>&type=person` → left column with the photo
(`display_photo_file`: the photo, else the server-resolved fallback cover,
else `FALLBACK_SVG`) and rating stamp, (holder of `self.list`) a **My rating** select, and a
**Naming** card (`NamingCard`, each of the four names that is set) → right column with the
display name, credited-entry count and, for a person with a `mal_link`, a
**MyAnimeList** button beside it (`MalButton`, as on the character page; none
without one), a "Profile" `InfoCard` (gender; the types
they are offered under, by their `PERSON_SUB_TABS` labels — Director, Music /
Composer; MAL as an external link reading `Person #<mal_id>`; and for a
non-admin the remark), (admin) a **Remarks** textarea, then one section per
group.

The admin controls are `components/info/EntityProfileControls.jsx`, shared
with the character, studio and publisher pages. The rating select is the
viewer's own and drawn for a holder of `self.list`, not by `isAdmin`: it
sends `PUT /api/me/ratings/person/{system_id}` `{my_rating}` on change
(Unrated sends null) and folds the answer into the page's state
(`useMyRatingSaver`). The remark (admin) PATCHes `{remark}` on blur, an
emptied one as null and an untouched one not at all, to
`PATCH /api/person/{system_id}`, and the response becomes the page's state.

The one difference from the studio page: a person may hold several roles, so
`/entries` groups by **(media type, role)** and each heading is the group's
`label` — 原作 on a manga, Writer on a comic — which comes from the endpoint,
not from the page. A group the viewer may see no entries of still renders, with
"Nothing you can see here" inside it. Entry cards are the same local
`CreditCard`, not `MediaCard`, for the reason spelled out below.

A **seiyuu** group is drawn differently, because what a seiyuu is credited
with is a part, not a work: one `VoicedPartCard` per casting voiced
(`components/info/VoicedPartCard.jsx`), led by the character's picture and
name, with the entry as a small cover-and-title line at its foot. One entry
voiced as two identities is two cards.

**Club membership** (`components/info/ClubMembership.jsx`, under the Profile
card) is drawn only for a session that can see h-comic. A club - a person holding the `club` role -
shows its **Members** in the club's order (`GET /api/person/{id}/members`); an
artist shows the **Clubs** they belong to (`.../clubs`, ordered by name). For
an admin each list has an Edit button: remove, add from a search, and on the
member list drag a member by its grip (or ArrowUp / ArrowDown on it) to
reorder; the order is a draft until Save PUTs the whole list. The clubs editor is
offered on anyone holding an `h-comic`-scoped role, so it does not appear on
every director's page.

### Character — `/character/:system_id`

File `pages/detail/Character.jsx`. The public profile for one character,
hand-built beside `Person.jsx` and `Studio.jsx` rather than reusing a media
detail shape — the header is a profile and the body is the entries this
character is cast in. Two raw fetches, the profile then `.../entries` by the
`system_id` it returns; the character call failing is the page's 404, the
entries call failing is not. Under the Profile card, a **First Appearances**
`InfoCard` lists the character's First Mention, First Appearance and First
Encounter — only the ones that are set (`firstsRows`); with none set the card
is left out. Beside the appearance count under the name, a
character with a `mal_link` gets a **MyAnimeList** button (`MalButton`, the
MAL icon, opening in a new tab); one without draws none. The Profile card shows the character's own
**Role** beside Gender — its own field, not derived from any casting's role —
then **Appearance** and **Trait**, each list as a row of `Chip`s in its stored
order (`tagChips`) ("—" when empty, like every unset row), and a **MAL** row: the `mal_link` as an external link reading
`Character #<mal_id>` (`MyAnimeList` when no id was derived), "—" without a
link. The layout and the admin controls — Quick edit
to `/modify?id=<system_id>&type=character` and the Remarks textarea,
PATCHing `/api/character/{system_id}`, and the viewer's own My rating select
(`self.list`, `PUT /api/me/ratings/character/{system_id}`) — are the person
page's, as is the Naming card in place of a list of other names. The photo
is `display_photo_file`: the photo, else a casting photo (the chosen entry's,
then the newest visible), else an entry cover (the same order), else
`FALLBACK_SVG`.

The one structural difference from the person page: `GET
/api/character/{id}/entries` groups **by media type only**, because a
character holds no role the way a person does — see
`app/routers/character.py`'s `get_character_entries`. Each entry in a group
also carries every seiyuu who voiced the character there (`seiyuu`, a list of
`{display_name, system_id, public_id, remark}`), rendered beneath the entry
card as one small link per seiyuu with its remark in brackets - "Name (child)"
(`components/info/CastingCard.jsx`, shared with the identity page, not
`MediaCard`, for the same reason `Person.jsx`'s `CreditCard` is local) — since knowing who played the part is
the point of looking a character up, unlike a person's own credits. A group
the viewer may see no entries of still renders, with "Nothing you can see
here" inside it, same rule the person and studio pages follow.

**Identities.** A character with other identities draws an **Identities**
section after the profile: one card per identity
(`components/info/IdentityCard.jsx`) with its
photo (`display_photo_file`), display name, its other non-empty names (the four name columns but the displayed one), resolved gender and remark, each
card a link to the identity's own page (below); an identity with no
`public_id` in the response renders as plain markup. The appearances list shows one card **per
cast row**, keyed by `casting_id`: an entry the character is cast in under two
identities appears twice, a row with an identity reading "as <identity name>"
under the title, each with that row's own seiyuu. A row with a credited name -
what that entry calls the character - reads "as <credited name>" instead, the
identity's name following it after a "·" when the row names one.

### Identity — `/identity/:public_id`

File `pages/detail/Identity.jsx`, route `/identity/:publicId/:slug?`. The
public page for one of a character's other identities (Edogawa Conan of Kudo
Shinichi), hand-built beside `Character.jsx` and shaped like it: an identity
is its character under another name, so the page shows what the character
page does. The names, photo, gender, remark and firsts are the identity's own; the
role, the appearance and trait tags, the rating and the MAL link are the
character's. `GET /api/character-identity/{id}` by the URL's public id comes
first, and its failing is the page's 404 ("Identity not found."). Then two
reads run side by side: `.../entries` by the `system_id` it returns, and
`GET /api/character/{character_public_id}`. Neither failing is a 404 — the
page renders from what the identity carries, with no appearances or no
character facts. `useCanonicalPath("identity", …)` puts the slug in the
address bar.

Layout: a breadcrumb **Characters** (`/library/character`) / the character's
name, linking to its page / the identity's name → (admin) the dashed
**Admin** strip with **Quick edit**, linking to
`/modify?id=<system_id>&type=identity` → left column with the photo under an
**Identity** spine (`display_photo_file`, the identity's own photo else the
character's displayed one, as the server resolves it; else `FALLBACK_SVG`),
the character's `my_rating` stamp on it, read-only, and a **Naming** card
(`NamingCard type="identity"`, each of the four names that is set) → right column with the
display name, its appearance count and the character's **MyAnimeList**
button (`MalButton`), a "Profile" `InfoCard` — **Role**, then **Gender**
(`display_gender`, the character's when the identity sets none), then
**Appearance** and **Trait** (`tagChips`) and **MAL** from the character, and
the identity's **Remark**, shown to everyone — with a faint line under it,
"Role, tags, rating and MAL are <character>'s." Under it a **First
Appearances** `InfoCard` lists the identity's own firsts, only those set, and
is left out when none is; the character's firsts never show here. Then a **Character** section:
the character's own card, labelled **Character** and linking to its page, then
its other identities, labelled **Identity**, this one left out — all
`IdentityCard`s; the character's card never shows the character's remark.
Then one section per media type the entries endpoint returned. Nothing is
edited in place: an identity has no `PATCH` route and its rating is the
character's, set on the character's page, so there is no rating select and no
remarks textarea.

The appearance sections are the character page's: `/entries` answers the same shape,
narrowed to the cast rows that name this identity, a group the viewer may see
no entries of renders "Nothing you can see here", and no group at all reads
**No appearances**. The cards are the shared `CastingCard` with
`hideIdentity`, which drops the "as <identity>" line — every row here is this
identity. A row with a credited name still reads "as <credited name>". The nav lights **Character** on this page (`matches` includes
`/identity`).

### Publisher — `/publisher/:system_id`

File `pages/detail/Publisher.jsx`. The public profile for one publisher or
distributor, copied from `Studio.jsx` and behaving identically: two raw
fetches (`GET /api/publisher/{id}`, then `.../entries` by the `system_id` it
returns), the profile call failing being the page's 404 while the entries
call failing is not, a breadcrumb back to `/library/publisher`, the admin
strip with Quick edit to `/modify?id=<system_id>&type=publisher`, the
logo-plus-rating left column with the viewer's own My rating select
(`self.list`, `PUT /api/me/ratings/publisher/{system_id}`) and the Naming
card, the Remarks textarea for an admin (the remark row for anyone else),
PATCHing `/api/publisher/{system_id}`, and one section per group the entries
endpoint returned rendered as the same local `CreditCard`.

Two differences from the studio page, both in the "Profile" `InfoCard`: a
**Types** row naming the media types the publisher is offered on (`scopes`,
by their media-type labels), and **no MAL row** — `PublisherResponse` carries
no `mal_id` / `mal_link` at all, because MAL has no record of a games
publisher or a TW distributor. Country, founded/defunct and website are the
studio page's.

### Studio — `/studio/:system_id`

File `pages/detail/Studio.jsx`. The public profile for one studio, built by
hand beside the media detail pages rather than from their shape: a studio has
no franchise, no tracker and no notes.

Two raw fetches: `GET /api/studio/{id}` by the URL's public id, then
`GET /api/studio/{id}/entries` by the `system_id` it returns. The studio call
failing is the page's 404 (rendered through `MediaLoadingState`, as the media
pages render theirs); the entries call failing is not, since a profile
without its credits is still worth showing. The admin controls write back
through PATCH and take the response as the page's state, so plain `fetch`
serves where the media detail pages need TanStack hooks.

Layout:

1. **Breadcrumb** `/library/studio` → display name.
2. **Admin strip** (admin only) — the dashed strip with **Quick edit** to
   `/modify?id=<system_id>&type=studio`.
3. **Left column** — logo with the rating stamp, (admin) the **My rating**
   select, then the **Naming** card (`NamingCard`, each of the four names that is set —
   English, Chinese, Japanese, Alternative — the displayed one included, as
   on the person and character pages).
4. **Right column** — the display name, a credited-entry count and, for a
   studio with a `mal_link`, a **MyAnimeList** button beside it (`MalButton`,
   as on the person and character pages; none without one), a "Profile"
   `InfoCard` (country; `founded – defunct`, or `Since founded` while the
   studio is still working, and no invented span when both are empty;
   website and MAL — `Producer #<mal_id>` — as external links; the remark
   for a non-admin), (admin) the **Remarks** textarea, then one section per
   group the entries endpoint returned, each entry linking to
   `{nav_path}/{system_id}`.

The controls are `EntityProfileControls`, the person page's: the
viewer's own rating select (`self.list`) sends
`PUT /api/me/ratings/studio/{system_id}` on change, and the admin's remark
PATCHes `{remark}` on blur to `PATCH /api/studio/{system_id}`.

Empty `groups` renders "No credited entries" as an ordinary empty state, not
an error: that is exactly what a viewer whose permissions hide every one of
this studio's credits sees.

The entry cards are a local `CreditCard`, **not** `MediaCard`. `MediaCard`
resolves its title through `getDisplayName(data, type)` and reads status,
franchise and admin props; the entries endpoint returns four keys
(`system_id`, `display_name`, `cover_image_file`, `release_date`), so
`MediaCard` would render blank titles. A group whose `nav_path` is null
renders the card unlinked.

### Hubs — `/franchise/:id`, `/series/:id`, `/collection/:id`

Files `pages/detail/FranchisePage.jsx`, `SeriesPage.jsx`, `CollectionPage.jsx`
(thin wrappers `Franchise.jsx`, `Series.jsx`, `Collection.jsx`). Chrome comes
from `components/hub/` (`HubShell`, `Crumbs` — whose `action` slot holds the
hub's **Report a problem** —, `AdminStrip` — the admin-only
dashed strip with the **Quick edit** link `/modify?id=…` —, `HeroCover` with
the spine strip and optional progress rule, cropping the borrowed cover at
its entry's focal point, `Field`, `HubTabs`, `Section`,
`HubLoading/HubError/HubEmpty/FilterEmpty`).

All three fetch with raw `fetch` in one effect keyed on `system_id` with a
`cancelled` flag; Franchise and Series also `setActiveTab(null)` on id change
so the first available tab is re-picked (Collection keeps "Franchises").

| | FranchisePage | SeriesPage | CollectionPage |
|---|---|---|---|
| Loads | `/api/franchise/{id}`; series, anime, anime-movie, movie, tv-show, cartoon, manga, novel, comic, **game** lists `?franchise_id=`, **h-comic**, **hentai** and **h-game** only when `franchise_type` names a type of the restricted family (`H-Comic`, `Hentai` or `H-Game`, `inFranchiseFamily`); `/api/plan-next/?scope=franchise`; parent collection lazily | `/api/series/{id}`; anime, movie, tv-show, cartoon, manga, novel, comic `?series_id=`, **game** included (no anime-movie — they have no series), **h-comic** in its own effect, only for a session that can see the type, **h-game** and **hentai** likewise, and only once the parent franchise has loaded and its `franchise_type` names a type of the restricted family; `/api/plan-next/?scope=series&kind=rewatch`; parent franchise | `/api/collection/{id}`; `/api/franchise/?collection_id=`; eight entry lists, covers only — game is not among them |
| Hero badges | `TierBadge` with `franchise_type`, names, my_rating, "{x} Expectation" (these two, here and on the other two hubs, the viewer's own and drawn only for a holder of `self.list`), parent collection link, "Plan Next: {type} ({bucket})", "To Rewatch/Reread: {type}", total entries, completion bar | same shape with `series_expectation`, rewatch chips, parent franchise link | names, my_rating, `collection_expectation`, "{n} Franchise(s)" |
| Content labels | the franchise's OWN labels as `ContentLabelChips`, with a note that they hide its series and entries; no row when it carries none | the series' own, noting they hide its entries | the collection's own, noting they hide every franchise, series and entry in it |
| Curation controls | Overall Rating and Expectation selects for a holder of `self.list` (`PUT /api/me/ratings/franchise/{id}`); for an admin, **Plan Next** `SizeGroupControls` (per-type checkbox + derived/manual size-group select → PATCH `size_group_manual`) and rewatch `PlanKindToggles` | Overall Rating and Expectation (`self.list`, `PUT /api/me/ratings/series/{id}`); rewatch `PlanKindToggles scope="series"` for an admin (no size groups at series level) | Overall Rating and Expectation (`self.list`, `PUT /api/me/ratings/collection/{id}`) |
| Remark | the viewer's own remark: a textarea drawn, editable, for a holder of `self.list` and not drawn at all without it; "Show all" opens `RemarkModal` (editable on the same key); saved on blur / modal close via `PUT /api/me/remarks/franchise/{id}` `{ remark }` (`useMyRemarkSaver`; emptied is null, untouched saves nothing) | same, `PUT /api/me/remarks/series/{id}` | same, `PUT /api/me/remarks/collection/{id}` |
| Tabs | "Media" (counted): Anime, Anime Movies, Manga, Novel, Comic, **Game** ("Base games, DLC & expansions", sorted by `release_date` ascending), **H-Comic**, **H-Game** and **Hentai** (each by `series_number`, then release date; the H-Comic, H-Game and Hentai tabs each allowed by any type of the restricted family), Movies, TV Shows, Cartoons — shown when `franchise_type` allows *and* the list is non-empty; "Extras": Characters (only with `view.character`), Watch Order, Relations, Notes. Every media tab's "Sort: my rating" option is offered only with `self.list` | Media tabs by non-empty list only; same extras. Its **Game** tab carries its own sort (release_date default, then title / my_rating / hours_played) and a Game Type filter the other tabs have no equivalent of — a series usually mixes a base game with its DLC | "Members" → Franchises (`FranchiseCard`s); extras Watch Order, Relations, Notes |

Plan toggles call `POST /api/plan-next/` `{ media_type, scope, kind, target_id }`
(409 tolerated) and `DELETE /api/plan-next/target?scope=&media_type=&kind=&target_id=`
(404 tolerated). Each "Media" tab shows the number of entries its list holds,
and the hero's entry total and completion bar are taken over every listed
tab: an entry counts as completed when its own type's status field
(`MEDIA_CONFIG[type].statusField` — `watching_status`, `reading_status` or
`playing_status`) holds one of `COMPLETED_STATUSES`. Both pages build the tab
row, the counts and the totals from one list of
`{ label, type, entries, offered }` rows (`lib/mediaTabs.js`,
`buildMediaTabs`), so a tab is never shown without being counted. Media tabs carry a sort select, a group-by-series checkbox
(on by default for anime/comic/movies/tv/cartoons) and filter pills specific to
the type. Extras render `HubCharacters` (below), `WatchOrderSection` (see below),
`RelationGraph readOnly scopeType=… scopeId=…`, and `{Tier}Notes` with the
`remark` section hidden whenever the hero already shows the remark box.

**Characters tab.** `components/hub/HubCharacters.jsx` lists the characters
cast on the tier's entries - characters, not the cast: each character once,
however many entries it is cast on, with its own picture and overall `role`,
plus one dashed card for each of its identities cast on those entries. It asks
`GET /api/character/?franchise_id=` (or `?series_id=`), which counts only
castings on entries the viewer may see, and draws `CharacterCard`s grouped by
`characterCardsByRole` (`lib/characterCards.js`): Main, Core, Important Supporting, Supporting,
Other, then No role, each group by name with an identity right after its
character. Offered to every viewer holding `view.character`, like the other
extras; an empty tier says so. Without the key the tab is not in the row and
`HubCharacters` never mounts, so `/api/character/` — which would answer 401 —
is not asked.

**Hero cover resolution.** Both hubs build their combined entry list from every
list the page loaded and hand it to `getFranchiseCover` / `getSeriesCover`. It
was not always so: both lists had silently omitted **comics**, so a
comic-covered franchise fell back to the placeholder, and a game would have
joined that omission. The games work fixed both and corrected
`getSeriesCover`'s docstring, which still claimed the caller passes "six flat
entry arrays". The rule the docstring now states is the one to respect: a
series whose `cover_entry_id` points at a type left out of the list falls back
to the placeholder in silence.

### Detail pages — `/{type}/:system_id`

Files `pages/detail/Anime.jsx`, `AnimeMovie.jsx`, `Movie.jsx`, `TV.jsx`,
`Cartoon.jsx`, `Manga.jsx`, `Novel.jsx`, `Comic.jsx`, `Game.jsx`, `HComic.jsx`,
`HGame.jsx`, `Hentai.jsx`.

**Tab title and contents.** The tab reads the entry's displayed title - the
`<h1>`'s - through `usePageTitle`, and the type's name ("Anime") while it
loads or when it fails. The page sits in `DetailContents`, which draws a
sticky **Contents** column on the right on `xl:` screens and nothing below
`xl`. Its rows are the main-column sections this viewer was actually shown,
in page order - Watch orders, My tracker (or the type's own tracker block),
Naming, Information, Genres, Production, Cast and each type's further
sections - then the note cards: Notes, each group card (攻略 Guides, never
its Beginner and Controls) and each standalone section. The header and the
left column are not listed. See
[components.md](components.md#in-page-table-of-contents).

**Common skeleton.** Data: `useMediaItem(type, id)` mirrored into local
state, `useMediaList("franchise", LIST_OPTIONS)`, `useMediaList("series")`
(not AnimeMovie), and `useMediaCacheUpdate(type, id)` for
`setMediaItem / fetchMediaItem / invalidateMedia`. Two kinds of write, by
whose value it is:

- **The viewer's own** - status, my rating, progress counters, Paused at
  (`time_fin`), usefulness, Novel's `progress_display` and the plan flags
  (`watch_next` / `to_rewatch` and each type's spelling) - go through
  `saveOwn(fields, msg)` from `hooks/useOwnTrackerSave.js`, which calls
  `useStatusToggle(type)`: plan flags to `PUT /api/me/plan-flags/{id}`, every
  other key to `PUT /api/me/list/{id}`. It is a no-op without `self.list`
  (`useViewScope().ownData`), merges optimistically, then replaces the held
  entry with the answer - the entry with the saved row folded in - and calls
  `setMediaItem`. `/api/me/list` keeps the tracker's rule that reaching the
  total finishes the row, so the toast is `progressToast`'s: "Marked as
  Completed!" when the answered status became Completed. On failure, toast
  "Update failed" and refetch.
- **The work's** - an editor's (`isAdmin`) - go through the catalogue PATCH
  `endpoints.resource(type).patch(id)`: the release step (below), Game's and
  H-Game's completion axes and Novel's units editor (those three pages keep a
  local `performPatch` for them), with the same optimistic merge, replace and
  failure handling.

Top to bottom:

1. **Breadcrumb** `/library/{type}` → title, with **Report a problem** at
   the row's right-hand end for a `self.requests` holder (see MyRequests).
2. **Admin toolbar** (`isAdmin`): **Quick Edit** → `/modify?id={id}`;
   **Mark Completed** → `POST {apiEndpoint}/{id}/complete` then refetch;
   the **release button** (`components/tracker/MarkReleaseButton.jsx`, rules
   in `lib/releaseAction.js`) moves the entry one step along its release
   axis, and is absent when there is no next step. It is the one control
   that edits the work and the viewer's row together, so `saveRelease` (from
   `useOwnTrackerSave`) splits it: the release fields go to the catalogue
   PATCH and `RELEASE_PERSONAL_FIELDS` - the Watch When Airs → Active
   Watching move on **Mark airing**, and anime's **My watch day** in the
   dialog - to `PUT /api/me/list/{id}`, in one `useStatusToggle` mutation.
   The page passes `canTrack={ownData}`; without `self.list` the step moves
   no status and the dialog does not ask for My watch day:

   | Type | Shown when | Label → writes |
   | --- | --- | --- |
   | Anime, TV Show, Cartoon, Hentai | `airing_status` is `Not Yet Aired` or `Rumored` | **Mark airing** → `Airing` |
   | | `airing_status` is `Airing` | **Mark finished airing** → `Finished Airing` |
   | Movie, Anime Movie, and an Anime or Cartoon whose `airing_type` is `Movie` | `airing_status` is `Not Yet Aired` or `Rumored` | **Mark released** → `Finished Airing` |
   | Novel | `serialization_status` is `未出` | **Mark serializing** → `連載中` |
   | Manga, Comic, H-Comic, Novel | `serialization_status` is `連載中` (on Novel also `連載中 (不穩定)` / `連載中 (有生之年)`) | **Mark finished serializing** → `完結` |
   | Game, H-Game | `release_status` is `Rumored`, `Unreleased` or `Early Access` | **Mark released** → `Released` |

   An empty status, `Canceled`/`Cancelled`, `停更`, `腰斬` and a game's
   `Ongoing` show no button: none of them has a next step. Manga, Comic and
   H-Comic have no not-yet-released value, so they only ever show the
   finishing step. The **release** step (not the finishing one) first opens
   `ReleaseDetailsModal` for whichever details the entry is still missing:
   every release-date column the type has (`releaseDate.js`
   `RELEASE_PRIORITY`), plus on a non-movie Anime `broadcast_day`,
   `broadcast_time` and `my_watch_day`. Every field is optional; confirming
   writes the status plus only what was filled in, Cancel writes nothing, and
   with nothing missing the button writes at once.
   **Mark airing** also sets `watching_status` from `Watch When Airs` to
   `Active Watching` in the same write, as the future-release card's bolt
   does; any other watching status is left alone.
   **Autofill & Update** → `POST /api/data-control/replace/{type}/{id}`
   with a spinner. On Game and H-Game it runs both sources: IGDB, fill-only
   (release date, times, credits, tags, cover, the Steam pair when the entry
   has none), then Steam (SteamDB link, store figures, progress). Comic renders no
   Autofill button: the single Replace route exists for it, but Comic Vine
   carries no score or rank that drifts, which is also why comic is not in
   bulk Replace.
3. **Left column**: poster card (my_rating badge, cover, hover progress
   overlay — percent or "{n} ep"), `SourcesCard` (Baha/Netflix/other,
   MAL/AniList/official/Twitter/IMDb links, official source, serialization
   platform), `RelationsSection` (GET
   `/api/media-relation/for-entry?media_type=&entry_id=`, hidden when empty,
   "Related Entries" sorted by relation family; omitted on Comic), and an
   admin-only **System Info** card with the system id.
4. **Right column**: header chips (status / type), h1 title (cn → en →
   roman), h2 subtitle, `ContentLabelChips` — the entry's OWN content labels,
   rendered only when it has some, and never its franchise's, which are shown
   on the franchise where they can be changed — franchise/series bar linking
   to the hubs,
   `ScoreBlock` (MAL score, MAL rank, AniList score, AniList rank, AniList
   popularity — every figure labelled with the source it came from, since
   AniList's score is an integer on its own 0–100 scale and MAL's is 0–10)
   on Anime,
   AnimeMovie, Manga, Novel (Movie has an inline IMDb block; TV/Cartoon/Comic
   none), then — directly under the header, on all twelve entry types —
   `FollowedOrderPanel` (the viewer's followed watch orders that step
   through this entry: order, group, step N / total, previous and next step;
   nothing when none does, or for a viewer without `self.list`), the tracker,
   `NamingCard`, `InfoCard "Information"`, on Manga, Novel, Movie, TV and
   Cartoon a **Genres** card (`GenresCard`: Genre (Main), Genre (Sub) and
   標籤 Label in a card of their own, directly after Information and not
   repeated inside it, left out when none of the three is set), `InfoCard
   "Production"` — whose Studio row on Anime and AnimeMovie is built by
   `studioValue()` (`components/info/StudioLinks.jsx`): one link to
   `/studio/{system_id}` per entry in `studio_refs` (plain text, not a link,
   for a viewer without `view.studio` — every entity name on an open page
   follows that rule for its own kind's key, through `useEntityHref`), falling back to the plain
   comma-joined `studio` string when there are none, which is what a viewer
   without the Credits permission and an entry whose studio never resolved to
   a row both get — and beside it, on **all six** types that credit a publisher
   (Anime, AnimeMovie, Manga, Novel, Comic, Game), `publisherValue()`: the same
   rule over `publisher_refs` with the route swapped to `/publisher`, under a
   heading `publisherLabel(entry, fallback)` reads off `publisher_refs[0].label`
   — the backend's `credit_label("publisher", media_type)`, so no page
   hard-codes 台灣代理商 or 發行商 and the fallback literal only shows on an
   entry with no publisher credited yet — a **Cast** slip (Anime, AnimeMovie, Manga, Novel; GET
   `/api/casting/{media_type}/{entry_id}` via `useCasting`), drawn by the
   shared `components/info/CastSection.jsx` and rendered only when the entry
   has a cast. Rows are sorted by role in `CHARACTER_ROLES` order — Main,
   Core, Important Supporting, Supporting, Other, then no role (`castRoleRank`) — then by
   `position` (`sortCast`, `lib/castOrder.js`), and each shows a small
   cover-or-portrait thumbnail, a role chip, a link to the character (the
   name as plain text for a viewer without `view.character`, as is the
   identity name, and the seiyuu names below without `view.person`), and — on Anime/AnimeMovie, the voiced types
   — "voiced by" and every seiyuu of the casting as a link to their person
   page, separated by "·", each followed by its voice remark in brackets
   ("voiced by A · B (child)"). The slip starts collapsed to the Main
   characters; **Show core cast (+N)** widens it to Main and Core and
   **Show main cast only** narrows it back; **Show full cast (N)** opens a
   dialog listing every row, every role. With no Main character the collapsed
   view starts at Core, and a cast with no Main or Core character is shown
   whole with no tier controls. A row cast as one of the character's other
   identities is drawn as one — a dashed frame on its thumbnail and a dashed
   **Identity** chip after the role chip — and reads "<identity> identity of
   <character>", the identity linking to its page and the character to its
   own. A row with a credited name — what this entry calls the character —
   shows it as the linked name, with the identity's (else the character's)
   own name in small faint text beneath it. It is **hidden by
   default** when its character also has a main row in the cast: **Show
   identities (N)** brings those back and **Hide identities** folds them
   again, one toggle shared by the slip and the full-cast dialog, not
   persisted. An identity row whose character has no main row is how that
   character appears at all, so it is always shown and never counted in N.
   The tiers and their counts are worked out over the rows the toggle leaves
   visible — the viewer's own remark textarea (rendered only for a holder of
   `self.list` who already has a remark, with the Notes `remark` section
   hidden exactly then so the row never has two editors; blur-saves a changed
   value through `useMyRemarkSaver` → `PUT /api/me/remarks/{owner_type}/{system_id}`
   `{remark}`, never the entry's PATCH), then `{Type}Notes` →
   `pages/notes/NotesTemplate.jsx` — except Game, which composes
   `NotesProvider` / `NotesGroup` / `NotesBlocks` itself (see **Notes** below).

**Tracker**: every tracker slip is the viewer's own list row, so it is drawn
for a holder of `self.list` (`useViewScope().ownData`, passed as `canTrack`)
and not at all for anyone else - an editor without `self.list` included -
and every control in it is enabled and saves through `saveOwn`, never the
catalogue PATCH. `MyTrackerCard` (`components/tracker/MyTrackerCard.jsx`:
progress stepper with cumulative counts, status select, rating select,
an optional **Paused at** text input (`time_fin`, `PausedAtInput`), optional
Watch/Read Next and To Rewatch/Reread checkboxes) on Anime, TV (`watch_next`
+ `to_rewatch`), Cartoon (`watch_next`), AnimeMovie and Movie (no stepper,
`watch_next` + `to_rewatch`, Paused at placeholder `1:10:00`) - those five
pass `onTimeFinChange` - Comic (`issue_fin`, `reading_status`, `to_reread`),
Game and H-Game (`playing_status`, `to_replay`). Game and H-Game pass **no**
`onEpChange`, which is what drops the stepper: a game has no unit to count
off, and playtime lives in its own Progress slip instead.
Game also renders `components/tracker/GameCompletionBlock` directly below the
tracker: `completion_level` plus the three completion axes as four selects -
`all_endings` and `all_collected` over `GAME_COMPLETION_FLAGS`,
`all_achievements` over its own `GAME_ACHIEVEMENT_FLAGS` (Fully before Yes) -
each patching the one field it changed and sending `null` rather than `""`
for the unset option. The axes are columns on the game, so they are an
editor's: a select for `isAdmin`, written through the catalogue PATCH, and a
read-only `Chip` for any other signed-in viewer; nothing at all for a
logged-out visitor.
Manga uses a local `MangaTrackerBlock` (`ch_fin`, `vol_fin`, `vol_fin_page`,
`read_next`, `to_reread`); Novel uses `components/tracker/NovelTrackerBlock`
(`ch_fin/vol_fin/arc_fin` by `progress_display`); H-Comic and Hentai use the
local blocks described below. All take `canTrack` and draw nothing without
it. **Mark completed** stays in the editor's toolbar: `POST /{id}/complete`
asks `manage.catalog` and also writes the work's airing status. A list
holder who is not an editor finishes an entry by choosing Completed in the
status select, which goes through `/api/me/list`.

**Per-type differences**

| Page | Information card | Production card | Extras |
|---|---|---|---|
| Anime | 本傳/外傳, Season Part, Special Episodes, Total Episodes (with cumulative), Airing Type/Status, Release Season, Release Date, Genre main/sub, 標籤 Label | Studio, 台灣代理商 (linked `publisher_refs`), Director, Producer, Music | remark lives only in Notes (no textarea); Cast placeholder |
| AnimeMovie | Airing Status, Length, Release Date JP/TW, Genre main/sub, 標籤 Label | Studio, 台灣代理商 (linked; the row this page gained in the publisher migration — it had none before), Director | no series query; Cast placeholder |
| Movie | 本傳/外傳, Airing Status, Length, Director, Release Date TW/USA | — | **Genres** card (`GenresCard`); inline IMDb score block |
| TV | 本傳/外傳, Season, Total Ep, Official Source, Airing Status, Release Date | — | **Genres** card (`GenresCard`); IMDb block with this season's rating, and the whole show's beside it when there is one |
| Cartoon | + Airing Type, Length Per Ep (min) | — | **Genres** card (`GenresCard`); IMDb block as TV's |
| Manga | Region, 本傳/外傳, Serialization Status/Platform, Release/End Date, Volume/Chapter Total | 作者 or 原作/作畫, 台灣出版商 (linked), Anime Studio (card shown only when any value) | **Genres** card (`GenresCard`), between Information and Production |
| Novel | Region, Type, Version, 本傳/外傳, Serialization Status, Release/End Date, Vol Total (JP/KR)/TW, Arc Total, Chapter Total | Author, Illustrator, 台灣出版商 (linked, conditional) | **Genres** card (`GenresCard`), between Information and Production; **Units** card (`NovelUnitsEditor` over the `units` relationship — volume/arc/story/chapter rows with a key, CN/EN name and, on an arc, a chapter count; a `manage.catalog` holder gets the editor with drag-to-reorder/add/remove and a Save → PATCH carrying each unit's own fields only (`novelUnitPayload`), everyone else a plain list keyed by each row's server-computed `display_key`. For a holder of `self.list` each row of that list carries the viewer's own rating select (`MY_RATINGS`, saved on change) and remark field (saved on blur), both through `useSaveMyNovelUnit` → `PUT /api/me/novel-units/{unit_id}`; an account holding both keys gets the editor and, under it, that list headed **My ratings**. The admin holds no `self.list` and gets no such control. Hidden entirely for a viewer when the novel has no units) |
| Comic | Type, Volume Label, Continuity, Era, Serialization/Reading Status, Release Year, Issue Total, Genre main/sub, 標籤 Label | Writer, Artist, 出版商 (linked, conditional), Imprint | **Events** card (red pills); no Autofill, no `RelationsSection`, no `ScoreBlock` |
| Game | Type, Main / Remake (`is_main`), Base Game (a link to `/game/{base_game_id}`), Platform, Mode, Combat Mode — only what the game *is*; the rest sits in cards of its own, below | **Production & Release**: Developer (`studioValue`), 發行商 (`publisherValue`, labelled by `publisherLabel` rather than a bare literal), Director, Composer, Release Status, Release Date, Current Patch — always shown, with a dash for an empty field | **Genres** card (Genre, Theme, 標籤 Label — the same `Label` vocabulary anime shows); **Reception** card (Metacritic / Metacritic User, each carrying its own denominator — `96 / 100`, `8.6 / 10` — via the exported `outOf` helper, a missing score showing the card's dash rather than a zero; the public verdict, not mine, which is the stamp on the cover); **Time to Beat** card (`TimeToBeatCard`, after Reception: Main, Main + Extra and Completionist from `hltb_main`, `hltb_main_extra` and `hltb_completionist`, IGDB's time-to-beat in hours, formatted by `hours` in `lib/gameHours.js` - only the recorded figures get a field, and with none recorded the card is left out); **Library** card (Ownership, server-derived; Copies, a count; Steam Progress Sync — whether Steam may write this entry's progress, a fact about the source rather than an answer about a playthrough, so it sits with the copies while playing status and the four completion axes stay editable in the tracker and Completion blocks); **Progress** slip (`GameProgress`: playtime against `hltb_main`, achievements gated on `achievements_total` — nothing renders when neither figure exists, since "0 h / ? h" reads as "played none of it" rather than "never measured"); the **分歧 Choices** card (`ChoiceGraphCard`: a still preview of the game's choice graph and **View all**, see below); **Prices** card (MSRP in USD / JPY / TWD); **Copies** slip (`GameCopiesSection`: one row per `game_copy` — storefront and ownership as chips, then format, acquisition, price with the copy's own currency via `copyPrice`, acquired date and remark — sorted by `position`, and rendered only when the game has copies, so the Library card's count is not their only trace on the page; editing still happens in the Add/Modify tab); a cover-side `ProgressRule` on `hours_played / hltb_main`; a Remarks slip, the viewer's own remark, that appears only for a holder of `self.list` who already has one; `SourcesCard` with `igdbLink` (under "Where to Look Up") and `steamLink` (under "Where to Play", since a Steam store page is a storefront rather than a reference database); no `RelationsSection`, no `ScoreBlock`, no Cast |

**H-Comic** (`pages/detail/HComic.jsx`) is a gated type's page: App.jsx
routes to it only for a session that can see h-comic
([components.md](components.md#gated-media-types)), and the API answers 404 to
any other, so the page itself re-checks nothing. It follows Manga's layout,
with the region deciding what shows (`lib/hComicRegion.js`):

| | JP | KR |
|---|---|---|
| Tracker counter | pages, `page_fin / page_total` | chapters, `ch_fin / ch_total`, beside **Behind official: N** from `ch_behind` (hand-set, never derived) |
| Information card | Region, Serialization Status, Originality, Animation Status, Series Number, Page Total, Release/End Date | Region, Serialization Status, Chapter Total, Chapters Behind Official, Official Source, Release/End Date |
| Credits card | 繪師 (`illustrator`), Club | 繪師, Club, Author |
| Naming card | the JP name | the KR name |
| Notes | remark list, reviews and the shared sections | the same, plus **亮點 Highlights** |

Both regions carry the tracker's reading status, rating, **usefulness**
(personal, like the rating) and Read Next / To Reread - a local
`HComicTrackerBlock`, drawn for `self.list` and saved through `saveOwn`;
**Behind official** is the work's and is also in the Information card; a **Genres** card (Genre
Plot / Appearance / Relation); `SourcesCard` with the KR official source as its
tag, and the MAL link and the E-Hentai gallery (`ehentaiLink`, tag "EH")
under "Where to Look Up"; `RelationsSection`; a **Cast** slip, the shared
`CastSection` (characters only - an h-comic casting never carries a seiyuu);
the series number beside the
series link on JP. The admin toolbar has Quick edit, Mark completed and
**Autofill & update**, which runs `POST /replace/h-comic/{id}` - Tenrai's
manga record, then the E-Hentai gallery's cover and illustrator where still
blank, all fill-only.

A JP entry's **Animation Status** is hand-set or derived, as
`animation_status_source` says (`lib/hComicAnimation.js`). While a hentai
adapts the entry the server serves a derived status, and the Information card
shows it with **Derived from** and a link to each adapting hentai
(`adaptingHentai`). The names come from `RelationsSection`'s own rows, handed
up through its `onRows` prop, so naming them costs no request; until the rows
arrive the note reads "a linked hentai adaptation".

`HComicNotes.jsx` hands the notes page the entry row (so the KR-only
Highlights section is dropped on a JP entry), the cast's names (suggested in
the Highlights `names` inputs) and `highlight_group_order` - the viewer's own
order, or null - with a callback that saves a new one through
`useHighlightGroupOrderSaver` (`api/mutations/useMyHighlightGroupOrder.js`):
`PUT /api/me/highlight-group-order/{system_id}` with `{group_order}`, the new
order shown at once and every cached h-comic detail refreshed after. The
callback is passed only to a holder of `self.personal_notes`, so nobody else
is offered the reorder. Highlights read as one group per female character, a
row naming two under both; dragging a group by the grip on its header - or
ArrowUp / ArrowDown on that grip - saves the whole new order, and the rows
inside a group are not movable. The reorder is **provisional UI**: the
ordinary group grips, pending the owner's design for a per-user order
([systems/notes.md](../systems/notes.md#h-comic-highlights-h_comic_highlights)).

**H-Game** (`pages/detail/HGame.jsx`) is the second gated type's page, routed
the same way. It is Game's page for what `h_game` holds: one `NotesProvider`
around the page, `MyTrackerCard` (playing status, rating, To Replay), a
Progress and Todo slip, the 分歧 Choices card (`ChoiceGraphCard`), the Prices card, the read-only Copies slip
(`GameCopiesSection`, imported from `Game.jsx`) and an Autofill button (Game's
IGDB and Steam fill, through `replaceSingle("h-game")`). What differs:

| | |
|---|---|
| Completion block | `GameCompletionBlock` with `H_GAME_COMPLETION_AXES`: Completion Level, All Endings, **All CG** - the work's, an editor's through the catalogue PATCH - and **usefulness**, the viewer's own (marked `personal` in the axes), drawn for `self.list` and written through `saveOwn` (`onOwnChange`) - no All Achievements or All Collected |
| Progress | `HGameProgress`: the main-story estimate and achievements - there is no playtime, so the cover's progress rule is achievements earned against the total |
| Information card | Type, Main / Remake (`is_main`), Base Game (an h-game), Series Number, Play Style, Platform, Language. A multi-choice list reads "None" when it is `[]` and a dash when it is `null` (`choiceText`) |
| Genres card | Genre, Theme, Genre Plot / Appearance / Relation |
| Presentation card | Art Style, H 演出 Art Style, H 演出形式, Dialogue Audio, Sound Effect — how it looks and sounds |
| Production & Release card | Developer (`studioValue`), Release Status / Date, Current Patch — always shown |
| Time to Beat card | `TimeToBeatCard`, as on Game - Main, Main + Extra, Completionist, only the recorded ones, and left out when none is |
| Library card | Ownership, Copies, Steam Progress Sync, as on Game |
| Sources | `SourcesCard` with `igdbLink`, `steamLink` and the two DLsite links under "Where to Play" |
| Notes | every game section, plus **亮點 Highlights** |

No Metacritic, no Cast and no `RelationsSection`. The provider is handed the
entry row, the viewer's own `highlight_group_order` and, for a holder of
`self.personal_notes`, the callback that PUTs a new one, exactly as on
H-Comic; an h-game has no cast, so the Highlights `names` inputs
take free text with no suggestions
([systems/notes.md](../systems/notes.md#h-game-highlights-h_game_highlights)).

**Hentai** (`pages/detail/Hentai.jsx`) is the third gated type's page, routed
the same way. It is tracked like Cartoon: a local `HentaiTrackerBlock`
(watching status, rating, **usefulness**, Paused at, Watch next, To rewatch) whose slip
carries `MyTrackerCard`'s `EpisodeStepper` in its actions slot - `ep_fin` of
`ep_total`, `PUT /api/me/list/{id} { ep_fin }`, and `progressToast`'s "Marked
as Completed!" when a step reaches the total and the server finishes the row;
the whole slip is drawn only for `self.list` - then
`NamingCard`, and three cards - **Information** (Source
Material, Originality, Airing Status, Release Date, Episodes), **Credits** (Studio via `studioValue` and Director on one row, Author below, each person linked through `creditValue`) and
**Genres** (Genre Plot / Appearance / Relation), with a **Cast** slip between
Credits and Genres - the shared `CastSection`, characters with "voiced by"
every seiyuu, from `useCasting("hentai", …)`, drawn only when the entry has a
cast. The spine reads "Hentai" and
the source material; the series number sits beside the series link. The left
column carries `SourcesCard` with `malLink` and `anidbLink` and `RelationsSection`. The admin
toolbar has Quick edit, Mark completed and **Autofill & update**, the
single-entry Tenrai and AniDB fetch (`replaceSingle("hentai")`: airing
status, release date, episode count, cover and the Official site / Twitter
reference rows,
each only where blank, AniDB only for what MAL left blank). A Remarks slip appears only for a
holder of `self.list` who has a remark, and `HentaiNotes.jsx` is the plain wrapper - the type has no
notes section of its own - with the `remark` section hidden exactly then.

`MarkAiringModal` is not used by any detail page; only `MediaCard` opens it.

**Notes.** Each `pages/detail/*Notes.jsx` is a one-liner around
`NotesTemplate` with `ownerType` = `anime | anime-movie | cartoon | collection
| comic | franchise | game | h-comic | h-game | hentai | manga | movie |
novel | series | tv-show`
(`HComicNotes` also passes `owner`, `nameSuggestions`, `groupOrder` and
`onGroupOrderChange`; `HGameNotes` the same less `nameSuggestions`). `NotesProvider`
(`pages/notes/NotesContext.jsx`) fetches `/api/notes/sections?owner_type=` and
`/api/notes?owner_type=&owner_id=` (cancellable) and owns the mutations;
`NotesBlocks` renders a "Notes" card for ungrouped sections plus one card per
registry group, and hands `quotes`/`memes` sections to `QuoteSection` /
`MemeSection` — for an account holding the `quotes_memes` feature
(`hasFeature`). Without it both sections
are dropped from the registry the page draws, before either component can
fetch `/api/quote` or `/api/meme`. A personal section needs no such rule:
the registry lists it for every viewer, and `/api/notes` returns only the
viewer's own rows in it. Write controls are gated **per section**, from its
`scope`: a catalogue section (and Quotes and Memes) for a holder of
`manage.catalog`, a personal one - 備註 Remark, the reviews and advantages,
the highlight sections, the 待辦 todos, 存檔 Saves and 下周目目標 NG+ Goals
among them - for a holder of `self.personal_notes`; the admin holds neither
key and is drawn no control (components.md, `pages/notes`).
The personal values on catalogue rows - an item's collected and collected
amount, an enemy's beaten, an ending's completion, a stat's Mine, a mod's
status, each song's and each song list's status - are the viewer's own and
gated apart from their section: a holder of `self.personal_notes` (and of
the feature, for the music and mod statuses) edits its own inline on every
row, through `PUT /api/notes/{id}/mark`, whether or not it may write the
section, and the row's form never shows them; anyone else reads them. The
item and enemy cards carry an **NG reset** button for the same holder, which
asks in place and then clears its collected values and beaten across the
whole owner (`POST /api/notes/ng-reset`), toasting how many were cleared.
Both controls are **provisional UI**, plain controls pending the owner's
design.
A **mixed** section - 武器&裝備, 道具, 收集物, 敵人, 角色, 地理, 配裝&流派,
隊伍組成, 攻略資源 and Resources - holds catalogue rows and the viewer's own
personal rows together, the catalogue rows first within each group. A holder
of `manage.catalog` adds catalogue rows and edits, deletes and reorders those
only; anyone else holding `self.personal_notes` adds personal rows and edits,
deletes and reorders its own only, and sees the catalogue rows read-only. In
地理 Geography a catalogue writer is offered no personal row to nest under. A
personal row carries a **Mine** chip, **provisional UI** pending the owner's
design (components.md, `pages/notes`).
`SHAPES` maps all nine stored shapes to components,
`structured` → `StructuredSection` among them, so a new registry section needs
no frontend change as long as it reuses an existing shape — every one of the
game-only sections did. Group cards render in registry first-appearance order,
so a group's position is decided by where its first section sits in
`NOTE_SECTIONS`.

**The series' and franchise's notes show on an entry's detail page.** Every
entry detail page passes the `series` and `franchise` rows it already resolves
for its header to the notes (through the `*Notes.jsx` wrapper, or straight to
`NotesProvider` on Game.jsx and HGame.jsx; Anime Movie passes no series, since
it has none). Each section the entry has then also lists, after its own rows,
the rows the series and then the franchise hold in that section, each under a
mono "From series" / "From franchise" heading linking to the group's page,
read-only. The Modify tabs and the Add page's notes panel pass neither, so
they show the entry's own rows alone. The rules are in
[systems/notes.md](../systems/notes.md#series-and-franchise-notes-on-an-entry).

**Game.jsx and HGame.jsx use no `*Notes.jsx` wrapper** (`GameNotes` and
`HGameNotes` are the Modify tabs'): each composes the three pieces itself, so
that 待辦 Todo renders inside its Progress slip (`NotesGroup groupKey="todo"`)
while everything else renders at the bottom (`NotesBlocks hideGroups={["todo"]}`),
from one provider and one fetch. `hideSections` and `hideGroups` are the only
places the frontend names a registry key; see systems/notes.md.

**The 分歧 Choices card** (`components/game-choices/ChoiceGraphCard.jsx`)
sits right after the Progress and Todo slip on both pages, inside the same
provider, because it reads the viewer's 存檔 Saves from it. It is a still
preview of the game's choice graph - fixed height, fitted to view, no pan,
zoom or clicks - headed by the counts, "n parts · n choices · n endings"
(parts counts every block, choices both kinds of branch; and, for a viewer
who can mark, "x / y endings done"), and a **View all** button opening
`ChoiceGraphModal`, where the graph is browsed, marked and edited: the canvas
in the middle, a left drawer for the selected block, branch or link, and a
right rail listing the story's starts and endings, each with **Show in
graph**. An empty graph reads "No story parts yet." and, for a manage.catalog
holder, offers **Add the first block**, which opens the modal on the
new-block form.
The rules are in [systems/game-choices.md](../systems/game-choices.md).

### WatchOrderPage — `/watch-order/:system_id`

File `pages/detail/WatchOrderPage.jsx`. GET `/api/watch-order/lists/{id}`
(404 → "Watch order not found."), then the owner (`/api/franchise/{id}` or
`/api/collection/{id}`) and sibling lists
`/api/watch-order/lists?franchise_id=&collection_id=` (self excluded);
cancellable. Shows owner link, `MediaScopeLine`, list name, badges
(`list_type`, most-recommended, Default, "{n} steps"), an **admin-only** link
to `/watch-orders`, `WatchOrderGuide` (filter all / essentials / no-optional,
section blocks, list remark) and "Other orders for {owner}".

The hub tab uses `components/tracker/WatchOrderSection.jsx`: lists for the
scope, chips for 2–6 lists (select above 6), inline guide capped at 10 steps
with a "see full" link, and an admin-only **Add built-in order** button
(`POST /api/watch-order/lists/release?…`, hidden once a release order exists).
Editing happens only on the admin `/watch-orders` page.

### Pages in two versions: with a list and without

`/seasonal`, `/seasonal/:seasonal_id`, `/statistics` and `/future-releases`
read the catalogue, so they sit inside
`<ProtectedRoute anyPermission={LIBRARY_MEDIA_TYPE_PERMISSIONS}>` in
`App.jsx` and their nav rows ask the same list: every viewer that reads an
ordinary media type opens them, a guest and a shared account included, and
the admin, holding none, does not. Each page asks `useViewScope().ownData`
(`self.list`) once, at the top, and draws one of two components: the
viewer's own version with a list, and the catalogue's without one. The
catalogue version never asks for a per-user read (`/api/seasonal/`,
`/api/plan-next/`, the full lists Statistics counts), so it draws no error
for a viewer those would refuse. `/plan` and `/completions` stay inside
`<ProtectedRoute permission="self.list">`: they are nothing but the
account's own rows.

### SeasonalOverall — `/seasonal` · SeasonalDetail — `/seasonal/:seasonal_id`

Files `pages/public/SeasonalOverall.jsx`, `SeasonalDetail.jsx`. Raw fetch.
Overall loads `/api/seasonal/current-season`, `/api/seasonal/`,
`/api/franchise/`, then `/api/anime/?airing_season=` for the current and next
season. Tabs **Current Season** (sections Completed / Watching / Planned /
Might Watch / Dropped with a `RatingDistributionBlock`), **Next Season**
(Watch When Airs / Plan to Watch / Might Watch / Other) and **All Seasons**
(year × WIN/SPR/SUM/FAL table linking `/seasonal/{id}`). Detail loads
`/api/seasonal/{id}`, `/api/anime/?airing_season={id}`, `/api/franchise/`,
with prev/next season arrows, a `RatingDistributionBlock`, and sections
Completed / Watching / Watch When Airs / Plan to Watch / Might Watch /
Dropped. The hero's **Planned** figure is `entry_planned`, which still counts
both of the two planned statuses together. Both render `DashboardCard`s with the same
optimistic `PUT /api/me/list/{id} { ep_fin }` (`putMyListRow`). **The
viewer's own** (`useViewScope().ownData`): a "Seasonal Rating" select →
`PATCH /api/seasonal/{id} { my_rating }`, the account's own season row, and
the steppers. **Without a list** each page is its `…Catalogue` component:
Overall reads `/api/seasonal/current-season` and `/api/seasonal/catalogue`
(every season the viewer's visible anime aired in, with its count), then the
current and next seasons' anime; the season tabs show the season's anime in
one grid with no status split (`components/seasonal/CatalogueSeasonGrid.jsx`:
`MediaCard`s, best MAL score first), a Total figure and no season rating or
rating distribution, and **All Seasons** is the year × season table built
from the catalogue's seasons, each cell with its count. Detail reads only
`/api/anime/?airing_season={id}` and draws the same grid under the
prev/next arrows. Neither reads `/api/seasonal/` or `/api/franchise/`.
**An editor's** (`isAdmin`): the hint to set the current season
under Admin → System Config when none is set, and, on Detail,
`components/tracker/SeasonBulkActions.jsx`, two
buttons that act on the whole season, each behind a `ConfirmModal` and each
reloading the page when done: **Autofill & update** runs the anime detail
page's own Autofill & update (`POST /api/data-control/replace/anime/{id}`)
for every anime in the season with a `mal_link`, one request at a time, the
button counting `Autofilling 3/12…`; **Mark finished airing (n)** sends
`PATCH /api/anime/{id} { airing_status: "Finished Airing" }` for each anime
still `Airing` or `Not Yet Aired`, and is not shown when there is none. A
toast reports how many succeeded and names each failure with the server's
`detail`.

### Statistics — `/statistics` · Completions — `/completions`

Files `pages/public/Statistics.jsx`, `pages/statistics/useStatisticsData.js`,
`StatsFavoriteGrids.jsx`, `StatsFranchiseSummary.jsx`, `StatsCompletions.jsx`,
`StatsCatalogue.jsx`, `pages/public/Completions.jsx`,
`components/charts/BarChart.jsx`.

**Without a list**, Statistics is `StatsCatalogue.jsx`: counts of the
catalogue from one `GET /api/statistics/catalogue` - entries per type (in
the registry's order), anime per season and entries per genre, each a plain
table - over what the viewer's role and mode show. The personal sections
below, and the sidebar that indexes them, are absent rather than empty, and
`useStatisticsData` never runs. Everything else in this section is the
version with a list.

`useStatisticsData` runs `useMediaList` for franchise, series and every
entry type the session may see (`h-comic`, `h-game` and `hentai` each only
when visible, and handed on as `null` otherwise) plus `useApiQuery(["api","seasonal"], "/api/seasonal/")` and
`useApiQuery(["api","seasonal","current-season"], "/api/seasonal/current-season")`.

`StatsSidebar.jsx` is a sticky in-page table of contents down the left, built
from `pages/statistics/sections.js` — one entry per block and one per
favourite grid (a gated grid's entry only for a session that can see its
type), with an IntersectionObserver highlighting whichever section is
nearest the top. It is `lg:`-only: on a narrow screen the page is already one
column. A section's id is both the sidebar's anchor and the block's `id`,
because `sections.js` is the only place either is written down.

Every block is headed by `StatsSectionHeader.jsx` — an eyebrow and an `<h2>`
at one size — so the page has exactly one `<h1>`, its own.

Statistics renders the favourite 3×3 grids (nine, and eleven for a session
that can see h-game), then the twelve
"Rating distribution" bar-chart cards in one wrapping grid: my rating per
anime franchise; MAL rating and **AniList score** over all anime; seasonal
per season; my rating over all manga / novels / anime movies / movies /
**comics**; and my rating per TV show / cartoon / **game** franchise - plus a
thirteenth, my rating over all **h-comics**, and a fourteenth, my rating per
**H-Game** franchise (as Game's card counts game franchises), and a fifteenth,
my rating over all **hentai**, each only for a session that can see its type
(`useStatisticsData` hands `allHComic` / `allHGame` / `allHentai: null` to
anyone else). Game Spend reads the `game` list only, so an h-game's copies
never reach it. Comics, h-comics and hentai are counted per entry rather than per franchise, because a comic
franchise is usually one long-running title. `computeScoreRows` puts a numeric column into
a bucket ladder, and `ANILIST_BUCKETS` is `MAL_BUCKETS` scaled by ten and
rounded — AniList's `averageScore` is an integer 0–100 against MAL's 0–10, so
the two cards sit side by side on the same cut points.

**The favourite grids** are declared in `config/favoriteGrids.js`, read by
both this page and `/modify` → Fav3x3. A grid holds one of three tiers — seven
hold franchises (ACG, Novel, Movie, TV, Cartoon, Game, H-Game), one holds
series (Comic), three hold entries (Movie, Game, H-Game) — and every tier stores a slot the
same way, a `type_slots` map of `{gridKey: 1..9}` on the row itself. The
`favorite*` helpers in `utils/statsUtils.js` (`favoriteName`, `favoriteCover`,
`favoritePath`, `favoritePool`, `slotIn`) answer everything that differs
between tiers (`favoriteCover`, like `getCoverForSlot` and
`getSeriesCoverForSlot`, returns `{ url, focus }`, so a group's slot crops its
borrowed cover at the focal point of the entry it came from), so both consumers are tier-blind and a new grid is a config
entry. A block is sized to its nine covers rather than stretched across a
column, and the blocks wrap.

**The game spend block** (`StatsGameSpend.jsx` over the pure functions in
`gameSpend.js`) totals the `game_copy` rows the game list already carries.
Subtotals are kept in cents and per currency; converted USD and TWD figures
appear only when FX rates have been entered on the admin page, because a
total built from a rate nobody entered looks exactly like a real one. Three
columns: **Owned** is every copy with a `price_paid`, **Bought** narrows to
`acquisition === "Bought"`, and **Should spend** prices those same bought
copies at the game's own list price — `price_original_us` / `_jp` / `_tw`,
picked by the copy's own currency, and failing that the first of US, JP, TW
that is filled in. A fallback price stays in its own currency and is never
converted into the copy's, so it shows under that currency and meets the rest
in the converted totals. Bought and Should spend cover the same copies, so the
two subtract to what waiting for a sale was worth; only a bought copy whose
game has no list price in any region is counted under the column rather than
priced at zero. The System page's Bought Copies Without a List Price lists
those copies, so they can be found and filled in.

The **Value** card is cost per hour, and a title counts only when it has
logged hours, a convertible price and a list price of its own. The last of
those is what keeps a bundle share or a free weekend off the top of "best
value": what was paid for those is not what an hour of that game costs. Each
of the three exclusions is counted and named separately under the card, since
they mean different things.

Completions renders `StatsCompletions`:
one tab per type with paged sub-groups (anime by airing type, anime movie by
studio bucket, movie/TV Disney/Marvel/other, cartoon by network, manga by
region, novel by region, comic dynamic, game by `completion_level` on the
closed ladder with the unrecorded ones last, h-comic by region, h-game by
`completion_level` as game with usefulness shown per row, hentai by
`source_material` (Original, Manga, Novel, the unrecorded ones last) with
usefulness shown per row - each gated type's tab and list only for a session that can see it) using `COMPLETED_STATUSES`. The
game tab filters on `playing_status === "Completed"` plus a `completed_at`:
the completion **level** is a separate axis shown per row, so a Main Story
finish still counts as finished. The hentai tab is drawn by a local
`GroupedCompletions` component - titled groups of ten a page, the shape the
other tabs draw by hand. No admin
controls on either page.

### FutureReleases — `/future-releases`

File `pages/public/FutureReleases.jsx`. `useMediaList("anime")`,
`useMediaList("franchise")` (with a list only: it feeds the expectation sort),
`useApiQuery(["api","seasonal","current-season"], "/api/seasonal/current-season")`,
and lazily per tab `anime-movie`, `movie` (`{ limit: 2000, airing_status: "Not Yet Aired" }`),
`tv-show`, `cartoon`, `game`. Tabs Anime / Anime Movies / Movies / TV Shows /
Cartoons / Games.
Anime keeps `Not Yet Aired` from the current season onward, grouped
"Spring 2025" / year / TBD with type chips; anime movies group by release
year; TV also includes "Airing". Games keep `release_status` of `Rumored` or
`Unreleased` — `Early Access` is already out and `Cancelled` is never coming —
grouped by the year of `release_date` with TBD last, and sorted inside a year
by that date, so a full date precedes a bare year. Cards are `MediaCard`: the status select
is drawn for a holder of `self.list` and the release bolt for an editor
(`isAdmin`); `onUpdated` patches the `["media-list", type]` caches.
**With a list**, anime and anime-movie groups are ordered by the viewer's
status (Watch When Airs, Plan to Watch, Might Watch) and then franchise
expectation, and under each card an **On your list** chip (any status) and a
**Planned** chip (any plan flag) are drawn from the fields the list response
carries. **Without one**, every group is in release-date order
(`primaryReleaseValue` + `releaseScore`, undated last) and no chip is
drawn.

### RandomPicker — `/random` · `/random/:type`

Files `pages/public/RandomPicker.jsx`, `lib/randomPicker.js`,
`lib/pickerWeights.js`, `hooks/usePickerData.js`,
`components/picker/ModeStrip.jsx`, `components/picker/PickerWeights.jsx`. Behind
`view.random_picker`; it draws from the same lists the library pages read, so
it can only offer what the viewer may already see.

**Two versions, by `useViewScope().ownData`.** With a list (`self.list`),
everything below. Without one - a shared account - the catalogue version:
every FilterDef flagged `personal: true` is dropped
(`filterDefsForMode(mode, types, { personal })`, one rule for every mode:
the status groups, my rating, the franchise mode's entry status and
expectation, and every library filter its config flags, such as a type's own
status, ownership and usefulness), the draw is
uniform, the Weights tab and the **Weighted** checkbox are not drawn (a
`?tab=weights` link opens the picker), a saved default naming a personal
filter is ignored, and `/api/plan-next/` is never asked. What is left is
media type, the type's catalogue filters, release decade, genre and the
external score.

**Genre** (`genre`) is a catalogue filter in both versions: its chips are
the genres the pool holds, and an entry matches when any of its genres is
on. It reads each type's own field, a ", "-joined string on every list
response (`GENRE_FIELD`): `genre_main` on the eight mainstream types and
`game_genre` on game and h-game. The adult genre fields are left out, as
`/api/statistics/catalogue` leaves them out, so h-comic and hentai have no
genre chips. The franchise mode does not offer it: a franchise has no genre
of its own, and "any entry's genre" would make most franchises match most
chips.

**External score** (`externalScore`) is a catalogue filter in both versions:
chips `9+`, `8+`, `7+`, `6+` and `No score`, which OR like every chip, read
from `mal_rating` for anime, anime movies, manga and novels and from
`imdb_rating` for movies, TV shows and cartoons; a null or `N/A` score, or a
type with no score field, is `No score`. It is named "MAL Score" or "IMDb
Score" when the mode's types share a source and "External Score" otherwise,
and it is not offered where no type has a score (game, comic, the gated
types, the franchise mode).

A strip of mode links runs across the top: **All**, then one per media type
the session may see (`visibleMediaTypes`), then **Franchise**. Each mode has its own filters,
rendered by the library's `FilterPanel`. Each mode opens on its **default
filters**, saved on the admin Picker Defaults page
([admin-pages.md](admin-pages.md#random-defaults-pickerdefaultsjsx)) and read
from `/api/random-picker-defaults/<mode>` by every viewer the page opens for; a mode with none saved,
or whose defaults cannot be read, opens with every filter empty. Switching
mode starts over from that mode's defaults, with no pick.

- **All** (`/random`) fetches every visible type and filters on what all
  types share: media type, status (the watch, read and play groups renamed
  onto one set - Planned, In Progress, Completed, Dropped, Might; an unset
  status is Might, as the library counts it), my rating (`S`…`F`, or
  Unrated), and release decade (from each type's primary release column,
  newest first, Unknown last). A gated type the session may see is in the
  pool like any other; untick it with the media-type chips.
- **One type** (`/random/<type>`) fetches only that type and offers its
  library page's own `filterDefs`, then my rating and release decade.
- **Franchise** (`/random/franchise`) draws a franchise, not an entry. It
  fetches every franchise and every visible type's list; the lists give each
  franchise its cover (the franchise library's `getFranchiseCover`) and say
  what it holds. It filters on franchise type (each type of a multi-type
  franchise counts), the media types it holds an entry of, the status groups
  of the entries it holds (the All mode's groups; a franchise matches when any
  entry does), expectation, and my rating — the status groups, expectation
  and rating the viewer's own, flagged `personal`. It always draws evenly - the
  weights are an entry's own status, rating, plan marks and release, which a
  franchise does not have - so it shows no **Weighted** checkbox. The pick is
  a `FranchiseCard`.

Within one filter the chosen chips OR; across filters they AND, exactly as
on the library page. **Pick** draws from the pool, weighted or evenly as the
**Weighted** checkbox beside the pool count says (see below), and the pick
shows the chance it had ("1 in 37 (2.7%) chance"); **Pick again** never
repeats the entry on screen while the pool holds another, and its chance is
out of the pool without it. **Clear all**, beside it, turns every filter off
and drops the pick, and **Defaults** (shown only when the mode saved filters,
or saved weighting off) puts the saved filters and weighting back and drops
the pick; the panel has no clear
link of its own here (`FilterPanel` draws one only when handed
`clearFilters`). The pick is
a `MediaCard` (with its type named above it in All mode) whose `onUpdated`
patches the `["media-list", type]` cache, and the page reads the pick back
from that cache by key, so a status change made on the card shows at once.
The lists share the library pages' cache keys (`mediaListQueryKey(type,
LIST_OPTIONS.params)`), so visiting either one warms the other. Nothing is
persisted.

**The weighted draw** (`lib/pickerWeights.js`, on unless the mode saved it
off) has two stages. First a status group is chosen among the groups the
filtered pool holds, in fixed proportions (In Progress, Planned, Might,
Completed, Dropped, heaviest first), so a group's share of the draw does not
grow with its size. The weighting groups statuses as the Status filter does,
except that Temp Dropped counts as In Progress and Watch When Airs and Play
When Released as Might. Then one entry of that group is chosen by the product
of its entry factors: my rating and a summary completion (Completed only),
the larger of its plan marks (next over rewatch, whether marked on the entry,
its series or its franchise), release decade (2000s and later over earlier or
undated), and, in the manga, novel and h-comic modes only, serialization
status. Because every entry factor applies inside the group already chosen,
none can move an entry into another group's share. A status, rating or
serialization value the tables do not name weighs 1. Status group, rating
and plan marks are the viewer's own, flagged `personal` in `WEIGHT_INPUTS`:
with `personal: false` in its context `entryFactors` sets them to 1 and
`drawChances` keeps the pool in one group. The page asks `/api/plan-next/`
for the series and franchise marks (under the Plan page's `["plan-next"]`
key) only with a list. The numbers are the tables in `lib/pickerWeights.js`, and
the **Weights** tab (`?tab=weights`, `PickerWeights.jsx`) renders those same
tables, so it lists exactly what the draw uses.

### Plan — `/plan`

Files `pages/public/Plan.jsx`, `pages/plan/usePlanData.js`, `PlanWatchNext.jsx`,
`PlanToRewatch.jsx`, `PlanToWatchFuture.jsx`, `PlanNextCard.jsx`.
`usePlanData` runs a `useMediaList` for franchise, series and each of the twelve
entry types (`h-comic`, `h-game` and `hentai` each enabled only for a session that can see it)
and `useQuery({ queryKey: ["plan-next"], queryFn: () => fetchJson("/api/plan-next/") })`
— deliberately not a media-list key. Rows are decorated with a `bucket`
(`utils/planNext.js` `entryBucket`) and a cover for franchise/series scopes.
Sections: **Watch Next** (`PLAN_TABS`, `kind === "next"`, grouped by
`SIZE_GROUPS` with manga's empties under "其他"; the **Game** tab has no
`SIZE_GROUPS` entry at all and renders one ungrouped list, deliberately, since
every existing bucket keys off a count and a game would key off hours; **H-Comic**,
**H-Game** and **Hentai** are ungrouped the same way and each drawn only for a session that can see the type; hentai is queued at entry scope only), **To Rewatch**
(`REWATCH_TABS`, scopes Franchise → Series → Entries via `scopesFor`; h-comic and hentai at entry scope only, h-game at all three as game),
**Plan to Watch for Future Releases** (Watch When Airs / Plan to Watch,
grouped by year, `MediaCard variant="future"`; an update bumps `reloadKey`
which invalidates `["media-list"]` and `["plan-next"]`). Toggling plan flags
happens on hubs, detail pages and Modify, not here. See systems/plan-next.md.

### Quotes — `/quote` · Memes — `/meme`

Files `pages/public/Quotes.jsx`, `Memes.jsx`, shell
`components/layout/GroupedEntryPage.jsx`. Quotes:
`useApiQuery(["quotes-grouped"], "/api/quote/grouped", { params })` with
`media_type`, `is_general`, `is_favorite` (the viewer's own; the toggle
shows only with the `favourites` feature), `needs_review` (admin-only
toggle), `search_query`. Memes: `useApiQuery(["memes-grouped"], "/api/meme/grouped", { params })`
with `owner_type`, `is_favorite` (as on Quotes), `search_query`. The Quotes media-type
filter offers H-Comic, H-Game and Hentai only to a session that can see each type. Both group rows under an
owner card (cover or tier icon; "Unlinked / deleted owner" when missing).
Row actions: copy text/image for everyone; the viewer's own favourite star
(`FavoriteStar`, only with the `favourites` feature, `PUT
/api/me/favorites/{kind}/{id}`); **admin-only** edit (`QuoteForm` /
`MemeForm`, PATCH `/api/quote/{id}` / `/api/meme/{id}`) and delete, followed
by `invalidateQueries` on the grouped key.

### Resources — `/resources`

Files `pages/public/Resources.jsx`, `components/resources/ResourceTree.jsx`,
`components/resources/ResourceMarkdown.jsx`, helpers `lib/resourceTree.js`,
writes `api/mutations/useResourceMutations.js`. One site-wide page of notes,
the admin's and super's alone: the route, the nav row and every
`/api/resources` call ask `manage.resources`, and its holder also gets every
edit control. `useApiQuery(["resources"], "/api/resources")` returns the
top-level nodes with `children` nested to any depth, every level already in
`sort_index` order with groups and items interleaved; the page draws them in
that order and sorts nothing.

- **Reading.** A group is a collapsible heading (chevron, title, child count;
  open by default, collapse state not kept). Top-level groups are bordered
  slips with an `h2`; each level down is indented behind a rule and one
  heading level deeper, capped at `h6`. An item shows its optional title and
  its Markdown `content` through `ResourceMarkdown` (`react-markdown` +
  `remark-gfm`: inline links, autolinked bare URLs, lists, tables). Raw HTML is
  dropped, a `javascript:` link renders without an executable href, and every
  link opens in a new tab with `rel="noopener noreferrer"`. Why Markdown:
  [decisions](../notes/decisions.md), "A Resources item's body is Markdown".
- **Editing** (`has("manage.resources")`, which every reader of the page
  holds; the server refuses writes from anyone else). **Add group** at the top; **Add item** / **Add subgroup** at
  the foot of every group; every row has a grip on its left, and its hover
  toolbar has a **Move to…** list, **Edit** and **Delete**. Edit is inline: a group's
  title, or an item's title and a Markdown textarea with a Write / Preview
  switch. Delete asks in `ConfirmModal`, and for a group says what goes with
  it ("3 items and 1 subgroup"). POST `/api/resources`, PATCH
  `/api/resources/{id}`, DELETE `/api/resources/{id}`.
- **Moving.** Every move is one PATCH `/api/resources/reorder` with
  `{parent_id, ordered_ids}` - the complete new child list of the parent the
  node lands in (the old parent's remaining children keep their order, so it
  needs no request). A node is dragged by its grip (dnd-kit pointer drag, so
  the page keeps scrolling under the mouse wheel mid-drag): dropping on a row
  takes that row's slot in its parent, dropping on a group's body appends to
  that group, the innermost box under the pointer is the target, and while
  dragging a "Drop here to move it to the top level" strip appears at the
  foot of the page. ArrowUp / ArrowDown on a grip moves the node one place
  among its siblings. Every move control is disabled while a write is in
  flight. **Move to…** lists the top level and every group the node
  may enter. A group is never offered itself or any group inside it - the
  drop is refused (`canDropInto`) and the option is left out. A reorder is
  applied to the cache first and rolled back if the request fails; every
  write then invalidates `["resources"]`.

### MyRequests — `/requests`

File `pages/public/MyRequests.jsx`; data `useMyRequests()` from
`api/mutations/useRequestMutations.js` (`GET /api/requests/mine`, key
`["requests", "mine", "all"]`). The account's own requests and reports,
newest first, behind `<ProtectedRoute permission="self.requests">` — user and
super; never the admin account, whose role holds no `self.*` key.

- **Table**: kind, what it is about (`RequestTarget`: a link through the
  target's `nav_path`, plain text when there is none, "(deleted)" after the
  name of a target that is gone, the page address for a request without a
  target), description, remark, status, the handler's response and the filing
  date.
- **The response column** is one constant at the top of the file,
  `SHOW_RESPONSE_TO_FILER` (true). The API returns `response` either way.
- **Edit** on a row whose `can_edit` is true (the caller's own and still
  open) opens `RequestModal` on that request: description and remark only.
  Nothing on this page deletes.
- **New request** opens `RequestModal`'s general form, which opens on the
  new-entry kind and offers a page-address field for a bug report. A refusal
  — 409 at the open-request limit, in the server's own sentence — shows inside
  the modal, which keeps the draft.
- Loading and error through `MediaLoadingState`; an empty list says how to
  file one.

A request about one entry, group or entity is filed from that page's
**Report a problem** instead (`components/requests/ReportProblemButton.jsx`,
see [components.md](components.md#requests)). It sits at the right-hand end
of the breadcrumb row on every media detail page, the three hubs (through
`Crumbs`' `action` slot) and the five entity pages, and is drawn only for a
`self.requests` holder. Its placement is provisional, pending the owner's
design.

### Login — `/login`

File `pages/public/Login.jsx`. Heading "Sign in". POSTs
`/api/auth/login` as `application/x-www-form-urlencoded` (`username`,
`password`), then **loads** `?next` when it starts with `/` and does not point
back at `/login`, otherwise `/system`. A full page load, not a route change -
everything cached up to that moment was cached as a guest. A refusal shows the
server's `detail` as it comes, inline and as a toast: the generic 401, the
403 a pending or a disabled account gets after the right password, and the
429 that says how many minutes to wait.

`?username=` pre-fills the username field - `/reset` lands here that way.
The saved-users row (up to three usernames this browser signed in with, from
`lib/savedUsers.js`) still replaces it on a click.

**Forgot your password or username?** under the form toggles a short note
(`aria-expanded`): ask the admin for a reset link, which works once for 24
hours and shows your username. It is a note only - no form, and no link to
`/reset`, which is useless without a code from the admin.

### ResetPassword — `/reset`

File `pages/public/ResetPassword.jsx`, in no menu: the only way here is a
reset link from the admin, `/reset?code=…`. On load it asks
`GET /api/auth/reset?code=` whose account the code is for, which does not
spend it. Without a code, or for any code the server refuses, the page shows
one message - the server's `detail` (`This link is not valid. Ask the admin
for a new one.`, or the 429) - and no form. Otherwise it reads "Setting a new
password for *username*", with the new password twice. The two must match,
and `lib/newPassword.js` repeats the server's only two checks (not empty, at
most 72 UTF-8 bytes) so the form can say so before a round trip; anything the
server still refuses (404, 422) is shown inline and the page stays. A save
POSTs `{code, password}` and then **loads** `/login?username=<username>` - a
full page load, as signing out is, because the server has just ended every
session of the account and cleared this browser's login cookies.

### Settings — `/settings`

File `pages/public/Settings.jsx`, behind `<ProtectedRoute
permission="self.list">`.

- **Account** - the username and role, read from `GET /api/account/settings`,
  and a line saying the list, ratings and personal notes are visible to this
  account only. This card writes nothing; there is no visibility switch.
- **Password** - only when `has("self.password")`, so a shared account and the
  admin (whose role holds no `self.*` key, and which never reaches this page)
  never see it. Current password, new password, new password again; the same
  `lib/newPassword.js` checks as `/reset`, then `PUT /api/account/password`.
  A refusal (`Your current password is not right.`, a 422) shows inline; a
  success clears the fields and says you stay signed in, here and on your
  other devices - a change ends no session, a reset does.

### UnderDevelopment — `/under-development`

File `pages/public/UnderDevelopment.jsx`. Static card. Targets: unknown
`/library/:type` values. No nav item currently carries `dev: true` — Seiyuu
lost it once `/library/seiyuu` shipped.

## Known rough edges (as of this commit)

- Cover resolution: FranchisePage, SeriesPage and `FranchiseLibrary` pass every
  entry list, so `getFranchiseCover()` gets the full set it requires. The
  remaining gaps are `usePlanData.allEntriesByFranchise`, which still skips
  comics, and `CollectionLibrary` and `CollectionPage`, which fetch eight entry
  lists and so can never draw a collection cover from a game.
- `SeasonalDetail` refetches on id change without a cancellation flag;
  `SeasonalOverall`, `CollectionLibrary`, `FranchiseLibrary` fetch once.
- `Search.jsx` passes `isAdmin` only to the Manga `MediaCard`s.
- Detail-page Quick Edit for anime omits `&type=`; dashboard cards add it.
- `useStatisticsData` loads TV/cartoon/comic/game lists Statistics never uses;
  `StatsCompletions` is rendered only by `/completions`.
- Comic sits in the nav's Reality column with the same icon as Novel.
