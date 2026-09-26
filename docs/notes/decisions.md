# Design decisions

Last verified: 2026-09-25

## What this is for

A dated log of the choices that shaped the code and, where it matters, the alternatives that were rejected. Read it before proposing a change that "obviously" simplifies something: the odds are the simpler shape was considered and turned down for a reason listed here. Each entry names the spec that produced it; the spec files themselves have been retired, so the date and name are the only attribution that remains.

## 2026-05

### Mark Completed endpoints (spec: 2026-05-08 mark-completed)

- Dedicated `POST /{id}/complete` on each router instead of the frontend PATCHing individual fields; the backend owns the completion rules.
- Fixed a manga bug where the frontend path forgot `ch_fin`, `vol_fin` and serialization updates.
- `completed_at` is set only when it is `None`.
- Endpoints reuse the existing `*Response` schemas.
- Auto-complete detection inside `apply_single_*` is untouched.

### Session expiry redirect (spec: 2026-05-09 session-expiry) — not implemented

- Proposed a centralised `apiFetch` that does a full-page redirect to `/login?next=` on 401 (excluding `/api/auth/login`) with credentials implicit.
- Abandoned. `fetchJson` throws and nothing redirects.

### Plan page (spec: 2026-05-14 plan-page)

- Watch Next and To Rewatch moved off Statistics to a dedicated public Plan page.
- Components were renamed, not rewritten; `statsUtils` is shared.
- `usePlanData` mirrors `useStatisticsData`.

## 2026-08

### Series structure (spec: 2026-08-23 series-structure)

- The series hub resembles the franchise hub without duplicating it: no `franchise_type`, no `collection_id`, no `type_covers` (a `cover_entry_id` instead), no `type_slots`, no `watch_next_group`, no new ORM relationships.
- Column declaration order equals sheet order.
- Main Cover is set only on Modify.
- Tabs are gated on list length; Watch Order and Notes are always on.
- `SeriesModal` retired.
- Anime movie is excluded (it has no `series_id`).

### Media relations (spec: 2026-08-23 media-relations)

- One polymorphic `media_relation` table replaces `prequel_id`, `sequel_id`, `alternative` and `derive_related`.
- FK-less `(media_type, entry_id)` pairs; a missing endpoint is served with `missing=True`.
- Rejected: mirrored rows, and per-table JSONB.
- A prequel is stored as a swapped sequel.
- Symmetric kinds sort their endpoints.
- The `RELATION_KINDS` registry is served over HTTP.
- 409 on self-relation or duplicate.
- The table started empty; derived values were not migrated.
- `is_main_entry` unchanged.
- The franchise/collection picker is a lens, not ownership.
- Reads are public, writes admin.

### Notes restructure (spec: 2026-08-23 notes-restructure)

- One polymorphic `note` table plus a backend section registry replaces the notes JSONB column. Rejected: table-per-shape, and JSONB with a backend schema.
- Registry in `app/utils/note_sections.py`.
- `text_links` carry an optional episode.
- Similar keys across types are kept distinct on purpose.
- Highlights got kinds; `special_*` split into `op_ed_changes` and `extended_episodes`.
- Episode-anchored sections stop at entry level; quotes are entry-only, memes are on all owners.
- Violations return 422; the migration logged unmappable values.
- Notes are edited only on the notes page.

### Remark as a note section (spec: 2026-08-23 remark-to-note)

- The `remark` column collapsed into the `remark` note section; the read path is a read-only `column_property`, so schemas and Sheets were untouched; remark leaves the entry sheets and lives in the Note tab.
- `pop_remark` distinguishes absent from empty; empty text deletes the row; last write wins.
- The migration merged existing text under an "original remark:" label; parsers drop remark.
- Accepted the correlated-subquery cost.

### Relations graph (spec: 2026-08-25 relations-graph)

- A canvas replaces the text list. Rejected: a second tab, a full-bleed overlay, persisted positions, hand-rolled SVG, Cytoscape.
- `@xyflow/react` + dagre, with a dedicated `/graph` endpoint.
- Ghosts are laid out like nodes; unconnected entries sit in a tray.
- Edges carry `label` and `inverse_label`; nodes are keyed `"type:id"`.
- Equivalence groups contract via union-find; branch and derivation edges get lower weight.
- Positions are stable across writes.
- The confirm popup is a sentence with a swap control; timeline edges have no chip, equivalence edges no arrowhead.
- Layout functions are pure.

### Comic entry (spec: 2026-08-26 comic-entry)

- Comics are runs; events and eras are labels, not entries.
- Modelled on Novel with Western-shaped columns; display order EN → CN → Alt; events comma-joined.
- `read_next` / `to_reread` columns were created early.
- Registered through the factory registry.
- No fill queue originally; `progress_display` dropped; an external API was deferred and then adopted (Comic Vine).

### Comic parity (spec: 2026-08-28 comic-feature-parity)

- Scope came from an audit of every file naming manga but not comic.
- Issue ranges are allowed in watch orders.
- The empty-Notes-card fix is general, not comic-specific.
- Duplicates are keyed on `comicvine_id` plus names.

### Release dates (spec: 2026-08-28 iso-release-dates)

- Truncated ISO strings. Rejected: DATE plus a precision column, and free text.
- A CHECK constraint per column; one helper module owns parse, validate, normalize and display.
- Multi-region columns kept; movie flips to TW-first.
- A year-only value leaves `release_season` untouched; anime year is the first four characters.
- Sheets get an apostrophe prefix (rejected RAW mode).
- Unparseable rows were logged and left NULL.

### Plan next (spec: 2026-08-29 plan-next)

- One `plan_next` table replaces `watch_next`, `read_next` and `watch_next_group`; row existence is the boolean.
- FK-less `(scope, media_type, target_id)`; rejected three nullable FKs. `media_type` is stored for entry scope too, and a franchise may appear once per type.
- `size_group_derived` and `size_group_manual` JSONB; manual wins per key.
- Comic buckets 1-3 / 4-10 / 11+ came from real data (35/35/29).
- An entry's bucket inherits series → franchise, except comic on `issue_total`; anime sums `ep_total`.
- Scope is validated in the API; virtual `watch_next` / `read_next` fields are kept.
- Reads public, writes admin.
- Both JSONB fields must be in the parsers with a round-trip test; the Plan page is config-driven.

### Rewatch levels (spec: 2026-08-29 rewatch-levels)

- `plan_next` gains `kind`. Rejected: a second table, JSONB on tiers, renaming `plan_next`.
- The per-type scope map differs from Watch Next (anime and cartoon are franchise-only).
- `kind` is validated in the API; requests default to `"next"` (a server default was added later).
- Nine `to_rewatch` / `to_reread` columns dropped; the cartoon entry flag discarded.
- The backfill reads child entries, not `franchise_type`.
- Plan page sections by scope with a shared toggle control; Calculate untouched.

### System options redesign (spec: 2026-08-29 system-options)

- Three tiers decided by "does code branch on the exact value?". Tier 1 stays in `constants.py` (Main/Spinoff and Region moved there; Dub Preference dropped).
- One vocabulary with explicit scopes: a value with no scopes is offered everywhere; person scope is explicit, not derived.
- Gender lives on the person base; `studio` means anime studios only.
- `media_credit` and `media_tag` are FK-less; `media_tag.field`, not `category`.
- Credit roles and person roles are separate.
- Everything becomes a link row; no nullable FKs on entries.
- The migration reports rather than guesses; delete cascades, merge handles duplicates.
- `/api/constants` is read-only.
- Entry sheets keep comma-joined columns generated from the links.
- `manga.anime_studio` is out of scope (belongs in relations); `character` belongs to franchise (deferred).

### View authorization (spec: 2026-08-29 view-authorization)

- RBAC, not tiers. Permissions are a code registry; grants live in the DB.
- Labels on entries never name roles; a dedicated `media_content_label` table (not `media_tag`, which the pipelines write).
- The admin role is `is_superuser`.
- The JWT carries `sub` only; permissions are resolved per request and cached by role id.
- Day-one behaviour-identical guest seed; `resolve_viewer` never raises and fails closed to guest.
- 401, not 403.
- One helper wires the media-type and label gates; a `NOT EXISTS` anti-join in SQL.
- Hidden means missing (404); hidden resolver pairs are dropped.
- Pre-existing unauthenticated `data_control` and `system` GETs were closed.
- Accepted residuals: seasonal counts, empty hubs, static covers.
- Field gating works on a copy, never `setattr` on live ORM rows; a field-group registry with a drift test.
- `PUT /permissions` replaces the whole set.
- The label picker is rendered once in Add and Modify.
- `ensure_rbac_seed` is idempotent and runs from both the migration and lifespan.
- `users.role` was kept, then dropped and re-exposed via `column_property`.
- Visibility tests assert on `response.text`.

## 2026-09

### Media sources (spec: 2026-09-04 media-sources)

- **The rule that decides column versus row:** a link the system *acts on* is a
  column; a link that is only ever *displayed* is a `media_source` row.
- By that rule `mal_link`, `imdb_link`, `comicvine_link` and their `*_id`
  partners stay columns — `derivation.py` parses ids out of them, the Fill
  pipeline keys on them, and `checking.py` and `calculation.py` gate on their
  presence. `official_link` and `twitter_link` become rows: `autofill.py` writes
  them and nothing reads them. `anilist_link` was read and written nowhere at
  all.
- **Rejected: dragging the id-bearing links through the polymorphic table** so
  everything lives in one place. The Fill pipeline would then have to find its
  own key through a join, which is strictly worse than a column.
- The Sources card composing from two places is accepted, because the split is
  principled rather than historical — and `SourcesCard` already did exactly
  that.

### Novel units (spec: 2026-09-04 novel-units)

- **One `novel_unit` table with a kind discriminator**, not separate
  `novel_volume` / `novel_arc` tables. "Other" spans volume, story and chapter,
  so separate tables would mean three tabs, three editors and per-type branching
  in every layer.
- **Rejected: structured JSONB on the novel row.** It keeps the single-row
  Sheets round trip and is the established local pattern, but Postgres enforces
  nothing inside it, every edit rewrites the whole array so two concurrent edits
  to different volumes lose one silently, and adding a field means a hand-written
  document rewrite rather than a migration.
- **Unit rows are optional for volumes and authoritative for arcs**, and the
  asymmetry is deliberate. Listing volumes is enrichment, so the denominator
  stays `vol_total_original` / `vol_total_tw` and `vol_fin` may legitimately
  exceed the number of volume rows. An arc row carries `ch_count`, which lives
  nowhere else, so when arc rows exist `arc_total` and `ch_total` derive from
  them; with no arc rows a web novel falls back to the flat `ch_fin` / `ch_total`
  pair.
- **The reading cursor lives on the novel, not on the units.** `arc_fin` counts
  *fully finished* arcs, so the arc being read is `arc_fin + 1` and
  `ch_fin_in_arc` is the position within it. Rollover is normalised server-side
  on write, so the Sheets restore path and a hand-edited sheet get the same
  guarantee as the UI. Rejected: a `finished` boolean or per-unit `ch_fin`, which
  would express non-linear reading that does not happen.
- **Carry stops at the last recorded arc.** If `arc_fin` equals the arc count,
  `ch_fin_in_arc` is left as it stands rather than clamped — an ongoing web novel
  is read into an arc nobody has recorded yet, and clamping would discard that
  progress silently.
- **Derived columns stay stored.** `arc_total`, `ch_total` and absolute `ch_fin`
  are recomputed on every write but remain real columns, because `_TOTAL_FIELDS`,
  `mark_novel_completed`, the dashboard cards and the Plan page already read
  them. This follows the existing `run_sync_*` idiom rather than inventing a
  second one.
- **A unit's name is a key plus a title, per language** — `unit_key`, `name_cn`,
  `name_en`, all optional. One row holding both languages fixes by construction
  the drift bug that two positional JSONB lists had. Fallback is display-time
  only: an empty `unit_key` renders a generated one from kind and position.
- **`vol_total_original` is relabelled, not renamed.** Renaming it would move a
  Sheets header, and headers are the restore contract —
  `credit_roles.LEGACY_SHEET_COLUMN` exists precisely because they must not move.
  Only the label changes, to "Total Volumes (JP/KR)".
- **`progress_display` narrows but stays a stored column**, so an entry that
  wants to override still can and the migration is a no-op for existing rows.

### Studio entity (spec: 2026-09-04 studio-entity)

- **Four plain nullable name columns** — `name_en`, `name_cn`, `name_jp`,
  `name_alt` — with a CHECK that at least one is set, replacing a NOT NULL
  `name_native`. Chosen because it is the shape the media tables already use.
- **Rejected: keeping `name_native` as a derived cache** of the display name. It
  would leave the unique constraint and resolver untouched, but the migration and
  Fill/Pull both write around the API, so the cache would go stale exactly where
  it matters.
- **Rejected: a `studio_name` alias table.** The most honest model — it is what
  `_find_by_name` already pretends is true — but it diverges from every other
  name-bearing table and complicates every form, for four fields.
- **`country` is a plain String column.** `system_option` holds values no code
  branches on, which country qualifies as, but `media_tag` keys on
  `(media_type, entry_id)` and a studio is not a media entry, so options would
  need a new link table. A plain column can be promoted later without breaking
  readers.
- **The display name is chosen per row**, not by a hard-coded chain:
  `display_name_field` holds `en | cn | jp | alt` or NULL, resolving to the
  chosen field, then `en → cn → jp → alt`, then `""`. This is the first entity in
  the repo where the choice is data rather than code — every other display name
  is a chain written into the model.

### Person entity (spec: 2026-09-04 person-entity)

- **One role vocabulary of five**, with `CREDIT_ROLES` and `PERSON_ROLES`
  collapsed into the same list: `director`, `producer`, `composer`, `author`,
  `illustrator`. `studio` stays a credit role with no person role. The six labels
  that vary by media type are **derived, not stored** — `author` renders 原作 /
  Author / Writer and `illustrator` renders 作畫 / Illustrator / Artist.
- **Rejected: keeping `media_credit.role` on its own vocabulary** and mapping it
  onto `(person_role, scope)` in code. It avoids migrating credit rows, but the
  two-vocabulary split that this change exists to remove would survive in the
  stored data and every reader would need the map.
- **Every `person_role` row carries a scope, and `scope` is NOT NULL.** There is
  deliberately no unscoped "offered everywhere" state, which is the opposite of
  `system_option_scope` — and the difference is the whole point. Under "zero means
  everywhere", the *first* scope row flips a value's meaning from all media types
  to one, which is the bug ruling R27 had to ban auto-scoping for tags to avoid.
  Person credits *are* auto-scoped, so copying the tag rule would rebuild that
  bug; removing the "everywhere" state makes auto-scoping purely additive and the
  trap structurally impossible rather than merely mitigated.
- The cost is two similarly-named `scope` columns meaning different things, paid
  for with a comment on `PersonRole` and a warning in the UI.
- **A credit write sets both role and scope.** Crediting 原作 on a manga gives the
  person `(author, manga)`, so a director arriving through Fill or Pull appears in
  the dropdown without an admin visiting a form. `director_scope_for()` and
  `DIRECTOR_ANIME_MEDIA_TYPES` were deleted: the scope *is* the media type.
- **An ambiguous name raises rather than picking a winner.** `_find_by_name`
  returns None on zero matches, the row on one, and **raises on two or more**.
  `resolve_person` is find-or-create and runs on every automated write path, so a
  false match silently attaches one person's credits to another; with names spread
  across four columns, two people holding 高橋 in different columns are two legal
  rows. Rejected: narrowing which columns are searched — the Sheets round trip
  requires a display name written from any of the four to resolve back, so the fix
  belongs at the ambiguity, not the width. Raising turns a silent wrong match into
  a visible per-row failure naming both candidates, which the pipelines already
  report and the duplicate-check page already exists to resolve. `Studio` inherits
  the same behaviour through the same function.

### Novel fill from Open Library (spec: 2026-09-05 novel-openlibrary-fill)

- **The stored id is an anchor book, not the entry.** One entry may cover several
  books and no books API has an identifier for "the trilogy as one thing", so the
  work id names book 1. Fill writes only what is true of the whole entry when read
  off the anchor — `release_date`, `cover_image_file`, the author credit — and
  **refuses** what the anchor cannot know: `end_date`, `vol_total_original`,
  `serialization_status`.
- **Rejected: searching by title and merging the result set.** Fuzzy matching
  across editions, box sets, audiobooks and reprints picks the wrong record
  silently, and a live probe found Open Library's title search unreliable even
  when the book exists.
- **Open Library over Google Books.** Google wins on publisher and page count,
  neither of which is written here; against that it needs a new API key whose
  keyless quota is *already exhausted* from this IP (verified: HTTP 429), and its
  volume ids are edition-specific where Open Library work ids survive reprints.
- **The date comes from the earliest edition, not the obvious field.** A live
  probe found `work.first_publish_date` unpopulated on every work checked, and
  earliest-edition-year beat `search.first_publish_year` (Gatsby 1925 vs 1920)
  and never lost.
- **Year precision is not a compromise.** Comic Vine already writes
  year-precision `release_date` fill-only, and `ck_novel_release_date_iso`
  already accepts a bare year.
- **Fetch only what is missing** — 1 to 3 calls driven by flags, where every
  other client in the repo fetches unconditionally. The reason is payload:
  `editions.json?limit=1000` returned 1000 entries for one book, and because
  writes are fill-only an entry that already has a `release_date` can never use
  that response.
- **`covers` uses `-1` as a "no cover" sentinel**, so an unfiltered `covers[0]`
  eventually downloads a 404.
- **MAL wins when both ids are present.** Tenrai returns strictly more, so
  `mal_link` takes precedence and Open Library fills only where MAL is absent —
  keeping novel's fill path a routing choice rather than an orchestration like
  `imdb.py`'s TMDB + OMDb merge.
- **Per-volume ids were rejected for v1, not ruled out.** Putting a book id on
  each `novel_unit` row is the *correct* model and would reuse the units
  machinery, but it costs a column, N calls per entry, a fill path for child rows
  that nothing else has, and a link field per volume — for the minority entry
  shape. The two are additive: the anchor stays the entry-level date and cover
  source even after volumes gain their own ids.

### Seiyuu and characters (spec: 2026-09-05 seiyuu-character)

- **The cast list has exactly one home.** `character_casting` is the only cast
  record, and an anime's seiyuu list is *derived* by walking its castings. **No
  `media_credit` row with `role="seiyuu"` ever exists.** Rejected: keeping both,
  which gives one fact two sources of truth that can silently disagree — adding a
  casting would not add the seiyuu to the anime's cast.
- **`seiyuu` stays in the one vocabulary, with a new `credited_via` axis.**
  `CreditRole` gains `credited_via`, and `seiyuu` declares
  `credited_via="character_casting"`. Rejected: splitting `PERSON_ROLES` into its
  own tuple, which rebuilds the two-lists-that-drift problem the 2026-09-04
  collapse removed. Rejected: deriving seiyuu-ness from casting rows with no
  `person_role` change, which fails the case `PersonRole` exists for — a seiyuu
  added today must appear in the dropdown before their first casting exists.
- **A character has no owner and links to many entries.** An earlier design gave
  `character` a nullable `franchise_id`; rejected because a character appears in
  entries that need not share a franchise.
- **No `language` column** on castings. It would read "Japanese" on every row
  until the day a dub is entered, and complicate the unique key. Dubs are a later
  widening and adding the column then is additive.
- **Casting is per entry with no default.** Rejected: a NULL entry meaning "her
  usual seiyuu" with overrides — every read would resolve override-then-default
  and "who voices her here" would have two answers. The casting row *is* the
  record, so recasts are free.
- **The table is `character_casting`, not `character_appearance`.** "Appearance"
  reads two ways, and the moment the row carries a `photo_file` the wrong reading
  wins — the same ambiguity `CLAUDE.md` tracks for the word "label".
- **Character names carry no unique constraint**, unlike `person` and `studio`.
  A human's or company's full name is nearly unique; "Yuki" and "Ichika" recur
  across unrelated works, and with no owning franchise there is nothing to scope a
  constraint to. This is a real divergence from the two sibling tables and is
  commented as one, or a future reader will "restore" the missing constraint.
- **Consequence: `POST /api/character` is a plain create, not find-or-create.**
  `POST /api/person` is find-or-create and safely so, because two spellings of one
  director really are one human. The same rule on characters would unify the Yuki
  of one work with the unrelated Yuki of another — exactly the collision the
  missing constraint accepts as normal. Disambiguation moves to the UI: the
  combobox lists existing matches *with the entries they appear in*, and minting a
  new row takes an explicit choice.
- **Deleting a seiyuu must not delete the character's casting.**
  `media_credit.person_id` is `ON DELETE CASCADE` because the credit *is* the
  person's link to the work; a casting is the *character's* link, so
  `character_casting.person_id` is **`ON DELETE SET NULL`** while `character_id`
  cascades.

### Games as a media type (spec: 2026-09-06 games-media-type)

- **One `games` table, not two.** A DLC is a `games` row with
  `game_type = "DLC"` and a self-FK `base_game_id`. The Anime / Anime Movie
  split exists because those are different metadata shapes from different
  sources; a game and its DLC share nearly every column and differ mainly in
  having a parent. It also keeps the cross-table discriminator space small —
  `MEDIA_TABLES` gains one key rather than a pair, so notes, quotes, relations,
  tags and credits each gain one value. **`base_game_id` stays nullable**: a DLC
  is often entered before its base game, and a write that fails on ordering is
  worse than a link filled in later.
- **Completion is three axes, not one dropdown.** An early draft had a single
  six-value `completion_level`; it was three questions in a trench coat with
  incoherent ordering. Now `completion_level` is a genuine ladder that statistics
  can sort on, `all_endings` is orthogonal (every ending can be seen on a
  main-story run, or missed on a Completionist one), and achievements are a
  **count**, because they move independently and in-game 100% and full
  achievements routinely disagree.
- `completion_level` is independent of `playing_status`: *Active Playing* +
  *Main Story* is the common state of having rolled credits and still playing.
  `mark_game_completed` sets the status and leaves all four completion fields
  alone — only the user knows the depth.
- **Ownership lives in `game_copy`, not `media_source`.** An earlier draft put
  it on `media_source`, reasoning that "where can I watch this" and "which
  storefront do I own this on" are one question. That held at one field and broke
  at six — at that size it is a purchase record, and putting it on a table shared
  by nine media types means six columns meaningless for eight of them.
  `media_source` is **unchanged**, and the split is *where can I play* versus
  *what do I own*. Entry-level ownership is **derived** through the registry's
  `extra_filters` hook with an `EXISTS` subquery, so there is nothing to keep in
  sync.
- **Playtime is the progress unit**, being the one number every game has.
  Estimates are three columns matching the three public tiers — and they come
  from **IGDB, not HowLongToBeat**, which publishes no official API; what
  circulates is an undocumented internal endpoint that breaks when the site
  changes. HowLongToBeat survives as a `media_source` link.
- **IGDB has no crew or staff data at all** — no directors, composers or
  writers, and no people endpoint. The credit design follows that honestly: a
  game's **developer is its `studio`** (no new `developer` role), `publisher` is a
  new role and new target, and `director` and `composer` are widened but
  hand-entered. `author`, `illustrator`, `producer` and `seiyuu` are not extended
  to games.
- **Player type and genre are tags, not columns**, and multi-value is what makes
  the awkward cases vanish: Minecraft is `{Single-player, Multiplayer}` and needs
  no "Both", PvPvE is `{PvE, PvP}` and needs no compound value. `game_genre` and
  `game_theme` stay separate because IGDB draws the same line — mechanical versus
  thematic.
- **A new note shape, `SHAPE_NAME_ENTRIES`, on a nullable JSONB `note.entries`.**
  A guide is a name plus an ordered run of items that are each either a note or a
  link, which none of `title` / `content` / `links` holds. Rejected: widening
  `links` to hold richer objects — no migration, but `links` would then mean
  plain URLs in seven sections and objects in two, and every reader would have to
  know which.
- **Publisher becomes an entity, with a separate `publisher` table rather than
  reusing `Studio`.** Reuse would give companies that both develop and publish
  one row instead of two, but most publisher values are Taiwanese distributors
  that never developed anything, and putting them on `/library/studio` would make
  that page mean something vaguer. The duplicate-row cost is accepted and narrow.
  This is a **schema** change, not just registry data: `media_credit` guarded
  `num_nonnulls(person_id, studio_id) = 1`, so a third target needs a column, a
  widened CHECK, a widened unique constraint, and a third case at roughly ten
  code sites — one of which (`credits.py`) had `if target == "studio": … else:`
  where `else` **means person**, so a publisher role would silently have created
  a `Person`.
- **One inherited gap was fixed rather than copied:** deleting a studio does not
  call `delete_cover_image` — that cleanup exists only for media entries.
  `Publisher` does not inherit the leak.
- **Vocabulary is Chinese; IGDB's English is an alias.** A new
  `system_option_alias` table answers "what does an external source call this
  value", taking the same shape as `system_option_scope` and
  `system_option_usage` so a reader who knows those understands it on sight. An
  IGDB value with no alias row is **logged, not silently dropped** — a new genre
  should surface as a gap in the Options page, not vanish. Rejected: a Python
  dict in the client, which would have worked but needs a deploy to retranslate.
- **Scope rows are mandatory when seeding game vocabulary.** A value with no
  scope rows is offered *everywhere*, so without them 角色扮演 leaks into anime's
  genre picker — the exact failure ruling R27 was written about. This is a
  seeding requirement with a test.

### Steam integration (spec: 2026-09-06 steam-integration)

- **The appid comes from IGDB**, which already carries it in `external_games`
  where the Steam row is `category = 1`. The link is **synthesised** from the
  appid rather than read from `websites`, so its shape is ours and stable.
- **A hand-typed link wins**, via an extractor mirroring the IGDB one, including
  its rule that an unparseable link leaves an existing id untouched. The game
  spec runs both extractors, as novel already does.
- **One Fill pass does the whole job** for a game entered with only an IGDB
  link: extract the IGDB id, fetch the IGDB record which writes `steam_appid`,
  then run the Steam phase which reads the appid just written. A game with no
  Steam presence never gets an appid and the phase returns immediately — an
  ordinary outcome for console-only entries, never logged as an error.
- **Two hosts, two auth stories, and the split is deliberate.** The storefront
  (`appdetails`) needs **no configuration whatsoever** and serves prices,
  Metacritic and the achievement total; the Web API needs a key and a steamid for
  playtime and achievements earned. A missing key, missing steamid or private
  profile skips only the progress phase with one warning and leaves prices
  filling normally.
- **`GetOwnedGames` is fetched once per run, not per game** — it returns the
  whole library with `playtime_forever` in one response, so playtime costs
  nothing per entry.
- **The cached library also decides whether to ask about achievements at
  all.** `GetPlayerAchievements` answers `403 "Profile is not public"` for an
  app the account does not own, on a fully public profile with a valid key —
  verified against the live API: `200` for an owned app, `400 "Requested app
  has no stats"` for an owned app with no schema, `403` for an unowned one. A
  tracked game that is not a Steam purchase is ordinary here, so the appid is
  checked against the library first and the request is skipped rather than
  spent on a warning that names the wrong cause. The skip is conditional on
  the library being **known**: an unreachable one leaves ownership unknown and
  the call is still made, so the fix cannot mask a real privacy failure.
- **Steam, not IGDB, sets the pace of Fill Game.** The storefront's unofficial
  ceiling is ~200 requests per 5 minutes per IP, so at three calls per game a
  300-game backfill runs 20-25 minutes. A sliding-window limiter is the guard and
  a `budget` hook stops a Fill All cleanly rather than blocking.
- **`steam_progress_sync` is a per-entry lock** for the game owned on Steam but
  played elsewhere — 200 hours on PS5, 2 on Steam, which a Replace would
  otherwise overwrite. It governs the two progress columns and nothing else.
- **Two guards on every progress write**, in order: the lock, then **skip on 0 or
  None**. The zero guard is the safety net for entries not yet flagged — a game
  owned but never launched reports `playtime_forever = 0`, and without it the
  first run would wipe a hand-typed figure before anyone had reason to set the
  lock.
- **`GAME_FIELDS_TO_FILL` is deliberately not extended.** Adding price or
  Metacritic to the missing-values test would leave every free, unrated or
  achievement-less game eligible forever — the same trap that keeps the genre
  tags out of it. Eligibility is instead "has an appid and Steam has written
  nothing at all".
- **Consequence worth tracking:** four more columns become overwrite-on-every-run
  fields, so the "exactly three are overwritten" claim in `catalog.py` and
  `external-apis.md` became seven and had to be corrected in the same change.

### Public ids and slug URLs (spec: 2026-09-07 public-id-slug-urls)

- **`/<type>/<public_id>/<slug>`** — a stored per-type sequential integer, with
  the slug decorative and lookup on the id alone. This is the standard shape when
  the primary key is a UUID, and what every comparable catalogue does: MyAnimeList,
  TMDB, IMDb.
- **Rejected: a truncated UUID.** It needs no migration but reads as a UUID that
  got cut off, which is exactly what the change exists to remove.
- **Rejected: a random short code.** Those are the convention where the URL *is*
  the access control — unlisted videos, share links. Here RBAC and content labels
  decide visibility, and `_get_or_404` already returns an identical 404 for a
  hidden entry and a nonexistent one, so enumeration reveals nothing the library
  page does not.
- **The accepted cost:** `public_id` leaks collection size and creation order,
  which for a personal collection shown to friends is not a secret worth uglier
  URLs. Deletions leave permanent gaps; ids are never reused.
- **No back-compatibility.** Bare-UUID browser URLs stop working.
- The slug derives from a **Latin-first** name chain, independent of the CN-first
  display name.

### Publisher entity migration (spec: 2026-09-07 publisher-entity-migration)

- **One role, not two.** A TW licensor (木棉花) and an original publisher
  (Marvel) share the `publisher` role. Rejected: a separate `distributor_tw`
  role — a distributor on an anime is the same *kind* of fact as a publisher on a
  novel, and splitting them would put one company's anime and manga credits in two
  vocabularies. The accepted cost, stated plainly: a comic with both an original
  publisher and a TW licensor shows them in one undifferentiated list, and
  `/publisher/:id` cannot say *why* an entry is credited. No data expresses that
  distinction today, so nothing is lost.
- **One role, but the words "Publisher / Distributor" are never shown.** That
  string names the concept, not a reader-facing label. The label varies by media
  type through the `_LABEL_OVERRIDES` mechanism that already makes one `author`
  role read 原作 / Author / Writer: 台灣代理商 for anime, 台灣出版商 for manga and
  novel, 出版商 for comic, 發行商 for game. The distinction is real — the first two
  name a *Taiwanese* licensor, while a comic's publisher is Marvel, the work's
  original publisher.
- **Publishers carry media-type scope, like people**, for the reason
  `PersonRole` already gives: scope cannot be derived from credits, because a
  distributor added today must appear in the anime picker before its first credit
  exists. Without it all 31 migrated rows would be offered on all six types — a
  games publisher suggested as an anime distributor.
- The table keys on `(publisher_id, scope)` with **no `role` column**, because a
  publisher holds exactly one role; adding one "for symmetry" would encode a
  constant. It inherits the two rules `PersonRole` argues for: **no unscoped
  "offered everywhere" state**, and **auto-scoping that is purely additive**.
- **Comic's `publisher_tw` was discarded, not migrated** — measured against the
  database, comic had **0** such rows; the column was defined and never used. The
  backfill still asserts the count is zero and **reports and skips** any row it
  finds, because a restore from an older sheet is the one way one could appear.
- **Entities come from a curated name map, not an automatic split.** The 31
  values mix pure Latin, pure CJK and Latin+CJK in one string (`Muse木棉花`), and
  the existing rule would leave several displaying as a mashed string. An
  automatic split at the script boundary was rejected because it guesses — and
  guesses wrong on `bilibili (GoodShow)`. `name_normalize.py` states the rule this
  codebase follows: *nothing is guessed*.
- **A split row keeps its old spelling so an old sheet still resolves.**
  Splitting `Muse木棉花` changes what the anime tab's column says, which is fine
  forward and dangerous backward: a Pull from a sheet backed up *before* the
  migration asks `find_publisher` for a string matching none of the four columns
  and mints a duplicate. **This holds for only two of the four split rows** —
  `Proware普威爾` and `曼迪 Mightymedia` keep their mashed spelling nowhere, so the
  mitigation for those two is procedural: Backup immediately after the migration,
  so no stale sheet is ever the newest version.
- **Three vocabulary values had no data behind them.** The backfill converts data,
  not vocabulary, so it created 30 entities rather than 33. `bilibili` and
  `Crunchyroll` were seeded anyway and given the `anime` scope — without a scope
  they would be "offered nowhere", defeating the point of seeding them. That scope
  is an **inference, not an instruction**, and correctable in the UI.

### Multi-user catalogue (spec: 2026-09-08 multi-user-catalog)

- **The catalogue is shared; the list is per user.** One `anime` row for
  Frieren, with per-user rows beside it. A new **`media` supertable** holds one
  row per entry across the nine types, carrying identity *plus shared catalogue
  fields* — `display_name`, `cover_image_file`, `franchise_id`, `series_id`,
  `public_id`, timestamps. Detail tables keep every type-specific column and
  their PK becomes an FK to `media`.
- **One `user_media_list` table** with a real FK, holding the superset of
  progress columns. It is wide and null-heavy, and that is accepted rather than
  relitigated.
- **Grouping tiers and watch orders stay shared and admin-curated** — one
  canonical order per series. **Quotes and memes stay universal**, shared and
  unfiltered with no per-user copies. `plan_next` and `seasonal` go per user.
- **Accounts are invite-only and catalogue writes are admin-only.** No public
  registration, no user-contributed entries, no moderation queue, no edit
  history, and no social features.
- **Notes are scoped per section in the registry** — catalogue or personal —
  rather than per note or per user.
- **Rollout is step 0 (identity) first, then phased by media type**, so the
  supertable lands before anything depends on it.
- **Authorization was deliberately deferred**, not settled here. The cookie's
  `secure` flag, the fail-fast on a default `JWT_SECRET_KEY`, session lifetime
  and the `personal_notes` field group were all explicitly left to a later
  design — which became the 2026-09-10 authorization redesign below.

**Sharp edges recorded at design time, all of which held:**

- **Deleting from a detail table orphans the `media` row.** `DELETE FROM anime`
  cascades downward to nothing and leaves the parent behind; the cascade only
  works deleting from `media`. This inverts the natural habit and **no constraint
  catches it** — mitigated by an `AFTER DELETE` trigger per detail table plus a
  test.
- **Eighteen constraints must stay in sync** — nine composite
  `(system_id, media_type)` FKs and nine `CHECK (media_type = '…')` — and
  **Alembic's autogenerate will not write them**. Adding a tenth media type means
  getting them right again, hence the drift test.
- **`display_name` can go stale.** The single new bug class the supertable
  introduces.
- **`media` will attract fields it should not have**, mitigated only by the
  promotion rule and by reviewers applying it.
- **`media_resolver.py` does not dissolve.** `TIER_TABLES` survives to render
  "this note belongs to franchise X". What dies is `(media_type, entry_id)` as a
  *storage* pattern, not as a concept.

### Authorization redesign (spec: 2026-09-10 authorization-redesign)

Supersedes the object half of the 2026-08-29 view-authorization entry above.
The gates as they behave now are `authorization.md`; what follows is why.

- **Two axes that answer different questions.** The **role** answers *what kinds
  of operation may this account perform*; the **access mode** answers *which
  objects can those operations reach in this session*. They must not be one knob:
  if they were, dropping to `safe` would also drop the `admin` grant.
- **Object-scoping vocabulary leaves the role axis entirely.** `label.<key>` and
  `field_group.<key>` stop being grantable to a role and become exclusively what
  a mode carries. Field groups *must* move rather than merely may: **permission
  resolution is a union, and a union can only add** — if `field_group.*` stayed
  grantable on a role, no mode could ever take it away and the narrow tiers would
  be unbuildable.
- **`admin` is a superset, not a break-glass account.** It holds `admin.authz`
  *and* both `manage.*` permissions and stays the daily account; `super` is
  "admin minus the ability to change who may do what". The original break-glass
  design was rejected as more friction than the risk warranted — it put a password
  prompt in the middle of any task that turned out to need both axes. **The
  consequence is accepted and stated:** the account in daily use can regrant
  itself anything, so a compromised daily session is a total compromise.
- **A mode never changes which *kinds* of operation an account may perform** — it
  never removes `manage.catalog` or `self.list`. It scopes two vocabularies:
  content labels (whether an entry exists for you at all) and field groups (which
  columns of a reachable entry you see). An earlier wording, "sight only, never
  writes", was wrong in its second half.
- **Narrowing is instant; widening asks for the password again.** So a browser
  left logged in at `safe` is actually safe. A session starts in the account's
  *chosen default*, not the narrowest — you just typed your password, so landing
  wide is not a new grant, and always landing narrow would make the widening
  prompt routine, at which point a prompt typed through by reflex has stopped
  being a control.
- **A per-account adjustment can only remove; a mode is a ceiling.** So a mode
  name on the user list is a trustworthy upper bound, and widening a mode later
  reaches everyone not explicitly narrowed.
- **Two *typed* link tables, not one generic `access_mode_grant(permission
  text)`.** Neither has a column in which `manage.catalog` or `admin.authz` could
  be stored, so "a mode scopes objects, it never grants powers" is a schema
  guarantee rather than a review rule.
- **Writes follow reads, against the ACTIVE mode.** If `GET` answers 404 for
  you, every write to that id answers 404 too. Rejected: binding writes to the
  account's *ceiling*, which would have the server 404 a `GET` and then accept a
  `PUT` for the same id. The precedent is uniform — Postgres RLS applies one
  `USING` clause to `SELECT` and `UPDATE` alike, and OWASP ranks the inverse as
  API1:2023, Broken Object Level Authorization.
- **401 and 404, and 403 disappears.** `401` means *you may not do this kind of
  thing*; `404` means *this object is not yours to see*, and is the same message a
  genuinely absent row gets — **because a 403 confirms the row exists exactly as
  surely as a 200 does.**
- **Four Sheets tabs need `admin.authz`.** Pull All restores `Users` (including
  each account's role), `Content Label`, `Media Content Label` and `Franchise
  Content Label`, and the sheet is editable by anyone with Google access — so a
  `super` could type `admin` into the Users tab and Pull themselves a promotion
  without ever holding `admin.authz`. Those four tabs are skipped and reported;
  every other tab restores normally. Rejected: requiring `admin.authz` for the whole pipeline,
  which would stop a helper restoring the catalogue after a bad import. **Note the
  direction:** Backup (local → sheet) is not an escalation path and is
  unrestricted; only Pull writes authorization data into the live database.
- **`manage.pipelines` is unscoped on the object axis, and only runnable from an
  unscoped session.** A pipeline rewrites entries with no visibility test, so its
  blast radius equals `admin.authz`. What stops that being a bare trust assertion
  is a session-level rule: the pipeline routes require the active mode to carry
  *every* content label and *every* field group — **computed, never a named
  mode**, so adding a label later cannot silently widen the qualifying set.
  Rejected: scoping the runner — the sheet holds exactly one version of the data
  and Backup overwrites every tab, so a Backup from a narrowed session would write
  a *partial* sheet over the complete one, turning an information leak into silent
  data loss.
- **`media_type.*` stays on the role axis**, the one arguable boundary. "May I
  see Games" is object-shaped, but it says what an account is *for* rather than how
  careful this session is being.
- **The guest mode is `safe`, resolved by key, and this reversed a decision.**
  The spec first put an `is_guest_default` flag on the mode, rejecting a literal
  key lookup because editing `safe` for yourself would silently republish to the
  internet. That rejection was the mistake, and it is worth keeping as a worked
  example of a design argument that did not survive contact with the seed: the
  objection was *equally true of the flag*, because the seeder flags `safe` and
  nobody ever moved it. The flag defended a scenario that does not occur, and
  charged for it in the one that does — a column an admin can edit is a column a
  Pull All, a migration or a hand-edit can move to `unrestricted`, publishing
  every labelled entry to the anonymous internet while looking like a successful
  restore. **The live risk is unchanged either way and is stated rather than
  designed around:** widening `safe` widens what the internet sees, immediately.
- A logged-out visitor gets **no mode switcher at all**, not a disabled one —
  `held_modes()` returns `[]` without an account, so other modes are never
  advertised to anonymous visitors.
- **`remark` becoming per-viewer had to land in one commit.** It is a class-level
  `column_property` and a scalar subquery cannot know who is asking, so serving it
  per-author and relaxing the one-remark-per-owner index had to happen together.
  Doing only the second is **worse than doing neither**: today a second account's
  remark is refused loudly by the database, and after a half-fix it would be
  accepted and then invisible — a data-loss shape rather than a limitation.

### Clean orphaned data (spec: 2026-09-11 clean-orphaned-data)

- **The sheet is allowed to be ahead of the database, and there is no freshness
  gate.** The obvious rule — "back up first, so the sheet reflects local truth" —
  is exactly backwards here: in the workflow that creates the garbage, the sheet
  is *deliberately* ahead, because the machine that performed the deletion wrote
  it. Running Backup first would re-write the local garbage into the sheet and
  destroy the only evidence the diff has.
- The cost is that a row created locally since the last Backup looks identical to
  an orphan. Handled in the review UI rather than by refusing to run: the report
  carries the last Backup timestamp and each candidate's `created_at`, and
  post-Backup rows are excluded from select-all and marked.
- **Tiers and entries only.** Vocabulary and entity tabs are excluded because
  deleting a `system_option` or a `person` does not remove a row the user
  reviewed — it silently rewrites every entry citing it through `ON DELETE
  CASCADE`. An orphaned option is clutter; an orphaned entry is divergence, and
  only the second is reviewable one row at a time. Authorization tabs are excluded
  for a second, independent reason: a delete path into `Users` would let a sheet
  edit remove an account.
- **A candidate must miss on EVERY identity the sheet carries; any single hit
  spares it.** `(media_type, public_id)` is the load-bearing one, and it is
  **stronger than a name match** — Backup writes `public_id` on every entity tab
  and Pull restores it unchanged, which is what keeps the two machines agreeing on
  the ids in URLs. So a rename on one machine does **not** make an entry look
  orphaned, which a names-only rule would have got wrong.
- **The asymmetry is deliberate:** a false negative keeps one piece of garbage for
  one more round, which costs nothing; a false positive deletes a real entry and
  everything cascading from it.
- **An identity rule borrowed from an upsert path must be re-derived before it
  gates a delete.** This design originally copied `pull.py`'s id-less matching
  rule because it was the identity rule the codebase already had for these tabs.
  It was sound where it came from and would have destroyed data here — an entry
  renamed on the other machine misses on every name. Worth generalising beyond
  this feature: a rule that is safe for *upsert* is not automatically safe for
  *delete*, because the failure directions are opposite.
- **Prefixes must be read, not guessed.** The tier prefixes are not uniform
  (`collection_`, `franchise_`, `series_`) and the entry ones are worse —
  `tv_name_en`, not `tv_show_name_en` — which is a second reason entries are
  matched on the `Media` tab rather than on their detail tabs.

### Admin holds no user data (spec: 2026-09-12 admin-holds-no-user-data)

- **The installation owner is a flag on the user row**, with a partial unique
  index so at most one account holds it. Rejected: an env var — per-machine, so
  the two databases could silently disagree about who owns the collection, exactly
  the drift the Sheets round trip exists to prevent. Rejected: a heuristic over
  roles, ambiguous the moment a third account exists.
- The flag rides the Sheets `Users` tab so both machines agree after a
  Backup/Pull cycle — and `parse_user_from_sheet` is an **explicit projection, not
  a column sweep**, so the column has to be named there or it will not travel.
- **The fallback never hard-fails**: alphabetically-first non-superuser account,
  else the first account. `user_media_list.user_id` is NOT NULL and a restore has
  to file its rows somewhere.
- **`self.*` is ownership, not privilege, so the superuser short-circuit does not
  cover it.** "May do anything to the system" and "has a personal library" are
  different claims, and conflating them is what put user data on the admin
  account. Expressed as one condition in the permission model rather than as
  refusals scattered through the write routes — **a rule spelled out in twenty
  routers is a rule that will be missing from the twenty-first.**
- **Authorship is not ownership, and `author_id` records who wrote the row, not
  who owns it.** Reassigning those is editing a record of authorship. They were
  moved anyway so the rule is verifiable by counting — sound here because the
  owner is both accounts, and explicitly noted as not generalising. **`admin` will
  author catalogue rows again**, because quotes, memes and catalogue notes are
  `manage.catalog` writes; "zero rows" is permanent for ownership and
  true-as-of-today for authorship.

**What this spec got wrong**, kept because a spec amended only forward teaches
nothing:

- **It under-counted the blast radius by a factor of nine.** It reasoned
  carefully about three routers and said nothing about tests — yet the change
  touched fourteen test files, nine of them because they had been written to
  drive personal endpoints as `admin_client`. The tests encoded the very
  assumption being removed, so "a rule expressed in one condition" was true of the
  source and false of the work. **A spec that sizes a change by counting
  production call sites will do this every time.**
- **A test had been asserting the bug**, in a file whose docstring called it "the
  whole point of the `user` role". Generalisable: when a rule is removed, grep the
  *test names* for the rule's old wording and read them as claims rather than
  labels.
- **Two doc claims were wrong before the work started** and were found only by
  grepping — `api.md` said plan-next writes "stay admin-only", which they never
  were, and three places in `authorization.md` said a superuser "holds every
  permission implicitly". The spec did not budget for the doc sweep, and the sweep
  is where both were caught.

### AniList scores (spec: 2026-09-12 anilist-api)

- The cache is read **in preference to** the network, not instead of it — but
  the spec's phrasing undersold a real gap. `run_replace_single` never calls
  `pre_run`, so every one-entry Replace was one on-demand fetch away from writing
  nothing at all if the fallback had been omitted. Nothing shipped broken, but it
  is a **hook contract** (`pre_run` not firing for a single-entry write) that this
  feature was the first to trip.
- **The overwrite-set count needed conscious widening, not just updating.** The
  count lives in prose in `external-apis.md`, not in a constant, so the tripwire
  test had to be hand-edited with the three new column names. A spec that only says
  "nine fields becomes twelve" reads as if the test would just pass. It would not
  have — **nothing catches a hand-maintained list falling out of sync except a
  person reading the diff.**
- **Real-API verification surfaced no surprise, which is recorded because an
  unsure section that is never resolved teaches nothing.** A live Fill against 40
  anime and 10 manga ids matched 100% of the collection by `idMal`, and roughly a
  third of scored entries carried no all-time rank — confirming "absence is
  normal" on real data rather than on two probed examples.

### Game guides, story and todo notes (spec: 2026-09-12 game-guides-story-todo)

- **"There is no frontend code change" was right for the wrong reason.** The spec
  asserted every shape already had a renderer, and it did — but `systems/notes.md`
  claimed the opposite in two places, and the spec was written without checking
  either. Both doc claims were stale, so **the conclusion held by luck**. Had the
  docs been right, this would have shipped eleven sections rendering null and a
  Sheets round trip that ate their contents. The check that settled it happened
  three tasks too late.
- **The section list was incomplete** — fourteen entries, with `builds_and_mods`'s
  Mod and Tool rows having nowhere to go. Caught while drafting rather than while
  specifying; a migration written from the section list alone would have stranded
  them.
- **The spec was silent on which test database its tests take**, which is where
  the only real hazard lived: `tests/api/conftest.py` runs `DROP SCHEMA public
  CASCADE` on whatever `POSTGRES_DB` resolves to. **A spec for work done during a
  multi-session run should name its database.**
- The one load-bearing claim verified against the code *before* being written
  down — that `sort_index` is per-section — is the only one nothing later revised.

### Image upload (spec: 2026-09-12 image-upload)

- **A two-table media library, not a per-row file path**: an `image` blob table
  and a polymorphic `image_attachment` join, which is the shape ActiveStorage,
  WordPress and Django all land on. Today the path *is* the identity
  (`anime/<id>.jpg`), which makes one image per row a structural limit rather than
  a choice — and would have caused a concrete bug: **replacing an image would
  serve the old one from browser cache, because the URL does not change.**
  Content-addressed storage means a replaced image is a new key, so that bug is
  never written.
- **`owner_id` is deliberately not a foreign key** — there is no single table to
  point at — and the cost is accepted knowingly: nothing in the database stops an
  attachment outliving its owner. The `unused` filter and the orphan tooling find
  those. The alternative, ten nullable FK columns, is worse in every other
  respect.
- **The re-encode to JPEG is the security control, not a format preference.**
  Validation is ordered, each step assuming the last passed, and the size cap is
  checked **before the body is read** — `Content-Length` is a claim from the
  client and cannot be the only check.
- **Uploaded images never travel through Backup or Pull**, and
  `bulk_download_missing_covers` must skip them — `uploaded_by` is how an upload
  is distinguished from a download.

**What this spec got wrong:**

- **The cross-format dedup claim was wrong and impossible.** It claimed the same
  picture arriving once as PNG and once as JPEG would dedup to one row. It cannot:
  JPEG is lossy, so it decodes to different pixels than the PNG it came from, and
  re-encoding two different pixel buffers cannot produce identical bytes. The real
  contract is that **identical pixels dedup and "the same picture" does not.**
- **The storage root it implied was overruled during implementation.** The spec
  never stated the root explicitly, and the plan built from it assumed
  `static/covers/library/` so that `getCoverUrl` would need no change. Uploaded
  images are library images, not covers, and do not belong in the cover tree — so
  the root is `static/` directly, and both URL helpers gained a `library/` branch
  rather than resolving it for free. **A spec that leaves a path implicit invites
  the plan to infer the convenient one.**
- **It never listed `meme` as an attachable owner**, despite "Quote and meme
  images" naming the problem in its own opening paragraph. The omission shipped as
  a 400 on every meme attach and was caught after a task landed, not before.

### Production deployment (spec: 2026-09-13 production-deployment)

The media tracker runs on `homelab`, an HP ProDesk 600 G4 mini, behind a
Cloudflare Tunnel at `media.cg1618.com`. Operating detail lives in
[deploy/README.md](../../deploy/README.md); the machine is
[deployment-selfhost.md](../deployment-selfhost.md). What follows is why the
shape is what it is.

- **The box builds its own image** from a git checkout — `git pull` then
  `docker compose up -d --build`. Rejected: `docker save | ssh docker load`,
  which pushes ~1 GB per deploy over the box's worst link and leaves it unable
  to rebuild itself. Deferred: building in CI and pulling from GHCR, which is
  the conventional answer but would make every pull request build a multi-stage
  image to serve a box one person deploys by hand. Three constraints keep that
  switch to about two lines: no environment-specific values in the image, no
  build args, and an explicit `image:` name beside `build:`.
- **The tunnel is locally-managed, with its ingress in git.** Rejected: a
  dashboard token, which is what Cloudflare recommends and is simpler to set
  up. Which hostnames are publicly reachable is a security decision with
  written reasoning, and in a dashboard the decision is separated from it.
- **The tunnel id lives in `.env`, not in the committed `config.yml`.** The
  design put it in the config; that file then could not be written until the
  tunnel existed. Passing it on the command line makes the ingress map static
  and committable first.
- **`docker-compose.prod.yml` sits at the repository root.** The design put it
  in `deploy/`, reasoning that a second compose file at the root would collide
  with the development one. That was wrong — they collide only on a shared
  *filename*, and Compose never auto-loads this name. What is not wrong is the
  consequence: Compose takes its project directory from the compose file's own
  location and loads `.env` from there, so under `deploy/` every `${...}`
  interpolated to an empty string and the database came up with a blank
  password, while `env_file:` kept working and the app looked fine.
  `tests/unit/test_prod_compose.py` fails if it moves back.
- **Data arrives by `pg_dump`, never through the Sheets pipeline.** Rejected:
  Pull All from the development sheet. Sheets is built for moving data between
  the two dev machines and is lossy where that is safe — it re-resolves
  database-local ids and skips authorization tabs without `admin.authz`. More
  importantly the sheet holds exactly one version of the data, so a third
  participant turns a two-way handover into a three-way sync with no merge.
- **Production has its own sheet, `App Database`, and never reads the
  development one.** Backup overwrites every tab, so the configuration in which
  production knows the dev sheet's id is the one that could destroy the dev
  backup; it should not exist. A new empty spreadsheet is enough —
  `get_google_sheet_tab` creates each tab on first Backup. The spreadsheet
  *name* is cosmetic (`open_by_key` is the only way the app opens one); the tab
  names are not, and `tabs.py` matches them exactly.
- **The restore happens with only the `db` service running, and both passwords
  are rotated afterwards.** `app/main.py` calls `create_all` at import, so an
  app container started against an empty database creates every table and makes
  `pg_restore` collide. And the dump carries the development password hashes
  while admin seeding is skipped when the account exists — the startup log line
  `[System] Admin account verified.` is that branch — so `ADMIN_PASSWORD` is
  never consulted and production would otherwise run on development
  credentials.
- **`restart: unless-stopped`, a `pg_isready` healthcheck on `db`, and one on
  `app` that probes `/api/health` rather than `/`.** `unless-stopped` rather
  than `always` so a deliberate `docker compose stop` survives a daemon restart.
  The app went without any healthcheck while the only available probe was the
  catch-all route, which serves the SPA for any path and so returns 200 with the
  database down; a healthcheck that lies is worse than none. What made one
  honest is an endpoint that opens a session, reads `alembic_version` and
  compares it to the head the running code expects — failing both when the
  database is gone and when the schema and the image disagree. Rejected:
  reporting the revision in the public body. The tunnel routes every path at
  `media.cg1618.com` to `app:8000`, so that would publish the schema version and
  migration cadence to anyone who asks; the detail is gated on
  `manage.pipelines` and the public body is a bare status.
- **No service publishes a port.** The tunnel is the only ingress; `psql` from
  a laptop goes over SSH. There is no open port to misconfigure.
- **`COMPOSE_PROJECT_NAME=media`, and no `container_name:` anywhere.** The
  project name decides the volume, and therefore which database the stack sees;
  a checkout moved or cloned under another name would otherwise come up on a
  new empty volume while the real data sat in the old one. Container names are
  derived from it rather than hardcoded, so there is one place a name is
  written. The dev machines pin the same value for the same reason.
- **Every deploy dumps before it pulls, and rollback rebuilds.** A bad
  migration is the only deploy failure with nothing to recover from:
  `entrypoint.sh` runs `alembic upgrade head` on every start, and `downgrade`
  is not a restore — reversing a dropped column recreates it empty. Rollback is
  three steps, and the third must be `up -d --build`: `git checkout` reverts
  the source, but the code the container runs is baked into the image and plain
  `up -d` reuses it. Rejected: taking migrations out of `entrypoint.sh`, which
  is the textbook separation but makes every deploy two commands with a window
  where code and schema disagree.
- **The tunnel needs two credential files.** Cloudflare's image runs as
  `nonroot` 65532, so the 600 file `cloudflared tunnel create` writes as the
  invoking user is unreadable to the container. Two copies of one secret, each
  owned by its consumer, each still 600. Rejected: `chmod 644`, which widens a
  secret to every user on the box; and `user:` in compose, which bakes a
  host-specific uid into a committed file.
- **The unused Ethernet interface is `optional: true` in netplan.** Without it
  `systemd-networkd-wait-online` blocks on a cable that is not there for its
  full two-minute timeout, then fails, and `docker.service` waits behind it.
  Startup went 2 min 18 s → 23.6 s and `systemctl --failed` went from one
  permanent failure to empty — the second mattering more, because a box that
  always shows a failure teaches you to skim past the command you would use to
  find a real one.

  **Reversed when the cable became the connection.** `optional` was right for an
  interface nobody depended on, and wrong the moment `eno1` was the only one:
  with the WiFi block removed, every interface was optional, netplan generated
  no wait at all, and Docker started 3.7 s into boot, ahead of DHCP. The first
  boot on the cable showed it — `cloudflared` restarted three times on failed
  DNS, and `media-drift` failed once — with nothing left failed to point at the
  cause. So `eno1` is now the interface boot waits on, `routable` with DNS.
  Rejected: keeping `optional` and relying on restarts, because it works only
  for services that retry, and a boot-time timer that fails once reports a
  false alarm until its next run.

**What the design got wrong**, recorded because a design that is only ever
amended forward teaches nothing about its own reasoning: the compose file's
location, the tunnel id's home, and the rollback procedure were all wrong in
the written design and were corrected by running them. Two of the three failed
*silently* — a blank database password behind a working-looking app, and a
rollback that restored old data under new code while the site stayed up and the
row counts came back correct. Both were found by comparing something concrete
against something else, not by reading.

### Off-box backups (spec: 2026-09-14 offbox-backups)

Four host-side scripts on `homelab`, scheduled by systemd timers and alerted
through Healthchecks.io, give the database and the uploaded-image tree a copy
off the box. Detail lives in [deployment-selfhost.md](../deployment-selfhost.md#backups);
this is why the shape is what it is.

- **R2 as the backup target, not the primary store.** Local disk stays the
  source of truth for every read the application does; R2 only ever receives
  copies. `deployment-selfhost.md` cited this decision as living here before
  it actually did — this entry is what makes that citation true.
- **Uploaded images stay on local disk rather than moving to object storage.**
  A backup script that copies ordinary files with `rclone sync` needs no
  application code and works even when the app is broken — which is exactly
  when a restore is needed.
- **Host-side scripts, not an app pipeline**, for the same reason: the backup
  has to work when the app is unhealthy, and a broken app is the case that
  actually matters. `sheets.sh` is the one job that does call into the app
  (`execute_backup`), because Sheets access lives entirely behind that
  pipeline; the database dump and the file syncs do not.
- **The stamp is written INSIDE the dump**, as a row in its own `backup`
  schema, rather than as a JSON file uploaded beside it. Rejected: the
  sidecar-file shape, because a fresh metadata file pairs happily with a stale
  dump and the freshness check passes on data that proves nothing.
- **`source_tables` is read from `pg_tables`** — what production actually had
  at dump time — rather than compared against the SQLAlchemy models. Detects a
  partial dump from the dump's own contents and needs no healthy app
  container to check against.
- **The verify drill's throwaway database runs with `--network none`**,
  rather than as a scratch database inside the live `db` container. Rejected:
  the scratch-database-in-production-container shape, where only a correctly
  set shell variable stands between a drill restore and `--clean` against the
  real data. `--network none` makes the throwaway incapable of reaching
  production by construction, not by convention.
- **One restore implementation, `restore.sh`, with two callers** — the weekly
  drill and a human in a disaster — differing only in their guards, never in
  their logic. A disaster procedure verified by different code from what
  actually runs it is verified by nothing; running the drill against
  `restore.sh` every week proves the 2 a.m. path works, not a description of
  it.
- **Row counts are reported in the drill's success ping, not asserted.** They
  are read just before `pg_dump` takes its snapshot, so a write landing in
  that gap would fail the drill for a reason that has nothing to do with
  backup correctness. A backup system that cries wolf gets ignored, which is
  its own kind of silent failure.
- **`static/covers/` syncs weekly, `static/library/` nightly**, split by
  recoverability on a metered link. A stale cover is re-fetchable from the
  metadata APIs; an uploaded image is not recoverable from anywhere else.
  283 MB of covers is worth spending deliberately, not at whatever hour a
  timer happens to fire — `install.sh` leaves `media-covers.timer` disabled
  until the first sync is run by hand.
- **The Google Sheets Backup is scheduled and automatic, and deliberately
  unverified.** This reverses an earlier decision to leave Sheets manual, on
  the reasoning that a scheduled Backup removes the human gate that used to
  catch a bad write before it overwrote every tab. The R2 dump is the backup
  of record and is restore-verified weekly; the sheet is a current,
  independent second copy whose only check is that the pipeline reported
  success. That asymmetry is deliberate, not an oversight, and is stated
  explicitly in `deployment-selfhost.md` so it cannot become a false belief.
- **A dead-man's switch (Healthchecks.io) rather than an error reporter.** A
  job that runs and fails can report its own failure on the way out; a job
  that never runs at all — box off, hotspot down, timer disabled — executes
  nothing and can report nothing about itself. Only something outside the box
  can notice an absence.
- **Healthchecks' OnCalendar schedule type, not Simple.** Simple measures its
  deadline from the last ping, so a catch-up run fired late by
  `Persistent=true` after an outage pushes the next deadline later, and every
  subsequent late run pushes it later again — the alarm drifts away from the
  schedule it exists to guard. OnCalendar anchors to the wall clock instead:
  04:00 is expected at 04:00 regardless of what happened the day before.
- **`media-sheets.service` and `media-verify.service` declare
  `After=media-backup.service` with no `Requires=`.** The shared `flock` in
  `lib.sh` is a pure mutex — it serialises the four jobs but does not order
  them. Without `After=`, `Persistent=true` firing every missed timer
  simultaneously at boot could let Sheets overwrite every tab before the
  night's dump had run, or let the drill verify against a dump not yet
  finished. `Requires=` was rejected: it would fail Sheets and the drill
  outright on any night the dump job fails, which are meant to be independent
  failure domains reporting to independent alerts.
- **Backup secrets live in `~/media/.env.backup`, not `.env`.**
  `docker-compose.prod.yml` gives the `app` service `env_file: .env`, so
  anything placed there is injected into the running web application —
  including, for these variables, write credentials for the very bucket
  holding the application's own backups.

**What the design got wrong**, found by running it on the box rather than by
reading it — three of the six were invisible from a Windows development machine:

- **The spec's load-bearing sentence for its own second requirement was false.**
  It claimed there is no path out of any script that does not report success or
  failure. There are four, all before `start_job` installs the trap:
  `load_env` failing, a syntax error while sourcing `.env`, `acquire_lock`
  timing out, and an unset `HC_*_URL` aborting under `set -u`. The last is the
  sharp one — a single typo in `.env.backup` yields a job that never reports,
  on every run. `load_backup_env` now validates the names it exists to load,
  and the remaining gap is stated rather than denied.
- **`Persistent=true` does not fire a timer on first activation.** It catches up
  a run missed while the machine was off, but only for a timer that has run
  before; on first enable systemd writes the stamp as of that moment and has
  nothing to catch up. `install.sh` and the setup guide both told the operator
  that enabling had just taken a backup and overwritten the production sheet.
  Neither had happened, and the claim was also the stated reason for deferring
  `media-verify.timer`. The deferral survives on its real reason — the drill
  cannot pass against an empty bucket.
- **The production guard in `restore.sh` failed open.** `[ -n "$(compose ps -q
  app)" ]` captures stdout only, so a `docker compose` failure read as "the app
  is stopped" and let a restore proceed with the app's real state unknown. A
  guard that fails open is worse than no guard, and broken docker tooling is
  exactly the situation a disaster restore happens in. Command substitutions
  are now audited by asking what the script concludes when the command *fails*
  rather than returns empty.
- **`rclone` needs `no_check_bucket` and `no_head` for R2**, and the design
  anticipated neither. Both present as permissions problems: a bucket-scoped
  token cannot perform rclone's pre-flight bucket check (403), and R2 does not
  implement object versioning, so rclone's post-upload HEAD by `versionId`
  returns 501 and a successful upload is reported as failed.
- **The scripts shipped non-executable.** `core.fileMode` is off on the Windows
  development machines, so `chmod +x` never reaches a commit; and the
  `git commit -- <paths>` form this project requires re-reads those paths from
  the working tree, discarding a bit staged with `git update-index`. Every
  timer would have failed at 04:00 through a check that had never been armed.
- **A failed Healthchecks ping was silent.** `|| true` correctly stops a network
  blip failing a backup, and incorrectly discarded the one case that matters: a
  ping URL that is wrong rather than missing, where the job succeeds and reports
  to nowhere. Not failing and saying nothing are different things.

Two things the implementation improved on the design rather than merely
correcting: `source_tables` is read from `pg_tables` — what production actually
had at dump time — instead of from the application's models, which detects a
partial dump and needs no healthy app container; and `After=media-backup.service`
with no `Requires=` was added once it was clear that the shared `flock`
serialises the jobs but does not order them, so a boot catch-up could let the
Sheets overwrite precede the dump it is supposed to follow.

### Continuous deployment (spec: 2026-09-14 continuous-deploy)

A merge to `main` deploys itself. What runs is
[deploy/README.md](../../deploy/README.md); this is why it has that shape.

- **A self-hosted GitHub Actions runner on the box, long-polling outbound.**
  The constraint decides this: no service publishes a port, the only ingress is
  an outbound Cloudflare Tunnel, and the box has no public address, so
  GitHub cannot push, `ssh` or webhook in. Rejected: a `git ls-remote` poll loop
  on a systemd timer — fewer moving parts and it fits the timers already here,
  but deploy logs would live only on the box and there is no approval mechanism,
  which the migration gate needs. Rejected: a signed webhook through the tunnel
  — instant and no polling, at the cost of a publicly reachable endpoint that
  runs deploys, whose safety rests on getting HMAC verification right.
- **The workflow is a trigger; the logic is shell.** Its deploy step is
  `./deploy/deploy.sh --ci` from `~/media`. Rejected: expressing the steps
  as workflow steps, which reads better in the GitHub UI and gives each step its
  own log — and makes the unattended path diverge from the path a person walks
  during an incident. That divergence is the shape of the rollback failure this
  box already had once, where a documented procedure was wrong in a way only
  executing it revealed. `rollback.sh` is run by a human and by the workflow,
  and it is the same script for the same reason.
- **Never from the runner's workspace.** `~/actions-runner/_work/...` has no
  `.env`, none of the bind mounts, and no `COMPOSE_PROJECT_NAME` — so a deploy
  from there comes up on a brand-new empty volume while the real data sits in
  the old one, which looks exactly like data loss.
- **Two lanes, split on whether the merge adds a file under
  `alembic/versions/`.** Without a revision it deploys unattended; with one it
  waits for approval in the `production` GitHub Environment. The gate is not
  about risk in general — it is that a migration is the only change that can
  destroy data, and that `alembic downgrade` is not a restore. An unclassifiable
  push — a zero `before` sha from a force-push — takes the gated lane: a
  needless approval costs one tap, the other error does not.
- **Classification is checked twice, in two places, against two different
  truths.** GitHub compares one push range; the box re-checks against its own
  `HEAD` and refuses unless `MIGRATION_APPROVED=1`. A runner offline across two
  merges leaves GitHub's range covering only the later one, and only the box
  knows how far behind the box is.
- **The rollback ladder reverses schema and never restores data.** Tier 1 is a
  refusal to start, where nothing was touched. Tier 2 downgrades and swaps back
  to `media-app:previous`. Tier 3 freezes and prints what a human needs.
  Rejected: restoring the pre-deploy dump automatically, which would discard
  every write since that dump in order to recover from a failure that usually
  did not touch data at all. Tier 2's message says *"verify your data"* rather
  than *"all good"*, because the most dangerous thing here would be reporting a
  rollback in a way that implies the data came back with it.
- **The downgrade runs from the NEW image and targets a revision recorded at
  dump time.** The new image is the only one holding the revision files being
  reversed — `media-app:previous` has never heard of them, and starting it first
  crash-loops, because `entrypoint.sh`'s `alembic upgrade head` cannot locate a
  revision its own files do not contain (verified against a scratch database:
  `Can't locate revision identified by`). The target is read from
  `alembic_version` by `deploy.sh` and written beside the dump. Rejected:
  deriving it from the git sha, which is a different namespace entirely.
  Rejected: asking `media-app:previous` for its head, which works and answers
  what that image *knows* rather than what the schema *was* — and those diverge
  exactly when a rollback is happening.
- **The downgrade overrides the image entrypoint, and `entrypoint.sh` refuses
  to discard a command.** `ENTRYPOINT` is `entrypoint.sh`, which runs
  `alembic upgrade head` and then uvicorn; a command passed to
  `docker compose run app` arrives as arguments it once ignored. So
  `run app alembic downgrade <target>` re-ran the upgrade that had just failed,
  and the output read as the migration failing twice. `--entrypoint alembic`
  fixes the call; `exec "$@"` when arguments are present fixes the image. Both
  exist because the failure mode was silence, and a single guard against
  silence is one thing believing itself.
- **A detached HEAD that `main` contains is recovered, not refused.**
  `rollback.sh` checks out the revision the dump belongs to, so a rollback
  always ends detached — and `deploy.sh --ci`'s branch guard then refused every
  later deploy, which made one rollback disable automatic deployment until a
  person noticed. Returning to `main` is the whole recovery and is what the
  deploy was about to pull anyway. A feature branch, or a detached HEAD `main`
  does not contain, still refuses; the ancestry test is what separates them.
- **The drift window ages the oldest commit the box is missing.** Ageing the
  newest commit on `main` reset the clock on every merge, so a box that had
  stopped deploying would never alert while anyone was merging more often than
  the window — active development masking a dead runner, which is the failure
  the job exists to catch. A box that is not behind `main` but still differs has
  no oldest-missing commit and no window that can expire, so it alerts
  immediately.
- **`downgrade()` is proven in CI before anything leans on it at 4 a.m.**
  `tests/api/test_migration_round_trip.py` walks upgrade → downgrade → upgrade
  against a scratch database and compares the schema object-for-object, because
  exit codes alone pass for a pair that runs cleanly and lands somewhere else. A
  migration that cannot be reversed in principle declares
  `irreversible = True`; `rollback.sh` greps for that same literal line and
  freezes instead of downgrading. Rejected: an opt-out marker for a `downgrade()`
  that is merely wrong — that is a defect to fix, and a waiver invisible in
  review gets used the first time somebody is in a hurry.
- **`/api/health` retires the no-healthcheck rule rather than contradicting it.**
  The old reasoning was right: the catch-all route serves the SPA for any path,
  so a probe against `/` passes with the database down. The endpoint opens a
  session, reads `alembic_version` and compares it to the head the running code
  expects — so it also fails when schema and image disagree, which is the state
  a half-rolled-back deploy leaves behind and the state every weaker probe calls
  healthy. The public body is a bare status; the revisions are gated on
  `manage.pipelines`, because the tunnel routes every path to `app:8000` and
  there is no such thing as an internal path here.
- **The fifth timer watches for drift, not for deploys.** A runner offline when
  a merge lands queues the job silently, and that looks exactly like success. A
  dead-man's switch on the deploy job cannot cover it — Healthchecks fires on a
  ping missing within an expected period, deploys are irregular so there is no
  period to configure, and a job that never started cannot ping. A daily check
  comparing the box's `HEAD` to `origin/main` has a period, so the switch works.

### Multi-app platform topology (spec: 2026-09-16 multi-app-structure)

Seven personal applications are planned for one box; only the media tracker
exists. This is how they are arranged in git, and why the box's shared
infrastructure does not belong to any one of them.

- **Polyrepo, with a platform repo as the master.** Seven app repositories in a
  GitHub organisation, plus `platform`, which owns `apps.yml`, the cloudflared
  ingress, the shared PostgreSQL, the backup units, the deploy scripts and the
  generic half of `CLAUDE.md`. The master connects the apps by configuration,
  not by git pointers: it knows about them and does not contain them. Rejected:
  a monorepo — `HEAD` belongs to the working tree, so seven concurrently
  developed apps means seven permanent worktrees, which is the cost concurrency
  makes worst, and its advantages are cheap code sharing and atomic cross-app
  commits, the two things explicitly not wanted. Rejected: submodules — the
  parent pins a child sha, so every app change becomes two commits with an
  ordering constraint between them, which is the stacked-PR failure this project
  has already been bitten by, made structural. Rejected: leaving the
  infrastructure in the media tracker, which makes one app a privileged repo
  that every other app's deploy must touch.
- **The organisation is `cg1618-apps`, and every repository is public.** The
  name is not `cg1618` because organisations and user accounts share one
  namespace and a dormant account holds it; the suffix is cheap because an
  organisation name appears in clone URLs and the runner registration URL and
  nowhere else — not the domain, the SSH config, any `.env`, or the tunnel
  configuration. Public is not inertia: on the free plan GitHub grants
  environments with required reviewers, and repository rulesets, only to public
  repositories, and the migration approval gate depends on the first while the
  required-check gate depends on the second. The consequence is a standing rule
  — **no `pull_request`-triggered job may run on the self-hosted runner, in any
  repository** — which is load-bearing security rather than hygiene.
- **The apps share no stack, so the platform defines a contract rather than a
  framework.** Four requirements: a container listening on the port `apps.yml`
  assigns it, a health path it declares, `DATABASE_URL` read from the
  environment, and a `main` branch that is production. Everything else —
  language, framework, migration tool, whether there is a frontend build at all
  — belongs to the app. Where the existing pipeline assumed otherwise the
  assumption became a declared value: `health_path` in `apps.yml` instead of a
  hard-coded `/api/health`, and `migrations_path` as a workflow input instead of
  a hard-coded `^alembic/versions/` grep.
- **One PostgreSQL container, one database and one role per app.** The backup
  machinery — `pg_dump`, the timer, the `flock` that serialises it against a
  deploy — already exists and would otherwise be duplicated seven times, and the
  apps share no data, so isolation at the database level is enough. Rejected: a
  container per app, which buys independent version upgrades and a smaller
  failure domain for roughly seven times the backup configuration; it is the
  change to make if one instance ever becomes the thing that hurts.
- **Provisioning is separate from deploying.** `bin/provision <app>` creates the
  database and the role, revokes `CONNECT` from `PUBLIC` and grants it to that
  role alone. It is its own command because it is rare and needs the superuser
  credential, while deploying is frequent and should hold the least privilege it
  can; folding them together would give every routine deploy superuser rights
  over every app's data. Rejected: Terraform with the `postgresql` provider,
  which adds a state file to store, back up and keep uncorrupted in exchange for
  managing seven `CREATE DATABASE` statements.
- **The deploy pipeline exists once and is called eight times.** One org-level
  self-hosted runner rather than eight registrations, and the pipeline as a
  `workflow_call` reusable workflow in `platform` — the classify step, the two
  lanes, the `production` gate, the exit-2-only rollback — which each app repo
  invokes with its own name, health path and migrations path. Rejected:
  `repository_dispatch` into a central deploy repo, which keeps one runner
  without an organisation at the cost of a cross-repo token and a classify step
  reading another repository's diff. Rejected: a runner and a copy of the
  pipeline per repo, which is eight services to keep alive and eight copies that
  drift.
- **Generated configuration is committed, and CI regenerates it and fails on a
  difference.** The ingress and the apex navigation derive from `apps.yml`, and
  the committed output is what appears in the pull request diff where a person
  reads it. Alongside it, `apps.yml` is validated against a schema, and the
  policy a schema cannot express is asserted separately: no two apps colliding
  on a hostname, a port or a database name, and `journal`, `health` and `money`
  never `public`. The same validator runs again inside `bin/deploy`, on the
  principle the deploy script already follows when it re-checks
  `MIGRATION_APPROVED` rather than believing GitHub's gate. This replaces a
  guard that would otherwise have been lost with the file it protects:
  `tests/unit/test_prod_compose.py` reads the ingress from inside the media
  tracker's suite.
- **`media` becomes a new repository, not a rename or a transfer.** Seeded with
  a single commit of the tracked tree; the 2,238 commits and 216 pull requests
  of `cgentle1618/anime_site` do not travel, and that repository is kept rather
  than deleted — archived read-only and private, so its 216 pull request
  discussions survive at their URLs for the owner, and for nobody else. The cost is
  deliberate and has one consequence worth remembering: `rollback.sh` recovers
  by checking out the commit a dump belongs to, so until several releases have
  accumulated there is no earlier release to return to and only the database
  half of a rollback is available.
- **A seed commit carries file modes, and a Windows machine silently drops
  them.** The tree was seeded from a checkout with `core.fileMode` false, so all
  ten of the deploy and backup shell scripts entered the new repository as
  `100644`. Nothing reports it: `git status` is clean, the blobs are identical,
  and the only visible symptom would have been `Permission denied` from
  `deploy.sh` and the backup timers *after* the production checkout was
  repointed. Repairing it needs `git update-index --chmod=+x`, which is the one
  method that works from the machine that caused it — changing the mode on disk
  does nothing when git is told not to look at it. Whatever seeds a repository
  this way should be checked with `git ls-tree` against the source, not
  `git diff`, which reports contents.
- **The two repositories share no history, so pushing a branch between them
  does not fail — it grafts.** A branch pushed to `cg1618-apps/media` from a
  checkout of the old repository arrived carrying its full ancestry as a second
  root, at identical shas, while `main` and `dev` stayed the single seed commit.
  Git has nothing to object to: there is no conflict, no non-fast-forward, no
  warning. The branch was deleted and the rule is that every branch on the new
  repository is cut from a fresh clone of it. Note that deleting a branch makes
  its commits unreachable rather than gone — GitHub serves an unreachable commit
  by sha until it collects it — so the seed's cleanliness is a property of
  `main` and `dev`, not a guarantee about the whole repository.
- **`set -a` on an application's `.env` exports `COMPOSE_PROJECT_NAME` into
  every later compose call, including calls aimed at a different project.**
  `deploy.sh` and `backup/lib.sh` source the app's `.env` to get
  `POSTGRES_USER` and `POSTGRES_DB`, which also exports `media` as the project
  name - and an exported variable beats the `.env` sitting beside the
  platform's own compose file. Compose then looked for service `db` in project
  `media` and reported "service db is not running", with PostgreSQL running one
  container away. The fix is `env -u COMPOSE_PROJECT_NAME` on the platform-
  facing invocation only, never on the one that means this project. This is the
  familiar "which volume am I really on" hazard, and the split gave it a way to
  cross repositories.
- **A fix to `deploy.sh` cannot deploy itself when the bug is before the
  `git pull`.** The dump runs first, so a broken dump step refuses the deploy
  that carries its own repair, and the second failure looks like a second
  defect. It is not: it is the old script still on disk. One manual `git pull`
  on the box breaks the cycle, and the re-run then proves the pipeline for
  real. Worth remembering before assuming a repeated failure means the fix was
  wrong.
- **The stack split in two, and the app's configuration did not change.**
  PostgreSQL and the tunnel moved to `cg1618-apps/platform`; this repository
  runs one service. The database kept the network alias `db`, which is the
  hostname the application already connected to, so the box's `.env` - the one
  file there that cannot travel and cannot be reconstructed - was not edited
  during the cutover. The data moved by dump and restore into `cg1618_pgdata`
  rather than by reusing `media_pgdata` under a new project: Compose prefixes a
  volume name with its project, and a volume named after one application
  holding every application's data would be a lie that outlives whoever
  shrugged at it. `depends_on` was traded for `restart: unless-stopped`, because
  Compose cannot order services across projects.
- **The registry landed before anything that reads it.**
  `cg1618-apps/platform` holds `apps.yml`, a JSON Schema for one entry's shape
  and `bin/validate_apps.py` for the policy a schema cannot express —
  uniqueness, which is relational and so invisible to a per-entry validator, and
  the rule that `journal`, `health` and `money` are never `public`. Both run in
  CI on `ubuntu-latest` and will run again inside `bin/deploy`. The generators
  that consume the registry — the cloudflared ingress, the apex navigation —
  were deliberately left out: both generate files that have not moved yet, so
  building them now would produce output nothing reads and a drift check against
  a file the box does not use. They arrive with the steps that move them.
- **A pull request opened while Actions are disabled never acquires its check.**
  The required-check ruleset then blocks it permanently, because the event that
  would have started the check has passed. Closing and reopening the pull
  request fires `pull_request: reopened`, which `ci.yml` accepts. This is the
  ordering trap in enabling a repository's gates before its Actions: the gate
  exists, and nothing can satisfy it.
- **The `structured` note shape: one JSONB column, not a dozen sparse ones.**
  The game guide sections need a dozen different field sets — a variant, an
  alias, a region, a tier, four stat values, and lists nested inside one row (a
  build's armour pieces, a team's members). Three options were live. A column
  per field was rejected because `note` is shared by all twelve owner types and
  its column list *is* the Google Sheets Note tab: a dozen mostly-blank columns
  would ride on every owner's rows to serve `game` alone, and each later field
  would be another migration — against the registry's own promise that a
  section is an entry and a shape is at most one column. A component and a
  validator per section was rejected as a dozen near-identical files. What
  landed is a registry-declared field spec plus one JSONB column.

  The thing that makes it cheap is that **most fields already have a column**.
  Mapping all thirteen guide sections first showed that a name is `title`, a
  description is `content`, links are `links`, and the closed dropdowns are
  `kind` and `status` — so several sections (`controls`, `skills`, `endings`)
  need no blob at all, and `fields` carries only the leftovers. Had that
  mapping not been done first, the obvious design was "everything in the blob",
  which would have hidden every name and description from the sheet, from
  search and from every existing reader of those columns.

  The nested lists settle the remaining argument: no column can hold one, so a
  JSONB column was arriving whichever way the scalars went. The cost is real
  and worth stating — the leftover scalars have no database-level type and no
  column to filter on — but the values worth filtering (a beaten status, a
  completion status) land in the real `status` column.

  Two consequences to keep in mind. A `select` with **no** options is free
  text, which is how the open vocabularies (type, group, tier) use the same
  columns a closed dropdown would; and a structured section's validation
  *replaces* the per-shape rules rather than extending them, so `kind` and
  `status` are checked against the spec and not against `kinds` / `statuses`.
- **`note.parent_id` shipped one branch before anything nests.** The Story List
  group is the only hierarchical section and lands later, but the column, its
  cascade and the router's parent rules came with the shape machinery so the
  table is altered once rather than twice on a chain of branches — two Alembic
  revisions on one table across consecutive branches is the collision the
  migration rules exist to avoid. It is covered by tests that patch `controls`
  hierarchical, not left uncovered until its section arrives. CASCADE rather
  than SET NULL: promoting every child to a root on a delete reads as a flat
  pile rather than as a loss, which is much harder to notice.
- **The 攻略 group's field sets went into the registry, not into components.**
  Thirteen of the sixteen guide sections are `structured`, and the shape's
  payoff shows here: the whole reshape is registry entries plus one data
  migration, and `StructuredSection.jsx` was not touched except to fix which
  field heads a row. Mapping every section's fields onto columns FIRST is what
  kept it cheap — `skills`, `endings`, `controls` and `guide_resources` need
  no `fields` blob at all, and across the whole group only `variant`, `alias`,
  `region`, `developer`, the four stat values and the nested lists do.

  Four decisions inside it are worth keeping:

  **Open vocabularies declare no options.** A `type`, a `group` and a `tier`
  are the game's words, not ours — "boss" and "small boss" in one game, three
  other words in the next — so those fields are selects with an empty
  `options` tuple, which renders as free text and validates as free text. The
  three closed vocabularies (`beaten`, `completion`, the mod `status`) are
  facts about my run rather than about the game, so they read the same
  everywhere and are worth pinning. `cheesed` is deliberately not folded into
  `beaten`: it answers "do I still owe this one a fair fight?".

  **A structured section's validation replaces the per-shape rules rather
  than extending them**, so `kinds` and `statuses` must be empty on one.
  `mods_and_tools` carried `kinds=("Mod", "Tool")` and now declares the same
  two as its `type` field's options on the same column — two sources of truth
  for one column, with only one of them consulted, is the kind of thing that
  reads as working. A test asserts the emptiness.

  **Two fields were kept that the request did not ask for.** A build and a
  team each get an optional name: every existing `builds_and_styles` row has
  one, and a list of builds with nothing to call them cannot be read.
  `mods_and_tools` keeps its Mod/Tool type for the same reason — dropping it
  would discard what every existing row is tagged with.

  **`side_quests` did not move with the rest.** It is asked to become a 劇情列表
  Story List subsection, and that group lands a branch later; retiring it now
  would mean deleting its rows or parking them where nothing reads them. It
  stays `name_entries` — and so keeps that shape's validation honest — until
  its destination exists.
- **The guide reshape's migration is `irreversible = True`.** The old
  `name_entries` array held a row's text and its links INTERLEAVED in one
  order; the reshape flattens that into a body plus a link list, so reversing
  it would invent an order rather than restore one. `deploy/migrations
  downgrade` refuses to reverse past it and freezes with the dump path, which
  is the honest outcome — the alternative is a rollback that quietly rewrites
  notes at 3am.

  Its one interesting case is a section whose new spec has **no** links field
  (`characters_guide`, `enemies`, `mods_and_tools`, `stats_and_points`).
  Leaving a URL in a column no field claims would make the row fail validation
  the next time anybody edited it, on a field they had not touched — so those
  URLs are written into the description instead, keeping their labels. Nothing
  is dropped silently even where the field is gone.
- **The `irreversible = True` near-miss check had never seen a real marker,
  and failed on the first one.** It was a single regex —
  `irreversible\s*=\s*(?!True$)` — meant to flag a misspelled marker. No
  shipped revision had ever declared the marker, so the check was vacuously
  green from the day it was written, and when the guide reshape finally
  declared one it flagged the *correct* spelling: `\s*` backtracks to empty,
  the negative lookahead then reads " True" rather than "True", and succeeds.

  Two things came out of it. The check is now a line comparison rather than a
  lookahead, which cannot backtrack; and it has a positive half asserting that
  a revision written the intended way satisfies `deploy/migrations`' own
  `line.rstrip("\n") == "irreversible = True"` comparison — with an assertion
  that at least one revision declares it, so the negative half cannot go
  vacuous again. This is the "asserting that a gate REFUSES is not safe on an
  empty set" rule with a safety marker as the gate: the worst shape a safety
  marker can take is one that fails silently, and a test that has never seen
  the thing it guards is not guarding it yet.
- **劇情 and 劇情列表 are two cards, not one.** 劇情 is the story written as
  prose — what happens, in sentences. 劇情列表 is the same story as a
  structure: a numbered, nestable list of the things it is made of, so
  "chapter 3, scene 2" is two rows and a parent link rather than a sentence.
  Merging them was considered and rejected because the two are read at
  different times and neither reads well as the other; the cost is that a
  reader has to know which card a thing belongs in, and 劇情's `story_other`
  already exists for exactly that kind of doubt.

  Four strands rather than one section with a `kind`, for the reason the 待辦
  buckets are four: `sort_index` orders rows within one `(owner, section)`
  pair, so a kind-tagged single section could not order entries *within* a
  strand. They are built from a tuple of (key, label) pairs because they
  differ in nothing else, and four copies of one eight-line spec is four
  places for them to drift apart.
- **An order number is free text, and either it or a name is required.** An
  entry is numbered "3", "3.2", "II", "v1.4" or "Act I" depending on the work,
  so a numeric column would refuse four of those five. `require_any` is what
  makes an entry an entry: "3.2" with no name is a placeholder somebody will
  fill in, "The Lake" with no number is an entry whose position is its
  parent's business, and a description with neither is a body with nothing to
  call it. That last case is the one the migration had to handle — a side
  quest with no title would have read fine and then 422'd the first time
  anybody edited it, on a field they had not touched, so its first line
  becomes its name.
- **The reorder endpoint's "names exactly the notes in this section" rule was
  left alone, and the page works with it.** A hierarchical move swaps two
  siblings, so sending just that sibling group would be the smaller payload —
  and is refused with a 400. Relaxing the endpoint was the obvious fix and the
  wrong one: the rule is what keeps a partial list from quietly renumbering
  half a section and leaving the rest wherever it was. The page flattens its
  whole tree depth-first with the swap applied instead, which is also the
  better data: `sort_index` ends up ascending in the order the page actually
  draws, so a reader of the raw rows sees the tree's order too.
- **A row whose parent is missing renders as a root.** It should not happen —
  the router refuses a parent from another owner or section, and a delete
  cascades — but the alternative to showing it is dropping it, which hides a
  row with nothing on screen to say so. A stray root is a failure somebody can
  see and fix.
- **進度 Progress and 待辦 Todo are one card now, and the notes page had to be
  split to allow it.** How far into a game I am and what I still mean to do
  are the same question asked twice; they were two cards a page apart, so the
  backlog was read after every other note rather than beside the playtime it
  belongs to.

  The obvious implementation — a second `NotesTemplate` with an "only this
  group" prop — was rejected: it would fetch `/api/notes/sections` and
  `/api/notes` twice for one page, with two loading states and two error
  banners. So the fetching, the mutations and the per-section rendering moved
  into `NotesProvider` (`NotesContext.jsx`), leaving `NotesBlocks` and
  `NotesGroup` as layout over shared data. `NotesTemplate` is now a provider
  wrapped around blocks, so the ten remaining `*Notes.jsx` wrappers did not
  change at all and the refactor landed behaviour-neutral — every existing
  notes test passed untouched, which is the only reason to trust that claim.

  `hideGroups` and `NotesGroup` are complementary by construction and a test
  asserts the group appears exactly **once** when a page uses both. The failure
  they replace is quiet: rendering the group in two places, or in neither.

  Game is now the one media type with no `*Notes.jsx` wrapper, because it is
  the one composing the pieces itself.
- **A section's group can vary per owner; exactly one section does it.**
  `groups_by_owner` mirrors `labels` and `kinds_by_owner`, and
  `group_for(section, owner_type)` resolves it before `/api/notes/sections`
  serves it, so the frontend never learns that overrides exist.

  解析 Analysis is the case. For a film or a series it belongs beside 分鏡/演出,
  伏筆 and 對稱 — those four are one subject. A game has none of the other
  three, so that card would stand there holding exactly one section, and an
  analysis of a game is read *with* the opinions rather than apart from them.
  The alternative, a second game-only section, would have split the rows as
  well as the card, and `analysis` is `ALL_OWNERS` precisely because it is one
  thing.

  A test asserts it stays the only one. An override puts the same rows in a
  different card, so a reader scanning `NOTE_SECTIONS` for `group=` would be
  wrong about where a section lands without noticing why — the same shape of
  trap as the per-owner label overrides, and worth keeping rare for the same
  reason.
- **備註 and 備註列表 are both kept.** 備註 is one block of prose and a
  singleton; a long remark wants to be written as a paragraph. 備註列表 is the
  short things, one per row, that a single block turns into a wall. Merging
  them was considered and rejected rather than postponed: a list whose first
  item is three paragraphs reads as badly as a paragraph made of bullets. Only
  備註 is a singleton, and only 備註 is hidden by `hideSections` — the dedicated
  remark editors write that one row and nothing else.
- **攻略 became five cards, and the split cost nothing but registry entries.**
  It held fifteen sections, which read as a wall of collapsed headers rather
  than as a guide. The cards are 攻略 (the way in: beginner, controls, guide
  notes, trivia), 養成&流派 (how to build), 物品 (what to get), 圖鑑 (who you
  meet) and 資源&工具 (what sits outside the game). Each answers one question,
  which is the test a new section has to pass — a section filed by elimination
  is a sign the categories are wrong, not that the section is awkward.

  `group` is display-only, so this was a registry edit: no migration, no data
  change, and `StructuredSection.jsx` was not touched. Cards collapse when
  empty, so a game with no mods shows one collapsed line rather than five.

  The alternative was sub-headings inside one 攻略 card, which needs a
  `subgroup` concept in the registry and a third level of card chrome —
  against `ui.jsx`'s own finding that nesting a card two deep reads as a
  subsection rather than as a group. Five sibling cards is the pattern 評論,
  解析, 劇情, 劇情列表 and 音樂 already use.

  A test keeps every card at two sections or more: a card of one is a section
  wearing a second header, which is the state 解析 was in for games before
  `groups_by_owner` moved it.
- **模組&工具 and 攻略資源 share a card, away from the guide.** `mods_and_tools`
  sat among the walkthrough sections with a comment on it saying a mod is not
  a guide, and `guide_resources` stood alone because nothing else was like it.
  Both are things *outside* the game, so pairing them gives one a home and
  moves the other out of content it was never part of. The card renders beside
  the site-wide Resources card it mirrors, and the two keep distinct keys AND
  distinct labels — two cards reading "Resources" on one page would be
  unreadable.
- **結局 Endings belongs to 劇情 Story.** It was filed under 攻略 because that
  is where it was asked for, and it stayed there through the reshape; when the
  guide was split it became obvious that it only ever sat with 圖鑑 by
  elimination. An ending is what the story *does*, so it reads above 世界觀&設定
  Lore, beside 未解之謎 Mysteries — and 圖鑑 is left cleanly about the cast and
  the bestiary. Its spec did not change, only its group, so no row moved.
- **A field can declare a default, and a defaulted field never counts as
  filling a row.** `NoteField.default` is the row-level twin of
  `NoteSection.default_kind`, which the structured shape does not use — a
  structured section's dropdowns are fields, so their defaults are too. Three
  收集物/道具/武器 sections start on `not collected` and 敵人 starts on `to beat`,
  because that is the true state of anything worth writing down at the moment
  you write it.

  The trap came with it, and `music_track` had already found it: a value that
  is *always* set makes every row non-empty, so an untouched draft would save
  itself as a row saying nothing. The emptiness check therefore counts only
  the fields with no default. That is a rule about which fields count, not
  about whether a value was touched — choosing "skip" and filling in nothing
  else is refused too, because it is still a row with nothing to call it.

  Two guards fell out of writing it down: a default must be one of its field's
  options (otherwise the form prefills a value the validator refuses, and the
  row cannot be saved without changing a field nobody touched), and no section
  may default *every* field it has (one that did could never be saved at all).
  Both are tests rather than runtime checks — they are statements about the
  registry, not about a payload.
- **Existing rows were NOT backfilled with a collect status.** NULL means
  nobody has said, and "not collected" is a claim about my run that the old
  rows cannot support — the field did not exist when they were written. This
  is the same distinction `Game.all_endings` and its two siblings already
  make: "Inapplicable" is a claim about the game, where NULL is only a claim
  about the row. A new row starts on "not collected"; an old one stays silent
  until somebody answers.
- **備註列表 reaches every owner, like 備註.** It shipped game-only because that
  is where the need came from, which was the wrong reason for a scope: nothing
  about a short note is game-shaped, and the two sections are read as a pair
  wherever 備註 appears. They share an `owners` tuple now, and a test asserts
  that rather than listing the owners twice — so widening or narrowing one
  moves the other with it.
- **A franchise's content label CASCADES to its entries, and is joined at read
  time rather than copied.** Labelling a franchise `nsfw` had to be one edit,
  not one per entry plus a promise to remember the next one — that was the
  whole point of asking for franchise labels. The alternative was writing a
  `media_content_label` row onto every entry when the franchise is labelled,
  which reads simpler and is wrong in three places: moving an entry out of the
  franchise would leave the copy behind, adding an entry to a labelled
  franchise would silently not inherit, and clearing the franchise's labels
  could not tell an inherited row from one an admin set by hand. So
  `enforcement._hidden_by_label` asks both questions on every read — the
  entry's own `media_content_label` rows, and its franchise's through
  `media.franchise_id` — and nothing is stored twice.

  `franchise_content_label` is a second table rather than a nullable owner pair
  on `media_content_label`, because that table's `media_id` is a real FK up to
  the `media` supertable and a franchise has no row there. A pair of nullable
  owner columns could name both owners or neither, and no constraint would say
  which was meant.

  **Series were left out deliberately.** A series under a labelled franchise
  keeps its own page, which then lists nothing — the entries are hidden by the
  cascade. That is a cosmetic leak of a series name, not of anything the label
  exists to hide, and adding a third join table to close it would double the
  write surface for it. Recorded in `docs/open-items.md` rather than fixed.
- **Assigning a content label is `manage.catalog`; minting one is
  `admin.authz`.** The whole `/api/content-labels` router was gated on
  `admin.authz`, which `permissions.locked_permissions` locks OFF for `super`
  by construction — so a `super` account saved an entry and then watched only
  its labels 401, with the entry itself already written. The two obvious fixes
  were both worse than the split: granting `super` `admin.authz` deletes the
  only difference between it and root, and moving the whole router to
  `manage.catalog` would let any catalogue editor mint and delete the labels
  that decide who sees what.

  The line is what each half *decides*. Minting, renaming or deleting a label
  changes who may see what across the installation. Putting an existing label
  on an entry or a franchise decides only which shelf that one thing sits on,
  and it is submitted by the Add/Modify forms along with the rest of the entry
  — it was never an authorization screen, it just lived on an authorization
  router. `GET /` answers to either, because it is both the admin page's table
  and the picker's checkbox list.

  The split widened who may write those rows, so the assignment routes gained
  the visibility gate the rest of the write surface already has: a thing the
  caller's active mode cannot see answers 404. Without it a narrowed editor
  who knew an id could have cleared the label that was hiding it — and these
  routes replace the whole set, so one empty `PUT` would have done it.

### Admin page load: batched credit counts, per-tab entry lists (2026-09-20)

The Add, Modify and Delete pages each opened by fetching about thirty-four
requests in two serialized waves and holding a spinner over the page until the
last one landed. Four changes, in descending order of what they were worth.

- **`credit_count` is computed for a whole list in one pass.** `_to_response`
  in the person, studio and publisher routers ran two queries plus a
  `filter_visible_pairs` call *per row*. With 554 people that is over a
  thousand round trips, and `/api/person/` took 3.91s to return 188KB. The
  batch — `credits.credit_counts()` — resolves visibility once for every pair
  on the page, because `filter_visible_pairs` was already a batch call; asking
  it per row was the N+1 it exists to remove. Same response, 0.27s.

  The counting is per entity but the *visibility* is not, and each entity's
  pairs are kept as a set, so an entry that both credits and casts one person
  still counts once. `tests/api/test_credit_counts_are_batched.py` asserts the
  query count rather than only the numbers: an N+1 produces exactly the same
  numbers, just slowly, so a correctness-only test would pass with the
  regression back in place.

  `person.roles` and `publisher.scopes` were a second N+1 one relationship
  over — read by `_to_response` for every row, lazy-loaded per row. Both list
  routes now `selectinload` them.

- **The two fetch waves are one.** Form defaults and suggestion sources were
  awaited *after* the twelve entry lists, and a FastAPI JSON response sends
  its headers only once the body is built, so the second wave genuinely
  started after the first had finished serializing. Nothing in either wave
  reads the other, so the sequencing only ever cost a round trip.

- **Entry lists are fetched per tab** (`hooks/useEntryLists.js`,
  `config/adminEntryLists.js`). A page renders one tab at a time; eleven of
  the twelve lists were for tabs nobody was looking at. The exceptions are
  real and are in the map: collections, franchises and series are read by
  every tab, and the franchise, series and fav3x3 editors render cross-type
  ribbons.

- **The page paints when the sources land**, not when every list does. The
  auto-fill box is disabled with a "loading entries" row until its own list is
  in — chosen over letting it return nothing, because on an Add page "no
  matches" for an entry that does exist is the wrong answer to give someone
  about to create a duplicate.

Two things were deliberately NOT done.

- **No `?fields=` projection on the list endpoints.** It would have cut the
  payload further and let the `attach_*` passes be skipped, but `list_entries`
  ends in `gate(viewer, ...)`, which masks fields per viewer. A projection
  that let a caller name a field the gate would have stripped is a permission
  leak wearing a performance costume, and it would have to compose correctly
  on every list endpoint. Pointing the auto-fill typeahead at the existing
  `search_query` parameter would remove most of the same cost without
  touching the gate, and is the cheaper thing to do first if this is ever
  worth revisiting.

- **Delete does not lazy-load behind its confirmation.** `entriesIn` and
  `standaloneEntriesIn` count across every media type to decide whether to
  offer deleting a now-orphaned franchise or series, and `deleteChildren`
  walks every list. An unfetched list reads as empty, which would understate
  the cascade and offer to delete a franchise that still holds entries — so
  opening the modal and executing the delete both wait for every list. That is
  stricter than the old code, which trusted a load that had already failed
  with nothing but a toast to show for it.

### The `anime_site` names became `media` (2026-09-21)

The checkout on the box, the live database, the development and test
databases and `COMPOSE_PROJECT_NAME` all carried the name this application
had before the platform existed. They are now `~/media`, `media`, `media`,
`media_test` and `media`. Why it was left alone until now, and why it was
worth doing in the end, is the platform's
`docs/notes/decisions.md`, "The last two `anime_site` names in production" —
the decision was the platform's, because the registry is where the name has
to be spelled consistently.

What belongs here is the part this repository owns, and it is the part that
does not move when the directory does:

- **`deploy/backup/units/*.service` hold the checkout path absolutely**, in
  `ExecStart`, and the copies that actually run are the ones `install.sh` put
  in `/etc/systemd/system`. Renaming the directory tells them nothing, and
  neither does deploying — `install.sh` is a one-off run by hand under sudo.
  Editing the units in this repository is therefore only half of it; the
  installed copies have to be replaced in the same window.
- **`deploy/backup/lib.sh` defaults `REPO_DIR` to the checkout path**, so a
  unit that was somehow updated while `lib.sh` was not would still resolve
  the old directory.

Both failures are silent at rename time and surface at 04:00 the next
morning, in a timer nobody is watching, as a backup that did not happen. The
health check the deploy runs says nothing about either, because the
application was never the thing that broke.

### Favourite grids beyond the franchise tier (2026-09-22)

The favourite 3×3 grids held franchises only, because `type_slots` existed on
exactly one table. Three of the nine now hold something else — favourite comic
*series*, favourite movies and favourite games — so a slot had to be storable
on a series and on an entry.

- **The same column on each table, not a generic `(grid, slot) -> owner`
  table.** A join table is the more normalised answer and it was the first
  thing considered. What ruled it out is the Google Sheet: data travels
  between the two machines by tab, so a new table needs its own `SheetTab`,
  its own parser and its own place in the Pull ordering before any of this
  survives a machine switch, whereas a column on a table that already has a
  tab travels the day it is added. It also keeps one shape for the reader —
  `type_slots` means the same thing wherever it appears.
- **The entry-tier column is on `movies` and `games`, not on `media`.** The
  supertable would have served all nine types at once and the next favourite
  entry grid would have needed no migration at all. `app/models/media.py`'s
  promotion rule requires two things, and only the first holds: every type
  could carry a slot, but nothing queries across types by one — each grid
  reads one type's list. A later grid pays for its own column, which is the
  rule working rather than a cost to route around.
- **A grid's key is only meaningful beside its tier.** The favourite movie
  *franchises* and the favourite *movies* both key `"Movie"`, on `franchise`
  and on `movies` respectively, and they are different slots. That is safe
  precisely because the column is per-table; it is the one thing the generic
  table above would have had to disambiguate with a second column.
- **`config/favoriteGrids.js` is the single declaration**, read by the public
  page and the admin editor, and the `favorite*` helpers in
  `utils/statsUtils.js` answer everything that differs between the three
  tiers. Both consumers had their own copy of the grid list before this, with
  different titles in each; adding three grids to two lists by hand is how
  they would have drifted further.

### What counts as value, and what "should spend" means (2026-09-22)

Two figures on the statistics page are now computed against the game's own
list price (`price_original_us` / `_jp` / `_tw`) rather than only against what
was paid.

- **A title with no list price is left out of the Value card.** Cost per hour
  is meant to answer "was this worth it", and what was paid for a bundle
  share, a free weekend or a gift is not what an hour of that game costs. Left
  in, those rows had the lowest per-hour figures in the library and sat
  permanently at the top of "best value" — the card's most prominent line was
  the one built on its least meaningful prices. A recorded `0` counts as no
  list price, because a market price of nothing is the column never having
  been filled in.
- **"Should spend" is the bought copies at list price, and it is deliberately
  the same copies as Bought.** The two columns are only useful if they
  subtract, and the difference is what discounts were worth. Pricing per
  distinct game instead would have been a different and less comparable
  question ("what would this library cost at full price"), and would not line
  up with the copy count printed beside it.
- **The list price is read in the copy's own currency and never converted
  from another region's column.** `_jp` is yen because the column says so, not
  because a game is Japanese. A TWD purchase whose game has only a US list
  price has no should-spend figure at all and is counted as unpriced:
  converting USD 59.99 into it would invent a number that reads exactly like a
  recorded one, which is the same failure the FX-rate guard already exists to
  prevent.

### H-Comic, the first gated type (spec: 2026-09-23 h-comic-design)

A tenth media type for adult comics, seen in the `unrestricted` access mode
only. It shipped in three pull requests - the visibility groundwork, the
backend type, the frontend - and the owner settled the shape before any of
them.

- **One type with a `region`, not a reuse of `manga` and not two types.**
  Hentai is an `anime` row with the `hentai` label because its fields are an
  anime's; an h-comic's are not a manga's - club, originality, animation
  status, a place in a series, pages on one side and chapters behind the
  official source on the other, a personal usefulness, and a highlights
  section. Reusing `manga` would have hung all of that on every manga row.
  Two types (a JP one and a KR one) was the other extreme: the two share most
  of their fields, so they would have been two near-identical tables, forms
  and pages. One table with a `region` follows manga's `region` and novel's
  `novel_type`: the columns a region does not use are cleared on every write
  path, not only hidden by the form, while a name column the region does not
  use is kept, since a name is harmless and keeping it makes a region change
  undoable. The frontend mirrors the rule in `lib/hComicRegion.js`, the way
  `lib/novelUnits.js` mirrors the novel one, and additionally clears the two
  KR-only link fields (author, official source) that the server does not.
- **The label is required, and the server attaches it.** A media type naming a
  required label (`REQUIRED_LABEL_FOR_TYPE`) is a *gated type*. Every h-comic
  entry and every `H-Comic` franchise carries the `h-comic` label on every
  write path, and a set that drops it is refused. It is not left to the admin
  to tick, because an entry missing its label is a public entry. The label
  reaches `unrestricted` only; `borderline`, which otherwise carries every
  label as of its seed, is kept off it. The SPA locks the label on in its
  picker and adds it back on save, so no save the admin never touched can hit
  the refusal.
- **Everything connected only to h-comic is hidden, by a derived rule.** The
  label already hid the entries; what leaked was everything they point at -
  artists, clubs, characters, genre and platform values - because those rows
  carry no label. The rule adopted is that *a shared record is hidden when
  every connection it has is hidden*, a connection being an appearance on an
  entry or a scope naming a gated type. Two alternatives were rejected:
  **label tables for people, characters and vocabulary** would have needed the
  admin to remember to label every artist and every genre value, and would go
  stale the day an artist is credited on a mainstream work; **separate tables
  for h-comic people** would have split one artist who also draws mainstream
  manga into two rows. The derived rule needs nothing remembered - crediting
  someone on a normal work reveals them, removing the credit hides them again
  - and it reverses the earlier stance that "the person is not the secret,
  their credits are". Scopes count as connections for two cases that have no
  appearance to hide behind: a club created before its first credit, and an
  unused value of the three h-comic-only genre vocabularies. Only label-hidden
  appearances count; a guest lacking a *media-type* permission still sees the
  people of that type, as before.
- **A narrow session is not told the type exists.** Beyond hiding rows, every
  surface that would name the type - constants, role scopes, the notes
  registry, `/api/auth/me` - leaves it out for a session that cannot see it,
  and the SPA draws no nav row, route, tab or picker for it. The SPA asks one
  question in one place (`canSeeGatedType`) rather than testing `"h-comic"`
  at each surface, because both SPA permission surfaces - the route guard and
  `navigation.js` - have to agree, and they drift when each keeps its own
  test. A signed-in narrow session sent to an h-comic URL lands on the home
  page, as for any unknown path, rather than on a login page that would say
  there is something behind it.
- **H-Comic franchises are kept apart from mainstream ones.** A new franchise
  type, `H-Comic`; an h-comic only ever sits in one, and the name resolver
  matches only those both ways. Otherwise a Fate-themed h-comic would attach
  itself to the mainstream Fate franchise, whose hub would then either list it
  or carry a hole where it was hidden. Keeping the franchise separate is also
  what lets the franchise carry the label - and a series under a labelled
  franchise is hidden through the same join entries use, which closed the
  standing gap where a series under a hidden franchise still showed its name.
- **Club membership is its own table and not a connection.** A club is a
  person holding the `club` role (studio-like as an idea, an author as a
  schema), so a club and its artists live in one table and `person_membership`
  links them, ordered on the club's side. Membership cannot make a hidden club
  or artist visible; a visible club's member list omits hidden members.
- **Highlight names are free text, not character ids.** A highlight names the
  characters it is about, and the ones worth naming are often not on the cast
  at all; requiring a character row for each would mean creating rows for
  every one-scene name. The editor suggests the cast and accepts anything.
  The price, accepted: renaming a character does not rewrite the highlights
  that named it.
- **The group order is a column on the entry.** The owner orders the female
  characters of one entry's highlights ("this one above that one"); the order
  of the rows inside a group does not matter. So the order is
  `h_comic.highlight_group_order`, a JSONB list written whole by dragging a
  group header, rather than a table of `(entry, name, position)` rows or a
  second sort key on the notes. It is only ever read and written whole, and a
  column on a table that already has a sheet tab travels between the machines
  the day it is added. A listed name no row carries any more is ignored when
  drawing and falls out on the next save, so a renamed or deleted group needs
  no cleanup.
- **The grouping is generic.** `group_by` and the `names` field type are
  registry features the structured notes component renders without naming
  the section, like every other structured field: the next section wanting
  groups or free-text names is a registry edit.

### Hentai, the second gated type (spec: 2026-09-25 hentai-design)

- **Its own table, not an `anime` row with a label (D1).** Its fields are
  h-comic's more than anime's - source material, originality, a series
  number, usefulness - and none of anime's episode, season, broadcast or
  AniList machinery applies to one episode of adult anime. A label on an
  anime row would also have left the type ungated: a label an admin can
  remove is not a type.
- **Franchise families instead of a second special case (D5).** h-comic was
  kept apart from the mainstream by one hard-coded franchise type. Hentai
  needs the opposite as well as the same: apart from the mainstream, but
  sharing a franchise with the h-comic it adapts, as anime shares one with
  its manga. So the rule became data: `FRANCHISE_FAMILY_FOR_TYPE` maps
  `H-Comic` and `Hentai` to one family, every unlisted type is mainstream, a
  franchise spanning two families is refused, and the resolver matches within
  the entry's family. It is written for any number of families - h-game adds
  its own - and one franchise carries the label of each gated type it holds,
  which is what keeps an h-comic-and-hentai franchise hidden from a session
  that sees only one of them.
- **h-comic's `animation_status` is derived at read time, not written
  (D8).** The alternative - writing the derived value whenever a relation or
  an airing status changes - needs a recompute on every relation write,
  every hentai write and every Pull, and it overwrites the hand-set value, so
  removing the relation would leave a stale one. Deriving on read needs
  neither, keeps the hand-set value for the day the relation goes, and costs
  one query per page. Only `hentai -adaptation-> h-comic` counts, read from
  the relation's own direction ("the hentai is the Adaptation of the
  h-comic"). While derived, a write of any other value is refused (422)
  rather than silently ignored: an ignored write looks saved and is not. A
  write of the derived value itself - the form sending back what it was
  served - is accepted and stores nothing, which is why the write goes
  through a nested-collection writer that sees the stored value before any
  flush can replace it. It is derived from every adapting hentai, whatever
  the viewer can see: the status is a fact about the h-comic, and a narrow
  session never sees the h-comic either.
- **Studio, director and the H Genre vocabularies are shared, not copied
  (D6).** A studio that makes both is one studio row; the shared-record rule
  already hides one credited only on hentai. The H Genre categories serve
  both gated types, so they are hidden only from a session that sees
  neither, and `/api/constants` serves a vocabulary while any type it serves
  is seeable.
- **The hand-made `hentai` label is adopted, and leaves every non-hentai
  entry.** The label existed on the home database, on one anime. Find-or-
  create by key keeps that row; the migration then removes the label from
  every entry that is not a hentai, and from every mode but `unrestricted`,
  because the label now means the type. Which rows carried it is recorded
  nowhere, so the downgrade does not restore them.
- **Tenrai fills three fields (D11).** The owner asked for airing status,
  release date and cover, and nothing else - not names, studio or scores.
  Tenrai serves Rx titles from the same anime endpoint, so the pipeline is
  anime's minus AniList, under anime's fill-only rules.
- **Hentai's label and family are map entries, not code.** It joins the
  shared label module by its `REQUIRED_LABEL_FOR_TYPE` entry and its
  `SYSTEM_LABELS` row, and the families by `"Hentai": "h-comic"` in
  `FRANCHISE_FAMILY_FOR_TYPE`. The family check on a `franchise_id` named by
  id is the router factory's, run for every media type, so hentai's write hook
  keeps only its vocabularies and the label stamp.
- **No notes section of its own (D7).** The owner's call: a hentai takes the
  sections every entry has and nothing type-specific, so its detail page
  hands the notes page the owner type alone, as a movie's does.
- **The SPA mirrors the families, it does not re-derive them.**
  `frontend/src/lib/gatedTypes.js` holds `FRANCHISE_FAMILY_FOR_TYPE` as a
  copy of the backend map, and one picker (`FamilyLineageFields`) serves both
  the h-comic and the hentai forms, offering the family's franchises. Offering
  only a type's own franchise type would have made the shared franchise D5
  allows unreachable from the form: a hentai could never be put beside the
  h-comic it adapts. The hub pages fetch either list under any franchise of
  the family for the same reason - joining a franchise does not add the
  joiner's type to `franchise_type`.
- **A derived animation status names its hentai from the relation card's
  rows.** The h-comic response says only that the status is derived, not
  from which entry; the detail page's Related entries card already loads
  every relation, so it hands its rows up (`RelationsSection`'s `onRows`)
  and the page names the adapting hentai without a second request or a new
  response field. The form, which has no relation card, says where the value
  comes from without naming it, and leaves `animation_status` out of the
  body while it is derived rather than echoing it back.
- **One entry, one episode, one Movie-shaped page.** The detail page follows
  Movie's layout rather than Anime's: there is no counter to step, and Mark
  completed also marks it aired, movie's rule. The watch axis is the ordinary one, so
  the plan tabs, library button and status chips need no hentai branch.

### Gated-type labels in one module (2026-09-25)

The label machinery h-comic introduced - the system label found or created by
key, stamping it on entries and franchises, refusing its removal, and the
Pull/Calculate pass that re-attaches it - moved out of
`app/services/domain/h_comic.py` into `app/services/domain/gated_labels.py`,
driven by `REQUIRED_LABEL_FOR_TYPE` and `FRANCHISE_TYPE_FOR` rather than by the
`h-comic` key.

- **Why now.** A second and a third gated type were being written in
  parallel. Each would otherwise have copied h-comic's label code under its
  own name, and a missed copy is a public adult entry, not a cosmetic bug. One
  module keyed on the map means a new gated type needs its map entry and its
  `SYSTEM_LABELS` row, and nothing else, to get every label rule.
- **The invariant pass was split, not moved whole.** `enforce_h_comic_invariants`
  kept the region clears, which are h-comic's own; the label half became
  `enforce_gated_label_invariants`, run by Pull after the tabs in
  `GATED_LABEL_INVARIANT_TABS` (derived from the map) and by Calculate as
  `run_sync_gated_labels`. The h-comic pass no longer runs after the
  Franchise and label tabs, which cannot break the region rule, and the label
  pass does not run after `User Media List`, which cannot remove a label.
- **Found by key.** `ensure_label` adopts a label row an admin made by hand
  with the same key instead of failing on the unique key or creating a twin;
  an adopted row keeps its own name and grants.

### A switched-to access mode lasts an hour, or until the browser closes (2026-09-25)

- **The problem.** The active mode lived in the login token's `mode` claim, and
  the login lasts 30 days in a persistent cookie. A laptop switched to
  `unrestricted`, closed, and reopened the next day was still `unrestricted`,
  although its default was `borderline`. The widening password protects the act
  of switching up; nothing protected a device left switched up.
- **Two cookies.** The login cookie says who is asking; `access_mode` says which
  mode they switched to. Every request with no live override resolves the
  account's default from the database, and the login token's `mode` claim is
  no longer read - which is also what moves every cookie minted before this
  change back to its default on deploy.
- **Both limits, not either.** A browser-session cookie alone fails in a browser
  that restores its session on startup, and in one that is never closed. A
  timer alone would survive closing the browser for up to an hour. The override
  is a session cookie whose token expires 60 minutes after the switch
  (`ACCESS_MODE_OVERRIDE_MINUTES`), capped at the login's own expiry.
- **Fixed, not sliding.** The hour runs from the switch, not from the last
  request, so a session left open on a page that polls does not stay wide.
- **Narrowing expires too.** A session switched below its default returns to
  the default without the password. Accepted: the default is what the
  account's own login already grants, so returning to it is not a new grant,
  and a rule that kept narrow overrides but expired wide ones would need an
  ordering of modes, which they deliberately do not have.
- **A revoked override still resolves to nothing**, not to the default, until
  it expires - the fail-closed rule for revoked modes is unchanged.
- **The switch no longer reissues the login cookie**, so the
  session-extension concern that made it preserve `exp` has no surface left.

### Only a mode wider than the default expires (2026-09-26)

- **Reverses "Narrowing expires too" above.** Narrowing on purpose - dropping
  to `safe` with someone watching - was undone after the hour, widening the
  session back to the default without its owner doing anything. The timer
  exists to stop a device being LEFT wide, so it now applies only there.
- **No ordering was needed after all.** The objection above was that keeping
  narrow overrides would need modes ranked. It does not: "wider than the
  default" is the password prompt's subset test with the default as the
  starting point. A mode neither wider nor narrower (adds one label, drops
  another) counts as wider and is timed - the conservative side.
- **Decided at the switch, carried in the token.** The override token for a
  mode that is not wider expires with the login and carries `timed: false`, so
  `/me` reports no end instead of a date a month out. Without the claim the
  SPA would schedule its reload past `setTimeout`'s ~24.8-day ceiling, which
  fires immediately. An override minted before the claim has none and is read
  as timed, which it was.
- **Rejected: a separate setting for the narrower duration.** One knob
  (`ACCESS_MODE_OVERRIDE_MINUTES`) now means "how long a wider mode lasts",
  and a narrower mode needs no timer of its own.

### H-Game, the second gated type (spec: 2026-09-25 h-game-design)

- **Its own table, Game's machinery.** `h_game` is to `games` what `h_comic`
  is to `manga`: the IGDB and Steam fill, the purchase records, the DLC chain
  and the game note sections are reused, the table is not. The two autofills
  take the entry's model and owner type instead of being copied, and write a
  column only when the table has it, so a column Game has and h_game lacks
  (`hours_played`, the Metacritic pair) is skipped rather than set as a stray
  attribute; a credit or tag whose scope lacks `h-game` (publisher, mode,
  platform) is skipped the same way.
- **Purchase records are shared, through `media`.** `game_copy.game_id`
  points at `media.system_id` instead of `games.system_id`. Every entry
  shares its id with its media row, so no value changed; the column kept its
  name because the `Game Copy` sheet tab is headed by it. With the FK off
  `games`, both `Game.copies` and `HGame.copies` spell out their join.
- **Fixed vocabularies, checked on every path.** The five h-game vocabularies
  live in `constants.py`, not in `system_option`: they are closed, and a
  closed list the code checks is a constant. The write schemas and the
  registry's progress hook (the tracker PATCH has no schema) refuse an
  unknown value with a 422; the Sheets parser drops it and logs, because a
  restore must not fail a tab over one hand-typed cell.
- **A multi-choice list is stored in vocabulary order, and `[]` is an
  answer.** Two ways of ticking the same boxes store the same list. An empty
  list ("no voiced scenes", "none of these presentations") is kept and is
  different from null ("not recorded"), the way `animation_availability`'s
  null means unknown rather than no.
- **No invariant pass of its own.** H-Game has no region and nothing derived,
  so the label is the only thing a restore could break, and the pass every
  gated type shares (`enforce_gated_label_invariants`) covers it. Its pipeline
  spec runs `run_sync_game` and `run_sync_gated_labels`.
- **Plans and watch orders as Game.** Plan-next scopes and the
  `play_next` / `to_replay` flags mirror game's; a watch-order step names an
  h-game whole.
- **Game's note sections by default.** Every game section names
  `GAME_OWNERS`, so the next one written for games reaches h-game without a
  registry edit. `h_game_highlights` copies `h_comic_highlights`' fields -
  the second copy, so not factored out yet - with the locator labelled
  "Route / Scene" and no `owner_where`.
- **A franchise family of its own.** `FRANCHISE_FAMILY_FOR_TYPE` maps
  `H-Game` to `h-game`, apart from the `h-comic` family H-Comic and Hentai
  share: an h-game never sits in a franchise with an adult comic or anime,
  by the owner's choice.
- **DLsite is two plain links, not an id and not JSONB.** Nothing fetches
  DLsite, so an id would be decoration; the JP and TW stores are exactly two
  fixed slots, so two columns sit beside `steam_link` and `igdb_link` in
  the Sources card, the forms and the sheet, where a JSONB object would
  put two links in one cell.
- **Game Spend stays games only.** The copies table is shared, but the
  statistic reads the `game` list's copies, so an h-game purchase never
  reaches a page a narrow session can open.
- **A multi-choice field is chips, with None and Unknown as chips too.**
  `ChoiceChips` sets `[]` from None and `null` from Unknown, so the
  difference the column keeps is one the form can express.
- **Usefulness sits in the completion block**, beside Completion Level, All
  Endings and All CG, because the shared tracker card has no per-type slot.
- **Its nav row is under Restricted**, with H-Comic's, not in the Library.

### The scope reconcile leaves unscoped options alone (2026-09-25)

- **What happened.** Netflix and Disney+ were left with no scope rows when the
  media-sources work cleared their TV-only scoping, so they were offered on
  every type. Calculate's `extract_system_options` then gave them `tv-show`
  and `cartoon` rows, because TV shows and cartoons name them in
  `original_source`. On a value with no rows, the first row narrows rather than
  widens, so both dropped out of the anime, anime-movie and movie Main Sources
  pickers. Ruling R27 had banned exactly this for `replace_tags`; the reconcile
  kept doing it, because "additive" was read as "never deletes a row".
- **The fix.** The reconcile now skips any option with no scope rows. A new
  value typed into a tag field therefore stays offered everywhere until an
  admin scopes it, which is what "scopes are admin data" already said.
- **Explicit scopes, not unscoped again.** Migration `n1d2plscope3` gives both
  values rows for anime, anime-movie, movie, tv-show and cartoon. Clearing them
  would also offer them on manga, novel and comic, which are read rather than
  watched. Explicit rows cannot be narrowed by the reconcile, since it only
  adds. Its downgrade is a no-op: nothing shows which rows were there before,
  and the older code is just as happy to offer the values more widely.

### Game Replace runs IGDB as well as Steam (2026-09-25)

- **Owner's decision: Autofill and Replace run both sources** on `game` and
  `h-game`, in Fill's order — IGDB, then Steam. Steam-only Replace had been
  justified by "nothing in an IGDB record drifts", which is true, but it meant
  the detail page's Autofill button could not finish an entry that had only
  an IGDB link: Steam keys off the appid that only IGDB supplies.
- **IGDB stays fill-only under Replace.** That is what every other type's
  Replace does with its source: the MAL Replace runs the same fill-only
  autofill and overwrites only the scores and ranks, which drift. IGDB has no
  drifting column, so its half of Replace only fills gaps. Overwriting would
  have rewritten hand-shortened names, curated tags and chosen covers for no
  new information.
- **The write hook keeps running the whole Replace.** Every other type with a
  source fetches it on save (movie, TV show and cartoon pay TMDB/OMDb, manga
  and novel pay Tenrai), and a game saved with a fresh IGDB link should be
  filled then, not on the next run. The cost is up to two IGDB requests per
  save of a linked game, well inside IGDB's 4/second limiter. The corollary
  is shared with every fill-only field: clearing IGDB-supplied tags or credits
  on an entry that still carries its `igdb_id` refills them on save.
- **Bulk Replace selects IGDB-only entries too**, and the Steam budget still
  gates every entry: IGDB can hand Steam an appid mid-entry, so an IGDB-only
  row is not exempt from the storefront window.

### 玩法系統 loses its links; 圖鑑 becomes 圖鑑與名詞 (2026-09-25)

- **Owner's decision: 玩法系統 Gameplay Systems takes no links.** It had kept
  them on the reasoning that a mechanic is something a write-up explains
  better than a line does. It is looked up like the glossaries it shares
  `_term_fields` with, and a write-up worth keeping is a 攻略資源 Guide
  Resources row.
- **Existing links move into the description rather than being cleared**
  (`g3s4ysnolink`). A row keeping URLs in a column no field claims would 422
  on its first edit, and clearing them would lose them. The revision is
  `irreversible`: after an edit, an appended URL cannot be told from a typed
  one.
- **玩家術語 Player Terms is its own section, beside 遊戲名詞 Game Terms.**
  The game's vocabulary and the community's are both looked up while playing,
  which puts them in one card, but a word met on a forum is looked for in the
  list of the forum's words. The card is relabelled 圖鑑與名詞 Compendium &
  Terms; its key stays `compendium`, because the key is what code and tests
  name and only the label reaches a reader.
