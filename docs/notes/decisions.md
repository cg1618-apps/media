# Design decisions

Last verified: 2026-11-19

## What this is for

A dated log of the choices that shaped the code and, where it matters, the alternatives that were rejected. Read it before proposing a change that "obviously" simplifies something: the odds are the simpler shape was considered and turned down for a reason listed here. Each entry names the spec that produced it; the spec files themselves have been retired, so the date and name are the only attribution that remains.

## 2026-05

## 2026-08

## 2026-09

## 2026-10

## 2026-11

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
