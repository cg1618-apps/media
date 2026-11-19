# Design decisions

Last verified: 2026-11-19

## What this is for

A dated log of the choices that shaped the code and, where it matters, the alternatives that were rejected. Read it before proposing a change that "obviously" simplifies something: the odds are the simpler shape was considered and turned down for a reason listed here. Each entry names the spec that produced it; the spec files themselves have been retired, so the date and name are the only attribution that remains.

## 2026-05

## 2026-08

## 2026-09

## 2026-10

### The nav search dropdown: eight rows, a hue per type, closed by a search (2026-10-18)

- **Owner's request**, three parts: the suggestion dropdown stayed open after
  Enter until the reader clicked elsewhere; it showed too many suggestions;
  and its type badges should each have a colour, to tell the types apart.
- **The dropdown that stayed open was a response landing late.** Enter
  cleared the debounce timer and hid the dropdown, but a request that had
  already left still held the current request id, so when it answered it
  passed the stale-response check and reopened the dropdown over `/search`.
  Enter, a result click and an emptied input now move the request id on as
  well as clearing the timer (`cancelPendingSearch`), so the late response is
  discarded. Aborting the fetch was not needed: the id check already throws
  the answer away, and an abort would add a second mechanism for the same job.
- **Eight rows, not twenty.** The dropdown is a shortcut to the likely row;
  `/search` is the result list. Eight rows cannot carry the old per-type
  quotas (anime alone had ten), so every title type gets a floor of one and
  the staff types none — the first pass is about showing as many types as
  fit, and the round-robin hands out the rest. The request's per-bucket
  `limit` drops to the same eight. **Exact matches moved into the merge**:
  they used to be lifted after it, which at twenty rows rarely lost one, but
  at eight a whole-title hit in a late bucket (a publisher, say) would be cut
  by the cap before it could be lifted, so the merge now takes every bucket's
  exact matches first.
- **The badge colour is the second sanctioned exception to design rule 5.**
  The rule asks that a colour-coded category make its own argument. This
  one's: the dropdown mixes up to nineteen types in eight rows that are
  scanned, not read, while the reader is still typing — the job is to find
  the one row of the type they meant, and hue does that before the mono
  label is read. That is the same shape as the System Options column (a
  comparison across rows, not a reading of one), on a different surface. The
  label stays in the chip, so colour is never the only signal.
- **Media types reuse their scope hue** rather than getting a second palette,
  so a type has one colour wherever it is coloured; `config/scopeColors.js`
  holds both as `TYPE_HUES`, and `SCOPE_CHIPS` is built from it. The seven
  types the System Options column never shows got new `--c-scope-*` tokens.
  Collection, franchise, series and seasonal take saturated hues in the gaps
  the media types leave; person, studio and publisher take low-saturation
  slate, taupe and mauve, so a credited entity reads as "not a title" first.
  Nineteen hues cannot all be far apart, so franchise and comic, series and
  movie, seasonal and novel are close in hue and separated by saturation.
  Every new value clears WCAG AA on `--c-surface` (lowest 5.29 light, 6.30
  dark), above the existing floors.
- **Rejected:** a separate ad-hoc colour map in `NavSearch.jsx` (two homes
  for one type's colour, and the tokens' "used only by scopeColors.js"
  guarantee would no longer hold); colouring the full `/search` results page
  too (its rows sit under per-type headings, so the type is already given by
  position, and the rule's argument does not carry over).

### Metacritic from Steam, HowLongToBeat from the site's search, or nothing (2026-10-18)

- **Owner's request: fill a game's HowLongToBeat and Metacritic page links
  automatically, "similar to what we did for SteamDB".** Both values were
  already seeded in the Reference Source vocabulary for games and h-games;
  nothing wrote them.
- **IGDB was the first place looked, and it has neither.** Queried live, its
  `external_game_sources` and `website_types` carry no HowLongToBeat and no
  Metacritic entry, so IGDB's `external_games` - which supplies the Steam
  appid - cannot supply these.
- **Metacritic comes from the Steam answer already fetched.** `appdetails`
  returns `metacritic.url` beside the score, so the link costs no request.
  Steam's URL is the legacy `/game/pc/<slug>?ftag=...` form; Metacritic 301s
  it to `/game/<slug>/` (checked live), so that is what is stored - one page
  per game, and no tracking query. Rejected: storing Steam's URL verbatim,
  which keeps a tracking tag and a redirect in every link.
- **HowLongToBeat comes from the site's own search, kept only when
  confident.** The owner's decision: store `https://howlongtobeat.com/game/<id>`
  only when the right entry is identified with confidence, and otherwise
  nothing. So the rule is an exact match on a normalised name, aliases only
  when no name matches, the release year only to break a tie, and more than
  one survivor is no link. Rejected: a fuzzy "best" match, which would put
  plausible wrong links on the Sources card where nobody checks them; and a
  search-results URL (`/?q=<name>`), which is a link to a question rather
  than to the game.
- **The search is undocumented, and the client is written to fail quietly.**
  HowLongToBeat publishes no API; its search endpoint's path and token
  handshake change over time. The client reads the path out of the site's
  own script and fetches a token the way the page does - the same mechanism
  as the maintained `howlongtobeatpy` package - and answers every failure
  as None. Rejected: depending on `howlongtobeatpy` itself, which pulls in
  `aiohttp`, `fake_useragent`, `beautifulsoup4` and a test library as runtime
  requirements for what is three `requests` calls here, and randomises its
  User-Agent, which the token is bound to.
- **Fill asks only for the entries it queues, and does not repeat a miss.**
  SteamDB is derived in post-processing because it is free; a search is not,
  and post-processing runs on the event loop for every entry in a run. A miss
  is remembered per process and retried by a bulk Replace or the Autofill
  button - not by an ordinary save, which runs the same Replace through the
  write hook but would otherwise add a search of a second or more to every
  save of an unmatched game - rather than stored: a column or table recording "searched, not found"
  would be a migration and a gated release for what a restart costs one
  extra search to forget.
- The time-to-beat **figures** still come from IGDB, as decided when games
  were built. HowLongToBeat is asked for its page link only.

### Characters are searched on the search page only, by opt-in (2026-10-18)

The `/search` page shows results on three tabs - Media, People & companies,
Characters - and characters became searchable for it. `GET /api/search/`
adds the `character` bucket only when asked (`characters=true`), and only
the page asks.

- **Opt-in, not a new default bucket.** The nav dropdown shares the endpoint
  and fills eight rows from per-bucket quotas; a query there is usually about a
  title, and character names recur across unrelated works on purpose, so a
  default bucket would spend the dropdown's slots on the weakest answers.
  Leaving the default response unchanged keeps the dropdown as it was without
  it having to filter anything out.
- **One request, not a second call to `/api/character/`.** The page already
  makes one search request; the character bucket is one more query plus three
  decoration queries (castings, tags, identities) for the whole bucket, built
  by the same `character_responses` helper the character list uses, so a
  search card and a library card cannot disagree. `/api/character/?name=`
  would have meant a second request, raw `ILIKE` matching instead of the
  search normalisation, and no `limit`.
- **Not a scope.** The scope selector is the dropdown's, and the dropdown has
  no characters; the bucket is filled at `scope=all` only.
- **Character names only.** An identity's names do not find its character and
  identities are not results of their own: the identity list is an admin
  surface, and an identity is reached from its character's page.
- **The same visibility as the list.** Character is a shared record, so the
  bucket goes through `apply_shared_visibility` exactly as
  `GET /api/character/` does - one whose every casting is on a hidden entry is
  absent.

### Form suggestions are ordered by appearances on the form's media type (2026-10-18)

The Add and Modify tags fields used to offer their values alphabetically
(people, studios, publishers) or in `sort_order` (vocabularies). The owner
asked for the most-used values first, and for a studio field's empty box to
offer only the studios of the entry's own type.

**What "appearances" counts.** The number of **entries of the form's media
type** that use the value, among those the viewer can see — not the value's
total across every type, and not rows. Per type because that is the scope the
owner's studio rule already names: the studio most used on hentai is not the
one an anime form wants first. Entries rather than rows so a value used twice
on one entry (a studio under two role keys, a vocabulary value in two fields)
counts once. People are counted **per role**, because a person picker is per
role: a prolific director who once composed is not the first composer.
Label-hidden entries and types the viewer lacks are left out, the
`credit_count` rule, so a narrow mode cannot learn from an order what it
cannot read. The manga form's Anime Studio field counts under anime: it names
the adaptation's studio, and no studio is credited on a manga.

**Which vocabularies.** Only the genre and label ones (Genre Main, Genre Sub,
Label, Game Genre, the H genres). The rest — platforms, imprints, themes,
modes — keep their admin `sort_order`, which is curated; reordering them by
use would discard that ordering without being asked to.

**How it is served.** One endpoint, `GET /api/credits/usage`, for every type
at once: two `GROUP BY` queries (media_credit, media_tag) plus the hidden-label
lookup, so the cost does not grow with the number of values. The forms fetch
it once beside their suggestion lists and sort client-side, typing included.
A separate endpoint rather than a parameter on the list endpoints because the
library, search and entity pages read those lists in their own order, and
the counts for one form come from several of them; the lists themselves are
untouched.

**Studio scope is the empty box only.** A studio has no declared scope (no
`studio_scope` table, unlike `publisher_scope` and `person_role`), so "in
scope" is read from the counts: credited on a visible entry of the type. The
empty box offers those; typed text searches every studio, exact and prefix
matches first, then appearances, so a studio new to the type is still
reachable. Publishers and people keep their stricter, declared scope — an
out-of-scope publisher is not offered even when typed — because that scope is
an admin's statement ("a games publisher must not be suggested as an anime
distributor"), not an inference from history.

### The three restricted types are one franchise family (2026-10-18)

`FRANCHISE_FAMILY_FOR_TYPE` maps `H-Comic`, `Hentai` and `H-Game` to one
family, `restricted`. Until now H-Comic and Hentai were the `h-comic` family
and H-Game a family of its own ("A franchise family of its own", above). The
owner reversed that: fan-made works span all three types, and one doujin
franchise ("Doujin Works / 同人作品") should hold the h-comics, the hentai and
the h-games together. That is a choice about grouping, not about visibility,
so nothing else about the gate moves.

- **Renamed, because it is no longer comics only.** `h-comic` was also the
  media type key and the content label key, and a family of three types named
  after one of them reads as that one. The family string is code alone - no
  column, sheet tab or migration stores it - so the rename needs no migration.
- **Name matching now crosses the three.** The resolver matches within the
  entry's family, so an h-game whose franchise name matches an existing
  `H-Comic` or `Hentai` franchise attaches to it instead of creating an
  `H-Game` one. That is the intended consequence: the doujin franchise is
  found by name from any of the three forms or sheet tabs.
- **Labels stay per type list.** A franchise still carries the label of each
  gated franchise type its `franchise_type` names; one typed
  `"H-Comic, Hentai, H-Game"` carries all three. Joining a franchise does not
  add the joiner's type, as before, and the hubs fetch every restricted list
  under any restricted franchise for that reason.
- **The h-game form reuses `FamilyLineageFields`.** Its own picker filtered on
  the `H-Game` type and was otherwise the same component; `HGameLineageFields`
  now wraps the shared one, as the h-comic and hentai tabs do. The DLC chain's
  Base Game picker is untouched - it picks among h-games, not franchises.
- **The mainstream boundary is unchanged.** `"ACG, H-Game"`, `"Game, H-Game"`
  and an h-game written into an `ACG` or `Game` franchise are still refused
  (422), so no gated entry reaches a public group.

### Following a watch order: the owner is copied, so the owner cannot move (2026-10-22)

A member follows at most one watch order per group (franchise, series or
collection). The rule could live in the router alone - "delete my other
follows in this group, then insert" - or in the database. It lives in the
database: `watch_order_follow` copies the order's owner onto the row and
`uq_watch_order_follow_group` is UNIQUE NULLS NOT DISTINCT over the user and
the three owner columns, the shape `plan_next` already uses.

A copy is only sound if the original cannot change, and a list's owner could:
`PUT` and `PATCH /api/watch-order/lists/{id}` accepted new owner columns, and
nothing in the SPA ever sent one. So the owner is now fixed at creation and
both endpoints answer 400 when a body names a different one (restating the
current owner, as a `PUT` echoing the list does, is allowed).

Rejected:

- **No copy; one-per-group checked in the router.** Correct on the follow
  path, but an admin moving an order into another group would leave a member
  following two orders of that group with nothing to say so.
- **Keep the owner movable and re-sync the follows on every move.** Three
  write paths (`PUT`, `PATCH`, a Pull that rewrites list rows), each needing
  to repoint follows and resolve the collision a move can create - which of
  the member's two follows wins has no good answer. Making the owner
  immutable removes the case instead of answering it.
- **A composite foreign key `(list_id, owner columns)` with ON UPDATE
  CASCADE.** Under MATCH SIMPLE a key with any NULL column is not checked at
  all, and two of the three owner columns are NULL on every row, so the
  constraint would hold nothing. A generated non-null owner column on the list
  would make it work, at the cost of a column Pull and PATCH would both have
  to learn to skip.

The remaining hole is a hand-edited sheet: a Pull writes a list row as the
sheet has it, owner included. Every list's uuid is minted once with its owner
and the owner never changes on either machine, so an ordinary Backup / Pull
round trip cannot move one.

Four smaller choices, made with the feature:

- **Progress counts the steps the page draws.** `_resolved_steps` serves both
  the detail endpoint and the follows, so the guide and "step N / total" never
  disagree about a hidden entry or a built-in order's generated steps.
- **A ranged step is "active" only once reached.** The rule as specified: active when
  the status is in progress and the step is not done by its range. Read
  literally, both halves of a split run (A ep 1-10, A ep 11-12) are "now"
  while ep 3 is playing. A step whose `ep_start` lies beyond the next unit is
  pending instead, so "Now" is the half being watched and "Up next" can name
  the other.
- **A split run shows every occurrence.** The entry panel draws one
  previous / this / next block per step naming the entry, since each half
  sits between different neighbours; folding them would lose one half's
  neighbours.
- **Follows travel in the Sheets backup**, as `plan_next` does: tab
  `Watch Order Follow`, `user_id` dropped for `username`.

### The main-entry flag is removed; the `alternative` relation replaces it (2026-10-22)

`is_main_entry` was a Boolean on anime, comic and novel ("Mark as main entry
among alternatives"; on a comic, "main line, not a spinoff"). The relation
system made it redundant: the `alternative` kind in
`app/utils/relation_kinds.py` says which entries are alternatives of one
another, between the two entries themselves. The owner dropped the flag from
every type: the three columns, by `d1r2opmain34`, the form checkboxes, the
comic card's "Main" badge, the anime "Main" chip on the franchise and series
pages, and the comic detail page's Main Line field. The values are not carried
anywhere; the downgrade puts the columns back empty.

- **The comic duplicate key loses it.** It was `(franchise_id, series_id,
  is_main_entry)`, so a main-line run and a spinoff of the same name in one
  series were never compared. The key is now `(franchise_id, series_id)`,
  like movie's; the Comic Vine id still tells two runs apart when it differs.
- **An old sheet still pulls.** The Google Sheet carries an `is_main_entry`
  column on the Anime, Comic and Novel tabs until the next Backup rewrites
  them. Pull discards the column and names it once per tab in the run's
  unresolved references, as it does for any header that is no longer a
  column.

### Genres and labels are replaced from a series or franchise entry, on every tagged type (2026-10-22)

The anime-only import of 2026-10-04 became **Replace genres & labels from…**
(`forms/TagReplace.jsx`), offered wherever an entry carries classification
tags.

- **Replaced, not appended.** Picking a source overwrites each field with the
  source's value, clearing one the source has empty. The use is "this entry is
  tagged like that one", and a merge left the old tags behind to be removed by
  hand. Nothing is saved until the form is, so a wrong pick costs nothing; the
  wording says "Replace" so the overwrite is not a surprise.
- **Series first, then the franchise.** An entry of the same series is the
  likeliest match, so it leads, under its own `<optgroup>`. The split is made
  in the browser from the one franchise list (`series_id` is on every row), so
  there is still no new endpoint.
- **Same media type only.** Tags are scoped per type (`lib/genreLabelFields.js`),
  so another type's values would not be offered by this form's pickers.
- **Every type with tags.** The seven `GENRE_LABEL_TYPES` get it through
  `GenreLabelFields`; anime keeps its own placement. Game replaces Genre and
  Label; h-game its Genre and three H genres; h-comic and hentai their three H
  genres, worded "Replace genres from…" as they carry no label. Game's Theme,
  Mode, Combat Mode and Platform are left out: the picker is about genres and
  labels, and those describe the game's play rather than its kind.

### One form body per media type, laid out like the detail page (2026-10-23)

The Add and Modify forms of the twelve media types had grown apart: the older
types kept two near-identical files per type, so a field added to one page was
missing on the other (Modify could not edit the AniList ranks or a movie's IMDb
rating, and saved the anime ranks back as null), and every type ordered its
sections its own way. Game was the exception, with one `GameFormBody` that both
tabs render. Every type now follows game.

- **One body per type, so Add and Modify cannot drift.**
  `pages/add-tabs/<Type>AddTab.jsx` exports `<Type>FormBody` and
  `<Type>LineageFields`; the Modify tab imports them. A field exists on both
  pages or on neither, and `pages/add-tabs/FormLayout.test.jsx` asserts that
  the two pages label the same fields in the same order.
- **The differences live in the wrappers, plus `ownerId`.** The Add wrapper
  adds the auto-fill and external search boxes; the Modify wrapper adds
  Structured Notes, and the page draws the franchise ribbon above the card.
  Validation, duplicate checks, enrichment, labels and starting state stay in
  `Add.jsx` / `Modify.jsx`. Inside a body, `ownerId` (the entry's id, absent on
  Add) is the only difference, and it only says which entry the pickers belong
  to.
- **Rejected: a mode flag in the bodies.** A body taking `mode="add" |
  "modify"` would let each page grow its own fields again behind a
  conditional, which is the drift this removes, only harder to see. `ownerId`
  is not a mode: it carries data the pickers need and changes no layout.
- **The section order mirrors the detail page.** Titles & Naming, Scores, My
  Tracker, Information, Genres & Labels, Production, Cast, the type's extras,
  Links & Sources, Cover & Remark - what the admin reads on the entry is where
  they edit it, and every type uses the same titles and icons. Names put CN
  top-left, as the naming card does (comic's naming card moved to CN-first
  for it; its display name stays EN-first, as the backend's is), and the
  romanised name is "Romaji" on the forms and the naming card alike.

### Current prices are dropped; achievements get their own vocabulary (2026-10-28)

The owner reshaped the game vocabularies in one revision, `g1a2mevocab34`.

- **`price_current_us` / `_jp` / `_tw` are dropped from `games` and
  `h_game`.** They held Steam's `final` price - what a sale had moved the list
  price to on the day Fill or Replace last ran. Nothing calculated with them:
  they were only displayed, and a displayed sale price is wrong as soon as the
  sale ends. The list price
  (`price_original_*`, Steam's `initial`) is stable and serves every
  statistic - the spend page prices a copy at it - so it alone stays. Steam's
  `final` is still in the answer Steam sends and is deliberately not mapped.
  The values are not carried anywhere; the downgrade puts the columns back
  empty. An older sheet still heads the three columns on the Game and H-Game
  tabs until the next Backup: Pull discards them and names each once in the
  run's unresolved references, as for any header that is no longer a column.
- **`all_achievements` has its own vocabulary, `GAME_ACHIEVEMENT_FLAGS`:
  `Fully`, `Yes`, `No`, `Inapplicable`.** The owner records "every
  achievement except the hidden ones" (`Yes`) separately from "every one,
  hidden included" (`Fully`), which one shared flag could not say. The other
  completion axes (endings, collectibles, CG) have no hidden tier, so
  `GAME_COMPLETION_FLAGS` is left as it is rather than given a value that
  means nothing on three of its four columns. `Fully` leads because the
  vocabulary reads from the most complete answer down. No row held `Yes`,
  so nothing was rewritten.
- **Ownership `Free` is removed; acquisition `Free` stays.** The two answered
  overlapping questions - "do I have it" and "how did I get it" - and a game
  claimed for nothing is simply owned. No row carried ownership `Free`.
- **Storefront `Physical` is renamed `Physical Store`**, so it does not read
  as the copy format `Physical` in the same row. The revision rewrites the
  copy rows and the stored game / h-game form defaults; Pull reads an older
  backup's `Physical` as `Physical Store`.
- **Copy format gains `Key Card`**: a boxed copy that holds only a download
  code, physical in the hand and digital in what it delivers.

### A guest browses the catalogue and nothing around it: the `view` family (2026-10-30)

The owner narrowed what a logged-out visitor sees to the libraries, the
detail pages they lead to, and the dashboard's announcements and broadcast
schedule. That is expressed as four role permissions - `view.entities`,
`view.search`, `view.extras`, `view.personal` - held by `user` and `super`
and not by `guest`, rather than as checks for "is anybody logged in".

- **Permissions, not a login check.** A role grant can be given back: an
  admin may open search or the entity pages to the public by ticking a box on
  `guest`, which is why the family is a free choice there and not locked off.
  Four keys rather than one, because the four surfaces are independent - a
  role may read entities without reading what members wrote.
- **Gated per read route, not per router.** A router-level dependency would
  also have gated the writes on the same router, so a role holding
  `manage.catalog` without `view.entities` could no longer save a studio.
- **Personal fields come back null, not absent.** A withheld field group is
  absent because its presence would announce what it conceals; these fields
  are on every row, so the key says nothing, and keeping it gives every
  viewer one response shape.
- **`manage.catalog` is exempt from the nulling.** The catalogue forms load a
  row with a GET and send it back whole, so a manager handed a null would
  write it over the stored rating. Every seeded holder of `manage.catalog`
  holds `view.personal` anyway; the exemption only matters for a custom role.
- **Rollout is a revision, `v1i2ewperms34`.** The seed tops up only a role
  holding nothing, so an established `user` role would never have received
  the keys and every member would have lost the entity pages on deploy.
  `super` needs no rows from it: the lock reconciliation adds them on start.

## 2026-11

### Recently added per type, and the shared account's one picker (2026-11-14)

- **`/api/dashboard/recent` cuts per type, not overall.** The dashboard draws
  one section per type, and newest-overall lets one busy type crowd every
  other off the page. It takes `per_type` (1–24, default 6) instead of
  `limit`, and answers in one query: the visible entries numbered newest
  first within their type by `row_number()` and cut there, `system_id`
  breaking a `created_at` tie. The response stays a flat `RecentEntry[]`, so
  the schema did not change; the page groups it. Anime's second row is the
  page's to ask for (`per_type=12`, keeping six of every other type) rather
  than a server rule about one type.
- **A row is the grid's column count at that width**, 2 / 3 / 4 / 6, not a
  fixed number of cards. A fixed count leaves a ragged last row at every
  width but the one it was picked for. The page fetches enough for the widest
  grid and hides the cards past the last full row at the narrower ones.
- **"Shared account" on the picker is `view.random_picker` without
  `self.list`**, the pair `dashboardSections.js` already reads for Recently
  added, rather than "no list" alone. A session without the picker key never
  reaches the page in the app, so for it the list-less full picker stays as
  it was.
- **Release decade needed no new derivation.** The full picker already had
  it, from `RELEASE_PRIORITY`, and its per-type columns were checked against
  the models: `release_date` everywhere except anime movie (`_jp` then `_tw`)
  and movie (`_tw` then `_usa`). The shared picker reuses that def.

### Requests and reports: two permissions, and the owner's seven answers (2026-11-13)

Requests and reports were built before the `shared` role and before the admin
stopped being root. They sit behind two permission names, so the role rework
changes only grants and nothing in the feature itself.

- **Filing is `self.requests`.** It is ownership of your own rows, so it
  belongs in the `self.*` family. `Viewer.has()` does not short-circuit that
  family for the root role, and the guest lock table locks it off, so "not
  guests, not the admin" holds by construction rather than by a check in
  every route. **Handling is `manage.requests`**, a capability like
  `manage.catalog`. When the role rework lands, `shared` is granted
  `self.requests`, and the admin's fixed set has to include
  `manage.requests`. `test_admin_handles_requests` fails if it does not.
- **The table is `user_request`, not `request`**, because `fastapi.Request`
  is imported across the routers.
- **The target is an FK-less `(type, id)` pair**, the convention `quote` and
  `meme` use, with the name stored at filing time. A deleted entry still
  reads as what it was. The author is `ON DELETE SET NULL`, because nothing
  is removed automatically.
- **The owner's answers**, each kept in one place:
  1. Requests do not travel on Sheets. They are messages to the production
     site; the box's dump holds them, and a Pull would otherwise overwrite
     the box's inbox with a development machine's.
  2. A role change on `/users` resets the limit to the new role's default,
     unless the same save sets the limit.
  3. Super's "no limit" is fixed. It is never stored and never enforced.
  4. The handler's response is optional when marking a request done or
     declined.
  5. "Report a problem" sits at the right-hand end of the breadcrumb row.
     That is provisional, pending the owner's design. The end of the header
     action row was asked for, but that row is drawn only for
     `manage.catalog`, so a `user` would never have seen the button.
  6. A handler can reopen a closed request, which lets the filer edit it
     again: a request closed by mistake should not be stuck.
  7. The filer sees the handler's response, not only the status, because
     a decline with no reason reads as a brush-off. This is one switch,
     `SHOW_RESPONSE_TO_FILER` in `MyRequests.jsx`.
- **The open-request limit does travel on the Users tab.** It is an account
  setting like `disabled`, and a Pull must not reset it. A blank cell means
  no limit, and an older sheet without the column leaves the local value
  alone.

### An account has a mode ceiling and a default, not a held mode set (2026-11-13)

- **An account has a ceiling and a default, not a set of modes.** The four
  modes are ordered `safe < normal < borderline < unrestricted`
  (`seed_modes.MODE_ORDER`, compared with `mode_rank`). An account may use
  every mode at or below `users.mode_ceiling` and lands in
  `users.mode_default`. A held set could express a gap (`safe` and
  `borderline` without `normal`) that nobody had a use for, and it needed a
  partial unique index to keep the default inside it; the ceiling needs one
  CHECK constraint.
- **Keys, not `access_mode` ids.** The order is defined on keys in code, the
  four keys are fixed, and a key means the same on both machines, so the
  pair travels on the Sheets `Users` tab without being resolved. An id is
  minted per database and would need the same name-resolution step the role
  needs.
- **Denials hang off the account and apply in every mode.** Re-keying the
  denial from the grant row to the account was the only shape left once
  there is no grant row. The migration takes the union of an account's
  denials across its grants, which is a narrowing, never a widening.
  `set_mode_ceiling` deletes the denials a lowered ceiling no longer shows,
  so a denial always names something the account could otherwise reach.
- **The switch's password test stays the subset test on effective sets.**
  With uniform denials it agrees with a rank comparison everywhere except
  from the empty set, where a rank says "widening" and the subset test
  correctly says moving to `safe` with its labels denied adds nothing.
  Which modes are *available* is the rank comparison; what a switch *costs*
  is the subset test.
- **A mode above the ceiling resolves the empty set**, exactly as a revoked
  grant did. Falling back to the default or to the ceiling would let a
  lowered ceiling leave a session somewhere it was never put.
- **A new account starts at `normal` / `normal`** (the spec's settled
  default for the approval form and for `/users`), from the columns'
  default rather than from handler code, so a Pull from a sheet that
  predates the columns lands there too.
- **The fresh `admin` account is seeded at `unrestricted` / `unrestricted`**,
  the faithful mapping of the root role, which sees everything. The
  account-system design gives `admin` no mode at all; that lands with the
  change that removes its user data, not here.
- **The migration's owner case.** `cg1618` is set to `unrestricted` /
  `borderline` whatever it held, as the owner settled. Every other account
  gets the widest mode it held as its ceiling, filling any gap below it; the
  migration logs each account whose held set had one, so a gap filled on the
  box shows in the deploy log. The downgrade recreates one grant per mode up
  to the ceiling with the default flagged, and copies each denial onto every
  grant; the only thing it cannot restore is a gap the upgrade filled.
- **A pair the constraints would refuse is skipped on Pull, not allowed to
  roll the tab back.** `ck_users_mode_*` would raise at the tab's commit and
  take every account with it, the failure shape the Users tab already guards
  against for roles. The row lands; its pair stays local and is reported.
- **`GET /api/access-modes` serves each mode's `rank`**, so the Users page
  orders its ceiling and default selects without keeping a second copy of
  the order. A mode an admin creates has no rank and no ceiling reaches it.

### Notes rework, catalogue half (spec: 2026-11-12 notes-rework-design)

The half of the notes rework that needs nothing from the account work, in one
revision, `n1o2tesrwk3`. The personal half - the amount collected, the NG
reset button, 下周目目標 - came with the account rework: 下周目目標 under
"Highlights are each account's own", the amount collected and the NG reset
under "note marks", both below.

- **地理 Geography sits in 圖鑑與名詞 Compendium & Terms, for game and h-game
  alike.** It is declared straight after 敵人 Enemies, because "where is it"
  is the next question after "what is it". 世界觀 Worldbuilding was the other
  candidate, but it is game-only; filing 地理 there would have needed a
  `groups_by_owner` override for h-game, while a card both types share needs
  none. Confirmed by the owner.
- **Only a top-level 地理 row carries a group.** The section both nests and
  groups, and a child already belongs to its root's group by being under it,
  so a child's own group would be a value nothing reads. The backend refuses
  one (422), the grouped view groups the roots and draws each subtree under
  its root, and `_check_groupable_by` now accepts a hierarchical section only
  when the field it groups by is column-backed.
- **Suggestions are field-level, `NoteField.option_category`.** The guide
  sections' free-text group and type fields wanted suggestions without
  becoming closed lists, and the existing `kind_category` names one category
  for a whole section, where a structured section has several free-text
  fields. Only a free-text `select` may name one, checked at import.
- **Only four categories: Character Group, Collectible Type, Item Type,
  Geography Group.** Adding a fifth is a registry edit, not an admin action.
  攻略資源 Guide Resources gained a group but no category: the spec named
  none. Two more followed at the owner's request, **Weapon & Gear Type**
  (武器&裝備's type, which shared the 物品 spec but had been left without
  one) and **Enemy Tier** (敵人's tier), both shipping empty like Geography
  Group.
- **The admin sub-tab is "Note Suggestions"**, a third beside Options and
  Tags on `/add`, `/modify` and `/delete`. The categories are the same
  `system_option` structure as everything under Options, and the split is
  navigation only, but they serve the notes rather than the entry forms, so
  they get their own tab rather than lengthening Options. Song Type and Song
  Source, named by a section rather than a field, stay under Options.
  Confirmed by the owner.
- **The seeds carry no scope rows**, so both game and h-game are offered
  them; 可攻略 is not scoped to h-game.
- **The amount total is text**, like the stat values. There is no number
  field type, and adding one was not this work.
- **NG Reset defaults to yes**, the commoner answer. The revision backfills
  `yes` on every existing row of the three 物品 sections, and a row with no
  key at all (an older sheet row) is read as yes rather than refused.
- **`collected` joins the collect statuses** after `not collected`, for a
  one-off thing that is simply had; "enough" and "fully" stay for a thing
  collected in quantity.
- **The gated types drop 評論 Reviews and Comments** for 大眾評價 Public
  Reviews and 我的評價 Personal Reviews, like every other type. Every
  `reviews_and_comments` row moved to `public_reviews` with its `author_id`
  kept as provenance - a personal section's rows becoming a catalogue
  section's. A sheet backed up before the move still names the old key, and
  Pull files those rows the same way; a POST naming it is a 400 like any
  unknown section.
- **The 待辦 buckets quick-move.** A "Move to…" select beside Edit and Delete,
  the pattern ResourceTree already uses, so no new layout. A PATCH that
  changes `section` without a `sort_index` now appends the row to the end of
  its new section; it used to keep an index that ordered it among rows it
  had left.
- **The downgrade puts back what the older registry can say, and clears what
  its validator would refuse.** `public_reviews` and `personal_reviews` rows
  on an h-comic, hentai or h-game go back to `reviews_and_comments` - exact
  for the moved rows, and the nearest home for a personal review written
  since. `collected` becomes `fully collected`, the old vocabulary's nearest
  truthful value. `ng_reset` and `amount_total` leave `fields`, and a guide
  resource's group is cleared. 地理 rows are left in place, untouched by the
  older code, and the option seeds stay. Not marked `irreversible`: every row
  the upgrade rewrote comes back with the same content.

### Labels and modes are code, and what a mode shows is derived (2026-11-13)

The six content labels (`app/services/rbac/labels.py`) and the four access
modes (`MODE_ORDER` in `app/services/rbac/seed_modes.py`) are defined in
code. Each label and each field group names the lowest mode that shows it,
and a mode shows everything at or below it. `cache.mode_sets` derives both
sets from the mode's key; `access_mode_label` and `access_mode_field_group`
were dropped by `l1a2belcode3`. Only a mode's name, description and display
order stay adjustable, and the label rows remain only as the foreign-key
target of the assignment tables, rewritten from the code on every start.

- **A ceiling needs each mode to contain the one below it.** Stored sets
  could not guarantee that: any edit could leave `normal` showing something
  `borderline` hides, and nothing would notice. Deriving every set from one order makes
  the containment true by construction.
- **Every database shows the same.** `access_mode_label` did not travel on the
  sheet, so each database's modes showed whatever had been ticked on that
  machine, and two databases could silently disagree about who sees an entry.
  With the rule in code, the answer is the same on every machine and in
  production.
- **`unrestricted` shows every label row**, not just the six the code names.
  A row nobody expected then stays reachable in the widest mode and hidden in
  every other: fail-closed everywhere but the one mode that means
  "everything".
- **Unknown labels are refused, not guessed at.** The migration deletes one
  nothing cites, and otherwise stops and names it. Deleting a cited label
  would silently publish its entries; keeping it would leave a label no code
  knows. A Pull skips a sheet row whose key the code does not name, and
  reports it.
- **Unknown modes are deleted outright.** The revision runs after the mode
  ceiling (`m1c2eiling345`), whose `ck_users_mode_keys` already keeps every
  account's ceiling and default to the four keys, so no account can be using
  any other mode and there is nothing to stop for. With the sets derived, the
  mode create, delete and regrant routes went too, which retires the ceiling
  entry's "a mode an admin creates has no rank": there is no such mode any
  more.
- **Rejected: keep the stored sets and validate monotonicity on write.** It
  would still be per-database and still absent from the sheet, so the
  databases would keep disagreeing; it would only stop one kind of bad edit.

### Every other label is stored with `nsfw`, not implied (2026-11-13)

`app/services/domain/label_rules.py` attaches `nsfw` beside any other label
on every write path, and refuses (422) a write that drops it while another
label stays. Revision `n1s2fwrule34` backfilled the rows written before the
rule: on the company database, 249 entries and 233 franchises, almost all of
them gated types that carried only their own label.

- **Stored, so a reader never needs the rule.** Implying `nsfw` would mean
  every query asking "is this nsfw" also knowing which labels imply it — the
  label filter, the reference counts, the sheet a human reads. A stored row
  answers by itself.
- **Refused, not silently re-added, when `nsfw` is dropped.** A PUT that keeps
  `erotica` and drops `nsfw` is a contradiction, and quietly putting `nsfw`
  back would make the form lie about what was saved. A first label, by
  contrast, brings `nsfw` with it, since that write states no contradiction.
- **No constraint enforces it.** A CHECK cannot see across rows; a trigger
  could, but every write path already goes through one function, and the
  invariant pass after a Pull and in Calculate catches anything written
  straight to the tables.

### A label and its 標籤 Label tag in step (2026-11-13)

`nsfw`, `ecchi` and `erotica` each have a 標籤 Label tag (NSFW, 輕微色情,
擦邊肉番 - 肉番 renamed, 輕微色情 new), and on an entry the two are kept in
step both ways, as the spec's "Content labels" section settled. Decisions
made while building it:

- **The tag is a field on the label definition** (`labels.py`, `tag`), not a
  second table: a label has at most one tag, and the mapping is a rule.
- **Each write path converts at the route**, inside its own transaction: the
  label PUT rewrites the tags after the label rows, the credits PUT resolves
  `tags.label` into labels before any write so a refused NSFW removal leaves
  nothing half-applied. `replace_tags` itself stays a plain writer, because
  Pull calls it and Pull must not 422.
- **Pull reconciles with the label winning**, as the spec says; it runs after
  the Label-field entry tabs and `Media Content Label`, and at the end of the
  gated invariant pass, so Calculate repairs drift too.
- **The one-time backfill (`t1a2gsync345`) is the UNION of the two sides,
  not label-wins.** Label-wins would have deleted tags the owner typed; a
  tag-wins pass would have deleted labels. The union deletes nothing and can
  only hide - a tag becoming a label never reveals anything. On the home
  development database it added tags only: no entry carried NSFW or 肉番, and
  26 carried `nsfw` or `erotica` without the tag.
- **The three tags are scoped to all nine Label-field types**, since a scoped
  option is offered only where it is scoped, and they had been scoped to
  anime alone.
- **The form keeps the two controls in step live**, so the order Add and
  Modify save in - tags, then labels - cannot silently revert an edit made in
  only one of them.

### Content labels on collections and series (2026-11-13)

Collections and series carry content labels of their own, as entries and
franchises already did, and a group's labels cascade down the tree: a
collection hides itself, its franchises, their series and every entry under
them; a franchise hides itself, its series and its entries; a series hides
itself and its entries. Revision `g1r2plabels3` creates both tables empty, so
nothing became hidden on upgrade. This reverses the earlier choice, recorded
above under the franchise cascade, to leave series out: a group's label is now
a thing the owner can set at every tier, rather than only at the franchise.

- **One join table per tier, not a polymorphic owner.**
  `collection_content_label` and `series_content_label` copy
  `franchise_content_label`'s shape exactly. A single table with an
  `(owner_type, owner_id)` pair could not carry a real foreign key, so a
  deleted group would leave its label rows behind and nothing in the database
  would say which table an id meant; a nullable column per tier could name two
  owners or none. Three small tables keep a real `ON DELETE CASCADE` each, and
  the code that treats them alike is one map, `GROUP_LABEL_TABLES`.
- **Read-time cascade, nothing copied.** As with the franchise cascade, no
  label row is written onto anything below a labelled group. Each tier's
  condition in `enforcement.py` is built from the one above it
  (`_collection_hidden` → `_franchise_hidden` → `_series_hidden` →
  `_hidden_by_label`), so moving a franchise out of a labelled collection, or
  clearing the collection's labels, reveals everything under it at once.
- **An entry is hidden by its series in full as well as by its own
  franchise.** An entry records both `media.franchise_id` and
  `media.series_id`, and its series records `series.franchise_id`. They
  normally name the same franchise, but nothing forces it. Asking only the
  entry's franchise would let a hidden series' franchise chain miss the entry;
  asking only the series would miss an entry with no series. Hiding on either
  is the direction that cannot leak, so `_hidden_by_label` asks both.
- **Nothing cascades up or sideways.** A series' label does not hide its
  franchise or its sibling series, and a franchise's does not hide its
  collection: a label marks what is inside the thing labelled, not the
  umbrella around it.
- **Groups have no 標籤 Label tag and no gated-type required label.** The
  Label tag is a vocabulary field on the entry tables only, and the gated-type
  rule needs a type, which a collection and a series do not have; the
  franchise keeps its own rule because its type list names gated types. The
  `nsfw` rule does apply to every tier: `add_missing_nsfw` covers all four
  join tables.
- **Labels travel on two more `admin.authz` tabs.** `Collection Content Label`
  and `Series Content Label` are derived-identity tabs like `Franchise Content
  Label`, so Pull's authorization tabs became six. Each fails open, as the
  others do: a Pull without the tab restores every collection or series
  unlabelled.

### Account lifecycle, first half: status, revocation, reset links (2026-11-13)

Accounts can be disabled, have their sessions ended, and be recovered by a
link the admin hands over. Invite links and approval are the second half,
below.

- **Revocation is a counter, not a session table.** Each login token carries
  `sv`, the account's `users.session_version` when it was minted. A token
  whose `sv` differs resolves as the guest. One increment ends every session
  at once, with no token list to keep. A token without `sv` reads as 0, so the
  deploy that added the claim signed nobody out. Every increment goes through
  `revoke_sessions()`, so grepping that name answers "what signs an account
  out".
- **What ends sessions, as the owner decided:**
  - **A spent reset link and disabling.**
  - **The admin setting a password on `/users`**, as the spec's hardening says
    and the owner confirmed. A new password is worthless against a leaked
    shared login if the old sessions carry on.
  - **Not changing your own password**, since you are the one holding the
    session.
- **When the admin sets its own password**, every session still ends, and the
  browser that made the change is given a fresh cookie at the new counter
  (the owner's decision). Without it, the admin would sign itself out
  whenever it used `/users`, its only way to change its password (the root
  role does not hold `self.password`). Django's `update_session_auth_hash`
  does the same. **The fresh cookie keeps the original deadline**: logins
  are a flat 30 days with no refresh, so a reissue minting a new month would
  let any password change extend a session without end.
- **No password policy**, by the owner's decision. There is no minimum length
  and no composition rule. Two technical checks remain:
  - **An empty password is refused**, since it is no credential at all.
  - **Past 72 UTF-8 bytes is refused rather than truncated.** bcrypt reads only
    72, so truncating would accept a different password that matches up to
    byte 72. `verify_password` still slices to 72, so an account set before
    the check still signs in.
- **Codes are hashed with SHA-256, not bcrypt.** They are 32 random bytes,
  and that much entropy needs no slow hash. A fast one lets the row be found
  by its hash. Spending locks the row (`FOR UPDATE`), so two requests racing
  with one link cannot both use it. A failed password check rolls the spend
  back, so a typo does not burn the link.
- **Rate limiting is an in-process counter, not slowapi.** The box runs one
  uvicorn process, and login needs a per-username key, which slowapi's
  per-route keys do not give. A second worker process would need a shared
  store. **The per-username limit is checked before the password**, so five
  wrong guesses lock that name for 15 minutes even for its real owner. That
  is the standard price of brute-force protection, accepted. Letting a
  correct password through the lock would undo the protection.
- **`disabled` travels on the Sheets Users tab, `session_version` never
  does.** A Pull must not re-activate a disabled account on the other machine.
  The counter, though, is a count of this machine's logins.
- **A shared account may be disabled** (the owner's decision). Disabling is
  reversible, unlike the deletion the spec forbids, and it is the fastest way
  to stop a leaked shared login while its new password is handed out.
- **Usernames are unique ignoring case**, by a `lower(username)` index. The
  `[a-z0-9_-]{3,32}` and no-`admin`/`guest` rules apply to new names only,
  so the `admin` account keeps its name.

### Ratings, expectations and the unit remark are each account's own (2026-11-13)

The rating of a collection, franchise, series, character, person, studio or
publisher, the expectation of the three tiers, and a novel unit's remark were
columns on the shared rows: one person's opinion, shown to everybody, nulled
for a viewer without `view.personal` by a `personal_gate` module. They moved
to per-account rows (revision `u1r2atings3`), so `personal_gate` had nothing
left to gate and was deleted, and `view.personal` now gates only the
highlight note sections. That retires the "null, not absent" and
`manage.catalog` exemption bullets of the `view` family entry above.

- **One `user_rating` table, not seven.** The seven ratings and three
  expectations are one concept, read one way (`attach_ratings`, one query
  per page) and written one way (`PUT /api/me/ratings/{owner_type}/{owner_id}`).
  Seven tables would be seven models, seven Sheets tabs and seven copies of
  the same delete-when-empty rule. The owner is one FK column per owning
  table with a `num_nonnulls(...) = 1` CHECK - the shape `note` and
  `watch_order_follow` already use - rather than an `(owner_type, owner_id)`
  pair, because a real foreign key cascades: deleting the franchise or the
  account takes the rating with it, where an FK-less pair leaves orphans for
  somebody to sweep. The expectation is one `expectation` column with a CHECK
  that it sits only on a tier; the responses keep their old per-tier field
  names, so the frontend's sorts, filters and statistics did not change.
- **The unit remark sits beside the unit rating**, on
  `user_novel_unit_rating`. It is the same kind of thing one level down - a
  reader's note on one volume - and that table already existed per reader,
  so a second unit table would have been a second row to join for one
  reader's view of one unit.
- **The migration's owner query is frozen, and never reads `role.is_root`
  nor picks `guest` or `shared`.** The existing values were one person's, so
  they move to the installation owner: the flag holder, else the first
  active account by username whose role is none of `admin`, `guest` and
  `shared` - a pending registrant or a disabled account never receives them,
  and `'active'` is a literal for the same reason the role names are; with
  values to move and no such account it raises rather than guesses. The
  query is a literal in the revision, not an import of
  `installation_owner_id`, because a migration must keep meaning what it
  meant when it ran, and that function's fallback reads `role.is_root`,
  which the account rework is to drop, so a revision reading it would stop
  running once that lands. Production may lack the flag, and the runtime
  fallback ("first non-root") would happily name a `guest` or `shared`
  account - handing the owner's ratings to a login anyone may use. Downgrade
  restores only the owner's values, since the old columns hold one person's;
  every other account's rows are lost, said in the docstring, and the
  revision is not marked `irreversible` because the owner's data, all the
  old shape could hold, comes back whole.
- **Old-sheet headers are handled in `legacy_personal.py`, not `pull.py`.**
  A backup taken before the revision carries `my_rating`, the
  `*_expectation` columns and the unit `remark` on its catalogue tabs, and
  Pull files them under the installation owner rather than dropping them.
  `tests/services/test_pipelines_write_no_personal_columns.py` forbids every
  pipeline module from naming a personal column, `my_rating` among them, so
  `pull.py` cannot spell those headers. Adding `my_rating` to the guard's
  `ALLOWED` would have exempted it in every pipeline file, including the
  ones that must never write a list row's rating. A domain module that owns
  the header names, pops the values and writes them keeps the guard whole:
  Pull asks it which headers are legacy and never writes a personal row
  itself.
- **Writes sit under `self.list`**, the permission every other piece of an
  account's own data is written under, so the admin - which the root
  short-circuit does not give the `self` family - keeps no ratings. The
  catalogue create and update schemas dropped the fields, so a
  `manage.catalog` write cannot make one account's opinion everybody's.
- **A merge moves ratings to the survivor** where that account has none
  there, and drops the loser's otherwise - the survivor's own rating wins,
  as its columns do in `merge_fill`.

### Highlights are each account's own, and so is their group order (2026-11-13)

The six highlight sections - `highlights`, `highlight_episodes`,
`highlight_passages`, `highlight_moments`, `h_comic_highlights`,
`h_game_highlights` - are an opinion of the work, and became personal note
sections. Revision `h1i2ghlights3` re-authors their rows to the installation
owner (the frozen `OWNER` rule `u1r2atings3` uses), so the person they were
written for still reads them. 下周目目標 (`ng_goals`) arrived as a personal
`text_links` section in NG 多周目 at the same time - a plan for one's next run
is one person's, like the 待辦 buckets it sits before.

- **The group order is a table, not a hidden note section.** An h-comic's or
  h-game's highlight group order was a JSONB column on the entry; once the
  rows are per account, the order of their groups has to be too.
  `user_highlight_group_order (user_id, media_id, group_order)` is the
  `user_rating` shape: one row per account per entry, read and written
  whole, deleted when cleared, cascading with either end, and attached to the
  entry under the old field name so the page reads `highlight_group_order` as
  before. A hidden personal note section would have reused the note router's
  author rules for free, but it would be a section the registry has to
  exclude from every listing, a singleton rule to enforce per author, and a
  JSON list stored in a column (`fields`) designed for one row's named
  fields - and its Sheets travel would be by note uuid rather than by the
  natural key (`media_type`, `public_id`, `username`) every per-user tab
  uses. The write is `PUT /api/me/highlight-group-order/{media_id}` under
  `self.personal_notes`, the permission the highlight rows are written under,
  rather than `self.list`, because the order is part of those notes. A JP
  h-comic has no highlights section, so turning one JP deletes every
  account's order on it, as the column used to be cleared.
- **No per-row `mine` flag on `NoteResponse`.** The plan offered either the
  user id on `/me` or a `mine` flag on each note so the page could tell its
  own rows from others'. Neither is needed: `GET /api/notes` returns a
  personal section's rows only when the viewer wrote them, so every personal
  row a viewer is served is its own, and `NoteSectionOut.scope` already
  tells the page who may write a section (catalogue → `manage.catalog`,
  personal → `self.personal_notes`). A flag would restate the read rule on
  every row and widen nothing.
- **`view.personal` is removed, not left empty.** It existed only to withhold
  `highlights` and `highlight_episodes` - catalogue rows that read as
  opinion - from guests. Once those sections are personal a guest has none to
  read, so the key gated nothing; a permission that gates nothing still
  draws a checkbox on the role editor that appears to mean something. It
  left `VIEW_PERMISSION_KEYS`, and with it the seeds and the lock
  reconciliation, which derive from that tuple; the revision deletes the
  stored grants, and its downgrade does not restore them because which roles
  held it is recorded nowhere.

### Some values on a catalogue note row are each account's own: note marks (2026-11-13)

The account spec splits eleven catalogue sections: the row - the item, the
enemy, the ending, the stat, the song, the mod - stays catalogue, and
`collected` (with the new amount collected), `beaten`, `completion`,
`my_value`, and the music and mod `status` become each reader's own. The
registry marks them (`NoteField.personal`, and `NoteSection.personal_status`
for the two shapes with no field spec); revision `n1o2temarks3` moves today's
values into the installation owner's marks and clears them from `note`.

- **One JSONB mark per account per row, the `game_choice_mark` shape.**
  `note_mark (user_id, note_id, values)`, unique per pair, cascading with
  either end. One row per value would give the same answer with a row per
  key and a key column the registry already names; a typed column per value
  would be a migration for every personal field added, which the registry
  exists to avoid (adding a section, or a field, is "one entry and no
  migration"). The values are a handful of short strings per row, never
  queried across rows except the review queue's one `values->>'status'`
  filter, so JSONB costs nothing here. Its keys are the registry's field
  keys, `"status"` for a section-level status, checked on write.
- **Overlay in place, not a parallel structure.** Every `NoteResponse` puts
  the viewer's value where the field lives - the `status` column, or
  `fields[key]` - so the response shape is the one the page, its quick edit
  and its status bars already read, and the sections listing says what is
  personal (`personal`, `granted`, `personal_status`, `status_granted`)
  rather than moving it. A separate `marks` object on each row would have
  made every reader of a row learn two places for one value. The cost is
  that a row's own `status` / `fields` now never mean the stored value for
  those keys; the overlay overwrites them always, so a stale value left on a
  row cannot leak, and a catalogue write drops them, so none is stored.
- **An unmarked value reads its default, else null.** The spec says a user
  with no mark sees "the field's empty value". The registry already declares
  what a field reads before anyone sets it (`collected` → not collected,
  `beaten` → to beat, the list status → Not Done), and the page drafts new
  rows from it, so that default IS the empty value; a field declaring none
  (`completion`, `my_value`, a song's status) reads null. Storing a default
  would make every unmarked account look like it had answered.
- **A catalogue write ignores a personal key rather than refusing it.** The
  page sends a row back whole, drawn with the viewer's values; refusing
  those keys would fail every edit. They are dropped before validation, so a
  row whose only content was a personal value is empty in the catalogue - and
  a PATCH of a row that was already empty (the migrated status-only songs)
  is allowed to stay so, while a PATCH still cannot empty a row that says
  something.
- **Granted features through one stand-in.** The music and mod statuses are
  behind per-account switches that another branch builds. Every check asks
  `has_feature(db, viewer, name)` in `app/services/rbac/features.py`, which
  today answers true for an account holding `self.personal_notes`. That
  branch's own `features.py` replaces the module wholesale - reading
  `users.feature_<name>` - and no caller changes. The stub's answer means
  that until then every member sees the statuses and the admin none, which
  matches "today only the owner uses them" on an installation whose only
  member is the owner. P3g's per-account switches have since replaced the
  stand-in: `has_feature` reads `users.feature_<name>`.
- **The review queue reads the caller's own music statuses** (decided with
  the owner). The rows are shared, but "waiting on something" is a fact
  about one person's tracking, so the queue is per caller, like the remarks
  block beside it.
- **The NG reset is registry-driven.** `NoteField.ng_resets` marks what a new
  cycle clears; a section with an `ng_reset` field reaches only its rows
  marked yes (missing reads as the default, yes), and 敵人, having none,
  reaches every row. It clears the caller's own marks and nothing else.
- **Sheets: a Note Mark tab by `username` and the note's uuid**, like the
  other per-user tabs, with the note translated through the Note tab when
  this database holds the row under its own uuid - a `music_status` row is
  minted per database, and the music status is the mark most worth keeping.
  An old backup's Note tab still carrying the values is read exactly: on
  these sections the status column (or `fields.my_value`) only ever held the
  personal value, so Pull takes it off the row before matching and files it
  under the installation owner.

### Catalogue rows and each account's own rows in one section: mixed sections (2026-11-13)

The account spec makes ten catalogue sections mixed - 武器&裝備, 道具,
收集物, 敵人, 角色, 地理, 配裝&流派, 隊伍組成, 攻略資源 and Resources: a
viewer reads the catalogue rows plus its own personal rows, in the same
groups. The registry marks them (`NoteSection.mixed`); revision
`m1i2xedrows3` adds `note.personal`.

- **A row-level boolean, because the section cannot say.** Everywhere else a
  row's kind is its section's `scope`, and the read filter, the write gate
  and Pull all key on that. A mixed section holds both kinds, so the kind
  has to live on the row. One boolean, NOT NULL with a false default, makes
  every row that existed before it catalogue with nothing to move, and
  leaves `scope` meaning what it meant. A second section per mixed section
  (`items` and `items_personal`) was the alternative: it would have split
  one card's rows across two sections, two orders and two group lists, the
  thing the spec's "in the same groups" rules out. `personal` stays false on
  a personal-scope section's rows: those are personal by their section, and
  a second source of the same answer is one that can disagree.
- **The server picks the kind, from `manage.catalog`.** The spec fixes which
  kind an account writes by whether it writes the catalogue, never both in
  one section, and there is no "only me" switch. So the payload carries no
  kind: a `personal` key is ignored like `author_id`, and `_authorize_write`
  decides - catalogue for a `manage.catalog` holder (`super`, the admin, any
  catalogue editor), personal for anyone else holding `self.personal_notes`.
  Taking it from the payload would have needed refusing the wrong one per
  account, which is the same rule written twice. The admin writes catalogue
  rows and keeps none of its own, as everywhere: a personal row is 404 to it
  like to anyone not its author, with no root short-circuit.
- **Reorder is per kind.** The two kinds never share an order - a user's
  rows sit after the catalogue's - so a reorder renumbers one: a
  `manage.catalog` holder sends exactly the catalogue rows, anyone else
  exactly its own. One list naming both would mean an order the read never
  draws, and a catalogue order written by a member would be a catalogue
  write by someone who may not make one.
- **A user's rows sort after the catalogue's within each group.** Sharing the
  catalogue's order would mean a per-user copy of it, which the spec rules
  out. Sorting by kind before `sort_index` in one flat response is enough:
  the page groups by first appearance and nests by `parent_id`, keeping the
  response order inside every group and under every parent, so no grouping
  has to know about kinds. Geography's tree takes the same rule one way: a
  personal row may sit under a catalogue row, but a catalogue row may not
  sit under a personal one, which every other reader would see as a child
  with no parent.
- **Never promoted.** A personal row is never turned into a catalogue row:
  no write changes `personal`, and a PATCH may move a personal row only to
  another mixed section. Adding one to the catalogue is a request, written
  by whoever writes the catalogue - the spec's rule, and the reason a row
  never changes hands between an account and everyone.
- **Personal values work on both kinds through marks.** A personal row's
  collected and beaten are its author's marks exactly as on a catalogue
  row, so the page, the mark route and the NG reset have one path, and the
  NG reset reaches the personal rows with no change.
- **Sheets: the column travels, and twins are catalogue only.** The Note tab
  carries `personal`; the row restores under its author by `username` like
  every Note row. An older backup has no header and restores catalogue rows,
  which is all it can hold. The content twin match - for rows each database
  minted under its own uuid - reads catalogue rows only, on both sides: a
  personal row is never minted per database, and matching one by content
  would hand a catalogue row to one account.
- **Downgrade deletes the personal rows.** The older code cannot tell one
  from a catalogue row and would show it to everyone; dropping it is the only
  safe reading. The catalogue survives, so the revision is not marked
  irreversible.
- **Deleting a catalogue row re-homes members' rows under it** (decided by
  the owner). In 地理 Geography a member may nest its own rows under a
  catalogue region, and the `parent_id` CASCADE would delete them with the
  region: a catalogue edit destroying data that is not the catalogue's. So the
  delete route moves every member's row under the deleted subtree to the
  section's top level first - with its own subtree, after that member's
  top-level rows, keeping their relative order - and the CASCADE then takes
  only catalogue rows. It lives in the route, not the foreign key, because an
  ON DELETE rule cannot tell a personal child from a catalogue one; catalogue
  children still go with their parent, as everywhere else.

### Favourite quotes and memes are each account's own (2026-11-14)

The account spec makes a quote's and a meme's `is_favorite` each user's own
and a granted feature (`favourites`). Revision `f1a2vourites3` adds
`user_favorite` and moves every flagged quote and meme to the installation
owner, by the frozen rule `u1r2atings3` uses.

- **One table, two FK columns.** `quote_id` or `meme_id`, exactly one set,
  each CASCADE - the owner-column shape `user_rating` and `note` use, so a
  deleted quote, meme or account takes its favourites with it and no merge
  code is needed: quotes and memes are never merged, and moving one to
  another entry keeps its id.
- **Presence is the value.** A row exists only while the item is a
  favourite; clearing deletes it. There is no `is_favorite` column on the
  row to disagree with its existence, and the PUT is idempotent by
  construction.
- **The switch hides, it does not delete.** An account whose `favourites`
  switch is off reads false everywhere and its filter finds nothing, but its
  rows stay: switching it back on brings them back, as a mode change does
  not destroy a list. Deleting on switch-off would make a misclick on
  `/users` lose data.
- **The write asks both switches, 401 for either.** Favouring a quote means
  reading it, and the quote reads are behind `quotes_memes`, which answer
  401 without it. The favourite route answers the same 401, rather than the
  404 a hidden item gets, because a caller without the read switch is not
  being told about one item - it holds no quote reads at all, and the read
  route already says so in those words.
- **An old backup's flag clears as well as sets.** On a Quote or Meme tab
  that still carries `is_favorite`, false or blank clears the installation
  owner's favourite of that row, as a blank rating cell clears a rating: the
  old sheet held exactly the owner's view, so it is applied whole.

### Account lifecycle, second half: invite links and registration (2026-11-13)

Strangers reach an account only through a link the admin hands over, and
only after the admin approves what arrived.

- **No invite, no registration.** There is no open sign-up and no register
  link on the sign-in page. The spec makes accounts invite-only, so the
  register routes refuse every request that does not carry an unspent,
  unexpired invite code, with the same 404 a reset link's refusals give.
- **A registration arrives `pending`, on `user`, with no mode.** Nothing the
  registrant typed decides what it can see: the admin chooses the role,
  ceiling and default at approval. With no mode, a pending account would
  resolve the empty object set even if a route forgot to check its status.
- **The approval form never hands out `unrestricted`.** The spec: a
  registered user can hold it, but only by the admin granting it later on
  `/users`, per person. The form's own refusal sits before
  `set_mode_ceiling`, which accepts `unrestricted` for the callers that may.
- **Invites get their own column, `created_user_id`, `ON DELETE SET NULL`.**
  `user_id` is a reset link's target and is `CASCADE`, so a code for a
  deleted account disappears. An invite needs the opposite: declining a
  registration deletes the account, and the invite must survive it as spent,
  or the declined person could register again with the same link. One
  foreign key cannot carry both rules.
- **Open invites do not void each other**, unlike reset links. A newer reset
  link replaces an older one because both are for the same account. Each
  invite is for a different person.
- **A refused or taken name rolls the spend back**, as a refused password
  does on reset, so a typo does not burn the link. A taken name is a 409
  like `/users` create's, which says that the name exists. That is
  acceptable on a route that already requires a valid invite.
- **A pending account does not travel and is never the installation
  owner.** Backup writes no `Users` row for it, because a registration is
  approved on the machine it arrived on. The owner fallbacks consider only
  `active` accounts, so a registrant whose name sorts first cannot have the
  owner's collection filed under it.

### Exactly five fixed roles, and the shared accounts (spec: 2026-11-03 account-system-design)

- **Custom roles are abandoned.** The roles are `admin`, `super`, `user`,
  `guest` and `shared` (`permissions.ROLE_NAMES`), and `POST` and `DELETE` on
  `/api/roles`, `RoleCreate`, the create form and delete button on `/roles`,
  and the "every custom role" branch of `locked_permissions` are gone. The
  spec's reason: with five fixed roles plus per-role and per-account
  switches, a custom role adds nothing but something more to secure. Every
  rule that had to say "and a custom role decides this freely" was a hole in
  a lock table, and the lock table was the thing being secured.
- **A name outside the five gets everything locked off**, not the old custom
  row's free choices. No such role can exist after the migration, but a lock
  table must not hand a stranger anything.
- **`role.is_system` is dropped.** Every role is a system role, so the column
  said nothing. `is_root` stays, on `admin`, until the admin stops being a
  root role.
- **The migration refuses rather than reassigns.** `f1i2veroles45` deletes
  every role outside the five that holds no account (its grants cascade). A
  role outside the five that **holds** an account makes the upgrade raise,
  naming the role and how many accounts hold it, and nothing changes. Which
  role those accounts should move to is a decision about people — `user` and
  `super` differ in whether they write the catalogue — and a deploy has no
  business guessing it.
- **So the deploy refuses if production has a custom role holding accounts.**
  The fix is to move those accounts to another role at `/users` first, then
  deploy again. **Production holds only `admin`, `super` and `guest`,
  checked by the owner**, so the refusal does not fire on this release; a
  user-less custom role, if any, is simply deleted. The refusal stays in the
  code for any other database. The downgrade re-adds `is_system` (true for
  every remaining role) and does not restore deleted roles, which held
  nothing.
- **The `shared` role and accounts come from the lifespan seed, not the
  migration**, as the other roles do, because the API tests build their
  schema with `create_all` and never run Alembic.
- **The shared accounts are re-asserted on every boot.** `ensure_shared_accounts`
  creates `shared-normal` and `shared-borderline` if missing, and on every run
  sets the role back to `shared` and the ceiling and default back to the
  account's own mode. "Fixed" has to survive what the API cannot stop: a Pull
  restores the Users tab as the sheet says, and a hand edit in the database
  goes round `/users` entirely. The password, status and request limit are
  the admin's, so the seed leaves them alone.
- **No shared password in `.env` or the code** (owner decision). A new shared
  account gets `UNUSABLE_PASSWORD_HASH`, which nothing verifies against, and
  the admin sets the password on `/users` when handing the account out.
- **`view.extras` is locked off for `shared` now**, because it is what opens
  quotes and memes, and a shared account never gets them, not even by
  switch. The same permission gates the random picker, future releases and
  completions, so until the switches split it a shared account reads what a
  guest reads, plus requests — its customised Random Picker and Future
  Releases wait for that split. Locking it now rather than later keeps
  "never quotes or memes" true from the day the role exists.
- **`user` loses `manage.catalog`**, locked off with the boot reconciliation
  dropping a stored grant. The owner: a user will never be given catalogue
  writing — writing the catalogue is what makes an account `super`.
- **`/users` refuses each fixed thing explicitly**, rather than leaving it to
  the last-admin guard: an account is created in or moved to `user` or
  `super` only (422); the admin account's role and a shared account's role
  are 409 with a sentence naming which; a shared account cannot be deleted
  (disabling is allowed) and its access modes cannot be edited (409). The
  last-admin guard is unchanged, and goes when the admin stops being root.
- **The shared request limit is 10** (`DEFAULT_REQUEST_LIMITS`), adjustable
  per account like `user`'s 15.

### Per-role and per-account switches (spec: 2026-11-03 account-system-design, "Fixed and adjustable settings")

`view.entities` became four role permissions - `view.studio`,
`view.publisher`, `view.person` and `view.character` - the three gated media
types became locked grants, and four per-account feature switches arrived as
columns on `users`. Migration `s1w2itches345` carries all of it.

- **Four entity keys, one per kind.** The owner wants each kind of entity
  page opened or closed on its own. `person` covers the seiyuu library too,
  because a seiyuu opens a person page, and `character` covers identities,
  which are pages of a character; a fifth and sixth key for those would be
  switches whose only sensible setting is "same as the other one".
- **The migration carries `view.entities` onto all four, rather than starting
  them off** (owner, settled in review). Every role that held the old key gets
  the four new ones, and the old rows are deleted, so the release changes
  nothing anybody sees. "Off by default" is the seed's rule for a database
  built from now on: a fresh database (the company machine's, say) seeds
  `user`, `guest` and `shared` with entity pages off until an admin ticks
  them on. Switching every member's entity pages off on deploy would have
  been a behaviour change smuggled into a refactor of the permission's shape.
- **The gated types are locked, not free.** A gated type is the one place a
  role grant and a content label say the same thing, and the label is what
  actually hides it: a guest or shared session in `safe`, `normal` or
  `borderline` never sees one whatever its role holds. Leaving the grant free
  made the role editor offer a box whose ticking did nothing visible on a
  guest - until somebody widened a mode. Locking it on for `user` and `super`
  and off for `guest` and `shared` makes the grant state what is meant: a
  member may see the type in a mode that carries its label, an anonymous
  visitor or a shared login never. The nine ordinary types stay free.
- **The migration grants any missing ordinary type once** to `guest`, `user`,
  `shared` and `super`. The owner: the nine usual types are for everyone but
  the admin. A role missing one is a seed accident, not a decision - the guest
  role on production was seeded before `game` existed, and the seed tops up
  only a role holding nothing, so its Games library was empty for a guest.
  Never the gated types, which the locks decide. Idempotent.
- **Columns, not a feature table.** A feature is a setting on one account,
  like the mode ceiling and the open-request limit, and those travel on the
  Sheets Users tab; a separate table would need a tab of its own keyed by
  username, and a Pull that skipped or reset it would silently switch every
  feature off on the arriving machine. As columns they ride the Users tab
  with the rest, and a sheet that predates them leaves the local values alone
  rather than resetting them. Four booleans is a small enough set that a
  table's generality buys nothing.
- **The role is asked as well as the column.** `PATCH /api/users/{id}` refuses
  switching a feature on for anything but a `user` or `super` account, but a
  Pull restores whatever the sheet says, so a hand-edited Users tab could
  store one on a shared account. `held_features` therefore counts a column
  only on a `user` or `super` account: a shared account never gets quotes or
  memes, not even by a stored switch.
- **The root admin keeps `quotes_memes` without the switch.** The quote and
  meme reads were `view.extras`, which the root short-circuit gave the admin,
  and the admin account can never be switched on - so without the exception
  it would write quotes and memes it could not read. Only that feature: the
  other three name personal data, which the root role does not hold.
- **Only `quotes_memes` gates anything yet.** Favourites, music status and mod
  status are storage and a switch on `/users` until the personal-data work
  gives them teeth; adding the columns now means that work changes no schema
  for them.
- **`cg1618` gets all four on; every other account starts off.** That removes
  quotes and memes from every other member until the admin switches them on,
  which is the spec's intent: they are granted per account, not per role.
- **`view.extras` narrows to resources, the random picker, future releases and
  completions, and stays locked off for `shared`.** Splitting it further, so
  a shared account gets its own Random Picker and Future Releases, is its own
  change with the per-viewer pages (owner, settled in review).
- **A shared account cannot switch modes at all.** Its ceiling and default are
  both its own mode, but the switch rule let any account move to a mode at or
  below its ceiling, so `shared-normal` could drop to `safe` and the switcher
  appeared for it - one person narrowing the login for everyone signed in.
  `POST /api/auth/access-mode` now answers 409 for it, and `held_modes` offers
  it its own mode alone, so the switcher, which needs two, does not render.
- **Search drops a bucket's key rather than send it empty.** An empty list
  still says the type exists - it reads as "nothing matched", which is only
  true of a type the viewer may see - and it was already how a gated type's
  bucket behaved, so every switch now answers the same way: a media type the
  role does not hold, or an entity kind without its `view.*` key, has no key
  in `results`. `SearchBuckets` defaults each such bucket to `None` and drops
  it on serialising, so a type added later cannot put its key back by having
  a default of `[]`. The groups and seasonal are always present, because no
  switch hides them. The SPA already read every bucket as `?? []`, and the
  nav search offers only the scopes whose bucket would come back.

### The admin's pages get their own `manage.*` keys, not `manage.catalog` (spec: 2026-11-03 account-system-design, "The named accounts")

The admin keeps announcements, the Note pages (System Options, Alias
Conversion, External APIs), `/images` and `/resources`, and every one of them
was gated on `manage.catalog` — `/resources`' reads on `view.extras`. Four
keys replace that: `manage.announcements`, `manage.options`, `manage.images`
and `manage.resources` (`ADMIN_PAGE_PERMISSIONS`).

- **`manage.catalog` is catalogue WRITE, and the admin writes no catalogue
  row.** Granting it would have handed the admin every entry, group, person,
  credit and catalogue note write — creating an entry needs no visibility, so
  even the empty object set would not have stopped it. The spec says the admin
  never writes the catalogue; a page it needs cannot be the price of that.
- **`manage.catalog` also drives `/me`'s `is_admin`**, which about 86 SPA
  files read as "may edit the catalogue" and draw edit controls on. Granting it
  would have made `is_admin` true for the admin account and lit those controls
  on pages it cannot use. Keeping the key off keeps `is_admin` meaning exactly
  what its readers think: true for `super`, false for the admin.
- **`manage.resources` gates reads as well as writes.** The owner: the
  site-wide Resources page is strictly the admin's and super's. So `user`
  loses `/resources` with this change, and `view.extras` stops naming it.
- **Form defaults and picker defaults stay on `manage.catalog`.** They shape
  how catalogue rows are written, so they are catalogue-editing tools rather
  than Note pages, and the admin has no use for them.
- **`super` holds all four by lock; `user`, `guest` and `shared` never do.**
  `super` already locks on everything but `admin.authz`, so the four reach it
  on the first boot through the reconciliation, with no seed change.

### No role is root, and the object axis applies to every viewer (spec: 2026-11-03 account-system-design, "The named accounts")

`role.is_root` is dropped, and with it every place that let the admin past a
check: the short-circuit in `Viewer.has()` and `AuthContext.has()`, the
`ROOT_FEATURES` exception, the exemptions in `media_relation.py` and
`watch_order.py`, the author check on personal notes, and `/me`'s `is_root`.
The admin role now stores its seven grants as rows, its whole row locked.
Migration `a1d2minroot45` carries it.

- **A permission minted later reaches nobody until it is granted.** The
  short-circuit's defence was that a new content label or media type would
  never hide anything from the administrator. That was its danger too: every
  new capability reached the most powerful login by default, without anyone
  deciding it should. With a fixed set, a later feature reaches the admin only
  by an edit to `ADMIN_FIXED_PERMISSIONS`. The cost the short-circuit avoided —
  re-granting the admin every new label — is gone anyway, because labels left
  the role axis for the access mode.
- **The admin holds no catalogue, so there is nothing left to exempt.** It
  holds no `media_type.*`, no `view.*` and no mode: ceiling and default NULL,
  so it resolves the empty object set. An exemption from the object axis —
  relations and watch orders skipped `filter_visible_pairs` /
  `drop_hidden_rows` for root — would now exempt a viewer that sees nothing
  from the filter that says so, which is a leak waiting for its first bug.
  Applying the axis to every viewer removes the special case instead of
  keeping it correct by accident.
- **No mode is enforced at boot, not just at migration.**
  `seed.ensure_admin_accounts_modeless` re-asserts NULL on every admin-role
  account on every start, the way `ensure_shared_accounts` re-asserts the
  shared modes: a Pull restores the Users tab as the sheet says, and a sheet
  written before this change carries the admin at `unrestricted`. The
  lifespan's INSERT cannot write NULL — the columns' Python-side default fires
  on None — so the account is parked with an UPDATE afterwards.
- **"Holds no user data" stops being a carve-out.** It was the one condition
  where the short-circuit did not reach (`self.*`). With no short-circuit the
  rule is simply the admin's locked row, and the explicit-grant escape hatch
  ("a grant beats the carve-out") has nothing left to escape.
- **Nobody edits another account's personal note**, the admin included. The
  root admin could still delete a member's personal-scope note, because the
  `DELETE` route never asked the section's write capability and the edit
  check let root through. Both are closed: `DELETE` asks what a `PATCH` asks.
- **The last-admin guard goes; deleting the admin account is a 409.** The
  guard counted accounts that could administer, which with fixed roles is
  only ever the one `admin` account — whose role is already fixed. An explicit
  refusal says what is protected instead of deriving it from a count.
- **The installation owner is never the admin.** Without the flag, the owner
  is the first `active` account by username whose role is not `admin`,
  `guest` or `shared`, and otherwise nobody. The old last resort, "the first
  account of any kind", existed so that a sheet could restore onto a fresh
  machine before a second account existed; it is what filed the first
  installation's collection under `admin`. A restore with no owner now skips
  the owner-dependent rows and names them (`no installation owner: N row(s)
  skipped`) rather than filing someone's library under an account that keeps
  none, and Pull restores the Users tab first so the sheet's owner is in place
  before any row needs it.
- **What the admin gives up.** It cannot see what a restriction does by
  looking; the label reference's counts cover that, and a "preview as an
  account or mode" feature is the remedy if that is ever not enough. Its own
  dashboard is not built yet, so `/` shows it the guest's dashboard.

### No admin-role account is the installation owner (2026-11-14)

Decided by the owner. The installation owner is whose collection a restore
or a pipeline files rows under, and the admin keeps no personal data, so the
flag and the admin role never meet on one account.

- **Guarded where they are written, not with a constraint.** A CHECK across
  `users` and `role` needs a trigger or a denormalised role name, and either
  is a migration for a state only a hand edit or an old sheet can produce.
  The writers are few: `/api/users`, Pull's Users tab and boot.
- **`/api/users` needed no new refusal.** It writes no flag, and every route
  that sets a role (create, approve, `PATCH`) already takes `user` or `super`
  only (422), with the admin account's own role fixed (409). Tests now pin
  both with a flagged account present, so a later change that widens either
  is caught.
- **Pull drops the flag from an admin row and restores the rest**, reported
  in `unresolved_refs`, rather than skipping the row. A skipped row would
  leave the account's other columns stale for a fault in one cell; this is
  how a bad mode pair is already handled. The drop happens before the
  clearing step, so the local holder keeps its flag.
- **Boot clears a flag a hand edit left on an admin account**
  (`ensure_no_admin_installation_owner`), the way `ensure_admin_accounts_modeless`
  removes the admin's mode.
- **`installation_owner_id()` also passes an admin flag holder over.** The
  guards make that state unreachable through the application, but the
  function is the one place every restore and pipeline asks, and "never the
  admin" is its contract; on a hand-edited database the rows then go to the
  fallback account rather than to one that keeps no personal data. The
  frozen owner query in the revisions that moved personal data
  (`u1r2atings3` onward) is left as it shipped: a revision keeps meaning
  what it meant when it ran, and no guarded database reaches it with an
  admin flag holder.
- **Found on the way: Pull un-owned the owner.** The clearing step that
  makes room for the sheet's flag holder also cleared the row's own account
  when it already held the flag - the ordinary Backup-then-Pull case - and
  the row's update then saw no change and wrote nothing, so every Pull left
  the collection with no flag holder (the fallback then answered). The
  clearing step now spares the row's own account, by username.

### A personal list write never finishes the work (2026-11-14)

`PUT /api/me/list` applies the tracker's rule that reaching the total
completes, because the SPA's steppers move onto it from the catalogue `PATCH`
and a `user` would otherwise press `+` on 11 / 12 and stay Watching. It runs
only the row's half, though. `mark_completed` also writes the work's
catalogue half - an anime becomes Finished Airing, a manga 完結 - and one
member reaching the last episode it has seen says nothing about whether the
work has ended. On the catalogue `PATCH` that edit is an editor's; on the
list route it would be a catalogue write by an account without
`manage.catalog`. So an editor who wants the catalogue half still gets it from
Mark completed or a `PATCH`, and the two paths share `write_list_payload` so
the row's half is the same on both.

### The Random Picker gets its own key, `view.random_picker` (2026-11-14)

viewers.md gives the picker to `super`, `user` and `shared` and never to the
guest. No existing key drew that line: `view.extras` also opens Resources and
Completions, which are not a shared account's, and `self.list` is exactly what
a shared account lacks. So the picker has a key of its own, locked on for the
three and off for the guest, which leaves no cell of it a free choice - the
line is the design's, not an admin's. The plan-marks read inside the picker
asks `self.list` rather than "signed in", because a shared account is signed
in, keeps no plan, and would get a 401.

`view.extras` goes with it. Once Resources answered to `manage.resources`,
the key gated three pages, and each has a better question of its own: the
picker this key; Future Releases any ordinary media type, because it reads
nothing but the catalogue lists (the same test the Library tab asks, so a
guest has it and the admin, which reads no catalogue, does not); Completions
`self.list`, because it is built from the viewer's own completions. A key
naming three unrelated pages was a key nobody could reason about. Future
Releases reads the open `/api/seasonal/current-season`, not the Control
Center's `manage.pipelines` route, which every member was refused.

The admin needs no lock code for the new key: its lock is its fixed set and
every other permission in the catalogue, so a key minted later is locked off
for it already. A test asserts it.

### Personal writes leave the catalogue PATCH (2026-11-14)

The SPA wrote every status, progress count and plan flag through
`PATCH /api/<type>/{id}`, which asks `manage.catalog`, while the controls were
drawn on `self.list` in one place and `isAdmin` in others. So a `user` was
shown a status button that answered 401, and could not keep its own list at
all. Those writes now go to `/api/me` - the list row and the plan flags - and
every control that writes them asks `self.list` (`ownData`), which is what
the write route asks.

- **One hook routes by key, with a small explicit split.** `useStatusToggle`
  sends the six plan-flag names to `/api/me/plan-flags` and everything else
  personal to `/api/me/list`. The SPA does not mirror the server's full
  `LIST_FIELDS` table: a second copy would drift, and the routes already
  refuse a key a type does not hold (422), so a wrong key fails loudly.
- **A control that edits the work as well says so.** MediaCard's bolt marks
  the work released (a catalogue fact) and may also move the viewer's status.
  It passes the catalogue half as `catalogue`, which alone goes to the PATCH,
  and it is drawn for an editor only; the status half is sent only by an
  account that keeps a list.
- **The answer is the cached entry with the row folded in**, because the
  list route answers the row, not the entry, and the callers replace their
  row with what comes back.
- **`isAdmin` became `canTrack` on the dashboard cards.** The prop gated the
  steppers only, and a name that says "editor" on a control that writes the
  viewer's own progress is how the two gates drifted apart.

### The Explore pages draw two versions, chosen once at the top (2026-11-14)

Seasonal, Statistics, Future Releases and the Random Picker each ask
`useViewScope().ownData` (`self.list`) once, in the page's default export,
and draw either the viewer's own version or the catalogue's. The two are
separate components rather than one component full of `ownData` checks.

- **Why separate components.** The list version reads per-user routes
  (`/api/seasonal/`, `/api/plan-next/`, the full lists Statistics counts)
  that refuse a viewer without a list. A component that branches inside
  would still mount those queries, or need a guard on each, and one missed
  guard is an error banner for a guest. A catalogue component simply never
  names them, and a test asserts each is never fetched.
- **The list version is unchanged.** With a list each page is the page it
  was, so the change cannot regress a member's view.
- **Seasonal and Statistics ask what Future Releases asks.** They left the
  `self.list` route block for `anyPermission={LIBRARY_MEDIA_TYPE_PERMISSIONS}`,
  on the route and the nav row together: what decides whether the page
  opens is whether the viewer reads the catalogue, and what it shows is
  decided by the list. The admin reads no catalogue and opens none of them.
- **Future Releases' markers sit under the card, not in it.** The On your
  list and Planned chips are drawn by the page around `MediaCard` from fields
  every list response carries, so the shared card is unchanged for every
  other page. Without a list the groups are in release-date order
  (`primaryReleaseValue` + `releaseScore`), the only order that does not
  need an opinion.
- **The picker's personal filters and weights are flagged, not listed per
  call.** A FilterDef carries `personal: true` and a weight input is marked
  personal in `WEIGHT_INPUTS`; `filterDefsForMode` and `entryFactors` apply
  one rule to every mode. A type's own library filters keep the flag their
  library config gives them, so the picker and the library drop the same
  filters.
- **External score is a catalogue filter.** It reads the stored MAL or IMDb
  score, which every viewer is shown on the card, so it is offered with and
  without a list. So is genre, read from the joined `genre_main` or
  `game_genre` field every list response carries; the adult genre fields are
  left out, as the catalogue statistics leave them out, and the franchise
  mode offers neither, since a franchise has no genre or score of its own.

### The dashboard is chosen per viewer, on permissions (2026-11-14)

`/` became five dashboards (viewers.md, "Dashboard") without becoming five
pages: one `Index` picks its parts in `components/dashboard/dashboardSections.js`,
and every pick is a permission, never a role name, so a role edited on
`/roles` gets the dashboard its permissions describe.

- **The admin is "admin.authz and no library media type", not "admin.authz".**
  What makes the admin's page necessary is that it reads no catalogue; the
  catalogue dashboard would only fetch lists the admin is refused. A role
  holding both would be shown the catalogue dashboard, since it can read it.
  "Reads the catalogue" is asked as `LIBRARY_MEDIA_TYPE_PERMISSIONS.some(has)`,
  the question the Library tab and Future Releases already ask, so the
  dashboard and the header cannot disagree about it.
- **Nothing is chosen before `/me` answers.** Until then every viewer looks
  like a guest, and the admin would fire catalogue reads that answer 401. The
  page shows its loading state instead; the cost is one round trip that the
  rest of the page waited on anyway.
- **The library links are the nav's rows, not a second list.** They come
  from `visibleSections` with Nav's arguments, filtered to the Library and
  Restricted sections, so a library the header hides is never linked from
  the dashboard and a new library row appears on both at once.
- **Super's pending-registrations line is not a link.** Only `admin.authz`
  approves a registration, in `/system`'s panel, which is not drawn for
  super; linking super there would send it to a page that does not show what
  the line promised. The line says who approves instead, and the open
  requests line, which super handles itself, links to the inbox.
- **The pipeline runs link to `/system`, not `/data-history`.** The data
  control log (`/api/system/logs`) is drawn on `/system`; `/data-history`
  shows recent and deleted records, not pipeline runs.
- **One announcement editor, on both pages.** `AnnouncementEditor` is what
  the admin's dashboard and `/system`'s Announcement & Notes card both draw,
  over the one `["announcements"]` query. `/system` had its own hand-written
  editor for the same routes; two editors would drift, so the card now
  renders the component and its inline state, handlers and form are gone.

### Everything an account keeps is private to it, the admin included (2026-11-14)

No account reads another's list, ratings, plan, copies, choice marks, notes
or marks, and the admin reads none of them either. Three things went with
the list-visibility setting (`users.list_is_public` and its Settings card)
rather than being kept behind it, because each could only ever be empty:
the public profile (`/user/<username>`), reading personal notes by author
(`?author=`, now ignored), and the community card with `/api/community/`.
`field_group.personal_notes` went for the same reason - it only decided
whether a mode could read *another* account's personal notes - and
`field_group.sources_other` went because every viewer gets the other
sources, which leaves `sources_restricted` the one field group.

- **User data is private from the admin too.** `admin.authz` used to open
  any profile whatever its setting; that override went with the profile,
  and nothing in the app shows the admin an account's list, ratings or
  notes. The admin keeps no personal data of its own either.
- **Requests and reports are not an account's data in this sense.** They
  are addressed to whoever handles them, who reads them in the inbox; the
  filer's own copy is My requests.

### Catalogue or account: the test for anything added later (2026-11-14)

The account rework sorted every stored value into the catalogue (one copy
everyone shares) or an account (one copy each), and the rule it settled for
anything added later is: **if two people could disagree about it and both
be right, it belongs to an account; if it is a fact about the work, it
belongs to the catalogue.** The present-tense split is
[catalogue.md](../catalogue.md).

- **Every personal rating is an account's, and only external scores are
  catalogue.** `mal_rating` and `mal_rank`, `anilist_rating`, `imdb_rating`
  and `imdb_series_rating`, `metacritic_score` and `metacritic_user_score`
  are scores someone else published, so they are facts about the work. Every
  `my_rating` and every expectation is an opinion.
- **`remark` on entities, credits, relations, watch orders and options stays
  catalogue.** Those are editorial annotations on the shared record, not one
  reader's view of the work.
- **`usefulness` is the account's own, and its meaning is too.** It is used
  mainly on restricted media, where few accounts other than the owner's
  will see it, but any account can keep its own. Nothing documents or
  derives what a value means.
- **Of the note sections, only the six highlights changed scope.** Others
  split instead: the row stays catalogue and named fields on it become each
  account's (note marks, above). OP/ED 變動 does not split, and stays
  catalogue as it is.
- **很多福利 stays an ordinary Label tag.** It is not the `ecchi` label's
  tag, so it decides nothing about who sees an entry.

### A mixed section has no "only me" switch (2026-11-14)

**Not built: letting a `manage.catalog` holder keep personal rows in a
mixed section.** Which kind of row an account writes follows from whether
it writes the catalogue (mixed sections, above), and there is no switch to
make a `super`'s row its own. The reason is who the feature is for: the
owner is the one creating catalogue data, and personal rows exist for the
other accounts, whose catalogue is far from complete. A `super` that needs
rows of its own is dealt with if it ever happens.

### Recovery goes through the admin, and nothing signs out everywhere (2026-11-14)

What the account rework deliberately did not build around signing in:

- **No email address or phone number on an account**, and so no
  self-service recovery: the site has no way to reach anyone. Recovery is a
  link the admin issues and hands over, and it recovers a forgotten
  username as well as a password, because the page it opens says which
  account it is for.
- **No in-app "forgot my password" request.** A signed-out form identifies
  nobody - anyone can type a username - and the link it would ask for still
  has to be handed over outside the app, so the request would save no
  step. The sign-in page's "Forgot your password or
  username?" opens a note saying to ask the admin, and nothing else links
  to `/reset`.
- **No public way to the register page.** Nothing links to `/register`, so
  nobody reaches it only to find they cannot register without an invite.
- **No "sign out everywhere" and no admin force-logout.** Sessions end on a
  spent reset link, the admin setting a password, and disabling the account,
  and those cover the cases: someone else knows my password (a reset), a
  leaked shared login (the admin sets a new password), an account to cut
  off (disable it).
- **No sliding refresh.** A login lasts 30 days from sign-in, used or not.

### `shared` is its own role and not a reserved word; a new account starts at `normal` (2026-11-14)

- **The shared accounts are not on the `guest` role.** A guest is the
  signed-out visitor and nobody else; a shared account is signed in. Giving
  them their own role lets what visitors read and what shared logins read
  be tuned separately on `/roles`.
- **Only `admin` and `guest` are reserved in usernames.** `shared` is not,
  because the shared accounts are seeded, never registered, so no
  registrant can collide with them. The test is a substring of the
  lowercased name, not a similarity test: `admin1` and `qadminqe` are
  refused, `adamin` and `adm1in` allowed.
- **A new account starts at `normal` / `normal`, not `safe`.** That replaced
  an earlier rule that every new account starts in `safe`: an account can
  switch up to its ceiling at once, so starting lower protects nothing.

### One test decides a page's catalogue version: `self.list` (2026-11-14)

Every page that differs for a viewer without a list - libraries, cards,
detail pages, Seasonal, Statistics, the Random Picker, Future Releases, the
dashboard - asks the same question, `has("self.list")`
(`useViewScope().ownData`), and nothing else. Guest and shared both lack it,
and so does the admin, which holds no `self.*` key. The alternative, a test
per page on role names or on a mixture of keys, is how the SPA drifted
before: one control asked `isAdmin`, the next `self.list`, and a `user` was
shown buttons that answered 401.

- **Whether a page opens is a different question.** Seasonal, Statistics
  and Future Releases open for any viewer that reads the catalogue (an
  ordinary `media_type.*`); what they show inside is decided by the list.
- **Statistics' catalogue counts are computed server-side**
  (`GET /api/statistics/catalogue`). They are aggregates over the viewer's
  visible object set, so a viewer without a list does not download every
  list to count it, and a mode never learns from a total what it hides.
- **What P7 opens to more viewers follows the owning group's visibility.**
  Watch orders and the relations graph used to filter only the entries
  inside them, so an order owned by a hidden group still listed by name.
  They answer a hidden owner as missing, so the guest's and shared
  account's watch-order pages and the dashboard's followed orders leak
  nothing.


### The tab title is the page's name, and a detail page's contents are read from the page (2026-11-14)

- **One writer of `document.title`.** `PageTitleProvider` in `Layout` owns it;
  pages only name themselves, through `usePageTitle`. Rejected: a
  `document.title =` effect in each page, which nothing keeps consistent, and
  a title field on every `<Route>` in `App.jsx`, which cannot know a record's
  name and would be a third list of pages beside the routes and the nav.
- **Ordinary pages take the nav's label**, read from `navigation.js`, so the
  tab and the menu cannot disagree. A library row adds "Library" ("Anime
  Library"), because the bare label would read as an entry page.
- **No site suffix.** The tab shows only the page's name, as the owner
  asked; `SITE_NAME` survives only as the title of a path nothing names.
- **The loading and error fallback is the nav row the path lights up** -
  "Anime" on `/anime/12`, "Franchise" on `/series/4`. Rejected: "Loading…"
  and "Not found" titles, which say nothing about where the tab is, and the
  site name, which makes every half-loaded tab look the same. A failed load
  is not told apart from a slow one in the tab; the page itself says which.
- **The detail-page contents are discovered, not declared.** Which sections a
  detail page renders turns on the viewer (`self.list`), the data (an empty
  cast) and the notes registry, which arrives after the entry. Writing those
  conditions again as a list per page would let the list and the page
  disagree, so `DetailContents` reads `data-toc` anchors off the rendered
  tree (with a `MutationObserver` for the notes) and skips one that rendered
  nothing. The dashboard keeps its declared list: it has sub-rows and
  already computes which divisions it draws.
- **On the right, xl+ only, with the page widened to make room.** The left
  column is the cover, sources and relations; a second column there would
  stack two sticky things in one place. Widening the container to `88rem` on
  xl keeps the cover column near its usual width instead of handing it the
  contents' 12rem; below xl the contents are not drawn at all.

### Originality 原創 is renamed 原版, and the h-comic and hentai links auto-fill (2026-11-14)

- **One rename covers both types**, because `hentai.originality` reads
  h-comic's `H_COMIC_ORIGINALITY`. Revision `o1r2iginal35` rewrites both
  tables and any stored Add-form default naming `原創`. A Sheets Pull reads an
  older backup's `原創` as `原版` (`_LEGACY_ORIGINALITY` in
  `app/utils/formatter.py`), in the same way as the storefront rename
  `Physical` → `Physical Store`. A write naming `原創` is refused like any other
  value outside the vocabulary.
- **`mal_link` (h-comic, hentai) and `anidb_link` (hentai) are auto-fillable
  and in `BUILTIN_AUTOFILL`.** Entries of one franchise often share a MAL or
  AniDB page, so copying is the useful default, and /defaults can switch it
  off. The hidden ids are not copied: the write hook derives them from the
  links again.
- **A stored auto-fill list gains the links in the same revision.** The stored
  list is used verbatim, and /defaults saves it whole, so a type configured
  before this change would otherwise never copy the links. Alternatives
  rejected: leaving stored lists alone makes the new default reach only
  unconfigured types, and nothing on /defaults would explain why. Treating
  absent keys as "on" would mean an admin who unticked a field cannot be told
  apart from one who never saw it. A list saved earlier could not have
  chosen the links, because /defaults did not offer them, so adding them
  overrides no decision. A null list already means the built-in set and is
  left as it is. The downgrade removes the links, because the earlier code
  cannot copy them.
- **Hentai source material gains `Game`**, with no MAL or AniDB mapping:
  neither records a source material, and no fill has ever written the
  column. The completions statistics grouped by a hard-coded copy of the list,
  which would have put a Game hentai under Unrecorded. The grouping moved to
  `pages/statistics/hentaiCompletions.js` and reads the shared vocabulary.

### A shared account's mode is a ceiling and a default; a login lands on the dashboard (2026-11-14)

- **The shared account's mode stopped being fixed.** It was fixed on the
  reasoning that one person narrowing would be "one person's choice made for
  everyone signed in". That was wrong: a switched mode is the `access_mode`
  cookie of one browser, so it never reaches the others on the same login.
  The real consequence of letting it switch is the opposite one: anyone with
  the shared password can widen to the ceiling, for up to an hour at a time.
  So the ceiling is what the admin hands out with the password, and it is
  set on `/users` like any account's. The shared ROLE stays fixed.
- **The seed stops re-asserting the mode.** It still creates each shared
  account at its own mode, and puts back a mode only on an account left with
  none. No migration: every existing shared account already holds its seeded
  mode as both ceiling and default, which is the state the new rule starts
  from.
- **A login always lands on `/`, and `?next=` is gone.** Sending a login to
  the page the previous visitor was on breaks whenever the new account may
  not open it - logging out of a member page and in as the admin left the
  admin on `/login?next=/statistics`. The dashboard is the one page every
  account can open. A mode switch is not a login and still reloads the page
  it is on.
- **The Users page edits in one dialog.** The Access column was the only
  place where a tick saved at once; it is now a summary, and the switches,
  ceiling, default and denials sit in the Edit dialog beside role, password
  and limit, saved together. The PATCH and the PUT are sent only for what
  changed.

### Statistics asks its own key, view.statistics, and its catalogue sections are everyone's (2026-11-14)

- **A key of its own, locked per role like `view.random_picker`.** The page
  used to open on any ordinary `media_type.*`, which reached the guest; no
  existing key draws the line "super, user and shared, never guest". The
  route, `App.jsx` and `navigation.js` all ask it, and `/api/statistics/catalogue`
  refuses a guest with 401 like the other view gates. Revision `s1t2atistics3`
  grants it to the three holders.
- **The catalogue sections show for every holder**, not only a viewer
  without a list. A member sees them after its personal sections, so the
  page reads the same for the shared account and for a member, plus the
  member's own blocks.
- **Franchises per type come from the entries, not from the franchise.**
  `COUNT(DISTINCT media.franchise_id)` over the same visible entries the
  entry count uses, in one grouped query. `franchise.franchise_type` was
  rejected: it is a free comma-joined string with its own vocabulary (ACG,
  "TV, Movie") which does not map onto the twelve media types, and it knows
  nothing about visibility.
- **The score distributions are bucketed by the server, per media type, and
  pooled by the page.** One request answers both the pooled chart and any
  single type. The scored types are read off the models (`hasattr`) rather
  than listed, so the four that carry `mal_rating` and `anilist_rating`
  today - anime, anime movie, manga, novel - are not a list to keep in step.
  A perfect score folds into the top bucket rather than getting a bucket of
  one value.
- **The catalogue chart is headed "Rating distribution" with the Catalogue
  eyebrow, and its sidebar entry is "Catalogue ratings"**, because a member's
  page already has a personal "Rating distribution" and two sidebar entries
  of one name would be ambiguous.
- **"Entries by genre" was removed**, to be added back; what it needs is in
  open-items.md.
- **No shared modal component exists**, so `SeasonCountsModal` follows the
  modal chrome `ConfirmModal` and `RemarkModal` share. Its grid is CSS
  columns rather than a CSS grid, so seasons read down each column, newest
  first, as the table above it does.

### Every note link is titled; seven sections change what a row holds (2026-11-16)

- **One link shape, everywhere.** Every `links` column holds `{"text",
  "url"}` pairs with an optional title, not only the song lists. Keeping
  URL strings on most sections and pairs on four meant two editors, two
  validators and a per-section flag (`link_pairs`) every reader had to
  consult; the flag, `uses_link_pairs` and `as_link_urls` are gone and
  `takes_links` says only whether a section has links at all. Revision
  `n1l2inkpairs3` turns every stored URL string into a pair with a null
  text, matching how the song lists already stored a missing title.
- **A bare URL string in a request is accepted and read as an untitled
  link**, rather than refused. A page still running the older bundle during
  a deploy would otherwise fail every save; the stored shape is still only
  pairs.
- **A section losing a field keeps its data in a field it still has**, as
  `g3s4ysnolink` did for 玩法系統. Controls, classes, geography and episode
  comments append their links to the description, one per line, "title:
  url" when a link had a title. The owner chose the plot rule: a 主線劇情 /
  支線劇情 row's description becomes its chapter and the old chapter its
  first link's title (the one local row - "【Bilibili】 1.6丹青渡
  日配女主全劇情全流程" / "祀的劇情" - reads chapter "祀的劇情", link
  "【Bilibili】 …"); with no link, or a first link already titled, the
  description is appended to the chapter after " — ".
- **A 角色劇情 row with text and no link moves to 其他 Other**, prefixed
  "【角色劇情】 ". An arc is titled links and nothing else, and its links are
  required; the alternatives were to keep the text in a column the section
  no longer draws (invisible, and a 422 on the row's next edit), to store a
  link with an empty URL (which the validator refuses everywhere), or to
  refuse the migration (which would freeze a deploy over a row that can be
  kept). 其他 is the same game's catch-all for a story observation, so the
  text stays readable and editable. An arc with a link takes its text as
  the first link's title, appended after " — " to a title it already has.
- **Irreversible.** Folded links, moved descriptions and moved arcs cannot
  be told apart from text somebody typed. The downgrade still turns pairs
  back into URL strings outside the song lists, dropping the titles, so the
  older code can read what is left.
- **A Pull from a sheet backed up before the revision is reshaped the same
  way** (`_reshape_pulled_note`), rather than only having its links
  converted: otherwise Pull would restore links on Controls and
  descriptions on plots into columns their sections no longer draw. Each
  step is a no-op on a row already in the new shape.
- **各集評論 becomes `episode_text` and requires its text**, since a comment
  that is only an episode says nothing; **小知識 Trivia becomes structured**
  (title, description, links), so a fact can carry a name to find it by.
- **Resources joins 資源&工具 on game and h-game** through `groups_by_owner`;
  a group resolved for the owner wins over `standalone`, so the API never
  sends both. **地理 Geography moves into 世界觀 above 時間線 for a game**;
  its registry fallback group is `worldbuilding` and h-game, which has no
  世界觀, overrides it back to `compendium`, which keeps the registry's
  group runs adjacent.

### ACG splits into Anime and Manga; the grouping is called AniManga (2026-11-17)

- **A franchise type per media type.** `ACG` was the one franchise type for
  anime and manga franchises, so nothing on a franchise said whether it held
  anime, manga or both, and every place that cared (the franchise hub's
  lists, the library's Type filter) had to read the entries instead.
  `Anime` and `Manga` match the media types: an anime, an anime movie and a
  series stamp `Anime`, a manga stamps `Manga`, and a franchise holding both
  says `Anime, Manga`. The existing `Anime Movie` type stays as it is.
- **The aggregate views keep one group.** The statistics page's franchise
  rating card and the favourite franchises grid counted ACG franchises; they
  now count `Anime` and `Manga` franchises together, a franchise carrying
  both once. That group is `ANIMANGA_FRANCHISE_TYPES` (`config/fieldOptions.js`;
  only the frontend aggregates over it) and is not a franchise type, and everywhere the
  text "ACG" was shown - the Library's column heading, the grid's title, the
  statistics card, code comments and docs - it reads "AniManga". The Library
  column still also lists Novel and Game; only its heading was renamed.
- **The favourite grid's storage key stays `ACG`.** It is the key inside
  `franchise.type_slots`, in every stored row and every sheet backup.
  Renaming it would need a JSONB rewrite plus a fold on Pull for every older
  sheet, for a key nobody sees; the grid instead says which franchises it
  holds (`franchiseTypes`), separate from where it stores its slot.
- **Revision `a1n2imanga4` splits the stored values by what each franchise
  holds**, not by a blanket rename: `Anime` for any anime or anime movie,
  `Manga` for any manga, both for both, and `Anime` for an empty franchise,
  since ACG was what anime and series creation stamped. Token-wise, in the
  ACG token's place, no duplicates. A `type_covers` choice under `ACG` moves
  to the type of the entry it names - otherwise it would be orphaned, since
  the editor offers a cover per franchise type. It is reversible: the
  downgrade folds `Anime` and `Manga` back into one `ACG`, which is exactly
  the vocabulary the previous head expects (no franchise was typed `Anime`
  or `Manga` under it); only which half each franchise was is forgotten.
- **Pull splits too, after the entries.** A sheet backed up before the
  split still says `ACG`, and the split decides by entries, which the
  Franchise tab restores before. So Pull All splits once after its last tab
  (`split_acg_franchise_types`), and a Franchise-tab Pull alone splits
  against the entries already in the database. The parser's old fold of a
  retired `Anime` token onto `ACG` is gone: `Anime` is a type again.
- **Rejected: keep `ACG` and add `Anime`/`Manga` beside it.** Two ways to say
  the same franchise would split every type test in two.

### 備註 Remark is the catalogue's; the remarks it held move to 備註列表 (2026-11-17)

- **The owner's call, and it reverses the per-author remark** recorded under
  "Authorization redesign". 備註 had become a personal-scope singleton - one
  row per owner per author, read back only by its author - which left the
  catalogue with no shared block of prose on an entry or a group, and gave
  each member a second personal place to write beside 備註列表. Now 備註 is
  one catalogue row per owner, written under `manage.catalog` and read by
  everyone who can see the owner, a guest included; a member's own short
  notes go in 備註列表, which stays personal.
- **The per-account write route is retired, not kept read-only.**
  `PUT /api/me/remarks/{owner_type}/{owner_id}` existed only to let a
  `self.list` holder write their own remark; with the remark shared there is
  nothing of theirs for it to write, and a route that refuses everything is
  an inert surface. The detail pages and hubs save through the owner's own
  `PATCH`, behind `manage.catalog`, and draw the remark read-only for
  everyone else.
- **Every existing remark becomes a 備註列表 row of its own author, in place**
  (revision `r1e2mcatalog3`). Publishing them as the new catalogue remark
  was rejected: they were written as private assessments, and turning one
  into a guest-readable page would publish it without its author choosing
  to. Re-authoring them to one account was rejected too - a remark is never
  handed to an account that did not write it. Updating the row rather than
  inserting a copy keeps its `system_id`, timestamps and any mark on it.
  Each lands first in its author's list on that owner, since it was the
  owner's one block of prose and reads best at the top.
- **The index and the read path change together, as before.** Per-owner
  `ix_note_one_remark_per_owner` and an unfiltered `attach_remark` are one
  mechanism, as the per-author pair was. The upgrade drops the index, moves
  the rows, and recreates it per owner; the downgrade only puts the
  per-author index back, because the catalogue remarks written since are
  valid per-author rows and a moved 備註列表 row cannot be told from a typed
  one.

### Game copies record a sale and hours; Rumored leaves games; a game's order is a Play Order (2026-11-17)

- **A copy's sale and hours are records, not inputs.** `game_copy.sell_price`
  / `sell_currency` mirror the price paid, and `game_copy.hours_played` is
  decimal hours on that copy. Nothing rolls the copy hours into
  `games.hours_played`, and the statistics page and the two list-price checks
  do not read either - the owner asked for the fields with no business logic.
  Both live on the shared table, so an h-game copy carries them too.
- **Rumored is not a game status.** Every game and h-game row holding it (the
  two share `GAME_RELEASE_STATUSES`) became `Unreleased`, as did a stored
  Add-form default, and Pull reads a `Rumored` cell from an older backup as
  `Unreleased`. The downgrade does not bring it back: nothing records which
  rows held it. `AiringStatus` keeps its own `Rumored`.
- **Games were already in watch orders on the backend.** `MEDIA_TYPE_MODELS`
  listed `game`, the candidates endpoint offered games and progress counted a
  game by `playing_status` alone. What was missing was the frontend: the
  editor's type filter had no Game, a game step showed its raw slug, and it
  was offered an episode range. `game` joined `TYPE_LABELS` (now one map,
  exported from `WatchOrderGuide.jsx`) and `WHOLE_ONLY_TYPES`.
- **"Play Order" is a label, not a second feature.** The Game page's follow
  panel says "Following Play Order"; every other type, h-game included, says
  "Following Watch Order". One model, one route, one editor - `orderNoun`
  picks the word from the page's media type.

### A film has a release status, not an airing status; Rumored goes; an anime movie is Cinema or ONA (2026-11-17)

- **Rumored leaves `AiringStatus`.** Revision `r1l2status34` turns every
  `Rumored` on anime, TV shows, cartoons and hentai into `Not Yet Aired`.
  Hentai is included even though the request named five types, because
  `hentai.airing_status` is checked against the enum on every write: leaving
  a hentai on `Rumored` would make its next edit fail. With games' `Rumored`
  retired by the entry above, no vocabulary carries `Rumored` any more, and
  Pull reads an older backup's `Rumored` per type: `Not Yet Aired` on an
  airing type, `Not Released` on a film, `Unreleased` on a game.
- **Movie and Anime Movie get `release_status`, with its own vocabulary**
  (`FILM_RELEASE_STATUSES`: `Not Released`, `Released`, `Canceled`). A film
  is released once, so it has no `Airing`. Old values map as `Not Yet Aired`
  / `Rumored` → `Not Released`, `Airing` / `Finished Airing` → `Released`.
  The column is renamed rather than added beside the old one, so there is
  only one way to say it. The key is the same one games use, over a
  different vocabulary; every reader that branches on `release_status`
  across types reads each type's own pending value.
- **`Not Released` counts as unfilled for Fill.** A new film now starts at
  `Not Released` rather than blank. Strict fill-only would therefore never
  let TMDB or MAL mark it `Released`. The fills write when the status is blank
  or `Not Released` and only move a film forward, never back.
- **`Watch When Released` is the film types' spelling of `Watch When Airs`.**
  One `WatchStatus` holds both; a film offers only the first, the airing
  types only the second, and every grouping that counts one as planned
  counts both. Rejected: one shared status re-labelled per type in the UI.
  The stored value would then not say what the viewer sees, and the sheet
  would carry a word no page shows.
- **An ONA's one release date is held in both columns**, kept equal on every
  write by `sync_ona_release_date` (registered as the anime movie's
  `progress_hook`, so create, update and patch all run it). The date the
  write changed wins, otherwise JP, the date MAL fills. Rejected: storing it
  only in JP and teaching every reader of `release_date_tw` about ONA. Coming
  Next, the library, the sheet and `RELEASE_PRIORITY` all read the columns
  directly. `release_type` is checked (`Literal`); `release_status`, like
  `airing_status`, is not.
- **Movie's "Original Source" becomes "Exclusive Source" by label only.** The
  owner chose this over moving movies onto the single-valued
  `exclusive_source` tag field, which would have had no lossless mapping for
  a movie holding several sources. The `original_source` key, its sheet
  header and its multi-value shape stay as they are on all four types.
- **Releasing a film starts watching it, for the acting viewer only** (the
  owner's call). "Mark released" and the future card's bolt move
  `Watch When Released` to `Active Watching`, as Mark airing does for
  `Watch When Airs`. The move rides `/api/me/list`, so it touches only the
  acting account's row. Fill and a plain edit of `release_status` move
  nothing: they are not a person saying "it is out and I am watching it".
- **MAL's type sets `release_type` on the Add form only.** `Movie` → `Cinema`
  and `ONA` → `ONA`, through the prefill's blank-or-default rule, which
  replaces the untouched `Cinema` a new form starts with. The fill of a saved
  entry never writes it. `release_type` is NOT NULL with `Cinema` as its
  default, so a stored `Cinema` cannot be told from a chosen one. Rejected:
  a nullable column meaning "not chosen yet", which every reader would then
  have to treat as Cinema.
- **Pull reads an older sheet** through `RENAMED_HEADERS` and the parsers.
  This is the same shape as Game Choice Edge's `option`, so no manual sheet
  work is needed, and the next Backup rewrites the headers.

### Series types: anime JP/TW dates, runtimes, a TV airing type (2026-11-17)

- **An anime has a JP and a TW release date, as an anime movie does.** The
  one `release_date` became `release_date_jp` and `release_date_tw`, and
  revision `s1e2rfields3` copied the old value into both, since it stood for
  both. **The season is the JP airing's**: `release_season`, Seasonal, the
  catalogue's season counts and `?airing_season=` all read the year of
  `release_date_jp`, and `RELEASE_PRIORITY["anime"]` is JP then TW. The
  downgrade folds the pair back JP-first and loses a TW date that differed.
- **MAL fills both dates, except on a Movie.** MAL knows the Japanese
  airing; for a TV series the Taiwanese simulcast lands on the same date, so
  copying it is right far more often than leaving TW blank. A movie's
  Taiwanese theatrical release is a separate date MAL does not know, so an
  entry typed `Movie` gets JP only. The entry's own `airing_type` decides,
  not MAL's, so retyping an entry changes what Fill writes.
- **MAL runtimes from 22 to 26 minutes are stored as 24.** MAL lists the
  same half-hour TV slot anywhere in that band - with or without recap,
  preview and credits - so storing it verbatim would make series that are the
  same length read as different. Checked against 50 real Tenrai records:
  normal TV series sat at 23 (Kimetsu no Yaiba, Naruto, Death Note), 24, 25
  (Bakemonogatari, GTO) and 26 (Angel Beats!), and none landed just outside.
  The band is `TV_EPISODE_BAND` in `tenrai_utils.py` and applies to autofill
  only. **A `Movie` skips it** (the owner's call): a film's length is its own,
  not a TV slot, so a movie MAL lists at 22 minutes (Byousoku 5 Centimeter)
  stays 22. As with the TW date, the entry's own `airing_type` decides.
- **A TV show's airing type is `TV` or `Special`, default `TV`.** The column
  carries a server default, so every existing show became `TV` when it was
  added, and a sheet with no such header restores new shows as `TV`.
- **Cartoon's `length_ep_min` is `runtime_min`**, the name anime and TV
  show use, and cartoon's airing types lose `OVA`: no cartoon used it.
- **Novel's `read_order` is gone**, values included. Comic keeps its own.

### Comic remarks are wiped (2026-11-17)

- **Revision `c1o2micrmk3` deletes every `備註` and `備註列表` row owned by a
  Comic**, shared and personal, for every account, at the owner's request.
  Nothing was kept and no dump was taken for it, so the revision is
  `irreversible`. H-Comic and the groups a comic sits in are untouched, and
  comics keep both sections. It ran ahead of the remark-list rework so that
  rework had no comic rows to carry.

### Pull streams its progress, and never runs beside a Backup (2026-11-17)

- **Pull streams the way Backup does, on the same plumbing.** `/pull`,
  `/pull/{key}` and `/pull/{tab_name}` start the Pull on a worker thread with
  its own session and relay a `processing` event per tab, then the pipeline's
  own result dict unchanged as the last event, with a `: keepalive` every 15
  seconds. A Pull All outlasts the tunnel's ~100-second idle window the same
  way a Backup did. The second use is what justified factoring: the advisory
  lock and the worker thread moved from `backup.py` into
  `app/services/pipelines/worker.py` (`claim`, `start_worker`, every lock
  key), and the SSE relay into `_relay` in `data_control.py`
  (`BACKUP_KEEPALIVE_SECONDS` became `STREAM_KEEPALIVE_SECONDS`).
- **Pull has its own lock, and Pull and Backup exclude each other.** A
  second Pull is a 409, and so is a Pull while a Backup runs, and a Backup
  (manual, Auto after Fill All / Replace All, or the nightly `sheets.sh`)
  while a Pull runs. Rejected: a Pull that only excludes other Pulls. A Pull
  reading a sheet that a Backup is rewriting tab by tab restores from half
  old and half new data, and a Backup during a Pull writes the half-restored
  database over the very sheet being read, losing what the Pull had not yet
  reached. Rejected too: one shared lock for both, because the refusal would
  then say "a backup is running" when it is a Pull. Each run takes its own
  lock and then reads the other's from `pg_locks` without taking it; two
  that start together both refuse, which is safe.
- **The final result stays the pipeline's own dict**, so the page keeps the
  counts and lists the JSON response carried; the stream adds nothing to it.
  Pull All's failures, which used to surface as a bare 500, now arrive as an
  `error` event carrying the message. An unknown tab is still a 400, decided
  before anything starts.
- **The frontend helper became `api/sheets.js`** (`runBackup`, `runPull`,
  `backupToast`, `pullToast`), one stream reader for both; a single-tab Pull
  that was skipped for want of `admin.authz` toasts as a warning rather than
  a success.


### 備註 is a shared list; 備註列表 is 個人筆記 Personal Notes (2026-11-17)

- **備註 Remark became a list** (`text_links`, like every other list
  section), still catalogue-scope and on every owner. One block of prose per
  owner had turned into walls of unrelated points; a list lets each point be
  its own row with the links it rests on. Revision `p1n2otesrmk3` dropped
  `ix_note_one_remark_per_owner`.
- **Each existing remark stayed one row, text unchanged, line breaks kept.**
  Splitting on line breaks was rejected: a remark's lines are sometimes one
  point wrapped by hand and sometimes several points, and nothing in the text
  says which. Instead the revision logs every remark whose trimmed text runs
  to more than one line - owner type, name, public id, ids and the full text -
  before it changes anything, and `multiline_remarks(conn)` returns the same
  list for a report outside a migration run. The owner splits those by hand.
- **The virtual `remark` attribute went with the singleton.**
  `attach_remark` / `upsert_remark` / `pop_remark` existed only to map one
  row onto one string; with several rows there is no string to map, and two
  editors of one row (the form's textarea and the Notes card) were already a
  last-write-wins hazard. Entry and group schemas carry no `remark`, a
  `remark` key sent to their routes is ignored, and the Remark textarea left
  every Add and Modify form and every detail page: remarks are written in the
  Notes card. The admin Remarks review returns `remarks`, every text of an
  entry, one row per entry.
- **備註列表 Remark List was renamed 個人筆記 Personal Notes** (`remark_list`
  → `personal_notes`), still personal and still a list. With 備註 a list too,
  "the list half of 備註" no longer told the two apart; who owns the rows
  does. Pull files an older sheet's `remark_list` rows under the new key
  (`_RETIRED_NOTE_SECTIONS`).
- **The generic `singleton` flag stays**, unused by any section for now: the
  notes router's and Pull's one-row checks are shared with `one_per_kind`
  (`music_status`), and the frontend's structured sections honour it.
- **Downgrade folds instead of refusing.** Putting the singleton index back
  needs one remark row per owner, so the downgrade keeps the first row (the
  notes page's order) and gives it every row's text, blank-line separated,
  with links appended as `title: url` lines; the rest are deleted. Declaring
  the revision `irreversible` was rejected, since a rollback can carry the
  text; moving the extra rows to 備註列表 was rejected, since that would turn
  shared catalogue text into one account's private notes.

### Anime says whether it is the original or a remake (2026-11-17)

- **A new column, `anime.original_or_remake`, over its own vocabulary
  `ANIME_ORIGINAL_OR_REMAKE` (`Original` / `Remake`).** Anime's `is_main`
  already answers 本傳 / 外傳 / 前傳 / 後傳 / 總集篇, so folding Remake into
  it the way game's `is_main` carries Main / Remake / Remaster would have
  mixed two questions in one column. The name is not `originality`:
  h-comic's and hentai's `originality` already means 原版 / 同人.
- **Never empty.** Unlike game's `is_main`, which stays NULL until someone
  answers it, an anime that says nothing is the original: the column is NOT
  NULL with a server default of `Original`, so revision `a1n2remake34`
  filled every existing row as it added the column. A write naming `null`
  or `""` is a 422 rather than a silent `Original`, and the form's select
  has no blank. A Sheets cell that is blank or unknown reads as `Original`
  instead of aborting the tab; a tab without the header keeps the default.
- **Anime only**, not anime movie or any other type.
- **It joins the anime duplicate key**, as `is_main` does game's: a remake
  usually shares its original's name exactly.
- **Auto-fill does not copy it.** The Add form copies fields from an entry
  already in the catalogue, and the entry a remake is filled from is usually
  its original.

### Anime's `ep_special` is text (2026-11-17)

- **`ep_special` is a string**, because specials are numbered `17.5A` and
  `17.5B`, which a float cannot hold. Revision `e1p2special3` converted each
  value with PostgreSQL's float-to-text cast, which already writes the
  shortest form: `17.0` became `"17"`, `17.5` `"17.5"`, NULL stayed NULL.
- **One rule makes a value canonical wherever it arrives**
  (`app/utils/ep_special.py`): a plain number is written in its shortest
  form (`17.50` -> `17.5`, `007` -> `7`), anything else is kept as typed,
  trimmed, and a blank is NULL. The API applies it on create and full
  update, and still accepts a JSON number from an older client; a Sheets
  Pull applies it to a cell, so a Backup taken while the column was a float
  (`17.0`) restores as `"17"`. Without it, `17` and `17.0` would be two
  different values to the duplicate key.
- **Nothing sorts it or computes with it**, so no ordering rule was needed.
  Every reader was checked: the `ep_previous` eligibility (checking,
  derivation, sequel relations) tests only for NULL; the duplicate key
  compares by equality; watch orders pass it through and `specialLabel`
  prints it; the detail page, Modify and the duplicates review display it.
  A future sort would have to order by leading number, then suffix - a
  string sort puts `10` before `9`.
- **The downgrade is lossy, not impossible**: text that is a plain number
  goes back to a float, and anything else (`17.5A`) becomes NULL. Until a
  lettered special is written the round trip is exact, so the revision is
  not declared `irreversible`.
- **`PATCH` writes it as sent**, like every column it touches; the Modify
  page's payload trims it and sends a blank as null.

### Progress numbers are floats (2026-11-17)

- **Every progress count and total is a float**: `ep_fin`, `ep_total`,
  `ep_previous`, `issue_fin`, `issue_total`, `page_fin`, `page_total`, and
  manga's and H-Comic's `ch_total` and manga's `vol_total` joined the
  counters that were float already (`vol_fin`, `ch_fin`, `arc_fin`,
  `ch_fin_in_arc`, novel's totals). Half an episode watched, or a total of
  12.5 for a season with a recap half-episode, is a real value, and one
  numeric type for every counter means one stepping rule. Not
  `achievements_total` (a game's achievements are whole), and not
  `vol_fin_page` (a page).
- **Revision `p1r2ogfloat3`** alters the thirteen columns to double
  precision; every integer converts exactly. **The downgrade floors**
  (`floor(col)::integer`): a partial unit is not a finished one, so 2.5
  episodes reads as 2 rather than rounding up to an episode nobody watched.
- **Manga's `vol_fin` / `ch_fin` and H-Comic's `ch_fin` were float columns
  behind `int` schemas**, so the API refused the fraction the column could
  hold. Every schema now says `Optional[float]`.
- **The Fill/Replace clamp stopped truncating.** `validate_episode_math`,
  `validate_vol_math` and `validate_ch_math` parsed with `int(float(...))`,
  which would have turned a total of 12.5 into 12 on the next Replace. They
  share one float parser that also treats `nan` / `inf` as no value.
- **+ and − go to the next integer in their direction**, not ±1: + is
  `floor(x) + 1`, − is `ceil(x) - 1`. Adding one to 2.5 gives 3.5, a value
  nobody stepping a counter means; and the dashboard cards' old
  `Math.round(fin) ± 1` took 2.5 + to 4. The alternative of rounding a
  fraction away on the first step was rejected because − from 2.5 should be
  2, not 1.
- **A tolerance of `1e-9`** lets a value that is an integer but for float
  noise (2.0000000001, a sum like 0.1 + 0.2) step as that integer, so a step
  never stalls or skips one.
- **+ stops at the total without passing it**, a fractional one included
  (2 + with a total of 2.5 → 2.5), and does nothing at the total. Some
  cards used to toast "Cannot exceed total" on + at the total; the cap makes
  that press a no-op instead, as `EpisodeStepper` and the manga and h-comic
  steppers already behaved. Typing over the total is still refused with the
  toast.
- **One helper, `frontend/src/lib/progressStep.js`**, holds the rule, the
  display formatter and the field list for every stepper, the novel arc
  cursor included, so the cards and the detail pages cannot step
  differently again. Display rounds to six decimals (`formatProgress`):
  enough for any fraction a person types, and short of the noise a float sum
  carries.

### Novel becomes Book (2026-11-17)

- **The type is renamed throughout, not just in the UI.** What the type
  holds is broader than novels - short-story collections, guides and
  setting books sit in it too - so the name was wrong wherever it appeared.
  A label-only rename was rejected: it would have left the table, the
  `media_type` key, the route, the permission, the franchise type and the
  sheet tabs all saying `novel` under a page saying Book, which is exactly
  the kind of mismatch "Suspect any shape that reads as uniform" warns
  about. So: tables `book`, `book_unit`, `user_book_unit_rating`; columns
  `book_id`, `book_name_*`; key and owner type `book`; route `/api/book`;
  permission `media_type.book`; franchise type `Book`; tabs `Book`, `Book
  Unit`, `User Book Unit Rating`; covers under `static/covers/book/`.
  Revision `b1o2okrename3` (after `p1r2ogfloat3`) renames every named
  object too - keys, indexes, checks, the `public_id` sequence and the
  delete trigger - so the result is exactly what `create_all` builds, and
  rewrites every stored spelling. Its downgrade reverses all of it.
- **The `type` vocabulary becomes Chinese**: `輕小說`, `小說`, `網路小說`,
  `短篇集`, `指南/設定集`, `其他`. The migration maps the old values one to
  one (`Light Novel` → `輕小說`, `Novel` → `小說`, `Web` → `網路小說`,
  `Other` → `其他`); `短篇集` and `指南/設定集` are new, and the owner moves
  entries into them by hand - which entries belong there is not derivable
  from anything stored. The downgrade sends both back to `Other`. The unit
  rules follow the old mapping: `輕小說` and `小說` are volume-only as
  `Light Novel` and `Novel` were, `網路小說` counts arcs as `Web` did, and
  the two new types take `其他`'s rules. The JP author-name rule
  (`name_slot_for`) follows `輕小說` and `網路小說`. *Gravity Falls: Lost
  Legends*, a graphic novel, belongs under Comic and is moved by hand.
- **Statistics keeps a section called Novel**, and it counts novels only:
  books whose type is `輕小說`, `小說`, `網路小說` or `短篇集`
  (`NOVEL_BOOK_TYPES` / `novelsOnly` in `frontend/src/utils/statsUtils.js`),
  in both the completions tab and the rating distribution. A guide or an
  `其他` book is a book, not a novel, and would skew a novel rating
  distribution.
- **The release date splits into JP and TW, as anime's did**, but the old
  value goes to `release_date_jp` **only**; `release_date_tw` starts empty.
  Anime copied its one date into both because it stood for both. A book's
  stood for the original's first publication - MAL and Open Library filled
  it, and both know only the original - so copying it into TW would have
  invented a Taiwanese edition date. `end_date` stays one column, and
  `RELEASE_PRIORITY["book"]` is JP then TW.
- **Pull reads a sheet written before the rename, through a new tab-alias
  mechanism.** Until now a renamed column was the only rename Pull knew
  (`RENAMED_COLUMNS`); a renamed *tab* is new, and so are renamed cell
  values. `app/services/pipelines/legacy_names.py` holds all three:
  `LEGACY_TAB_NAMES` (`Book` may be titled `Novel`, and so on),
  `RENAMED_COLUMNS` entries for `novel_name_*`, `novel_id` and
  `release_date`, and `legacy_cell_values` for the `novel` key, the `Novel`
  franchise token and `type_covers` key, `novel/` cover paths, the two
  per-type `system_configs` keys and the fields inside them, and the old
  type vocabulary. **The current tab title wins whenever it holds a row**:
  a sheet backed up after the rename may keep the old tab beside the new
  one, and that one is stale. **The old title is read only when the sheet
  lists it**, because asking Sheets for a title it lacks creates the tab.
  Backup writes only the new names, so the next Backup leaves nothing old
  behind but the stale tabs, which nothing reads.
- **Old URLs redirect**: `/novel/:publicId/:slug?` to `/book/...` and
  `/library/novel` to `/library/book`, swapping only the type segment so the
  id, slug, query and hash survive, with `replace` so the dead URL leaves no
  history entry. Bookmarks and links pasted into notes keep working.
- **The cover folders are copied at startup, not moved.** The migration
  rewrites the stored paths but does not own the cover volume, so the app
  copies `static/covers/novel/` and `static/covers/thumbs/novel/` into
  `book/` when it starts (`copy_legacy_cover_folders`), never overwriting,
  so every boot after the first copies nothing. A move was the first
  version and was rejected before release: after a rollback the old code
  would look for covers under `novel/` and find an empty folder. With a
  copy the old folder is the rollback's copy; deleting it, and the copy
  step, waits until the release has proved itself (open-items.md).
- **Kept, on precedent.** The favourite book grid's stored `type_slots` key
  stays `Novel`, as the ACG split left `ACG`: it is a storage key, not a
  franchise type, and rewriting it buys nothing; the grid names its
  franchises through `franchiseTypes: ["Book"]` instead. `deleted_record`
  tombstones are not rewritten either - they record what was deleted at
  the time - and DataHistory, the one reader that branches on the label,
  accepts both `Novel` and `Book`. `type_covers` keys *are* rewritten, as ACG's were, because
  they are franchise types. **Hentai's `Novel` source material stays**: it
  names the genre the work adapts, not this app's type. So does genre prose
  (light novel, web novel, visual novel, graphic novel), MAL and AniList
  vocabulary, the retired `novel_author` / `novel_illustrator` keys, and
  every historical revision.

### Upcoming books and manga volumes (2026-11-17)

- **Upcoming is a date, not a status.** A book unit carries its own
  `release_date_jp` and `release_date_tw`, on every kind, and manga its
  next volume's `next_vol_release_date_jp` and `next_vol_release_date_tw`.
  Nothing records that a unit or a volume is out: it is upcoming while one of
  its dates is still ahead, and a passed date drops it off Future Releases on
  its own. A per-unit release status was rejected with the owner: it would
  be a second statement of what the date already says, and the two would
  disagree the day the date passes and nobody edits the status. The detail
  pages keep showing a passed date until it is edited.
- **Manga gets two columns, not the unit table.** What a manga reader waits
  for is the next volume, one at a time; a table of every future volume
  would be data nobody enters. Revision `u1p2coming3` adds the four date
  columns (each with the `ck_<table>_<column>_iso` check every release
  column has) and the unit's `cover_image_file`, all empty; its downgrade
  drops them.
- **"Ahead" for a partial date is the end of the period it names.** `2026`
  stays upcoming until 31 December, `2026-11` until 30 November, and a date
  that is today still counts (`isUpcomingReleaseDate`). The alternative,
  reading a partial date as the first of its period - which is how
  `releaseScore` *sorts* it - would drop a book announced for "2026-11" on
  the first of the month, while it is still to come. Today is the viewer's
  own calendar date, computed in the browser, which is where the page
  decides.
- **The filter runs in the browser, over the ordinary list endpoints.** The
  book list already carries every book's `units` (`selectinload`), so a
  unit's dates reach Future Releases with no new endpoint and no request per
  book, and the per-type visibility - `media_type.book`, `media_type.manga`,
  content labels - is the list endpoint's, exactly as every other tab of the
  page gets it. A dedicated "upcoming" endpoint was not built: the other
  tabs filter client-side too, and a second read path would need its own
  copy of the gates.
- **A unit's cover belongs to the image library, not to the units write.**
  `book-unit` is an attachable owner (`ATTACHABLE_OWNERS`, mirror column
  `book_unit.cover_image_file`), gated through its book
  (`book_unit_visible`). `BookUnitWrite` has no cover field and
  `write_book_units` never writes one, so a units save sent from a form
  loaded before a cover was attached or removed cannot put the old value
  back. That is why the picker appears only on a saved unit: the attach
  needs an id. Entries differ - their cover rides in the entry body - but an
  entry form is loaded and saved as one, where the units editor sits beside
  an immediate attach on the same page.
- **`book-unit` is not a `COVER_OWNERS` folder.** Like `quote` and `meme`,
  a unit only ever holds an uploaded `library/...` image; nothing downloads
  one, so a `static/covers/book-unit/` folder would always be empty, and
  the gated cover route, the orphan scan and the cover-layout script would
  each carry a type that never has a file. No focus column either: the cover
  is drawn only as a thumbnail beside the unit's name.
- **The books and manga tabs use the library card.** `MediaCard`'s future
  variant is built for the watch and play axes - a Watch/Play When Released
  select and a release bolt - and a book has neither a waiting status nor a
  release status, so its tab draws the ordinary card with the reading-status
  button, and the dates that list it underneath. A book is placed by its
  earliest upcoming date, its own or a unit's, so a book with a volume due
  next month and another next year appears once, in the nearer year, with
  both volumes under it.
- **PATCH checks a unit's dates in the writer.** The PATCH body is a raw
  dict, so without the check a malformed unit date reached the ISO
  constraint and answered 500; `write_book_units` now answers 422 with the
  validator's message, as `POST` and `PUT` do.

### Testing: a database per run, the release round trip, and a selected pull-request suite (2026-11-18)

- **A database per run, not a lock.** Two runs collided because they shared
  the NAME `media_test`, not the server, so the fix is a fresh
  `media_test_<epoch>_<hex>` per run and per scratch use (the platform's rule,
  `docs/registry.md`). The epoch in the name is a deliberate addition: leftover
  cleanup drops only databases with no connections that are older than two
  hours, so a neighbour's cleanup cannot take a database a run created a
  moment ago and has not connected to yet. "No connections" alone has that
  window. The database is created while the root conftest is imported, not in
  `pytest_configure`, because `app.main` checks the schema at import and pytest
  imports `tests/api/conftest.py` before configure runs; the first version
  used configure and every API test failed on a missing database.
- **The chain is built from zero once per run.** Each from-zero build costs
  over a minute. `migrated_head` is built once and read by every generic guard;
  a test that downgrades takes a `CREATE DATABASE ... TEMPLATE` copy, seconds
  rather than another replay. `test_migrations_build_the_schema.py` alone used
  to build it twice.
- **The round trip goes to `origin/main`'s revision, not one step.** That is
  what a rollback of the release undoes, and concurrent sessions put several
  revisions into one release. Rejected: walking every revision down to base,
  which the baseline makes meaningless and which costs a replay per step. The
  walk stops above a revision declaring `irreversible = True`, because that is
  where the deploy hook stops too.
- **A pull request into `dev` runs a selected backend suite; the merge queue
  runs all of it.** Every code pull request ran the full suite twice - once on
  its own, once in the queue - and only the queue run tests the tree that
  lands. The selection (`scripts/pr_tests.py`) keeps what the pull request
  can actually tell you: unit, services, the API files it touches, and the
  migration guards plus its own revision tests when it touches the schema; it
  falls back to everything when the harness itself changes. The cost, accepted
  by the owner, is that an uncovered API failure appears at queue time instead
  of on the pull request; it still cannot land. Rejected: a second job for the
  selection, which would change the required check's name and so the
  ruleset; and path filters at workflow level, which leave a required check
  unreported.
- **The built URL names `127.0.0.1`.** On the company machine `localhost`
  resolved to `::1`, which the dev database does not listen on, and every new
  connection waited out a 21-second timeout - measured: 21.1 s against
  0.02 s. A pooled app barely notices; the suite opens a fresh connection per
  scratch database, per Alembic subprocess and per comparison read, which is
  where much of its local half hour went. Building the URL with
  `URL.create` instead of `quote_plus` also fixes a password containing a
  space, which `quote_plus` turned into a literal `+`.

### 劇情 folds into 劇情&任務 Story & Quests; 支線任務 Side Quests (2026-11-18)

- **The prose 劇情 card goes, and its three sections with it.** `main_plot`,
  `side_plot` and `character_arcs` covered what the 劇情列表 strands hold as
  a structure, and the owner chose the structure alone, reversing the earlier
  "two cards, not one" decision; production held one row across the three.
  Their rows are **deleted**, not moved,
  by `s1q2uests345` — the owner moved that one row onto its strand by hand
  before the release — so the revision declares `irreversible = True`; only
  the pre-deploy dump brings them back. Pull does not refile an older sheet's
  rows of those sections: they restore under keys the registry no longer has
  and render nowhere, the standing hazard `switching-environments.md`'s "one
  hard rule" describes.
- **One card, keyed `story_list`, labelled 劇情&任務 Story & Quests**: the four
  strands, then 支線任務 Side Quests, then 結局 Endings last. The key stays
  because keys are what code and tests name. With 劇情 gone, an h-game needs no
  per-owner group for its strands, so game and h-game read the same card.
- **支線任務 Side Quests is a nestable structured section, not a fifth
  strand.** A quest carries what a strand entry does not — region, cautions,
  prerequisite, NPCs, rewards, and each viewer's own done status (personal,
  NG-reset, default `to do`, like 敵人's beaten) — and it is always named, so
  `require_any = (("name",),)` rather than the strands' order-or-name. Its
  type is free text suggested from a new `Side Quest Type` category, and
  groups the roots, so a step under a chain carries no type of its own.
  Catalogue rather than `mixed`, like the strands it sits beside.
- **NPC suggestions come from the page's own rows (`NoteField.suggest_from`).**
  Nothing in the registry let one section's field suggest another's rows. The
  page already holds every row of the owner, so the smallest mechanism is a
  field property naming the source section and a `sectionTitles` map built in
  `NotesContext` — no endpoint, no query, and it follows edits to 角色
  Characters at once. The values stay names rather than row ids, the same
  choice `names` fields made for the cast.

### 待補充 Needs Work (2026-11-19, no spec)

Every entry and every group can be marked as not complete yet - sequels not
added, names missing, an official name not released - with an optional note,
and a page lists the marks grouped by note for the admin and super.

- **One polymorphic table, `needs_work`, not two columns on fifteen tables.**
  The owner is the `note` / `meme` shape: four nullable foreign keys
  (`media_id`, `collection_id`, `franchise_id`, `series_id`), a CHECK that
  exactly one is set, every one ON DELETE CASCADE - read off those two
  models, whose four owner FKs all cascade. Two columns on each of twelve
  entry tables and three tiers would have been thirty columns, fifteen
  sheet tabs reshaped, and a page that queries fifteen tables to find what
  is marked; one table answers the page with one query.
- **The row is the flag.** No boolean column: clearing deletes the row, as on
  `plan_next` and `user_favorite`, so "never marked" and "cleared" are one
  state and the table holds only what is marked.
- **One mark per owner, by a UNIQUE on each owner column.** A UNIQUE column
  treats NULLs as distinct, so the three NULL columns on every row never
  collide; `user_favorite` keys its two items the same way. A NULLS NOT
  DISTINCT constraint over all four columns would have said the same thing
  less directly.
- **The note is free text and the grouping key.** Stored trimmed, blank as
  NULL, so "a" and " a " are one group. A vocabulary (a `system_option`
  category) was rejected: the notes are ad hoc and short-lived, and the
  consistency a vocabulary would buy is got instead by suggesting the notes
  already in use (`GET /api/needs-work/notes`, most used first) wherever a
  note is typed.
- **The permission is `manage.requests`.** The owner asked for the admin and
  super. `manage.catalog` is the obvious name and is wrong here: the admin
  role holds it locked off, so the admin would be refused. `manage.requests`
  is held by exactly super and the admin, each locked on, and locked off for
  every other role; it already means "handle what is wrong or incomplete in
  the data" through the inbox, whose `incomplete_data` reports are the
  members' version of the same thing. `manage.pipelines` and the four
  admin-page keys have the same holders but mean something else. No new
  permission was added. The key gates reads and writes alike, on the router.
- **No object check, and no narrowing by mode.** The admin account resolves
  the empty object set and reads no catalogue, so a page narrowed by mode
  would be empty for one of the two roles it is for. The page names every
  mark the way the inbox names every request's target; an owner must exist,
  not be visible.
- **Set from the Modify editor, saved on its own.** The editor header is the
  one place all fifteen owner types are edited, so one call site covers them.
  The control saves immediately rather than with the editor's Save, because
  the mark is its own row: folding it into fifteen save paths would tie a
  one-row write to the entry PATCH and its enrichment. The admin, who opens
  no editor, changes notes and clears marks from the page.
- **The badge is a separate read per detail page**, made only for a
  `manage.requests` holder, rather than a field on every entry and group
  response - that would have put a permission-dependent field on fifteen
  response schemas for two roles.
- **The marks travel on the Sheets backup**, as the `Needs Work` tab. The one
  documented exclusion, `user_request`, is excluded because members file
  requests on the box and a Pull would overwrite them with a development
  machine's; the marks are the catalogue editor's own bookkeeping and move
  with the catalogue they describe. The tab matches a row by its owner when
  its uuid is unknown, so one owner marked on both machines is one row.
- **Series link to `/series/<uuid>`.** `MediaRef.nav_path` is None for a
  series (`app/utils/media_resolver.py`), written when a series had no page.
  It has one now, so the Needs Work service builds every owner's path itself
  rather than inherit the gap; the inbox and memes still link no series,
  which is the resolver's to fix, not this feature's.

### Directors without a director credit are deleted (2026-11-19)

- **Revision `d1i2rnocred3` deletes every person who holds a `director`
  role and has no `director` credit**, at the owner's request ("remove
  directors without credits"). Only a `media_credit` row with
  role `director` counts, in any scope: a person with director roles in two
  scopes and a director credit in one is kept. Credits in other roles do not
  save a person, and the whole `person` row goes even when they hold other
  roles too - the owner chose that over stripping just the role.
- Every foreign key into `person` cascades, so roles, other credits, voices,
  memberships on both sides and ratings go with the row. The person's
  `image_attachment` rows (owner_type `staff`, no foreign key) are deleted
  by the revision; `user_request` rows keep their `target_label`, as for any
  deleted target. Photo files on disk are not touched - a migration cannot
  reach them.
- No dump was taken for it, so the revision is `irreversible`. A Sheets
  backup taken before it still holds those people, and a Pull from one
  brings them back; the revision does not run again on what a Pull restores.

### Common Options; the 待補充 note suggests only its common notes (2026-11-19, no spec)

- **"Note Suggestions" became "Common Options", and widened.** The owner's
  definition: a common option is a suggestion-only vocabulary, added only on
  the Add page, edited only on the Modify page, and never created from what
  someone typed. That is a property of the category, not of where it is
  read, so the sub-tab is named for it. Song Type and Song Source (the music
  sections' suggestions) and Needs Work Note meet it and moved in from
  Options; the seven game guide categories stay as its **Note Suggestion**
  group. `COMMON_OPTION_CATEGORIES` sits in `credit_roles.py` beside
  `TAG_CATEGORIES`, derived from `NOTE_OPTION_CATEGORIES` plus
  `NEEDS_WORK_NOTE_CATEGORY`, and replaces `/api/constants`'
  `note_suggestion_categories` outright: its only reader was the sub-tab.
- **The grouping is presentation, so it lives in `TIER2_GROUPS`.** The
  picker already arranges with the /options page's groups, so the three
  groups (Note Suggestion, Music, Needs Work) were added there and the two
  pages agree. Needs Work holds one category, which the group-of-one rule
  would have sent to Other; that rule is about a group the data shrank, so a
  group *declared* with one member now stands. Rejected: a per-picker
  threshold prop, which would have made the /options page and the sub-tab
  disagree about the same group.
- **The 待補充 note no longer suggests the notes in use.** Suggesting what
  other marks carry fed every typo back as a suggestion, which made the
  field a vocabulary that grows from typing - the opposite of a common
  option. The suggestions and chips are the `Needs Work Note` values only,
  on the Needs Work page's Edit note as well, which now uses the same
  `NeedsWorkNoteInput`. With no reader left, `GET /api/needs-work/notes`,
  `notes_in_use()`, the `NeedsWorkNote` schema and `useNeedsWorkNotes` were
  deleted rather than kept for later.
- **No common option is created from typed text.** Checked when the set was
  drawn: `resolve_option` is reached from tag, character tag, label and
  source fields only, and `ensureSourceValues` from the entry forms' tag
  fields; the note sections and the 待補充 note store their text as typed.

### A person's gallery of works (2026-11-19, no spec)

- **Library attachments, not a table of its own.** The pictures are `image`
  rows with `image_attachment`s on the person (`staff`, role `work`), ordered
  by the `position` column the library had reserved for the multi-image case
  and captioned by a new `image_attachment.caption`. A `person_work_image`
  table with a foreign key to `person` was the obvious alternative, and its
  cascade on delete was the one thing it bought. Against that it would have
  been a second record of which images are in use: the manager page's
  `unused` filter, the 409 on deleting a used image and the forced delete
  would each have needed teaching about it, and the dedup by checksum would
  have had to be repeated. The attachment's missing foreign key is paid for
  where it bites: deleting a person empties the gallery explicitly, and a
  merge moves it.
- **Removing a gallery picture deletes its file**, which an ordinary detach
  of an upload does not. A cover upload is library stock, kept for reuse; a
  picture of somebody's work uploaded to their gallery has no other purpose.
  The image survives when the same bytes are some other owner's picture
  (`image_library.drop_if_unused`), since the library stores identical
  pictures once.
- **Writes are `manage.images`**, the key every upload and attach already
  answers to, rather than `manage.catalog`, which guards the person's own
  columns. Picking a person's photo already needs both in practice (the
  Modify page is `manage.catalog`'s, the picker's calls `manage.images`'s),
  and the gallery sits on the same form.
- **Only an author or illustrator may gain a picture**, by any scope of
  either role; the check reads the saved roles. Losing the role later keeps
  the gallery and keeps it editable rather than deleting someone's uploads
  as a side effect of a role edit. A viewer who cannot see any such role -
  an h-comic author, for a session that cannot see h-comic - reads an empty
  gallery, as the page shows no such role.
- **It does not travel on the sheet.** No library row does; a gallery has no
  column on `person` to carry even its keys.
- **No lightbox.** The app has none, and the tile links to the full picture
  in a new tab instead of introducing one for this.
