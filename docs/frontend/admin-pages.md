# Admin Pages

Last verified: 2026-09-26

**What this is for.** Every route behind `ProtectedRoute` (permission `admin`)
in `frontend/src/App.jsx`: what each page loads, what it lets an admin do, and
the rules that are easy to get wrong (cascade deletes, enrichment, form
defaults). Public pages are in [pages.md](pages.md); the shared data layer,
theming and component catalog are in [components.md](components.md); the
server side of every action is in [../api.md](../api.md) and
[../data-actions.md](../data-actions.md).

All admin routes are lazy chunks (loaded on first navigation) and sit under
the `Admin` nav section, which only renders when `useAuth().has("admin")`.

| Route | File | Purpose |
|---|---|---|
| `/system` | `pages/admin/Admin.jsx` | Control Center: pipelines, announcements, review modals |
| `/data-history` | `pages/admin/DataHistory.jsx` | Data-control logs and deleted-record audit |
| `/review-queue` | `pages/admin/ReviewQueue.jsx` | Remarks and duplicate clusters to act on |
| `/add` | `pages/admin/Add.jsx` + `pages/add-tabs/*` | Create entries, groups, options, quotes, memes |
| `/images` | `pages/admin/Images.jsx` | Image library: upload, filter, detach, delete |
| `/modify` | `pages/admin/Modify.jsx` + `pages/modify-tabs/*` | Edit an existing row (deep link `?id=`) |
| `/delete` | `pages/admin/Delete.jsx` | Delete with cascade / orphan handling |
| `/defaults` | `pages/admin/FormDefaults.jsx` + `pages/defaults-tabs/DefaultsTab.jsx` | Per-type form defaults |
| `/watch-orders` | `pages/admin/WatchOrders.jsx` | Watch-order lists editor |
| `/relations` | `pages/admin/Relations.jsx` | Relations canvas |
| `/options` | `pages/admin/SystemOptions.jsx` | Read-only view of the three option tiers |
| `/aliases` | `pages/admin/Aliases.jsx` | Read-only view of the external-source names, inverted by source |
| `/external-apis` | `pages/admin/ExternalApis.jsx` | Read-only view of which field each external API writes, and whether it fills or replaces it |
| `/roles`, `/users`, `/content-labels` | `pages/admin/{Roles,Users,ContentLabels}.jsx` | RBAC administration |

---

## /system — Control Center (`Admin.jsx`)

- **Pipelines.** Buttons start `POST /api/data-control/fill/<type>`,
  `/replace/<type>`, `/fill/all`, `/replace/all` as Server-Sent Event streams
  (`startStream`). The reader parses `data: {...}` events (`processing`,
  `success`, `error`) into a status line and toasts on completion; **Stop**
  aborts the fetch via an `AbortController`, and the page aborts any running
  stream on unmount. Only one stream runs at a time. The Fill box's
  **H-Comic** buttons (`/fill/h-comic`, `/replace/h-comic`) are drawn only for
  a session that can see the type; both fetch Tenrai's manga record over the
  h-comic table, fill-only, and end in the region clears and the label. The
  **H-Game** buttons (`/fill/h-game` in the Fill box, `/replace/h-game` in the
  Replace box) are gated the same way; they run Game's IGDB and Steam fill and
  Game's Replace (IGDB fill-only, then Steam) over the h-game table. The
  **Hentai** buttons (`/fill/hentai`, `/replace/hentai`) are gated the same
  way too; both fetch Tenrai's airing status, release date and cover over the
  hentai table, and both are fill-only - Replace completes what is blank and
  overwrites nothing.
- **Sync actions.** Backup, Pull All, Pull `<tab>`, Calculate All and the
  cover-image maintenance endpoints are plain JSON calls with a busy state.
- **Announcements.** Create / edit / delete the dashboard board
  (`/api/announcements/`; title is the identifier — see api.md).
- **Current season.** Reads and writes `/api/system/config/current_season`
  (`"SPR 2025"` shape; not validated server-side). The season and year
  pickers default to the season after today's (`nextSeason` in
  `lib/season.js`; seasons are calendar quarters, so late September offers
  `FAL` of the same year and December offers `WIN` of the next).
- **Remarks / Duplicates modals.** The same views as the Review Queue, opened
  in place. (The Remarks modal's media-type tab list must include every type;
  `ReviewQueue.jsx` is the reference copy.)

## /data-history (`DataHistory.jsx`)

Lists `data_control_logs` (`GET /api/system/logs`) and `deleted_record`
(`GET /api/system/deleted`), each with a per-row delete
(`DELETE /api/system/logs/{id}`, `/deleted/{id}`). Deleted-record rows link
back to the owning franchise/series where the ids still exist.

## /review-queue (`ReviewQueue.jsx`)

- **Remarks section** — `GET /api/data-control/check/remarks`: every entry
  whose remark note is non-empty, grouped by media type, with the remark
  editable in place through `RemarkModal` (PATCH on the entry; the remark is a
  note section, see [../systems/notes.md](../systems/notes.md)).
- **Duplicates section** — `GET /api/data-control/check/duplicates`: clusters
  per type (see `find_all_duplicates` in
  [../business-rules.md](../business-rules.md)) with links to Modify/Delete.

## /add (`Add.jsx`)

A two-level tab bar (`config/adminTabs.js`): **Entries** (anime, anime movie,
movie, TV show, cartoon, manga, novel, comic, game, and the gated h-comic,
h-game and hentai, each for a session that can see it), **Structure** (collection,
franchise, series, quote, meme), **Entity** (studio, publisher, person,
character) and **System** (system option, alias). Each
tab is a form component in `pages/add-tabs/`; the page owns the state objects,
submit handlers and the shared modals.

**Restricted sources start prefilled.** A new entry's Sources block starts
with one restricted row for every name its type has on every entry, and the
restricted name field offers that type's other names as a datalist
(`lib/restrictedSources.js`). The names are suggestions, not a vocabulary:
choosing one only fills that row's text, which can still be edited for this
entry, and any other name is accepted.

| Type | Prefilled on every entry | Offered as well |
| --- | --- | --- |
| anime, anime movie | `Gimy`, `Anime1` | - |
| movie, TV show, cartoon | `Gimy` | - |
| manga | `漫畫櫃 (電腦版)`, `漫畫櫃 (手機版)`, `漫畫人` | `包子漫畫` |
| novel | - | `bili嗶哩輕小說`, `無限輕小說`, `無限小說`, `輕小說文庫`, `真白萌`, `和圖書`, `小說狂人`, `全本小說` |
| comic | `BatCave` | `GlobalComix`, `Read Comics Online` |
| h-comic | `禁漫天堂`, and six more on KR (below) | - |
| hentai | `Hanime1` | - |

Modify starts from the entry's stored rows and adds nothing, but the editor's
**Prefill suggested** button adds whichever prefilled names are missing. A
`sources` default set on `/defaults` replaces the prefill outright.

The **System** group holds the vocabulary tables themselves rather than
anything a visitor browses. System Option moved here out of Structure, which
had come to mean "grouping tiers plus a vocabulary editor"; Alias is new.

The **Entity** group holds things that are credited *on* entries rather than
being entries: studios, publishers, characters, and the people credited as
director, producer, composer, author or illustrator. Both were sub-tabs of System Options and both
moved out once each became a public entity with pages of its own. They are in
`FORM_TABS`: an entity is not a media entry, but each has an Add form whose
starting values are configurable on `/defaults`. Only options, alias, quote
and meme are excluded — those four have no factory in
`config/formFactories.js`.

**Data loaded on mount.** Collections, franchises and series (read by every
tab's pickers and by `buildAutofillPatch`), the form defaults and the
suggestion sources — all started together, in one wave.

**The twelve media lists are fetched per tab**, by `hooks/useEntryLists.js`: the
visible tab's list goes out first, and another tab's list is fetched the first
time that tab is opened and never again. Which lists a tab reads is
`config/adminEntryLists.js`. Every list, the three eager ones included, still
carries `limit=2000` — the API
default of 500 would silently truncate the auto-fill search and the duplicate
check.

**The page paints once the sources are in**, not once every list is. While a
tab's own list is still arriving its auto-fill box is disabled and says so,
because an enabled box searching an empty list would report "no matches" for
entries that do exist.

**Form defaults.** A fresh form comes from `freshForm(type)`
(`config/formFactories.js`) merged with the admin's saved defaults
(`hooks/useFormDefaults.js`, `/api/form-defaults/<type>`).

**Notes for the entry just added (every media tab).** Notes hang off an
entry's `system_id`, so the form cannot hold them before the entry exists.
Once a media submit succeeds, the page keeps the created row beside the
"Added" banner and renders `add-tabs/AddedEntryNotes.jsx` under it: the same
`NotesTemplate` the Modify tabs embed, pointed at the new entry, so every
section that type has is listed and each saves on its own. It hides nothing,
`remark` included — the form has already reset to a blank entry, so its Remark
field no longer edits this row. For h-comic and h-game the created row feeds
`owner_where` and the 亮點 Highlights group order, which a header drag saves
with a `PATCH`. The panel shows only on the tab the entry was added from, is
replaced by the next media add, and goes when the banner is dismissed or a
non-media row (collection, person, …) is added.

**Autofill search box (anime, anime movie, movie, TV show, cartoon, manga,
novel, comic).** Typing filters that tab's list client-side; picking a row
copies its fields into the form (`lib/autofill.js`, driven by
`config/formFields/fieldMeta.js`). Nothing is fetched from external APIs at
this point. **Game is the exception** — its box searches IGDB instead, see the
Game tab below.

**Franchise / series pickers.** `ComboBox` over the loaded lists; "create new"
opens `FranchiseCreateModal` / `CreateNewEntityModal`, which POST the group
and select it. `ComboBox.onSelect` receives `(id, label)`.

**Submit.** Validation (at least one name) → `POST` the entry
(`api/endpoints.js resource(type).create()`) → `PUT /api/credits/<type>/<id>`
with the credit/tag fields (`saveCredits`) → `PUT /api/content-labels/entry/…`
if labels were picked (and `PUT /api/content-labels/franchise/…` on the
Franchise tab, whose labels hide the franchise and every entry in it) → for **anime and anime movie only**, enrichment via
`lib/enrich.js` (`POST /api/data-control/replace/<type>/<id>` then re-read the
entry). The toast says "appended and enriched" only when enrichment
succeeded; otherwise "Saved. Enrichment failed - run Replace later." Movie
and TV Show toasts never claim enrichment (they are not enriched on Add).
Content labels reset only after a successful submit; a validation
early-return or a failed POST keeps the selection. Network failures surface
as an error toast.

**Game tab.** `GameAddTab.jsx`. The one media tab whose search box is not the
client-side "copy an existing entry" picker: `IgdbSearchBox` queries
`GET /api/game/search-igdb?q=&limit=10` (`endpoints.game.searchIgdb`) and lists
IGDB's own hits. It debounces 350 ms (IGDB is rate-limited), fires nothing under
two characters, and its effect cleanup marks in-flight answers cancelled, so a
slow reply to an earlier query can never overwrite a newer one. The rows read
IGDB's **raw** objects — `name`, `first_release_date` (Unix seconds UTC, shown
as a year) and `cover.url` (protocol-relative, so `https:` is prefixed) — because
the endpoint does not reshape them. The widget never touches form state; it
hands the raw object to `onPick`.

Its sections run Classification → **Rating** → Status → Progress → Credits →
Release & Prices → Copies → Sources → Flags → Notes. Rating holds `my_rating`
and the two Metacritic scores together, which is why the registry groups all
three under `Ratings` (`fieldMeta.js`) rather than leaving `my_rating` in the
shared `Status` group — /defaults reads those groups and is meant to match.

`applyGameAutofill` (in `Add.jsx`) is what turns that object into fields, and it
is deliberately not `makeApply`'s shape: it always sets `igdb_id` and
`igdb_link`, and fills `game_name_en` **only when the admin left it blank**.
Nothing else is copied — the rest is Fill Game's job.

**`igdb_id` has its own input, beside `igdb_link`**, and both ids are typed
rather than derived. The picker stores IGDB's public `www.igdb.com/games/<slug>`
URL, while the backend's `extract_igdb_id` only parses the API shape
`api.igdb.com/v4/games/<id>` — so a link pasted by hand identifies nothing, and
without a separately carried id the entry saves with `igdb_id` null and Fill has
no handle on it. `steam_appid` sits beside `steam_link` for the same
reason — there is no Steam picker at all, so a hand-typed `steam_link` still
needs its own id extracted before Fill can use it — but unlike `igdb_id` it
rarely stays null in practice: `steam_appid` is also written automatically,
either by `extract_steam_appid` parsing a store URL out of a hand-typed
`steam_link` before every Fill, or by Fill Game itself, whose IGDB half reads
the appid from `external_games` and writes the pair when the entry has
neither yet. Steam itself never writes `steam_appid`/`steam_link` — it only
reads the appid IGDB (or the admin) already supplied. `gameFieldsPayload`
coerces both to ints
(`lib/payloads.js`); `fieldMeta.js` marks them `defaultable: false`, since an
identifier is per-entry by definition.

The rest of the form is `GameFormBody`, exported from the same file: the five
names, classification (game type plus a **Base Game** `ComboBox` that never
offers the row being edited — `ck_games_not_self_parent` — and the four game
vocabularies), status, progress and the three HLTB tiers, credits (Developer is
a **studio** row, Publisher a **publisher** row; director and composer are
people scoped to `game`), release date and the six price fields, **Copies**,
sources, flags and notes. Submit needs a CN or EN name, `POST /api/game/` then
`saveCredits`; **games are never enriched on Add** — the toast is a plain "Game
appended successfully."

**H-Comic tab.** `HComicAddTab.jsx`, offered only to a session that can see
the gated type (`AdminTabBar` filters every tab list through `visibleByType`,
so Add, Modify, Delete and Form Defaults agree). **Region comes first**: until
JP or KR is chosen only the fields both regions share are offered, and choosing
one reveals its own (`lib/hComicRegion.js`) - JP the originality, animation
status, series number, page total and pages read; KR the chapter total,
chapters read, chapters behind the official source, author and official
source. The region's own name field (JP or KR) shows beside the shared EN / CN
/ Alt names. Both regions carry serialization status, club, 繪師 (artists),
the three H Genre tag fields, reading status, rating, usefulness, release /
end date, the cast (`CastEditor`, no seiyuu column) and sources. The franchise
picker (`FamilyLineageFields`, shared with the Hentai tab) offers the h-comic
family's franchises - **H-Comic and Hentai**, so an h-comic can join the
franchise of the hentai that adapts it - and a new franchise typed there is
created as `H-Comic`; the server refuses an h-comic in any other family. Submit
needs a region and a CN or EN name, blanks what the region does not use
(`clearedForRegion` - names are kept), quick-creates the typed people and genre
values through `hComicSourceFields`, then `POST /api/h-comic/`, the credits,
the cast and the labels; the write hook then fills from Tenrai when a MAL
link was given. The form starts with the restricted source `禁漫天堂`, and
choosing KR adds the six KR names (`污汙漫畫`, `漫小肆ikanhm`, `ToonGod`,
`Anime Planet`, `MANGA18`, `MANGADNA`) - rows that are still untouched (a
suggested name with no url) follow the region, and anything typed stays
(`lib/restrictedSources.js`). Modify offers the same names through the
editor's **Prefill suggested** button instead. The MAL ID beside the MAL Link
is read-only: the write hook derives it from the link. The
content-label picker shows the `h-comic` label checked and locked: every entry
carries it, and the save adds it back. The form never sends
`highlight_group_order` - the detail page's drag owns it.

**H-Game tab.** `HGameAddTab.jsx`, gated like the H-Comic tab. It is the Game
tab reshaped for `h_game`: the same **IGDB search** at the top (`IgdbSearchBox`
pointed at `/api/h-game/search-igdb`, filling the id, the link and a blank EN
name), then `HGameLineageFields` and `HGameFormBody`, which the Modify tab
renders too. The franchise picker offers **H-Game franchises only**, and a new
franchise typed there is created as `H-Game` - H-Game is a franchise family of
its own, and the server refuses an h-game anywhere else. The **Base Game**
picker offers h-games only (the self-FK is on `h_game`) and never the row
being edited. The body has the five names; classification (game type, base
game, **play style**, series number, Genre and Theme scoped to `h-game`, and
the three H Genre fields); a **Content** section - **Language** (one choice),
**Animation** (yes / no / unset) and three `ChoiceChips` lists, **Audio**, **H
演出形式** and **Platform** (where it is sold; not Game's hardware Platform
tag, and never filled from IGDB), each with None (`[]`) and Unknown (`null`)
as separate answers; rating and **usefulness**; status, completion level,
current patch, **All Endings**, **All CG** and Steam progress sync;
achievements and the three HLTB tiers; one credit, the **Developer** (a studio
row); release date and the six prices; **Copies** (Game's `GameCopiesEditor`,
gated on `self.list` as on Game); IGDB id and link, Steam appid and link, and
the two **DLsite** links; sources, flags and notes. No hours played,
Metacritic, All Achievements or All Collected - `h_game` has none of them.
Submit needs a CN or EN name, quick-creates the developer and tag values
through `hGameSourceFields`, then `POST /api/h-game/`, the credits and the
labels, without enrichment; the `h-game` label is checked and locked in the
picker.

**Hentai tab.** `HentaiAddTab.jsx`, gated like the H-Comic tab. It exports
`HentaiLineageFields` and `HentaiFormBody`, which the Modify tab renders too,
and it is simpler than h-comic's: no region and no progress - one entry is
one episode. The form starts with the restricted source `Hanime1`, which the
Sources editor also offers as a suggestion (and Modify through **Prefill
suggested**) - `lib/restrictedSources.js`. Its **Cast** section is `CastEditor` with the seiyuu column, as
on anime, saved through `PUT /api/casting/hentai/{id}` after the entry by both
the Add and the Modify page. The franchise picker is `FamilyLineageFields` over the
h-comic family (**Hentai and H-Comic** franchises), so a hentai can join the
franchise of the h-comic it adapts; a new franchise typed there is created as
`Hentai` (`HENTAI_FRANCHISE_TYPE`). The body has the five names;
classification (source material, originality, series number and the three H
Genre fields); credits (**Studio** and **Director**); airing status and
release date; watching status, rating and **usefulness**; the **MAL link** -
there is no MAL id input, since the write hook derives `mal_id` from the link
and `hentaiFieldsPayload` sends an id only beside one; sources, Watch Next /
To Rewatch, cover and remark. Submit needs a CN or EN name and a franchise,
quick-creates the studio, director and genre values through `hentaiSourceFields`, then
`POST /api/hentai/`, the credits and the labels, without enrichment (Fill and
Replace fetch from Tenrai later); the `hentai` label is checked and locked in
the picker.

**Copies editor.** `components/forms/GameCopiesEditor.jsx`, one row per copy
owned or wanted (storefront, ownership, format, acquisition, price paid +
currency, acquired date, remark), with move-up/down and remove. It is fully
controlled on the `NovelUnitsEditor` contract: no internal state, the parent
owns `items`, the array handed in is never mutated, and every change goes out
through `onChange` with `position` renumbered 1..n. `acquired_date` is free text,
not `<input type="date">`, because it carries the same partial precision
`release_date` does (invalid values are flagged with a danger border). The
entry's Ownership is derived from these rows, not typed.

**Person tab (Entity).** `PersonAddTab.jsx`. No `PersonSubTabBar` here — the
bar filters a list, and Add has no list; the role × scope matrix inside the
form already says which types a new person holds. `PersonFields` holds the four name fields with a
"Display name" select, the **role × scope matrix**, and gender, rating, photo
key and remark. Ticking a type selects its first legal media type, because a
scopeless role is a 422; the legal types per role come from
`GET /api/person/role-scopes`, so the form cannot offer a pair the API
rejects. Submit is blocked until at least one name is filled, matching
`ck_person_has_a_name`. `POST /api/person/` is find-or-create, like studio.
`PersonFields` is exported so the Modify tab renders the same inputs.

**Options tab.** Two sub-tabs (`OptionSubTabBar`, shared with Modify and
Delete): **Options** and **Tags**, both creating system options (category +
value + scopes). They are the same form posting to the same endpoint; only the
categories the Category picker offers differ (`TAG_CATEGORIES`, see
[../options.md](../options.md)). All three pages now show the same two, so the
Add-only `OPTION_VALUE_SUB_TABS` variant is gone. People and studios are
**not** here — each has its own Entity tab.

Below the scope and usage pickers sits `forms/AliasPicker.jsx`, repeating
`source` + external-value rows. Its hint says the opposite of theirs on
purpose: no scopes means *offered everywhere* and no usages means *every
usage*, but no aliases means *nothing maps to this*.

The picker appears **only for the categories in `ALIAS_CATEGORIES`** — Game
Genre, Game Theme, Game Mode, Game Platform (`forms/AliasPicker.jsx`, mirroring
`app/utils/source_fields.py`; see [../options.md](../options.md) for why the
list is code). Hidden rather than disabled: unlike the multi-value case below,
nothing the admin does to this form would make it apply. It **is** disabled,
and explained, while more than one option value is being added — the form
creates N values at once and an alias belongs to one value, not to the
category.

**Alias tab (System).** `forms/AliasTab.jsx`, shared verbatim with Modify.
A `system_option_alias` row has no endpoint of its own, so the tab picks the
option that owns it (category select, then value select) and `PUT`s that whole
option. The category select offers only `ALIAS_CATEGORIES`, and only those of
them that have values, in that constant's order rather than alphabetically. The body carries the option's `scopes`, `usages`, `sort_order` and
`remark` back unchanged — the `PUT` replaces those lists wholesale too, so an
aliases-only body would silently unscope the value. Choosing a different value
re-seeds the picker rather than carrying the previous option's rows over. The
page-level **Append Entry** button is hidden on this tab; the tab saves through
its own.

**Alias tab (Delete).** Not the shared component — the Delete page keeps its
own list/confirm shape. A category filter over `ALIAS_CATEGORIES`, then one
card per alias **row** (an option with three aliases yields three cards, since
the row is what gets deleted), each opening the page's usual confirmation
modal. Confirming calls `optionWithoutAlias(option, source, value)` from
`AliasPicker.jsx` and `PUT`s the result: the row goes, the option and its
scopes and usages stay. Deleting a conversion never deletes the value it points
at — only the external name, after which a Fill run meeting that name logs it
as unmatched and skips it. The match is on the `(source, value)` **pair**, not
the external value alone, so a second API knowing a value by the same string
keeps its own row.

Category is a closed picker (`forms/OptionCategorySelect.jsx`), the same
component and the same grouping the Modify and Delete pages browse with. It is
deliberately not a text box with a `datalist`: that lets a category be coined
by typing, and a typo then makes a category of its own that no other page
lists. `POST /api/system-option` accepts any category string; the restriction
is the form's. The picker
arranges its categories with `groupTier2Categories` (`lib/optionsPageGroups.js`,
see [/options](#options-systemoptionsjsx)) into `<optgroup>`s, with unclaimed
categories under **Other**; a list that yields a single section — the Tags
sub-tab, whose four categories are one group — renders flat rather than under
a heading repeating the sub-tab's own name.

**Studio tab (Entity).** `StudioAddTab.jsx`. Four name fields (English,
Chinese, Japanese, Alternative) with a "Display name" select naming which one
to show, plus a rating select over the shared `MY_RATINGS` vocabulary
(S…F, the same one entries use), logo key, country, founded/defunct dates
(`ReleaseDateInput`, so partial precision is allowed), website, MAL id/link
and remark. Submit is blocked client-side until at least one name is filled,
matching `ck_studio_has_a_name` and the schema's 422. `POST /api/studio/` is
find-or-create: posting a name that already exists returns the existing
studio rather than splitting its credits, and leaves its metadata untouched.
`StudioFields` is exported from this file so the Modify tab renders the exact
same inputs.

**Publisher tab (Entity).** `PublisherAddTab.jsx`, the publisher twin of the
studio tab and split the same way (`PublisherFields` exported beside the page
wrapper, so `PublisherModifyTab` renders the identical inputs). Same four name
fields with the "Display name" select — it is the third consumer of the shared
`STUDIO_NAME_FIELDS` list in `lib/naming.js`, after studio and person — plus
rating, logo key, country, founded/defunct `ReleaseDateInput`s, website and
remark. **MAL ID and MAL Link are deliberately absent**: the `publisher` table
carries no MAL columns, because MAL has no record of a games publisher or a
Taiwanese distributor. Submit is blocked until at least one name is filled,
matching `ck_publisher_has_a_name`. Below the name fields sits
`PublisherScopePills` (`components/forms/PublisherScopePills.jsx`): one row of
media-type pills — Anime, Anime Movie, Manga, Novel, Comic, Game — writing the
`scopes` list the request body carries, which decides where this publisher is
offered in the entry forms' pickers. A publisher with no pill lit is offered
**nowhere**, which is the deliberate rule, not an oversight; the studio tab has
no counterpart, because studios carry no scope. `POST /api/publisher/` is
find-or-create exactly as studio's is.

**Quote / Meme tabs.** `QuoteForm` / `MemeForm` with `QuoteEntryPicker` /
`MemeOwnerPicker`, and an `ImagePicker` for the image itself (see
[components.md](components.md) for the shared picker) — see
[../systems/quotes-memes.md](../systems/quotes-memes.md).

## /images (`Images.jsx`)

The image library: every file ever uploaded, from this machine or another,
behind `manage.catalog`. A drop zone accepts multiple files at once
(`POST /api/images` per file); a grid below shows each image's thumbnail,
size, dimensions and what it is attached to.

Three filters, each answering one question: **Unused** (no attachment),
**Not on this machine** (the row exists but the file does not — the normal
state of an uploaded image after a machine switch, since uploads never travel
through Backup or Pull), and **Duplicates** (same checksum; always empty in
practice — checksum is unique — and kept to prove dedup rather than to find
anything to fix).

**Deletion is unused-only by design.** The API still accepts
`DELETE /api/images/{id}?force=true` against an attached image, but no button
here sends it — removing an image that is still in use is a decision made at
the place that uses it (detach there first), not a blanket "delete anyway"
from the library. Each tile's **Detach** button removes one attachment
(`DELETE /api/images/{id}/attach/{attachment_id}`); an uploaded image stays in
the library, a downloaded one goes with its last attachment (see
[api.md](../api.md#images--apiimages)). **Delete** is disabled until every
attachment is gone.

## /modify (`Modify.jsx`)

Same tab bar and the same per-type forms (`pages/modify-tabs/*`), plus
**Fav 3x3** (`Fav3x3ModifyTab.jsx`: the favourite grids of
`config/favoriteGrids.js` - nine, and eleven for a session that can see
h-game - each stored as a `type_slots` map on the row it
holds — a franchise, a series or an entry; see
[pages.md](pages.md#statistics--statistics--completions--completions)).

- **Data loading** is `hooks/useEntryLists.js`, as on `/add`: collections,
  franchises and series eagerly, the media lists per tab. The three
  grouping-tier tabs are the ones that read more than their own — **franchise**
  pulls the eight lists that are neither game, h-comic, h-game nor hentai for
  its ribbon, **series** the seven (a series never lists anime movies), and
  **fav3x3** every list but h-comic and hentai, because two of its grids hold
  game rows, two hold h-game rows and none holds an h-comic or a hentai.
  `config/adminEntryLists.js` holds the map; games, h-comics, h-games and
  hentai appear in no tier ribbon. The two
  h-game grids are drawn only for a session that can see the type
  (`visibleFavoriteGrids`).
- **Finding a row.** A search box over that tab's list, or a deep link
  `/modify?id=<system_id>[&type=<type>]` used by the dashboard cards and
  detail-page "Quick Edit" buttons. The deep-link effect runs once on mount,
  and is the one path that may fetch a list the visible tab does not: a link
  naming its type costs that one list, and only if the id is not in it does it
  fall back to searching anime, collection, franchise, series and anime movie
  in that order.
- **Opening a row** seeds the form (`<type>ToForm(...)`), then loads its
  credits/tags (`GET /api/credits/<type>/<id>`) and content labels. A late
  credits response for a row that is no longer open is ignored (request
  counter), and the label picker clears the previous selection before
  fetching, so a slow or failed fetch can never save one entry's credits or
  labels onto another.
- **Save.** `PUT` the entry → `saveCredits` → labels (a franchise saves its
  own set the same way, through `saveFranchiseLabels`) → for **anime, anime
  movie, cartoon and manga**, enrichment via `lib/enrich.js`; the page then
  shows the *enriched* row (not the pre-enrichment one) and warns if
  enrichment failed. Other types save without enrichment.
- **Game tab.** `GameModifyTab.jsx` renders `GameAddTab`'s exported
  `GameLineageFields` and `GameFormBody` rather than keeping its own copy, so
  the two tabs cannot drift; the only differences are the ribbon section Modify
  puts above the form, the Structured Notes below it, and `excludeGameId`, which drops the row being edited from
  its own Base Game picker. This is a deliberate divergence from the **comic**
  pair, which still keeps two near-identical files. The Modify tab has **no IGDB
  search box** — identification happens once, on Add — and it saves with
  `PATCH /api/game/{id}`, without enrichment.
- **H-Comic tab.** `HComicModifyTab.jsx` renders `HComicAddTab`'s exported
  `HComicRegionField`, `HComicLineageFields` and `HComicFormBody`, the game
  pattern. It loads the cast like the other cast-carrying tabs, and saves with
  `PATCH /api/h-comic/{id}`, then credits, cast and labels, without enrichment.
  `hComicToForm` carries the row's `animation_status_source`: while it is
  `"derived"` (a hentai adapts the entry) the form shows the animation status
  as a disabled, read-only input with the hint "Derived from a linked hentai
  adaptation - remove the relation to set it by hand", and
  `hComicFieldsPayload` leaves the field out of the save, since the server
  refuses (422) any other value. A hand-set status is an ordinary select.
- **H-Game tab.** `HGameModifyTab.jsx` renders `HGameAddTab`'s exported
  `HGameLineageFields` and `HGameFormBody`, the game pattern, with the row
  being edited left out of its own Base Game picker. `hGameToForm` keeps an
  unrecorded list `null` rather than `[]`. No IGDB box, as on Game; it saves
  with `PATCH /api/h-game/{id}`, then credits and labels, without enrichment.
- **Hentai tab.** `HentaiModifyTab.jsx` renders `HentaiAddTab`'s exported
  `HentaiLineageFields` and `HentaiFormBody`, the game pattern, with no
  ribbon. `hentaiToForm` seeds the columns and the credit and genre fields
  arrive through `loadCreditsIntoForm`; a new franchise typed there is created
  as `Hentai`. It saves with `PATCH /api/hentai/{id}`, then credits and
  labels, without enrichment.
- **Structured Notes.** Every media type's tab ends with the entry's notes
  page (`<Type>Notes`). On the Comic, Game, H-Comic, H-Game and Hentai tabs it
  sits below the form body, with the whole open row as the owner, so the KR-only 亮點 Highlights appears on a KR h-comic alone.
  `remark` is hidden there, as on every other type's tab: the form's Remark
  field writes the same singleton row. Highlights groups show in their stored
  order; reordering them is the detail page's.
- **Franchise / Series tabs** also expose the plan-next / rewatch toggles
  (`PlanKindToggles`) and size-group overrides (`SizeGroupControls`).
- **Studio tab (Entity).** `StudioModifyTab.jsx` bypasses the search / open /
  save machinery above, which is shaped around media entries and the grouping
  tiers: it owns its own `useQuery` over `/api/studio/`, its own picker and
  its own `PUT /api/studio/{id}`, rendering `StudioFields` from the Add tab.
  The picker **lists every studio up front** in a grid of display names, the
  way the System Option tab lists a category's values — an admin does not have
  to already know a name to reach the record. The search box filters that grid
  in place over **all four** name fields, not just the one
  `display_name_field` points at, so a studio configured to display its
  English name is still findable by its Japanese one. Opening a studio whose
  `country` is unset seeds the field with **Japan** — the overwhelmingly
  common case here — so saving without touching it records Japan.
- **Publisher tab (Entity).** `PublisherModifyTab.jsx`, self-contained the
  same way over `/api/publisher/` (query key `["publishers-admin"]`): its own
  picker listing every publisher up front, the same all-four-names filter, and
  its own `PUT /api/publisher/{id}` rendering `PublisherFields` from the Add
  tab, `PublisherScopePills` included — and this is the **only** path that
  narrows a publisher's scopes, since `PUT` replaces the set wholesale while
  every other writer (the create POST, and crediting a publisher on an entry)
  is additive. Two `activeTab !== "publisher"` guards on the page suppress the generic
  entry search bar and save footer, as the studio and person tabs do. Unlike
  the studio tab it seeds **no default country**: "nearly every studio here is
  Japanese" is not true of publishers and distributors.
- **Person tab (Entity).** `PersonModifyTab.jsx`, self-contained the same way
  over `/api/person/`. A `PersonSubTabBar` picks the role — the analogue of
  the option tab's category — and every person holding it is listed in the
  same grid of display names, filtered in place by the same all-four-names
  search. Above that search sits a row of **scope chips** — the role's legal
  media types, from `/api/person/role-scopes` — which narrow the grid to the
  people holding the role in one of the ticked scopes; the match is OR, so a
  director scoped to `anime` alone still shows under {anime, anime-movie}.
  None ticked means any scope, switching sub-tab clears them, and a role with
  a single legal scope (producer, composer) gets no chip row. The filtering is
  client-side over the `roles` each listed person already carries, not the
  endpoint's single-valued `?scope=`. The form then edits the person's whole
  record, every type they hold and not just the sub-tab's one, because `PUT` replaces the role set
  wholesale.

## /delete (`Delete.jsx`)

Loads the five entity lists (options, studios, publishers, people,
characters) on mount and the entry lists per tab, the same way `/add` does.
Every list carries `limit=2000`; the API default of 500 would silently truncate
the search and the checks below. For a selected row it shows a confirmation
modal with the consequences:

| Deleting | What is offered |
|---|---|
| Collection | Never cascades; member franchises become uncollected. |
| Franchise | **Cascade** (checkbox): deletes every series and every media entry of *every* type under it (`deleteChildren("franchise_id", id)`), or leaves them with `franchise_id = NULL` if unchecked. |
| Series | Cascade over every media type holding that `series_id`. |
| Any media entry | **Orphan series** offer when it is the last entry of any type in its series; **orphan franchise** offer when it is the last entry of any type in the franchise and the franchise has no (remaining) series. |

The **Game tab**'s panel adds one line of its own: when the selected game has
copy rows it warns how many will be deleted with it. Its DLC and expansion rows
are not cascaded — they survive with `base_game_id` set to `NULL`.

The **H-Comic tab** (gated like its Add tab) offers the same orphan series
and orphan franchise checkboxes as the manga tab. The **H-Game tab** (gated
the same way) offers them too, and warns about copy rows as the Game tab
does; its DLC rows likewise survive with `base_game_id` set to `NULL`. The
**Hentai tab** (gated the same way) offers the orphan series and orphan
franchise checkboxes as well.

Counts are computed across all twelve media types (`entriesIn`,
`standaloneEntriesIn`), so **opening the confirmation waits for every media
list to be in** — lazily loaded ones included — and `executeDirectDelete`
waits again before cascading. A list that was never fetched reads as empty,
which would understate the cascade and offer to delete a franchise that still
holds entries. The modal says "Checking what else this would delete…" while
that completes. Deletion order is children first, then the row, then
any orphaned parents the admin ticked. Every delete goes through the type's
`DELETE` endpoint, which also removes cover images, plan rows, credit links and
writes a `deleted_record`.

**Person tab (Entity).** A `PersonSubTabBar` filters the picker to the people
holding one type, then the selected person's whole record is edited through
`PersonFields` — every type they hold, not just the sub-tab's one, because
`PUT` replaces the role set wholesale. The picker searches all four name
columns, not just the displayed one. The panel mirrors the studio one below:
credit count, a warning that `media_credit.person_id` is `ON DELETE CASCADE`,
**Merge Into Another Person** offered before Delete, and the confirmed credit
count sent as `?credits=N` so a count that moved while the dialog was open
comes back as a 409 rather than a silent over-deletion.

**Studio tab (Entity).** A picker over `/api/studio/` showing each studio's
display name, id and credit count, then a warning that says exactly what
deleting costs: `media_credit.studio_id` is `ON DELETE CASCADE`, so deleting
destroys this studio's *n* credits on every entry linked to it. The panel
therefore offers **Merge Into Another Studio** beside Delete — merge
(`POST /api/studio/{keep}/merge` with the selected studio as `source_id`)
repoints the credits onto the survivor first, and is the correct fix for a
duplicate. Delete itself is two-step (confirm, then execute) and writes no
`deleted_record`.

**Publisher tab (Entity).** The same shape as the studio tab above: a picker
over `/api/publisher/` showing display name, id and credit count; a warning
that `media_credit.publisher_id` is `ON DELETE CASCADE`, so deleting destroys
this publisher's *n* credits; **Merge Into Another Publisher**
(`POST /api/publisher/{keep}/merge` with the selected publisher as
`source_id`) offered beside Delete as the correct fix for a duplicate; and a
two-step delete writing no `deleted_record`. The one thing the studio path
does not do: the publisher `DELETE` endpoint also removes the publisher's logo
object from GCS — see [../api.md](../api.md#publisher--apipublisher).

## /defaults (`FormDefaults.jsx`)

One tab per `FORM_TABS` entry (`DefaultsTab.jsx`) — every media type, the
three grouping tiers, and the three Entity tabs. Fields come from
`config/formFields/fieldMeta.js` (label, control, option source, `coerce`
rule); values are stored per type via `/api/form-defaults/<type>` and applied
by `useFormDefaults` when an Add form is created. "Reset" deletes the stored
defaults for that type. Note `coerce: "tristate"` is implemented but unused
by any field.

`h-comic` is present here for a session that can see it; its Add form has no
"copy an existing entry" search either, so its auto-fill ticks drive nothing
yet. `h-game` is present the same way and for Game's reason (its box searches
IGDB); its four multi-choice lists offer no default, since their unset state
is `null`, "not recorded". `hentai` is present the same way; its Add form has
no copy search either, so its auto-fill ticks drive nothing yet; its
`mal_id` is hidden (the write hook derives it from the link) and `mal_link`
is not auto-fillable.

`game` is present here like any other media type, but its Add form has no
"copy an existing entry" search (its box searches IGDB), so the auto-fill ticks
on the Game tab currently drive nothing.

**Repeater defaults (sources, game copies).** `sources` on every media tab and
`copies` on the Game tab are lists of rows, not single values, so
`DefaultValueControl` renders the Add form's own editors — `SourcesEditor` and
`GameCopiesEditor` — inline, laid out across the full row rather than squeezed
into the value column. What the admin builds here is what a new entry starts
with: a game can default to one "Steam / Owned" copy instead of no copies at
all. The Game tab hides the main-access block exactly as its Add form does
(`showAccess: false`), since a game is owned rather than streamed. Rows are
templates, so `useFormDefaults` strips any `system_id` off them on read — a
default row must insert, never update someone else's row. Modify is unaffected:
it reads `sources` and `copies` off the saved entry and takes only scalar
fallbacks from the defaults.

The Entity tabs (studio, publisher, person, character) are defaults-only: their Add forms
have no "auto-fill from an existing record" search, so every one of their
fields is `autofillable: false` and `DefaultsTab` drops the auto-fill column
for them entirely.

## /watch-orders (`WatchOrders.jsx`)

Lists every watch-order list (`GET /api/watch-order/lists`, with the
`auto=exclude|only` filter for generated Release Orders), opens
`WatchOrderEditor` for items, sections and reordering, and can duplicate or
delete lists. Details in [../systems/watch-orders.md](../systems/watch-orders.md).

## /relations (`Relations.jsx`)

Picks a lens (franchise, collection or series) and renders `RelationGraph`
(`GET /api/media-relation/graph`), with drag-to-connect, the edge inspector,
undo and scope reset. Details in [../systems/relations.md](../systems/relations.md).

## /options (`SystemOptions.jsx`)

Read-only: Tier 1 enums from `/api/constants`, Tier 2 options grouped by
category with their scopes, Tier 3 people and studios. Editing happens on
Add/Modify under System → System Option — see [../options.md](../options.md).

## /aliases (`Aliases.jsx`)

Read-only, and the inverse of `/options`: that page answers "what values does
this category offer?", this one answers the question Fill actually asks —
"IGDB just said *Role-playing (RPG)*; what does that become?". Both read the
same `GET /api/options/?limit=5000`; `lib/aliasGroups.js` turns the rows inside
out into source → category → `{external, value, scopes}`, sorted by the
external string so an admin can scan for what the API sent.

A category appears under a source only if at least one of its values carries a
row for it — otherwise every category would list under `igdb` with all its
values unaliased, which says nothing (Combat Mode is not an IGDB field). Within
a listed category, the values that carry **no** row are named underneath: those
are the gap the page exists for, invisible from the options side, where a value
with no aliases looks exactly like a value in a category no API touches.

Neither Tier 1 nor Tier 2 is one alphabetical wall: `lib/optionsPageGroups.js`
sorts each into named groups, with everything unclaimed under a final
**Other**. Tier 1 (`TIER1_GROUPS`, keyed by enum name) puts the "what kind of
work is this" lists together under Entry Type, files the game lists by the
question they answer (`game_release_status` under Publication Status,
`playing_status` under My Progress) and keeps only the game_copy vocabularies
in a **Game** group. Tier 2 (`TIER2_GROUPS`, keyed by `system_option.category`)
reads as Tags, Game, Comic and Source & Platform. That last group holds the
platform and reference vocabularies, the ones that name an outside party.
Publishers and distributors are **not** among them — they are entities, edited
on the Entity → Publisher tab.

A group left with a single member is demoted into Other rather than printed as
a heading over one card. The left-hand section index lists one level per tier —
the group headings, not the enums and categories inside them; listing every
leaf ran to forty-odd links, taller than the viewport on its own. Individual
cards and tables keep their ids for saved links, but only the tiers and their
groups carry `data-section-anchor`, since those are the entries the index can
highlight. Grouping is presentation only — no business logic reads it, and
a category no group claims still appears, under Other. `TIER2_GROUPS` is not
this page's alone: the Add / Modify / Delete category picker
(`forms/OptionCategorySelect.jsx`) arranges its dropdown with the same
`groupTier2Categories`, so a category sits in the same company wherever an
admin meets it.

## /external-apis (`ExternalApis.jsx`)

Read-only, and the third of the inventory pages: `/options` says what the
vocabulary offers, `/aliases` says what an API's English becomes, and this one
says which **columns** an external API writes at all — and whether it fills
each or replaces it. Served by `GET /api/constants/external-apis` from
`app/services/integrations/catalog.py`; the prose version, with the mapping
rules the catalog omits, is [../external-apis.md](../external-apis.md).

The distinction the page is built around, and the reason it is not laid out as
a Fill column beside a Replace column: **Replace does not write a different set
of fields from Fill**. `apply_single_replace_*` calls the same `autofill_*`
function with the same `force_replace_ratings=True`; the two pipelines differ
only in which entries they select. A two-column table would print every value
twice and teach the wrong model, so the page states one rule per field and
calls out the overwrite list once, up front. That list is computed from the
catalog rather than written into the page — a stale summary here would be worse
than none.

One section per media type, in `PIPELINES` order, each holding the id it is
keyed on, the requests it costs per entry, chips for the pipelines it actually
has, and one table per source. A type with several sources says how they
combine: Movie / TV Show / Cartoon are `merged` (TMDB and OMDb both fetched,
OMDb winning on `imdb_rating`, the only key they share), Novel is `either-or`
(a `mal_link` routes to Tenrai, otherwise Open Library). Below the sections, a
service table with the env var and rate limit behind each API, and a legend for
the six rules.

Colour carries one thing only: `overwrite` takes the brand chip, everything
else is muted — design rule 1, and the whole point of the page in one glance.
The media-type key reuses `config/scopeColors.js`; Studio has no hue because
it is not a media entry.

The four pipeline chips (`in Fill All`, `bulk Replace`, `fill only`, `stops on
quota`) are derived server-side from `PIPELINES`, never declared in the
catalog, so flipping `in_replace_all` on a spec lights the page up without
anyone remembering this file.

## /roles, /users, /content-labels

- **Roles** — create roles, replace their permission set from the catalog
  (`/api/roles/catalog`). Boxes a role may not change are drawn disabled from
  the `locked_on` / `locked_off` the role itself carries, and a role with
  nothing left to decide (`super`, `admin`) gets no Save button. The same
  table answers 409 on the write path, so a box that looks editable is one the
  server will accept.
- **Users** — create users with a role, change role, delete; the last
  administrator and your own account are protected.
- **Content Labels** — the label vocabulary; deleting a label immediately
  re-exposes every entry and franchise that carried only that label. This page
  is `admin.authz`; **assigning** a label on Add/Modify is `manage.catalog`, so
  a `super` account labels things here without reaching this screen.

Rules and enforcement are in [../authorization.md](../authorization.md). These
three pages have one-click deletes with no confirm dialog.
