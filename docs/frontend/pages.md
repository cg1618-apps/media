# Frontend: public pages

Last verified: 2026-09-27

**What this is for.** This is the map of every page a guest can open — which
route renders which file, what data it pulls and under which React Query key,
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
| `/search` | `Search` — `public/Search.jsx` | eager |
| `/library/collection` | `CollectionLibrary` — `library/CollectionLibrary.jsx` | eager |
| `/library/franchise` | `FranchiseLibrary` — `library/FranchiseLibrary.jsx` | eager |
| `/library/studio` | `StudioLibrary` — `library/StudioLibrary.jsx` (matched before `/library/:type`) | lazy |
| `/library/publisher` | `PublisherLibrary` — `library/PublisherLibrary.jsx` (matched before `/library/:type`) | lazy |
| `/library/person` | `PersonLibrary` — `library/PersonLibrary.jsx` (matched before `/library/:type`) | lazy |
| `/library/seiyuu` | `PersonLibrary role="seiyuu"` — same file, filtered server-side via `?role=seiyuu` (matched before `/library/:type`) | lazy |
| `/library/character` | `CharacterLibrary` — `library/CharacterLibrary.jsx` (matched before `/library/:type`) | lazy |
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
| `/studio/:system_id` | `detail/Studio.jsx` | lazy |
| `/publisher/:system_id` | `detail/Publisher.jsx` | lazy |
| `/person/:system_id` | `detail/Person.jsx` | lazy |
| `/character/:system_id` | `detail/Character.jsx` | lazy |
| `/watch-order/:system_id` | `detail/WatchOrder.jsx` → `WatchOrderPage.jsx` | lazy |
| `/seasonal` | `public/SeasonalOverall.jsx` | lazy, **login required** |
| `/seasonal/:seasonal_id` | `public/SeasonalDetail.jsx` | lazy, **login required** |
| `/future-releases` | `public/FutureReleases.jsx` | lazy |
| `/statistics` | `public/Statistics.jsx` | lazy, **login required** |
| `/completions` | `public/Completions.jsx` | lazy |
| `/plan` | `public/Plan.jsx` | lazy, **login required** |
| `/quote` | `public/Quotes.jsx` | lazy |
| `/meme` | `public/Memes.jsx` | lazy |
| `/under-development` | `public/UnderDevelopment.jsx` | eager |

**Gated routes.** The two h-comic routes sit inside
`<ProtectedRoute gatedType="h-comic">`, the two h-game routes inside
`<ProtectedRoute gatedType="h-game">`, and the two hentai routes inside
`<ProtectedRoute gatedType="hentai">`; each asks `canSeeGatedType`
(`lib/gatedTypes.js`) for its own type - the question its nav row asks too. A signed-in session
that cannot see the type is sent to `/`, as for a path that does not exist; a
signed-out visitor is sent to log in, since an account may bring a mode that
carries the label.

`App.jsx` also calls `useConstants()` once: it fetches `/api/constants` and
overwrites the bundled `config/fieldOptions.js` arrays in place so every
`<select>` in the Add/Modify tabs switches from the fallback to API values.

## The navigation model

Both the desktop tab strip and the mobile drawer render from one data file,
`frontend/src/config/navigation.js` (`NAV_SECTIONS`). Nothing in it knows
about styling.

| Section key | Label | Shape | Contents |
|---|---|---|---|
| `library` | Library | mega-panel (`columns`) | **Groups**: Collection `/library/collection`, Franchise `/library/franchise` · **Entities**: Studio `/library/studio` (also matches `/studio`), Publisher `/library/publisher` (also matches `/publisher`), Person `/library/person` (also matches `/person`), Character `/library/character` (also matches `/character`), Seiyuu `/library/seiyuu` · **ACG**: Anime, Anime Movie, Manga, Novel, Game `/library/game` (also matches `/game`) · **Reality**: TV Show, Movie, Cartoon, Comic |
| `restricted` | Restricted | flat `items`, every row gated | H-Comic `/library/h-comic` (also matches `/h-comic`; `gatedType: "h-comic"`), H-Game `/library/h-game` (also matches `/h-game`; `gatedType: "h-game"`), Hentai `/library/hentai` (also matches `/hentai`; `gatedType: "hentai"`). Each is drawn only for a session that can see its type; a session that can see no gated type has every row dropped, so the tab itself is not drawn |
| `track` | Track | flat `items` | Plan `/plan`, Seasonal `/seasonal` (both `requires: "self.list"` — see below), Future Releases `/future-releases`, Completions `/completions` |
| `insights` | Insights | flat | Statistics `/statistics`, Quotes `/quote`, Memes `/meme` ┃ Relations `/relations`, Watch Orders `/watch-orders` — these two carry `requires: "admin"` on the row, inside a tab everyone may open |
| `entry` | Entry | flat, `requires: "admin"` | Add `/add`, Modify `/modify`, Delete `/delete`, Form Defaults `/defaults` |
| `note` | Note | flat, `requires: "admin"` | System Options `/options`, Alias Conversion `/aliases`, External APIs `/external-apis` — the three read-only inventories of how the data is described |
| `admin` | Admin | flat, `requires: "admin"` | Control Center `/system`, Data History, Review Queue ┃ Users, Roles, Content Labels |

Each item has `label`, `icon` (Font Awesome class), `to`, optional `matches`
(extra path prefixes that light the tab up — `/anime/123` highlights the Anime
library item; Franchise also owns `/series` and `/watch-order`), `dev` (routes
to `/under-development`), `divider` (a rule between item groups) and
`requires` (a per-row permission). Helpers:
`sectionItems`, `activeItem` / `activeSectionKey` (segment-aware prefix match,
so `/library/anime` does not claim `/library/anime-movie`),
`sectionRequirement` / `itemRequirement` (`adminOnly: true` is the legacy
spelling of `requires: "admin"`) and `visibleSections(sections, has,
canSeeType)` — which drops both the sections and the individual rows the
viewer lacks the permission for, and a row carrying `gatedType` unless
`canSeeType` answers yes (Nav passes `canSeeGatedType`), then drops any section
left holding nothing but dividers. It
hands back the original item objects, since Nav marks the current row by
identity. The Entry, Note and Admin tabs are gated by `has("admin")` from
`useAuth()`, as are the Relations and Watch Orders rows inside Insights.

**`components/layout/Nav.jsx`** renders two rows: an "ink" row (logo → `/`,
`<NavSearch/>`, session controls) and a paper tab strip. Mega-panel behaviour:
click-outside closes, Escape returns focus to the trigger, ArrowUp/Down cycle
links inside `[data-nav-panel]`, any route change closes the panel and the
mobile drawer. Session controls: theme toggle (moon/sun, `useTheme().toggle`,
`aria-pressed`), a session indicator, and a theme toggle. The indicator always renders: the
account's `username` when signed in, **Guest** when not. It is a value, so it
keeps the body face and its own casing - the mono uppercase treatment belongs
to labels. The **Admin** chip beside it is a capability and stays gated on
`isAdmin`, as does **Back up** (POST `/api/data-control/backup`, toasts
"Backup completed successfully" / "Backup failed", also behind
`has("manage.pipelines")`). **Log out** (POST `/api/auth/logout`, then a full
load of the page it is on, so nothing cached for the outgoing account
survives) follows the indicator rather than the chip: it renders for any
signed-in account, because a strip naming you with no way out is a dead end.
Guests get **Log in** → `/login?next=<current path>`. The mobile drawer
repeats all of it, indicator first.

**`components/layout/NavSearch.jsx`** is the universal search box. It
debounces 250 ms, discards stale responses by request id, and calls
`GET /api/search/?q=…&limit=20[&scope=…]`. Scopes: all, collection, franchise,
series, anime, anime-movie, movie, tv-show, cartoon, manga, novel, comic, game,
h-comic, h-game and hentai (each offered only to a session that can see the type), seasonal, person,
studio, publisher. With scope `all`, `TYPE_QUOTAS`
(collection 3, franchise 3, series 3, anime 10, anime-movie 3, movie 3,
tv-show 3, cartoon 5, manga 5, novel 5, comic 5, game 5, h-comic 5, h-game 5,
hentai 5, seasonal 3, person 2, studio 2, publisher 2) act as first-pass
floors that `mergeBuckets` fills in
order then round-robins up to `MAX_RESULTS = 20` (the quotas sum to 77, so
they never all fill). The server leaves a gated type's bucket out altogether
for a session that cannot see the type, and a missing bucket reads as empty. Person, studio and publisher come last and smallest on
purpose: a query is usually about a title, so a name match on a credited
person, studio or publisher is the weaker answer and takes the slots the media
buckets left behind. Exact
matches are lifted to the top. Enter navigates to `/search?q=…[&scope=…]`; a
result click routes to the entry's page (`/seasonal/<encoded id>` for seasons,
`/person/:id`, `/studio/:id` and `/publisher/:id` for entities). Comic display
names are EN-first; a person, studio or publisher row shows the
server-resolved `display_name` and its credit count as the secondary line. **Characters are not searchable** — by design,
there is no character scope.

**Theme.** `ThemeContext` keeps `light | dark | system` in
`localStorage["cg1618:theme"]` and stamps `<html data-theme>`; `index.html`
stamps the same attribute before first paint. See components.md → Theming.

## Shared page plumbing

| Piece | File | Notes |
|---|---|---|
| `Layout` | `components/layout/Layout.jsx` | `<Nav/>`, `<Outlet/>`, footer, `<Toast/>`, `ScrollButtons` (to-top after 300 px, to-bottom when >300 px from the end) |
| `ProtectedRoute` | `components/layout/ProtectedRoute.jsx` | spinner while `auth.loading`; `has(permission)` (default `"admin"`) → `<Outlet/>`, else `<Navigate to="/login?next=<path+search>" replace/>`. A redirect, not a security boundary — the API enforces. |
| `MediaLoadingState` | `components/layout/MediaLoadingState.jsx` | spinner + `loadingText`, or red error card |
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

**Data**: `useMediaList` for `anime`, `franchise`, `tv-show`, `cartoon`,
`manga`, `novel`, `comic`, `game` (all `LIST_OPTIONS`) and
`useApiQuery(["announcements"], "/api/announcements/")`. For a viewer holding
`self.list` it also loads `anime-movie` and `movie` and
`/api/seasonal/current-season`, which only Coming Next reads. Announcements and
those three are kept out of the combined loading/error gate so a failure there
never blanks the dashboard.

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

**Layout** (an `xl:`-only sticky left TOC, `DashboardTOC`, tracks the active
section with a threshold at the bottom of whatever sticky header covers it —
the division header for Announcements and Schedule, the filter bar for the
tracker divisions):

| Anchor | Division | What it shows |
|---|---|---|
| `#announcements` | Announcement & Notes | `AnnouncementBoard` cards (`components/info/AnnouncementBoard.jsx`); a clipped body expands into `AnnouncementModal`. Read-only here; CRUD is on `/system`. |
| `#schedule` | Weekly Schedule | two `WeeklySchedule` blocks: **My Watch Schedule** (`my_watch_day`, anime with `airing_status === "Airing"`) and **Broadcast Schedule** (`broadcast_day` + `broadcast_time`, collapsible, collapsed by default). Only anime feed the schedule today. Sunday-first (`config/weekdays.js`), today highlighted, entries sort by `HH:MM` then name. Under them, **Coming Next** (`schedule-coming`, `components/tracker/ComingNext.jsx`), collapsed by default and drawn only for a viewer holding `self.list` — see below. |
| `#watching` | Watching (Anime · TV Show · Cartoon) | sections `watching-active` Active Watching, `watching-passive` Passive Watching, `watching-paused` Paused, by `watching_status`. Each groups Anime → TV Show → Cartoon, sorted by rating weight (S…F, unrated last), rendering `DashboardCard`. Shown when no type is picked or the picked type is one of its three. |
| `#reading` | Reading (Manga · Novel · Comics) | `reading-active`, `reading-passive`, `reading-paused` by `reading_status`. Manga → `DashboardCard`, Novel → `NovelDashboardCard`, Comic → `ComicDashboardCard`. Shown when no type is picked or the picked type is one of its three. |
| `#playing` | Playing (Game) | `playing-active`, `playing-passive`, `playing-anytime`, `playing-paused` by `playing_status`, rendered by a local `PlayingSection` — simpler than `ReadingSection` because the division holds exactly one media type, so there is no per-type grouping and no progress callback. Cards are `GameDashboardCard`, whose playtime figure is read-only for everyone. Shown when no type is picked or the picked type is Game. |

**Coming Next** shows what the viewer is waiting on or has planned for the
**next season** — the season after the admin-set current season
(`system_configs.current_season`), or after the calendar's current season while
none is set. It has two sub-sections, each grouped by media type (Anime, Anime
Movie, Movie, TV Show, Cartoon, Game; a type with nothing is omitted) and
sorted by release date:

- **Watch when airs** — `Watch When Airs`, and `Play When Released` for games.
- **Planned to** — `Plan to Watch`, and `Plan to Play` for games.

An entry's season is its `release_season` plus the year of its `release_date`
for anime, and for every other type the calendar quarter of its primary
release date (`primaryReleaseValue` in `lib/releaseDate.js`, mirroring
`RELEASE_PRIORITY`: anime movies prefer the Japanese date, movies the Taiwan
one). A date with only a year has no season, so that entry is left out.
Reading types have no "when released" status and are not included; gated
types are not shown on the dashboard. The selection lives in
`lib/comingNext.js`. Guests never see the section: statuses are the viewer's
own, so a guest's would always be empty.

**Admin-only controls** (cards read `isAdmin`): a "Quick Edit" pencil
(`/modify?id=…&type=…`; anime omits `type`) and −/input/+ progress steppers.
Guests see a read-only counter.

**Optimistic PATCH handlers.** Each handler patches every
`["media-list", type]` cache with `queryClient.setQueriesData`, fires a raw
`fetch` PATCH, and on failure restores the previous value and toasts
"Network error. Progress reverted.":

| Handler | Endpoint | Body |
|---|---|---|
| `handleEpChange` | `/api/anime/{id}` (also recomputes `cum_ep_fin = ep_previous + ep_fin` locally), `/api/tv-shows/{id}`, `/api/cartoon/{id}` | `{ ep_fin }` |
| `handleChChange` | `/api/manga/{id}` | `{ ch_fin }` |
| `handleNovelProgressChange` | `/api/novel/{id}` | any of `{ vol_fin | ch_fin | arc_fin }` (the card picks by `progress_display`: `vol_tw`, `vol_original`, `arc_ch`, `ch`) |
| `handleComicProgressChange` | `/api/comic/{id}` | `{ issue_fin }` |

Cards cap at the total and toast "Cannot exceed total episodes/volumes/…".

### Search — `/search`

File `pages/public/Search.jsx`. Reads `?q` and `?scope` (default `all`).
`useApiQuery(["api","search"], "/api/search/", { params: { q, scope }, enabled: hasQuery })`
→ effective key `["api","search",{q,scope}]`. The response is
`results.{collection, seasonal, franchise, series, anime, "anime-movie", movie, "tv-show", cartoon, manga, novel, comic, game, "h-comic", "h-game", hentai, person, studio, publisher}`
plus `related_franchises` (the franchises of the matched anime — used as
filter pills, not name matches); the three gated buckets are left out for a
session that cannot see the type and read as `[]`. Results are copied into local state so a
card's `onUpdated` can replace a row without a refetch.

Layout: sticky header "Search Results for “q”" + scope pill + a count line
("n collections · n anime · …", non-empty buckets only); then, in order and
only when the scope allows and the bucket is non-empty: **Collections**
(`TierCard` → `/collection/{id}`), **Seasonal** (pill buttons →
`/seasonal/{id}`), a franchise pill row (`CollapsiblePillRow`, "All Results"
+ one per related franchise; filters franchises/series/anime by
`franchise_id`), **Franchises** (`TierCard` labelled "{franchise_type}
Franchise"), **Series**, **Anime** (sub-grouped TV / ONA, Movies, Other by
`airing_type`), **Anime Movies**, **Movies**, **TV Shows**, **Cartoons**,
**Manga**, **Novel**, **Comic**, **Game**, **H-Comic**, **H-Game**,
**Hentai** — all `MediaCard` grids — and last
**People**, **Studios** and **Publishers**, `PersonCard` / `StudioCard` /
`PublisherCard` grids (`components/cards/StaffCard.jsx`, the same cards the
three libraries use) linking to `/person/:id`, `/studio/:id` and
`/publisher/:id`. Staff sit below every media section because a name match
ranks below a title match; characters have no section at all, being
unsearchable by design. The Publishers section landed with the games frontend,
closing a gap the Publisher entity had left: the API had returned a
`publisher` bucket and `NavSearch` had rendered it, but this page had no
mention of publishers at all. `SCOPE_LABELS` moved to a module-level export at
the same time so a test can assert the page and the API agree on the bucket
keys without rendering the page. Empty query shows a "No Search Query" card.
Admin-only behaviour comes from `MediaCard` itself.

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
hentai config has no progress column - one entry is one episode: it filters
by watch status, airing status, source material, originality and usefulness,
sorts by title, release date and my rating, and its columns are franchise,
title, source, airing status, usefulness, my rating, the watch button and
the watch-next / to-rewatch flags. All three also sort by usefulness
(`usefulnessSort`), in the vocabulary's order - 非常實用, 實用, 特定情況實用,
不實用 - with an unset value last; no other library offers it. `Library.jsx` looks up `LIBRARY_CONFIGS[type]`,
runs `useMediaList(type, LIST_OPTIONS)`, `useMediaList("franchise")` and
(when `config.usesSeries`) `useMediaList("series")`, and hands everything to
`LibraryLayout`. `useLibraryState` holds search text, sort, grid/table view,
the filter panel toggle and the filter values — **none of it is persisted**;
navigating away resets the page. Filtering is entirely client-side over the
≤2000 rows: search (`config.buildSearchString`, normalised by `cleanString`)
→ active `filterDefs` (`match(item, value, franchiseDict, seriesDict)`) →
`sortDefs[currentSort].compare`.

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
`{ franchiseDict, seriesDict, isAdmin, handleStatusToggle }`, and
`handleStatusToggle` goes through `useStatusToggle(type)` with toasts
("Added to Watch/Read Next", "Marked for rewatch/reread", "Status → X").

**Admin-only** in tables: the watch/read status button advances the status on
click (`watchButtonColumn` / `readButtonColumn`, guests see text), and the
plan-flag checkboxes (`planFlagColumn`) are disabled for guests.

| Type | Series? | Filters (key: type) | Sorts | Table columns |
|---|---|---|---|---|
| anime | yes | airingType: set (TV/Movie/ONA/OVA/Special) · airingStatus: set · watchingStatus: set-grouped · bahaOnly: boolean | title (franchise→series→entry), release_date, my_rating, mal_rating, anilist_rating, anilist_popularity_rank | franchise, title, type, season, status, ep (`cum_ep_fin/cum_ep_total`), my, mal, studio, baha, watch |
| anime-movie | no | airingStatus · watchingStatus · bahaOnly | title (en→roman→alt→cn→jp), release_date (jp→tw), my_rating, mal_rating, anilist_rating, anilist_popularity_rank | franchise, title, status, my, mal, studio, director, baha, watch, watch_next, to_rewatch |
| movie | no | airingStatus "Release Status" · movieType (Reality/Animation) · watchingStatus | title, release_date (year of `release_date_usa` only), my_rating, imdb_rating | franchise, title, status, my, imdb, director, release, watch, watch_next, to_rewatch |
| tv-show | no | airingStatus · watchingStatus · region: set-dynamic | title, release_date, my_rating, imdb_rating | franchise, title, season, status, ep, my, imdb, watch, watch_next, to_rewatch |
| cartoon | yes | airingStatus · airingType: set-dynamic · watchingStatus · officialSource: set-dynamic | title, release_date, my_rating, imdb_rating | franchise, title_cn, title_en, type, season, airing, ep, source, my, imdb, watch |
| manga | yes | serializationStatus: set-dynamic · readingStatus: set-grouped · region: set-dynamic | title, release_date, end_date, my_rating, mal_rating, anilist_rating, anilist_popularity_rank | franchise, title_cn, title_en, status, ch, vol, my, mal, read, read_next, to_reread |
| novel | yes | serializationStatus · readingStatus · region · type: set-dynamic | title, release_date, end_date, my_rating, mal_rating, anilist_rating, anilist_popularity_rank | franchise, title_cn, title_en, status, progress (`getNovelProgress`), my, mal, read, read_next, to_reread |
| comic | yes | comicType: set-dynamic · readingStatus · era: set-dynamic · events: set-dynamic (multi-value via `parseTypes`) | title (EN-first), release_date, my_rating | franchise, title_en, title_cn, volume_label, comic_type, era, progress (`issue_fin / issue_total ISS`), my, read, to_reread |
| game | yes | gameType: set-dynamic · playingStatus: set-grouped (Playing / Planned / Completed / Dropped / Might Play, via `PLAYING_STATUS_GROUP`) · ownership: set-dynamic · releaseStatus: set-dynamic | title (CN-first), release_date, hours_played ("Playtime"), metacritic_score ("Metacritic", highest first, unscored last), my_rating | franchise, title_cn, title_en, game_type, hours_played (`32.5 h`), my, play (`playButtonColumn`), to_replay |

All default to the `title` sort. `Library.test.jsx` pins the twelve config
keys, requires more than three table columns and a `my_rating` sort per
config, and checks the unknown-type redirect. Search strings cover every name
field of the entry plus franchise/series names, release date/season (anime
also matches `SPR2024` / `Spring2024`), genres, studio, label, for comic the
writer and volume label, and for game the game type and release status.

The game row's `ownership` filter is a plain string column here: it is derived
server-side from the entry's `game_copy` rows and stored nowhere, so the page
treats it like any other value. `playButtonColumn` is the third
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
collection names; sort `title | my_rating (default) | collection_expectation`.
No filter panel, no table view, no admin controls. Renders `CollectionCard`
with member count.

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
`title (default) | my_rating | franchise_expectation`, shared by both views.

Grid renders `FranchiseCard`. Table view renders the file's `TABLE_COLUMNS`,
whose markup and class names mirror the table in `LibraryLayout.jsx` so the
two read as one component: Franchise (a `Link` built by `entityPath`, plain
text when the row carries no `public_id`), Collection (`md`), Type (`lg`),
Entries, Expectation (`lg`), My. The breakpoint in brackets is where that
column collapses, so Franchise, Entries and My are what survives at phone
width; the wrapper is `overflow-auto`, so a wider table scrolls inside itself
rather than widening the page. Clicking a row navigates to the franchise.

### StudioLibrary — `/library/studio`

File `pages/library/StudioLibrary.jsx`. A studio is a public **entity**, not a
media type, so this sits outside `LIBRARY_CONFIGS` as its own component,
alongside `CollectionLibrary` and `FranchiseLibrary`; its route is declared
before `/library/:type` so the generic library page never claims it.

Raw `fetch` of `/api/studio/` alone — the response already carries
`display_name`, `credit_count` and `logo_file`, so no per-studio request and
no entry lists are needed. Search runs over **all four** name fields
(`STUDIO_NAME_FIELDS`), not just the displayed one, so typing "Kyoto
Animation" finds a studio displayed as "KyoAni". Sort
`name (default) | credit_count | my_rating`. No filter panel, no table view,
no admin controls. Each `StudioCard` (`components/cards/StaffCard.jsx`, shared
with `/search`) shows the logo, the display name and the credit count, and
links to `/studio/:system_id`.

### PublisherLibrary — `/library/publisher`

File `pages/library/PublisherLibrary.jsx`. Same shape and the same reasoning as
`StudioLibrary`: a publisher is a public **entity**, not a media type, so it
sits outside `LIBRARY_CONFIGS` with its route declared before `/library/:type`.

One raw `fetch`, but through `endpoints.publisher.list()` rather than the
literal URL `StudioLibrary` still hardcodes — the deliberate divergence, so the
route lives in one place. The response already carries `display_name`,
`credit_count` and `logo_file`, so there is no per-publisher request. Search
reuses `STUDIO_NAME_FIELDS` (`lib/naming.js`, now shared by studio, person and
publisher) and runs over **all four** name fields, so a publisher displayed as
木棉花 is still found by typing "Muse Communication". Sort
`name (default) | credit_count | my_rating`. No filter panel, no table view, no
admin controls. Each `PublisherCard` (`components/cards/StaffCard.jsx`, beside
`StudioCard`) shows the logo, the display name and the credit count, and links
to `/publisher/:system_id`.

### PersonLibrary — `/library/person`

File `pages/library/PersonLibrary.jsx`. Same shape and the same reasoning as
`StudioLibrary` — a person is a public **entity**, not a media type, so it sits
outside `LIBRARY_CONFIGS` with its route declared before `/library/:type`.

Raw `fetch` of `/api/person/` alone: the response carries `display_name`,
`credit_count`, `photo_file` and the `roles` each person holds, which is what
lets the **type filter** (All plus the `PERSON_SUB_TABS`; the Club tab only for a session that can see h-comic) run client-side
— one request serves every filter, where a per-type request would refetch on
each click. Search runs over all four name columns (`PERSON_NAME_FIELDS`), not
just the displayed one. Sort `name (default) | credit_count | my_rating`. Each
`PersonCard` (`components/cards/StaffCard.jsx`, shared with `/search`) shows
the photo, display name and credit count, and links to `/person/:system_id`.

`/library/seiyuu` renders the same component with `role="seiyuu"`, which adds
`?role=seiyuu` to the `/api/person/` fetch server-side rather than filtering
client-side — not a new page type, and not `dev: true` any more. A person
holding the `seiyuu` role but never yet cast still appears with zero
entries: `person_role` exists precisely so a seiyuu can show up before their
first casting, and hiding them here would defeat that.

### CharacterLibrary — `/library/character`

File `pages/library/CharacterLibrary.jsx`. Same shape as `PersonLibrary` and
`StudioLibrary` — a character is a public **entity**, not a media type, so it
sits outside `LIBRARY_CONFIGS` with its route declared before `/library/:type`.

Raw `fetch` of `/api/character/` alone (server-side `?name=` search is what
the cast editor's combobox uses instead; this page filters client-side over
all four name columns). Sort `name (default) | casting_count | my_rating`.
Each `CharacterCard` shows the photo, display name and casting count, and
links to `/character/:system_id`.

### Person — `/person/:system_id`

File `pages/detail/Person.jsx`. The public profile for one person, built the
same way as the studio page below and for the same reasons: two raw fetches in
one `Promise.all` (`GET /api/person/{id}` and `.../entries`), the profile call
failing is the page's 404 while the entries call failing is not, and nothing on
the page is editable.

Layout: breadcrumb → left column with the photo, rating stamp and an "Other
names" card → right column with the display name, credited-entry count, a
"Profile" `InfoCard` (gender, the types they are offered under, remark), then
one section per group.

The one difference from the studio page: a person may hold several roles, so
`/entries` groups by **(media type, role)** and each heading is the group's
`label` — 原作 on a manga, Writer on a comic — which comes from the endpoint,
not from the page. A group the viewer may see no entries of still renders, with
"Nothing you can see here" inside it. Entry cards are the same local
`CreditCard`, not `MediaCard`, for the reason spelled out below.

**Club membership** (`components/info/ClubMembership.jsx`, under the Profile
card) is the one editable thing on the page, and it is drawn only for a
session that can see h-comic. A club - a person holding the `club` role -
shows its **Members** in the club's order (`GET /api/person/{id}/members`); an
artist shows the **Clubs** they belong to (`.../clubs`, ordered by name). For
an admin each list has an Edit button: remove, add from a search, and on the
member list reorder with arrows; Save PUTs the whole list. The clubs editor is
offered on anyone holding an `h-comic`-scoped role, so it does not appear on
every director's page.

### Character — `/character/:system_id`

File `pages/detail/Character.jsx`. The public profile for one character,
hand-built beside `Person.jsx` and `Studio.jsx` rather than reusing a media
detail shape — the header is a profile and the body is the entries this
character is cast in. Two raw fetches in one `Promise.all`
(`GET /api/character/{id}` and `.../entries`); the character call failing is
the page's 404, the entries call failing is not, and nothing is editable.

The one structural difference from the person page: `GET
/api/character/{id}/entries` groups **by media type only**, because a
character holds no role the way a person does — see
`app/routers/character.py`'s `get_character_entries`. Each entry in a group
also names the seiyuu who voiced the character there (`seiyuu_display_name`
/ `seiyuu_system_id`), rendered as a small link beneath the entry card
(`CastingCard`, a local component, not `MediaCard`, for the same reason
`Person.jsx`'s `CreditCard` is local) — since knowing who played the part is
the point of looking a character up, unlike a person's own credits. A group
the viewer may see no entries of still renders, with "Nothing you can see
here" inside it, same rule the person and studio pages follow.

### Publisher — `/publisher/:system_id`

File `pages/detail/Publisher.jsx`. The public profile for one publisher or
distributor, copied from `Studio.jsx` and behaving identically: two raw fetches
in one `Promise.all` (`GET /api/publisher/{id}` and
`GET /api/publisher/{id}/entries`), the profile call failing being the page's
404 while the entries call failing is not, a breadcrumb back to
`/library/publisher`, the logo-plus-rating left column with an "Other names"
card, and one section per group the entries endpoint returned rendered as the
same local `CreditCard`.

The one difference from the studio page: the "Profile" `InfoCard` has **no MAL
row** — `PublisherResponse` carries no `mal_id` / `mal_link` at all, because
MAL has no record of a games publisher or a TW distributor. Country,
founded/defunct, website and remark are unchanged.

### Studio — `/studio/:system_id`

File `pages/detail/Studio.jsx`. The public profile for one studio, built by
hand beside the media detail pages rather than from their shape: a studio has
no franchise, no tracker and no notes.

Two raw fetches in one `Promise.all`: `GET /api/studio/{id}` and
`GET /api/studio/{id}/entries`. The studio call failing is the page's 404
(rendered through `MediaLoadingState`, as the media pages render theirs); the
entries call failing is not, since a profile without its credits is still
worth showing. Nothing on the page is editable, which is why it uses `fetch`
rather than the TanStack hooks the media detail pages need for their admin
controls.

Layout:

1. **Breadcrumb** `/library/studio` → display name.
2. **Left column** — logo with the rating stamp, then an "Other names" card
   listing whichever of the four names is set and is not the one being
   displayed, labelled English / Chinese / Japanese / Alternative.
3. **Right column** — the display name, a credited-entry count, a "Profile"
   `InfoCard` (country; `founded – defunct`, or `Since founded` while the
   studio is still working, and the row is dropped when both are empty;
   website and MAL as external links; remark), then one section per group the
   entries endpoint returned, each entry linking to
   `{nav_path}/{system_id}`.

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
from `components/hub/` (`HubShell`, `Crumbs`, `AdminStrip` — the admin-only
dashed strip with the **Quick edit** link `/modify?id=…` —, `HeroCover` with
the spine strip and optional progress rule, `Field`, `HubTabs`, `Section`,
`HubLoading/HubError/HubEmpty/FilterEmpty`).

All three fetch with raw `fetch` in one effect keyed on `system_id` with a
`cancelled` flag; Franchise and Series also `setActiveTab(null)` on id change
so the first available tab is re-picked (Collection keeps "Franchises").

| | FranchisePage | SeriesPage | CollectionPage |
|---|---|---|---|
| Loads | `/api/franchise/{id}`; series, anime, anime-movie, movie, tv-show, cartoon, manga, novel, comic, **game** lists `?franchise_id=`, **h-comic** and **hentai** only when `franchise_type` names a type of the h-comic family (`H-Comic` or `Hentai`, `inFranchiseFamily`), and **h-game** only when it includes `H-Game`; `/api/plan-next/?scope=franchise`; parent collection lazily | `/api/series/{id}`; anime, movie, tv-show, cartoon, manga, novel, comic `?series_id=`, **game** included (no anime-movie — they have no series), **h-comic** in its own effect, only for a session that can see the type, **h-game** likewise, and only once the parent franchise has loaded and its `franchise_type` includes `H-Game`, and **hentai** likewise, only under a parent franchise of the h-comic family; `/api/plan-next/?scope=series&kind=rewatch`; parent franchise | `/api/collection/{id}`; `/api/franchise/?collection_id=`; eight entry lists, covers only — game is not among them |
| Hero badges | `TierBadge` with `franchise_type`, names, my_rating, "{x} Expectation", parent collection link, "Plan Next: {type} ({bucket})", "To Rewatch/Reread: {type}", total entries, completion bar | same shape with `series_expectation`, rewatch chips, parent franchise link | names, my_rating, `collection_expectation`, "{n} Franchise(s)" |
| Admin controls | Overall Rating select, Expectation select, **Plan Next** `SizeGroupControls` (per-type checkbox + derived/manual size-group select → PATCH `size_group_manual`), rewatch `PlanKindToggles` | Overall Rating, Expectation, rewatch `PlanKindToggles scope="series"` (no size groups at series level) | Overall Rating, Expectation |
| Remark | textarea (admin editable, guest disabled, shown when admin or non-empty), "Show all" opens `RemarkModal`; saved on blur / modal close via PATCH `{ remark }` | same | same |
| Tabs | "Media" (counted): Anime, Anime Movies, Manga, Novel, Comic, **Game** ("Base games, DLC & expansions", sorted by `release_date` ascending), **H-Comic**, **H-Game** and **Hentai** (each by `series_number`, then release date; the H-Comic and Hentai tabs each allowed by either type of the h-comic family), Movies, TV Shows, Cartoons — shown when `franchise_type` allows *and* the list is non-empty; "Extras": Watch Order, Relations, Notes | Media tabs by non-empty list only; same extras. Its **Game** tab carries its own sort (release_date default, then title / my_rating / hours_played) and a Game Type filter the other tabs have no equivalent of — a series usually mixes a base game with its DLC | "Members" → Franchises (`FranchiseCard`s); extras Watch Order, Relations, Notes |

Plan toggles call `POST /api/plan-next/` `{ media_type, scope, kind, target_id }`
(409 tolerated) and `DELETE /api/plan-next/target?scope=&media_type=&kind=&target_id=`
(404 tolerated). Media tabs carry a sort select, a group-by-series checkbox
(on by default for anime/comic/movies/tv/cartoons) and filter pills specific to
the type. Extras render `WatchOrderSection` (see below),
`RelationGraph readOnly scopeType=… scopeId=…`, and `{Tier}Notes` with the
`remark` section hidden whenever the hero already shows the remark box.

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
`Cartoon.jsx`, `Manga.jsx`, `Novel.jsx`, `Comic.jsx`, `Game.jsx`, `HComic.jsx`.

**Common skeleton.** Data: `useMediaItem(type, id)` mirrored into local
state, `useMediaList("franchise", LIST_OPTIONS)`, `useMediaList("series")`
(not AnimeMovie), and `useMediaCacheUpdate(type, id)` for
`setMediaItem / fetchMediaItem / invalidateMedia`. Every write goes through a
local `performPatch(payload, msg)`: no-op for guests, optimistic merge, PATCH
`endpoints.resource(type).patch(id)`, replace from the response; on failure
toast "Update failed" and refetch.

Top to bottom:

1. **Breadcrumb** `/library/{type}` → title.
2. **Admin toolbar** (`isAdmin`): **Quick Edit** → `/modify?id={id}`;
   **Mark Completed** → `POST {apiEndpoint}/{id}/complete` then refetch;
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
   none), the tracker, `NamingCard`, `InfoCard "Information"`, `InfoCard
   "Production"` — whose Studio row on Anime and AnimeMovie is built by
   `studioValue()` (`components/info/StudioLinks.jsx`): one link to
   `/studio/{system_id}` per entry in `studio_refs`, falling back to the plain
   comma-joined `studio` string when there are none, which is what a viewer
   without the Credits permission and an entry whose studio never resolved to
   a row both get — and beside it, on **all six** types that credit a publisher
   (Anime, AnimeMovie, Manga, Novel, Comic, Game), `publisherValue()`: the same
   rule over `publisher_refs` with the route swapped to `/publisher`, under a
   heading `publisherLabel(entry, fallback)` reads off `publisher_refs[0].label`
   — the backend's `credit_label("publisher", media_type)`, so no page
   hard-codes 台灣代理商 or 發行商 and the fallback literal only shows on an
   entry with no publisher credited yet — a **Cast** slip (Anime, AnimeMovie, Manga, Novel; GET
   `/api/casting/{media_type}/{entry_id}` via `useCasting`), rendered only
   when the entry has a cast, one row per casting sorted Main before
   Supporting then by `position`: a small cover-or-portrait thumbnail, a role
   chip, a link to `/character/{character_id}`, and — on Anime/AnimeMovie
   only, where `character_casting.person_id` may be set — "voiced by" plus a
   link to `/person/{person_id}` — a remark textarea (blur-saves; rendered only when
   a remark already exists, with the Notes `remark` section hidden so the
   singleton row never has two editors), then `{Type}Notes` →
   `pages/notes/NotesTemplate.jsx` — except Game, which composes
   `NotesProvider` / `NotesGroup` / `NotesBlocks` itself (see **Notes** below).

**Tracker**: `MyTrackerCard` (`components/tracker/MyTrackerCard.jsx`:
progress stepper with cumulative counts, status select, rating select,
optional Watch/Read Next and To Rewatch/Reread checkboxes; every control is
admin-only) on Anime, TV (`watch_next` + `to_rewatch`), Cartoon
(`watch_next`), Comic (`issue_fin`, `reading_status`, `to_reread`) and Game
(`playing_status`, `to_replay`) — Game passes **no** `onEpChange`, which is
what drops the stepper: a game has no unit to count off, and playtime lives in
its own Progress slip instead.
Game also renders `components/tracker/GameCompletionBlock` directly below the
tracker: `completion_level` plus the three `GAME_COMPLETION_FLAGS` axes as
four selects, each patching the one field it changed and sending `null` rather
than `""` for the unset option. Same two guards as `MyTrackerCard` — nothing
at all for a logged-out visitor, read-only `Chip`s for a signed-in non-admin.
AnimeMovie and Movie inline a status/rating/Watch Next/To Rewatch tracker;
Manga uses a local `MangaTrackerBlock` (`ch_fin`, `vol_fin`, `vol_fin_page`,
`read_next`, `to_reread`); Novel uses `components/tracker/NovelTrackerBlock`
(`ch_fin/vol_fin/arc_fin` by `progress_display`).

**Per-type differences**

| Page | Information card | Production card | Extras |
|---|---|---|---|
| Anime | 本傳/外傳, Season Part, Special Episodes, Total Episodes (with cumulative), Airing Type/Status, Release Season, Release Date, Genre main/sub, 標籤 Label, Quality 品質 | Studio, 台灣代理商 (linked `publisher_refs`), Director, Producer, Music | remark lives only in Notes (no textarea); Cast placeholder |
| AnimeMovie | Airing Status, Length, Release Date JP/TW | Studio, 台灣代理商 (linked; the row this page gained in the publisher migration — it had none before), Director | no series query; Cast placeholder |
| Movie | 本傳/外傳, Airing Status, Length, Director, Release Date TW/USA | — | inline IMDb score block |
| TV | 本傳/外傳, Season, Total Ep, Official Source, Airing Status, Release Date | — | |
| Cartoon | + Airing Type, Length Per Ep (min) | — | |
| Manga | Region, 本傳/外傳, Serialization Status/Platform, Release/End Date, Volume/Chapter Total | 作者 or 原作/作畫, 台灣出版商 (linked), Anime Studio (card shown only when any value) | |
| Novel | Region, Type, Version, 本傳/外傳, Serialization Status, Release/End Date, Vol Total (JP/KR)/TW, Arc Total, Chapter Total | Author, Illustrator, 台灣出版商 (linked, conditional) | **Units** card (`NovelUnitsEditor` over the `units` relationship — volume/arc/story/chapter rows with a key, CN/EN name and remark; admins get the editor with reorder/add/remove and a Save → PATCH, read-only viewers get a plain list keyed by each row's server-computed `display_key`; hidden entirely for a viewer when the novel has no units) |
| Comic | Type, Volume Label, Continuity, Era, Main Line, Serialization/Reading Status, Release Year, Issue Total | Writer, Artist, 出版商 (linked, conditional), Imprint | **Events** card (red pills); no Autofill, no `RelationsSection`, no `ScoreBlock` |
| Game | Type, Base Game (a link to `/game/{base_game_id}`), Release Status, Release Date, Current Patch, Steam Progress Sync (the one flag left here: it governs whether Steam may write this entry's progress, so it is a fact about the source rather than an answer about a playthrough — playing status and the four completion axes are editable in the tracker and Completion blocks instead), Metacritic / Metacritic User (each carries its own denominator — `96 / 100`, `8.6 / 10` — via the exported `outOf` helper, and a missing score drops the field), Ownership (server-derived), Copies (a count) | Developer (`studioValue`), 發行商 (`publisherValue`, labelled by `publisherLabel` rather than a bare literal), Director, Composer — the whole card is skipped when none of the four has a value | **Progress** slip (`GameProgress`: playtime against `hltb_main`, achievements gated on `achievements_total` — nothing renders when neither figure exists, since "0 h / ? h" reads as "played none of it" rather than "never measured"); **Prices** card (MSRP and current price in USD / JPY / TWD); **Copies** slip (`GameCopiesSection`: one row per `game_copy` — storefront and ownership as chips, then format, acquisition, price with the copy's own currency via `copyPrice`, acquired date and remark — sorted by `position`, and rendered only when the game has copies, so the Info card's count is no longer their only trace on the page; editing still happens in the Add/Modify tab); a cover-side `ProgressRule` on `hours_played / hltb_main`; a Remarks slip that appears only when a remark already exists; `SourcesCard` with `igdbLink` (under "Where to Look Up") and `steamLink` (under "Where to Play", since a Steam store page is a storefront rather than a reference database); no `RelationsSection`, no `ScoreBlock`, no Cast |

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
(personal, like the rating) and Read Next / To Reread; a **Genres** card (Genre
Plot / Appearance / Relation); `SourcesCard` with the KR official source as its
tag and the MAL link; `RelationsSection`; a **Cast** slip (characters only -
an h-comic casting never carries a seiyuu); the series number beside the
series link on JP. The admin toolbar has Quick edit, Mark completed and
**Autofill & update**, which runs `POST /replace/h-comic/{id}` - Tenrai's
manga record, fill-only.

A JP entry's **Animation Status** is hand-set or derived, as
`animation_status_source` says (`lib/hComicAnimation.js`). While a hentai
adapts the entry the server serves a derived status, and the Information card
shows it with **Derived from** and a link to each adapting hentai
(`adaptingHentai`). The names come from `RelationsSection`'s own rows, handed
up through its `onRows` prop, so naming them costs no request; until the rows
arrive the note reads "a linked hentai adaptation".

`HComicNotes.jsx` hands the notes page the entry row (so the KR-only
Highlights section is dropped on a JP entry), the cast's names (suggested in
the Highlights `names` inputs) and `highlight_group_order` with a callback that
PATCHes it. Highlights read as one group per female character, a row naming
two under both; dragging a group header - or its arrows - saves the whole new
order, and the rows inside a group are not movable
([systems/notes.md](../systems/notes.md#h-comic-highlights-h_comic_highlights)).

**H-Game** (`pages/detail/HGame.jsx`) is the second gated type's page, routed
the same way. It is Game's page for what `h_game` holds: one `NotesProvider`
around the page, `MyTrackerCard` (playing status, rating, To Replay), a
Progress and Todo slip, the Prices card, the read-only Copies slip
(`GameCopiesSection`, imported from `Game.jsx`) and an Autofill button (Game's
IGDB and Steam fill, through `replaceSingle("h-game")`). What differs:

| | |
|---|---|
| Completion block | `GameCompletionBlock` with `H_GAME_COMPLETION_AXES`: Completion Level, All Endings, **All CG**, and **usefulness** (personal, like the rating) - no All Achievements or All Collected |
| Progress | `HGameProgress`: the main-story estimate and achievements - there is no playtime, so the cover's progress rule is achievements earned against the total |
| Information card | Type, Base Game (an h-game), Play Style, Series Number, Language, Animation (yes / no, a dash when unknown), Audio, H 演出形式, Platform, Release Status / Date, Current Patch, Steam Progress Sync, Ownership, Copies. A multi-choice list reads "None" when it is `[]` and a dash when it is `null` (`choiceText`) |
| Production card | Developer only (`studioValue`), skipped when there is none |
| Genres card | Genre, Theme, Genre Plot / Appearance / Relation |
| Sources | `SourcesCard` with `igdbLink`, `steamLink` and the two DLsite links under "Where to Play" |
| Notes | every game section, plus **亮點 Highlights** |

No Metacritic, no Cast and no `RelationsSection`. The provider is handed the
entry row, `highlight_group_order` and a callback that PATCHes a new order,
exactly as on H-Comic; an h-game has no cast, so the Highlights `names` inputs
take free text with no suggestions
([systems/notes.md](../systems/notes.md#h-game-highlights-h_game_highlights)).

**Hentai** (`pages/detail/Hentai.jsx`) is the third gated type's page, routed
the same way. One entry is one episode, so it is laid out like Movie, with no
episode counter: a local `HentaiTrackerBlock` (watching status, rating,
**usefulness**, Watch next, To rewatch), `CommunityCard`, `NamingCard`, and
three cards - **Information** (Source Material, Originality, Airing Status,
Release Date), **Credits** (Studio via `studioValue`, Director) and
**Genres** (Genre Plot / Appearance / Relation), with a **Cast** slip between
Credits and Genres - characters with "voiced by" their seiyuu, from
`useCasting("hentai", …)`, drawn only when the entry has a cast. The spine reads "Hentai" and
the source material; the series number sits beside the series link. The left
column carries `SourcesCard` with `malLink` and `anidbLink` and `RelationsSection`. The admin
toolbar has Quick edit, Mark completed and **Autofill & update**, the
single-entry Tenrai and AniDB fetch (`replaceSingle("hentai")`: airing
status, release date, cover and the Official site / Twitter reference rows,
each only where blank, AniDB only for what MAL left blank). A Remarks slip appears only when a
remark exists, and `HentaiNotes.jsx` is the plain wrapper - the type has no
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
`MemeSection`. `SHAPES` maps all nine stored shapes to components,
`structured` → `StructuredSection` among them, so a new registry section needs
no frontend change as long as it reuses an existing shape — every one of the
game-only sections did. Group cards render in registry first-appearance order,
so a group's position is decided by where its first section sits in
`NOTE_SECTIONS`.

**Game.jsx and HGame.jsx use no `*Notes.jsx` wrapper** (`GameNotes` and
`HGameNotes` are the Modify tabs'): each composes the three pieces itself, so
that 待辦 Todo renders inside its Progress slip (`NotesGroup groupKey="todo"`)
while everything else renders at the bottom (`NotesBlocks hideGroups={["todo"]}`),
from one provider and one fetch. `hideSections` and `hideGroups` are the only
places the frontend names a registry key; see systems/notes.md.

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

### Four pages that need an account

`/plan`, `/seasonal`, `/seasonal/:seasonal_id` and `/statistics` sit inside
`<Route element={<ProtectedRoute permission="self.list" />}>` in `App.jsx`.
They are built from `plan_next` and `seasonal`, which are per-user tables whose
API routes answer `401` to a stranger, so a logged-out visitor is redirected to
`/login?next=…` rather than shown a page that fills with errors. `requireAuth`
gates on "is anyone logged in" rather than on a permission, mirroring the
server's `get_current_user_id`. Their nav rows carry `requires: "self.list"`,
the navigation config's spelling of "a signed-in member" (the guest role does
not hold it; both `user` and `admin` do), so a guest is not shown links that
would only bounce them.

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
optimistic `PATCH /api/anime/{id} { ep_fin }`. **Admin-only**: a "Seasonal
Rating" select → `PATCH /api/seasonal/{id} { my_rating }`, plus the hint to
set the current season under Admin → System Config when none is set.

### Statistics — `/statistics` · Completions — `/completions`

Files `pages/public/Statistics.jsx`, `pages/statistics/useStatisticsData.js`,
`StatsFavoriteGrids.jsx`, `StatsFranchiseSummary.jsx`, `StatsCompletions.jsx`,
`pages/public/Completions.jsx`, `components/charts/BarChart.jsx`.

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
between tiers, so both consumers are tier-blind and a new grid is a config
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
picked by the copy's own currency, never by falling back to another region's.
Bought and Should spend cover the same copies, so the two subtract to what
waiting for a sale was worth; a bought copy whose game has no list price in
its currency is counted under the column rather than priced at zero.

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
`useMediaList("franchise")`,
`useApiQuery(["api","system","current-season-config"], "/api/system/config/current_season")`,
and lazily per tab `anime-movie`, `movie` (`{ limit: 2000, airing_status: "Not Yet Aired" }`),
`tv-show`, `cartoon`, `game`. Tabs Anime / Anime Movies / Movies / TV Shows /
Cartoons / Games.
Anime keeps `Not Yet Aired` from the current season onward, grouped
"Spring 2025" / year / TBD with type chips; anime movies group by release
year; TV also includes "Airing". Games keep `release_status` of `Rumored` or
`Unreleased` — `Early Access` is already out and `Cancelled` is never coming —
grouped by the year of `release_date` with TBD last, and sorted inside a year
by that date, so a full date precedes a bare year. Cards are `MediaCard` with
`isAdmin`; `onUpdated` patches the `["media-list", type]` caches.

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
`media_type`, `is_general`, `is_favorite`, `needs_review` (admin-only
toggle), `search_query`. Memes: `useApiQuery(["memes-grouped"], "/api/meme/grouped", { params })`
with `owner_type`, `is_favorite`, `search_query`. The Quotes media-type
filter offers H-Comic, H-Game and Hentai only to a session that can see each type. Both group rows under an
owner card (cover or tier icon; "Unlinked / deleted owner" when missing).
Row actions: copy text/image for everyone; **admin-only** favourite toggle,
edit (`QuoteForm` / `MemeForm`, PATCH `/api/quote/{id}` / `/api/meme/{id}`)
and delete, followed by `invalidateQueries` on the grouped key.

### Login — `/login`

File `pages/public/Login.jsx`. Heading "Admin Access". POSTs
`/api/auth/login` as `application/x-www-form-urlencoded` (`username`,
`password`), then **loads** `?next` when it starts with `/` and does not point
back at `/login`, otherwise `/system`. A full page load, not a route change -
everything cached up to that moment was cached as a guest. Errors show inline
and as a toast.

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
- `FutureReleases` has no Games tab, so an unreleased game (`release_status`
  `Rumored` / `Unreleased`, playing status `Play When Released`) shows up
  nowhere on that page.
- `SeasonalDetail` refetches on id change without a cancellation flag;
  `SeasonalOverall`, `CollectionLibrary`, `FranchiseLibrary` fetch once.
- `Search.jsx` passes `isAdmin` only to the Manga `MediaCard`s.
- Detail-page Quick Edit for anime omits `&type=`; dashboard cards add it.
- `useStatisticsData` loads TV/cartoon/comic/game lists Statistics never uses;
  `StatsCompletions` is rendered only by `/completions`.
- Comic sits in the nav's Reality column with the same icon as Novel.
