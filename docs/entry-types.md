# Entry types and grouping tiers

Last verified: 2026-09-25

## What this is for

Everything in the tracker is either a **media entry** (one anime season, one movie, one comic run...) or a **grouping tier** that holds entries together. This page explains what each tier is for, what each of the twelve media types is for, and then lays out — in one matrix — what each media type does and does not support (status vocabulary, progress unit, external source, plan/rewatch scopes, size buckets, notes, pipelines, duplicate rule). Column-by-column table schemas live in [data-model.md](data-model.md); derivation and checking rules live in [business-rules.md](business-rules.md). This page links to them rather than repeating them.

## The grouping tiers

The hierarchy is `Collection → Franchise → Series → entry`. Only Franchise is (nearly) mandatory; the other two are optional.

| Tier | Table | What it is for | Type? | Parent | Detail route |
|---|---|---|---|---|---|
| Collection | `collection` | Optional umbrella over several *distinct* franchises that share an IP or creator (the model docstring's examples: "Marvel" over MCU / X-Men / Spider-Man, "Type-Moon" over Fate/stay night / Tsukihime / Kara no Kyoukai). "Deliberately inert: no derivation, no duplicate detection, no stats." Entries never point at a collection directly — only through `Franchise.collection_id`. | no | — | `/collection/:system_id` |
| Franchise | `franchise` | "Top-level media franchise entity. Groups related series and individual entries." Every entry resolves to a franchise; if a form or sheet row names one that does not exist, it is **auto-created** (see below). | `franchise_type` | `collection_id` (nullable, `ON DELETE SET NULL`) | `/franchise/:system_id` |
| Series | `series` | "Intermediate grouping layer. Links individual entries to a parent Franchise." A series has **no type** and **no `collection_id`**; it is a deliberate sub-grouping and is **never auto-created** (an unknown series name resolves to `None` with a warning). `anime_movies` has no `series_id` column at all. | no | `franchise_id` | `/series/:system_id` (no library page) |

Library pages exist for collection (`/library/collection`) and franchise (`/library/franchise`); series has none.

### `franchise_type` values

Two lists exist on purpose (see the comment above `FRANCHISE_TYPES` in `app/utils/constants.py`, Ruling R10 of the options redesign):

| Where | Values |
|---|---|
| `FranchiseType` enum (backend logic, auto-creation) | `"Anime"`, `"Movie"`, `"TV"`, `"Cartoon"`, `"Comic"`, `"ACG"`, `"Novel"`, `"Game"`, `"H-Comic"`, `"H-Game"`, `"Hentai"` |
| `FRANCHISE_TYPES` tuple (what `/api/constants` serves to the dropdown) | `"ACG"`, `"Anime Movie"`, `"TV"`, `"Movie"`, `"Cartoon"`, `"Comic"`, `"Novel"`, `"Game"`, `"H-Comic"`, `"H-Game"`, `"Hentai"` |

A franchise may carry a comma-separated list of types; duplicate detection buckets it under each one.

#### Franchise families (`FRANCHISE_FAMILY_FOR_TYPE`, `app/utils/constants.py`)

Franchise types fall into **families**: `H-Comic` and `Hentai` are the
`h-comic` family, `H-Game` the `h-game` family, and every type the map does
not list is `mainstream`. An untyped franchise is mainstream. Families are
kept apart in both directions:

- **A franchise spans one family.** A `franchise_type` mixing two
  (`"ACG, H-Comic"`, `"ACG, Hentai"`, `"H-Comic, H-Game"`) is refused (422) on
  create, update and patch (`check_franchise_type_family`), and so is
  retyping a franchise into another family than an entry it holds
  (`check_franchise_entries_family`). `"H-Comic, Hentai"` is one family and is
  accepted: an h-comic and its hentai adaptation share a franchise the way a
  manga and its anime do.
- **An entry sits in a franchise of its own family.** An entry's family is the
  family of the type it stamps (`FRANCHISE_TYPE_FOR` below). The name resolver
  matches an entry only against franchises of its family - so an h-comic or a
  hentai named "Fate" never attaches to the mainstream Fate franchise, a manga
  named "Fate" never attaches to an `H-Comic` or `Hentai` one, an h-game named
  "Fate" attaches to neither, and a hentai named after an h-comic attaches to
  that h-comic's franchise. A `franchise_id` naming a franchise of another
  family is refused (422) on create and update for every media type, and in a
  tracker PATCH body too, although PATCH does not otherwise write
  `franchise_id` (`check_entry_franchise_family`,
  `app/services/domain/hierarchy.py`, run by the router factory).
- **Labels.** A franchise carries the content label of each gated type in
  its type list - `H-Comic` brings `h-comic`, `H-Game` brings `h-game`,
  `Hentai` brings `hentai`, and a franchise holding `H-Comic` and `Hentai`
  carries both - attached on auto-create and whenever a franchise is created
  or updated with that type (`app/services/domain/gated_labels.py`).
- A series is not segregated: it names its parent whatever that parent's
  type.

### Auto-created franchise type per media (`FRANCHISE_TYPE_FOR`, `app/services/domain/hierarchy.py`)

| Media / owner key | Stamped `franchise_type` |
|---|---|
| `"anime"` | `FranchiseType.ANIME` (`"Anime"`) |
| `"anime-movie"` | `FranchiseType.ANIME` (`"Anime"`) |
| `"series"` | `FranchiseType.ANIME` (`"Anime"`) |
| `"movie"` | `FranchiseType.MOVIE` (`"Movie"`) |
| `"tv-show"` | `FranchiseType.TV` (`"TV"`) |
| `"cartoon"` | `FranchiseType.CARTOON` (`"Cartoon"`) |
| `"manga"` | `FranchiseType.ACG` (`"ACG"`) |
| `"novel"` | `FranchiseType.NOVEL` (`"Novel"`) |
| `"comic"` | `FranchiseType.COMIC` (`"Comic"`) |
| `"game"` | `FranchiseType.GAME` (`"Game"`) |
| `"h-comic"` | `FranchiseType.H_COMIC` (`"H-Comic"`), labelled `h-comic` on creation |
| `"h-game"` | `FranchiseType.H_GAME` (`"H-Game"`), labelled `h-game` on creation |
| `"hentai"` | `FranchiseType.HENTAI` (`"Hentai"`), labelled `hentai` on creation |

Resolution rule (module docstring): a UUID passes through; a non-empty string is looked up case-insensitively across all five franchise name columns; a blank cell falls back to the entry's own titles; nothing found creates a franchise with the type above and whatever names were available.

## The twelve media types

Media-type keys are the hyphenated values in `MEDIA_TABLES` (`app/utils/media_resolver.py`); they are what `plan_next`, `media_relation`, `watch_order_item`, `note`, `quote` and `meme` store as a discriminator. Router/registry names use underscores (`anime_movie`, `tv_show`).

| Key | Table | Model docstring / purpose |
|---|---|---|
| `anime` | `anime` | One Japanese animation entry per season/cour or per OVA/special/movie-format release. `airing_type` is one of `"TV"`, `"ONA"`, `"OVA"`, `"OAD"`, `"Special"`, `"Movie"` (enum) — the dropdown adds `"Other"`. |
| `anime-movie` | `anime_movies` | A theatrical anime film tracked in its **own table**, with MAL metadata and no series link. |
| `movie` | `movies` | "Live-action and animated movie entries." `movie_type` is `"Reality"` or `"Animation"`. |
| `tv-show` | `tv_shows` | "Live-action and scripted TV show entries." One entry per season (`season_part`). |
| `cartoon` | `cartoons` | "Western animated TV show entries." `airing_type` is one of `"TV"`, `"Movie"`, `"OVA"`, `"Special"`. |
| `manga` | `manga` | "Manga, manhwa, and manhua entries." |
| `novel` | `novel` | "Light novel, web novel, and book entries." `novel_type` is `"Light Novel"`, `"Novel"`, `"Web"` or `"Other"`. |
| `comic` | `comic` | "Western comic runs, Marvel-focused. One entry is one numbered run." `comic_type` is `"Ongoing"`, `"Limited"`, `"One-Shot"` or `"Annual"`. |
| `game` | `games` | One **purchasable**, not one work: `game_type` is `"Base Game"`, `"DLC"`, `"Expansion"` or `"Bundle"`, and a DLC is a row in this same table with a `base_game_id`. Ownership is not a column - it is derived from the `game_copy` rows. |
| `h-comic` | `h_comic` | Adult comics, seen in the `unrestricted` access mode only. One table, two variants keyed on `region` (`"JP"` or `"KR"`, required): the columns a region does not use are cleared on every write path (see "H-Comic regions" below). A **gated type** - every entry carries the `h-comic` content label ([authorization.md](authorization.md)). Its `animation_status` is derived from hentai adaptations when it has any (see "H-Comic animation status" below). |
| `h-game` | `h_game` | Adult games, seen in the `unrestricted` access mode only: to `game` what `h-comic` is to `manga`. One purchasable per row as for game (`game_type`, a `base_game_id` self-FK for DLC), with Game's fill, purchase records (`game_copy`) and note sections. Its own fields: `playstyle`, `all_cg`, `language_availability`, `audio_availability`, `animation_availability`, `h_presentation`, `platform`, `dlsite_link_jp` / `_tw` (see "H-Game fields" below). A **gated type** - every entry carries the `h-game` content label. |
| `hentai` | `hentai` | Adult anime, seen in the `unrestricted` access mode only. **One entry is one episode**: no episode count, and watch orders treat it as whole. `source_material` is `"Original"`, `"Manga"` or `"Novel"`; `originality` reuses h-comic's `原創` / `同人`; `airing_status` is anime's vocabulary. A **gated type** - every entry carries the `hentai` content label. No notes section of its own. |

All twelve have their own router under `app/routers/` and a detail page in `frontend/src/App.jsx`. H-Comic's, H-Game's and Hentai's library and detail routes are gated: they, their nav rows and every other surface of each type in the SPA are drawn only for a session that can see that type ([frontend/components.md](frontend/components.md#gated-media-types)).

### H-Comic regions (`REGION_CLEARS`, `app/services/domain/h_comic.py`)

| Column | JP | KR |
|---|:-:|:-:|
| `h_comic_name_jp` / `h_comic_name_kr` | the JP name | the KR name (the other region's name is kept, not cleared - a name is harmless) |
| `originality`, `animation_status`, `series_number`, `page_total` | ✓ | cleared |
| `ch_total`, `ch_behind`, `highlight_group_order` | cleared | ✓ |
| the reader's `page_fin` (`user_media_list`) | ✓ | cleared |
| the reader's `ch_fin` (`user_media_list`) | cleared | ✓ |

The clears run in the registry's `progress_hook` / `progress_hook_list`, which the router factory calls on create, update and the tracker PATCH; Pull and Calculate run `enforce_h_comic_invariants` over the whole table instead (and `enforce_gated_label_invariants` for the label) ([data-actions.md](data-actions.md)). An entry with no region clears nothing. Only a KR entry takes the `h_comic_highlights` notes section.

### H-Comic animation status (`attach_animation_status`, `app/services/domain/h_comic.py`)

A JP h-comic's `animation_status` is **derived at read time** when the entry
has one or more `adaptation` relations from a hentai - the row
`hentai -adaptation-> h-comic`, read "the hentai is the Adaptation of the
h-comic" ([systems/relations.md](systems/relations.md)). A row the other way
round, or of another kind, does not count.

| Adapting hentai | Served `animation_status` | `animation_status_source` |
|---|---|---|
| at least one is `Airing` or `Finished Airing` | `Animated` | `derived` |
| all others (`Not Yet Aired`, `Rumored`, `Canceled`, blank) | `Announced` | `derived` |
| none | the stored hand-set value | `manual` |

A KR entry has no animation status (it is cleared), so it serves `null` for
both. The column always keeps the hand-set value, so deleting the relation
restores it and nothing needs recomputing when an airing status changes. The
list, detail and search reads derive it for the whole page in one query.

While the status is derived, a write that names the derived value (the form
sending back what it was served) is not stored, and a write naming any other
value is refused (422) - it could not take effect while the relation stands.

The SPA follows `animation_status_source` (`frontend/src/lib/hComicAnimation.js`).
While it is `derived`, the h-comic detail page shows the status with "Derived
from" and a link to each adapting hentai - read from the rows its Related
entries card already loaded (`RelationsSection`'s `onRows`), so naming them
costs no request - and the h-comic form shows the value read-only and leaves
`animation_status` out of the body it sends (`hComicFieldsPayload`). A
hand-set status is an ordinary select.

### H-Game fields (`app/services/domain/h_game.py`)

The fixed-choice fields carry closed vocabularies from `app/utils/constants.py`
([options.md](options.md)), not system options:

| Column | Shape | Values |
|---|---|---|
| `playstyle` | single | `H_GAME_PLAYSTYLES`: `ADV`, `RPG`, `SLG`, `Other` |
| `language_availability` | single | `H_GAME_LANGUAGE_AVAILABILITY`: `官方中文`, `中文補丁`, `無中文` |
| `audio_availability` | JSONB list | `H_GAME_AUDIO_AVAILABILITY`: `一般對話`, `H場景` |
| `h_presentation` (H 演出形式) | JSONB list | `H_GAME_H_PRESENTATIONS`: `靜圖`, `動圖`, `2D動畫`, `3D動畫`, `互動` |
| `platform` | JSONB list | `H_GAME_PLATFORMS`: `Steam`, `DLsite`, `Nintendo`, `Other` - hand-set, never filled from IGDB, and not Game's `game_platform` tag field |
| `animation_availability` | boolean | null is "unknown" |
| `all_cg` | string | `GAME_COMPLETION_FLAGS`, as Game's `all_endings` |

A value outside a vocabulary is a 422 on create, update and the tracker PATCH
(the registry's `progress_hook`, since PATCH has no schema). A list is
de-duplicated and kept in vocabulary order; `[]` is kept as an answer ("none
of these") and differs from null. The Sheets parser keeps only known values
and logs the rest rather than failing the tab. Game columns h_game does not
have: `hours_played`, `metacritic_score`, `metacritic_user_score`,
`all_achievements`, `all_collected`.

### Novel unit structure (`novel_unit`, `NOVEL_UNIT_KINDS_BY_TYPE`)

A novel is not one flat progress counter — it optionally holds `novel_unit`
child rows (volume / arc / story / chapter), and `novel.type` decides which
kinds the editor (`NovelUnitsEditor`) offers:

| `novel.type` | Kinds offered | Structure |
|---|---|---|
| `Light Novel` | `volume` | Volumes only, for display (subtitles, per-volume remarks). Progress is tracked flat via `vol_fin` / `vol_total_original` / `vol_total_tw` — volume rows never feed those columns (Decision B). Counts **nothing else**: see "Volume-only types" below. |
| `Novel` | `volume` | Same as Light Novel. |
| `Web` | `arc` | Two-stage progress: `arc_fin` (arcs fully finished) and `ch_fin_in_arc` (chapters into the current arc). `arc_total`, `ch_total` and `ch_fin` are derived from the arc rows' `ch_count` on every write — see `app/services/domain/novel_units.py` and [business-rules.md](business-rules.md). |
| `Other` | `volume`, `story`, `chapter` | Free-form structure for entries that fit neither pattern (e.g. a short-story collection); `story` and `chapter` rows are display-only, the same as `volume`. |

### Which counter a novel shows

`progress_display` picks the counter; the dropdown that sets it is built per
entry by `progressDisplayOptions(novel)` (`frontend/src/lib/novelUnits.js`),
never from a flat list, so a novel is only ever offered a counter it can
actually render:

| `novel.type` | Offered | Not offered |
|---|---|---|
| `Light Novel`, `Novel` | Default, `vol_original`, `vol_tw` | every chapter and arc counter |
| `Web` | Default, `ch` — plus `arc` and `arc_ch` **once the entry has arc rows** | every volume counter |
| `Other`, unset | Default, `vol_original`, `vol_tw`, `ch` | the arc counters (only Web holds arc rows) |

The five counters render as:

| Value | Tracker row | Cover rule |
|---|---|---|
| `vol_original` / `vol_tw` | `Volumes`, editable | `Volumes 3 / 11 · 27%` |
| `ch` | `Chapters`, editable — **read-only when the novel has arc rows**, because `ch_fin` is derived from them and an edit here would be overwritten on the next save | `Chapters 21 / 87 · 24%` |
| `arc` | `Arcs`: `arc 7 / 8 · 倒吊人` — the arc being read, its name, and the arc count. Stepping closes or reopens a whole arc and resets `ch_fin_in_arc` | `Arcs 6 / 8 · 75%` (arcs *finished*) |
| `arc_ch` | `Arc / Chapter`, the two-stage stepper | `Chapters`, the derived absolute pair |

`countsVolumes()` is the volume-side counterpart of `countsChapters()`, and
the two are deliberately asymmetric. Chapters on a light novel are
*meaningless*, so the server clears them. Volumes on a web novel are merely
*not the counter in use* — a web novel can get a print run later — so for
`Web` the columns are kept untouched and only hidden: no Volumes tracker row,
no volume inputs in the Add and Modify forms. Change the type back and the
numbers are still there.

An override the type cannot render is ignored. `effectiveProgressDisplay()`
falls back to the derived mode when the stored value is not in that entry's
option list — a `Web` row still holding `vol_tw` after a type change or a
Pull, say. The select still *shows* the stored value (appended by
`withLegacyProgressDisplay`, labelled `(legacy)`) so it is visible rather
than silently swapped, but nothing renders a row for it.

### Volume-only types

A type whose only allowed kind is `volume` — `Light Novel` and `Novel` — counts
volumes and nothing else. Its `arc_total`, `ch_total`, `arc_fin`, `ch_fin` and
`ch_fin_in_arc` are not empty, they are *meaningless*, so nothing renders or
edits them: no chapter row in `NovelTrackerBlock`, no chapter total on the
cover rule (it counts volumes instead), and no arc/chapter inputs in the Add
and Modify forms.

The rule is enforced where the data is, not only in the UI.
`derive_novel_progress()` clears those five columns for these types on every
write path — the forms, the tracker's inline PATCH, Pull, Fill and Calculate —
so a value cannot come back in through any of them, including a sheet that
still carries one. Arc rows arriving from a Pull are ignored for derivation and
deleted by the migration; the editor cannot create them.

The type list is `NOVEL_VOLUME_ONLY_TYPES` (`app/utils/constants.py`), derived
from `NOVEL_UNIT_KINDS_BY_TYPE` rather than typed a second time, and mirrored
in `frontend/src/lib/novelUnits.js` as `countsChapters()`. An unset or
unrecognised type is *not* volume-only: it keeps its chapter pair, on both
sides. Migration `v1o2l3o4n5l6` cleared the historical values once — it is not
reversible, since nothing else records what `ch_total` was.

Every unit also carries its own `my_rating`, on the same S..F scale as the
novel's - a per-volume or per-arc grade, shown as a chip beside the unit on
the detail page and set from a select in `NovelUnitsEditor`. It is
independent: nothing derives from it, and the novel's own rating stays
hand-set.

Only `arc` rows are authoritative for derivation; every other kind is
enrichment shown on the detail page via `display_key` (`unit_display_key` /
`unitDisplayKey`: an explicit `unit_key`, or a generated `"Vol 1"`/`"Arc 2"`
style label). Vocabulary source and drift guard: [options.md](options.md#novel-unit-kinds-apputilsconstantspy).

## Common points of confusion (from CLAUDE.md)

- **Anime Movie is not the same as Anime with `airing_type` "Movie".** Anime Movie has its own table `anime_movies`; an anime with `airing_type = "Movie"` lives in `anime`. "Anime Movie" almost always means the `anime_movies` rows.
- **"Reality franchise"** means a franchise whose type is "TV or Movie".
- **"Group"** usually means the grouping tiers collectively — collection, franchise, series — as opposed to individual media entries.

## Capability matrix

### Status, names, progress, source

| | `anime` | `anime-movie` | `movie` | `tv-show` | `cartoon` | `manga` | `novel` | `comic` | `game` | `h-comic` | `h-game` | `hentai` |
|---|---|---|---|---|---|---|---|---|---|---| --- |---|
| Status column | `watching_status` | `watching_status` | `watching_status` | `watching_status` | `watching_status` | `reading_status` | `reading_status` | `reading_status` | `playing_status` | `reading_status` | `playing_status` | `watching_status` |
| Status vocabulary | `WatchStatus` | `WatchStatus` | `WatchStatus` | `WatchStatus` | `WatchStatus` | `ReadStatus` | `ReadStatus` | `ReadStatus` | `PlayStatus` | `ReadStatus` | `PlayStatus` | `WatchStatus` |
| Default status | `"Might Watch"` | `"Might Watch"` | `"Might Watch"` | `"Might Watch"` | `"Might Watch"` | `"Might Read"` | `"Might Read"` | `"Might Read"` | `"Might Play"` | `"Might Read"` | `"Might Play"` | `"Might Watch"` |
| Display-name fallback (model `display_name`) | CN → EN → Alt → roman → JP | CN → EN → Alt → roman → JP | CN → EN → Alt | CN → EN → Alt | CN → EN → Alt | CN → EN → Alt → roman → JP | CN → EN → Alt → roman → JP | **EN → CN → Alt** | CN → EN → Alt → roman → JP | CN → EN → Alt → JP → KR | CN → EN → Alt → roman → JP | CN → EN → Alt → roman → JP |
| Name order in `NAMING_CONFIGS` (frontend) | cn, en, roman, jp, alt | cn, en, roman, jp, alt | cn, en, alt | cn, en, alt | cn, en, alt | cn, en, roman, jp, alt | cn, en, roman, jp, alt | en, cn, alt | cn, en, roman, jp, alt | cn, en, jp, kr, alt - the naming card shows the entry's own region's name only | cn, en, roman, jp, alt | cn, en, roman, jp, alt |
| Progress columns | `ep_fin` / `ep_total` (+ `ep_previous`, `ep_special`) | — (one sitting) | — (one sitting) | `ep_fin` / `ep_total` | `ep_fin` / `ep_total` | `ch_fin` / `ch_total`, `vol_fin` / `vol_total`, `vol_fin_page` | `ch_fin` / `ch_total` / `ch_fin_in_arc` (derived from `novel_unit` arc rows; cleared outright on `Light Novel` and `Novel`), `vol_fin` / `vol_total_original` / `vol_total_tw` (never derived), `arc_fin` / `arc_total`, `progress_display`, `units` | `issue_fin` / `issue_total` | No fraction at all: `hours_played` plus **five independent completion axes** - `completion_level`, `all_endings`, `all_achievements`, `all_collected`, `achievements_earned` / `achievements_total`. Nothing is derived from anything, including `all_achievements` from the counts. The middle three carry GAME_COMPLETION_FLAGS, so a game with no endings or no achievement list answers `Inapplicable` rather than leaving the axis blank. | `page_fin` / `page_total` (JP) or `ch_fin` / `ch_total` (KR), plus `ch_behind` (KR, hand-set: chapters behind the official source). The other region's pair is cleared on every write | Game's completion axes without the dropped ones: `completion_level`, `all_endings`, `all_cg`, `achievements_earned` / `achievements_total`. No `hours_played`, no `all_achievements` / `all_collected` | — (one entry is one episode) |
| Other status column | `airing_status` | `airing_status` | `airing_status` | `airing_status` | `airing_status` | `serialization_status` | `serialization_status` | `serialization_status` | `release_status` | `serialization_status` (`MANGA_SERIALIZATION_STATUSES`), plus `animation_status` (JP, hand-set) | `release_status` | `airing_status` (`AiringStatus`) |
| External id / link | `mal_id` / `mal_link` (Tenrai) | `mal_id` / `mal_link` (Tenrai) | `imdb_id` / `imdb_link` (TMDB + OMDb) | `imdb_id` / `imdb_link` (TMDB + OMDb) | `imdb_id` / `imdb_link` (TMDB + OMDb) | `mal_id` / `mal_link` (Tenrai) | `mal_id` / `mal_link` (Tenrai) | `comicvine_id` / `comicvine_link` (Comic Vine) | `igdb_id` / `igdb_link` (IGDB), plus `steam_appid` / `steam_link` (Steam) — the appid is normally adopted from IGDB's `external_games` and is what Steam and the derived SteamDB link both key off | none - there is no external API | `igdb_id` / `igdb_link` (IGDB) and `steam_appid` / `steam_link` (Steam), as game; `dlsite_link_jp` / `dlsite_link_tw` are plain links nothing fetches | `mal_id` / `mal_link` (Tenrai: airing status, release date and cover only) |
| Sources card heading | Where to Watch | Where to Watch | Where to Watch | Where to Watch | Where to Watch | Where to Read | Where to Read | Where to Read | **Where to Play** | Where to Read | **Where to Play** - the DLsite links render there beside Steam | Where to Watch |
| Access `main` platforms | baha, netflix, disney_plus, prime, bilibili, crunchyroll | (same as anime) + Cinema | netflix, disney_plus, prime, hbomax, apple_tv | netflix, disney_plus, prime, hbomax, apple_tv | netflix, disney_plus, prime, hbomax, apple_tv | none | none | none | **none** - a game is played on a platform, not watched on one: that is the `game_platform` tag field, and which copy was owned is `game_copy`. The Sources editor hides the access group for games | none seeded | none seeded; where it is sold is the `platform` column | none seeded |
| Reference `main` sources | official, twitter, anilist, wiki, fandom, keyframe_staff | (same as anime) | wiki | wiki | wiki | twitter, anilist, wiki, fandom | twitter, anilist, wiki, fandom | official, wiki, fandom | SteamDB (**derived**: `derive_steamdb_source` writes it from `steam_appid` in `game_post_processing`, so every entry in a run gets it and not only the queued ones; fill-only, so a hand-entered row wins), HowLongToBeat, Metacritic, Official site, Wikipedia, Fandom wiki | none seeded | SteamDB (**derived**, as for game) | none seeded |
| Publisher credit label (`credit_label("publisher", type)`) | 台灣代理商 | 台灣代理商 | — | — | — | 台灣出版商 | 台灣出版商 | 出版商 | 發行商 | — | — | — |
| Publisher sheet header (`sheet_column_for`) | `distributor_tw` | `distributor_tw` | — | — | — | `publisher_tw` | `publisher_tw` | `publisher` | `publisher` | — | — | — |
| Origin/exclusivity tag field | `exclusive_source` (single) | `exclusive_source` (single) | `original_source` (multi) | `original_source` (multi) | `original_source` (multi) | `serialization_platform` (multi) | `serialization_platform` (multi) | — | — | `original_source` (multi) - the KR official source | — | — |

Six of the twelve credit a **publisher** - one `publisher` credit role, one
`publisher` entity table, six reader-facing labels. Movies, TV shows and
cartoons credit none. The label and the sheet header are independent: the
header is whatever that tab has always been called, while the label is what a
reader sees, and `_LABEL_OVERRIDES` in `app/utils/credit_roles.py` owns it.
Which publishers a type's picker offers is `publisher_scope`
(see [data-model.md](data-model.md#publisher_scope)), so a games publisher is
never suggested as an anime distributor. Anime Movie carries a
`distributor_tw` of its own.

Every type also gets `other` and `restricted` free-form access/reference
buckets on `media_source`, gated by the `sources_other` / `sources_restricted`
field groups. Table and column detail: [data-model.md](data-model.md#media_source);
authorization: [authorization.md](authorization.md); the rule that decides
column vs. `media_source` row: [business-rules.md](business-rules.md).

Status values themselves are listed in [options.md](options.md). The frontend `MEDIA_CONFIG` (`frontend/src/config/mediaRegistry.js`) mirrors the status column as `statusField` and `statusType: "watch" | "read" | "play"` — the third case arrived with games.

### Pages

| | `anime` | `anime-movie` | `movie` | `tv-show` | `cartoon` | `manga` | `novel` | `comic` | `game` | `h-comic` | `h-game` | `hentai` |
|---|---|---|---|---|---|---|---|---|---|---| --- |---|
| Library page | `/library/anime` | `/library/anime-movie` | `/library/movie` | `/library/tv-show` | `/library/cartoon` | `/library/manga` | `/library/novel` | `/library/comic` | `/library/game` | `/library/h-comic` (gated) | `/library/h-game` (gated) | `/library/hentai` (gated) |
| Detail route | `/anime/:system_id` | `/anime-movie/:system_id` | `/movie/:system_id` | `/tv-show/:system_id` | `/cartoon/:system_id` | `/manga/:system_id` | `/novel/:system_id` | `/comic/:system_id` | `/game/:system_id` | `/h-comic/:system_id` (gated) | `/h-game/:system_id` (gated) | `/hentai/:system_id` (gated) |
| API base (`MEDIA_CONFIG.apiEndpoint`) | `/api/anime` | `/api/anime-movie` | `/api/movies` | `/api/tv-shows` | `/api/cartoon` | `/api/manga` | `/api/novel` | `/api/comic` | `/api/game` | `/api/h-comic` | `/api/h-game` | `/api/hentai` |
| Dashboard card on `/` (`Index.jsx`) | `DashboardCard` | none | none | `DashboardCard` | `DashboardCard` | `DashboardCard` (reading section) | `NovelDashboardCard` | `ComicDashboardCard` | none | none | none | none |

`/library/:type` is one page (`frontend/src/pages/library/Library.jsx`) that picks a config from `LIBRARY_CONFIGS` (`frontend/src/pages/library/configs/index.js`), which has twelve keys; `/library/h-comic`, `/library/h-game` and `/library/hentai` are each declared on their own route, behind their gates, and render the same page. The dashboard loads `anime`, `franchise`, `tv-show`, `cartoon`, `manga`, `novel`, `comic` and `game` lists, plus `anime-movie` and `movie` for a signed-in member; those two have no card and appear only in the Coming Next block under the weekly schedule.

### Plan-next, rewatch, size buckets (`app/utils/plan_next_kinds.py`)

| | `anime` | `anime-movie` | `movie` | `tv-show` | `cartoon` | `manga` | `novel` | `comic` | `game` | `h-comic` | `h-game` | `hentai` |
|---|---|---|---|---|---|---|---|---|---|---| --- |---|
| `ALLOWED_SCOPES["next"]` | `entry`, `series`, `franchise` | `entry` | `entry`, `series`, `franchise` | `entry`, `series`, `franchise` | `entry`, `series`, `franchise` | `entry` | `entry` | `entry`, `series` | `entry`, `series`, `franchise` | `entry` | `entry`, `series`, `franchise` | `entry` |
| `ALLOWED_SCOPES["rewatch"]` | `franchise` | `entry` | `entry`, `series`, `franchise` | `entry`, `series`, `franchise` | `franchise` | `entry` | `entry`, `series`, `franchise` | `entry`, `series` | `entry`, `series`, `franchise` | `entry` | `entry`, `series`, `franchise` | `entry` |
| Virtual plan flags (`PLAN_FLAG_FIELDS`) | `watch_next` | `watch_next`, `to_rewatch` | `watch_next`, `to_rewatch` | `watch_next`, `to_rewatch` | `watch_next` | `read_next`, `to_reread` | `read_next`, `to_reread` | `read_next`, `to_reread` | `play_next`, `to_replay` | `read_next`, `to_reread` | `play_next`, `to_replay` | `watch_next`, `to_rewatch` |
| Size buckets (`SIZE_THRESHOLDS`) | `12ep` (≤12), `24ep` (≤24), `30ep_plus` | none | `standalone` (1), `2_3movies` (≤3), `4movies_plus` | `1season`, `2season`, `3season_plus` | `1season`, `2season`, `3season_plus` | none | none | `1_3` (≤3), `4_10` (≤10), `11_plus` | none (deferred: hours, not counts, is the honest measure) | none | none | none |
| Measured against (`SIZE_MEASURE`) | `sum_ep_total` | — | `count` | `count` | `count` | — | — | `sum_issue_total` | — | — | — | — |
| Where the bucket lives | series/franchise maps | — | series/franchise maps | series/franchise maps | series/franchise maps | — | — | **the entry's own `issue_total`** | — | — | — | — |

Why the two scope maps differ (module comment): "anime is queued one season at a time but rewatched as a whole franchise, and novels are reread at every tier though they are only ever queued one book at a time." A type has an entry-level rewatch flag if and only if `"entry"` is in its rewatch scopes (asserted at import).

Buckets are stored on franchise and series as two JSONB maps keyed by media type (`size_group_derived`, written by Calculate; `size_group_manual`, written by the admin and never touched by Calculate); manual wins. An entry's bucket is resolved at display time from its series, then its franchise — except comic, which buckets on its own `issue_total` (`app/services/domain/size_group.py`). Details and the Plan page: [systems/plan-next.md](systems/plan-next.md).

### Watch-order range unit (`frontend/src/components/tracker/WatchOrderGuide.jsx`)

| | `anime` | `anime-movie` | `movie` | `tv-show` | `cartoon` | `manga` | `novel` | `comic` | `game` | `h-comic` | `h-game` | `hentai` |
|---|---|---|---|---|---|---|---|---|---|---| --- |---|
| From/to range offered (`supportsEpisodeRange`) | yes | no | no | yes | yes | no | no | yes | yes (by default — `game` is in neither set) | no - whole-only, like manga | no - whole-only, as the API treats it | no - whole-only: one entry is one episode |
| Unit label (`RANGE_UNITS`, default `"Ep"`) | `Ep` | — | — | `Ep` | `Ep` | `Ch` | `Ch` | `#` | `Ep` (the fallback; no game unit declared) | — | — | — |

`WHOLE_ONLY_TYPES = {"movie", "anime-movie", "manga", "novel", "h-comic", "h-game", "hentai"}`: those steps always cover the work whole. On the backend a hentai step is whole too - `hentai` has no `_TOTAL_FIELDS` entry in `app/services/domain/watch_order.py`. An unknown or null `media_type` keeps the range inputs. (The test file is `frontend/src/components/tracker/watchOrderRange.test.js`; there is no `frontend/src/utils/watchOrderRange.js`.) See [systems/watch-orders.md](systems/watch-orders.md).

### Fill / Replace pipelines (`app/services/pipelines/specs.py`)

| | `anime` | `anime-movie` | `movie` | `tv-show` | `cartoon` | `manga` | `novel` | `comic` | `game` | `h-comic` | `h-game` | `hentai` |
|---|---|---|---|---|---|---|---|---|---|---| --- |---|
| Id extractor | `apply_extract_mal_id_anime` | `apply_extract_mal_id_anime` | `apply_extract_imdb_id` | `apply_extract_imdb_id` | `apply_extract_imdb_id` | `apply_extract_mal_id_manga_novel` | `apply_extract_novel_ids` (`apply_extract_mal_id_manga_novel` then `apply_extract_openlibrary_id`) | `apply_extract_comicvine_id` | `apply_extract_game_ids` (IGDB then Steam) | none | `apply_extract_game_ids`, as game | `apply_extract_mal_id_anime` |
| Fill eligible when | `mal_id` set and missing values | `mal_id` set and missing values | missing values | missing values | `airing_type` in `{"Movie", "TV"}` and missing values | `mal_id` set and missing values | `mal_link` set and missing MAL values, **or** `mal_link` unset and `openlibrary_id` set and missing Open Library values | `comicvine_id` set and missing values | `igdb_id` set and missing IGDB values, **or** `steam_appid` set and Steam has written nothing yet | never (no external API) | as game | `mal_id` set and `airing_status`, `release_date` or the cover missing |
| Fill function | `autofill_anime_from_mal` | `autofill_anime_movie_from_mal` | `autofill_movie_from_imdb` | `autofill_tv_show_from_imdb` | `autofill_cartoon_from_imdb` | `autofill_manga_from_mal` | `autofill_novel_from_mal` / `autofill_novel_from_openlibrary` (routed on `mal_link`) | `autofill_comic_from_comicvine` | `autofill_game_from_igdb` then `autofill_game_from_steam` | none | game's two, generalised over the table: IGDB writes only `studio`, `game_genre`, `game_theme` and h_game's columns; Steam only prices and achievements | `autofill_hentai_from_mal` |
| Pause between calls | `MAL_PAUSE` (1 s) | 1 s | none | none | none | 1 s | 1 s | `COMICVINE_PAUSE` (1 s) + hourly budget | `STEAM_PAUSE` (0.5 s) + Steam storefront budget | none | as game | `MAL_PAUSE` (1 s) |
| After Fill | derive `ep_previous`, `run_sync_anime` | `run_sync_anime_movie` | — | `run_sync_tv_show` | `run_sync_cartoon` | `run_sync_manga` | `run_sync_novel` | `run_sync_comic` | `run_sync_game` | `run_sync_h_comic`, `run_sync_gated_labels` | `run_sync_game`, `run_sync_gated_labels` | `run_sync_hentai`, `run_sync_gated_labels` |
| Bulk Replace selects | rows with `mal_id` or `mal_link` | rows with `mal_id` or `mal_link` | rows with `imdb_id` or `imdb_link` | rows with `imdb_id` or `imdb_link` | TV/Movie rows with `imdb_id` or `imdb_link` | rows with `mal_id` or `mal_link` | rows with `mal_id` or `mal_link` | **no bulk Replace** (`replace=None`) | rows with `steam_appid`, `steam_link`, `igdb_id` or `igdb_link` (IGDB fill-only, then Steam) | **no bulk Replace** | as game | rows with `mal_id` or `mal_link` |
| In Fill All / Replace All | yes / yes | yes / yes | yes / yes | yes / yes | yes / yes | yes / yes | yes / yes | **no / no** (`in_fill_all=False`, `in_replace_all=False`) | yes / yes | **no / no** | yes / yes | yes / yes |

`PIPELINES["game"]` shipped with this backend as a spec that fetched nothing - registration demands one, since `MEDIA_TABLES` membership is asserted by `test_sheet_tabs` and by the data-control route builder - and gained its IGDB Fill immediately afterwards, in its own plan. **Game now has a bulk Replace**, its first: IGDB still carries no score or rank that drifts, so Replace runs `autofill_game_from_steam` only, re-fetching the live prices, the Metacritic score and this collection's own playtime. See [external-apis.md](external-apis.md#steam) for the full mapping, the request budget, and the `steam_progress_sync` lock.

`PIPELINES["h-comic"]` fetches nothing: Fill finds nothing eligible, and the single-entry write hook only runs `run_sync_h_comic`, which clears each region's unused columns, and `run_sync_gated_labels`, which keeps the `h-comic` label on every entry and every `H-Comic` franchise.

`PIPELINES["hentai"]` reads Tenrai's anime record - the same endpoint and mapper anime uses, which serves Rx titles - for **three things only**: `airing_status` and `release_date` (fill-only) and the cover (downloaded only when the entry has none). Names, studio, scores and AniList are not written. Every run and the single-entry write hook end in `run_sync_hentai` (system options) and `run_sync_gated_labels`, which keeps the `hentai` label on every entry and every `Hentai` franchise.

`PIPELINES["h-game"]` is game's spec on the `h_game` table: the same gates, pacing and Replace, with `autofill_game_from_igdb` / `autofill_game_from_steam` generalised over the model. They write only what `h_game` has - IGDB the columns, the `studio` credit and the `game_genre` / `game_theme` tags, never `publisher`, `game_mode` or `game_platform`; Steam prices and achievements, never `hours_played` or a Metacritic score - and look the DLC parent up among h-games only. After a run, `run_sync_game` extracts the system options and `run_sync_gated_labels` keeps the `h-game` label on - h-game has no invariant pass of its own, since its vocabularies are checked on every write and its label is the only thing a restore could lose.

End-to-end pipeline behaviour: [data-actions.md](data-actions.md); the external services: [external-apis.md](external-apis.md).

### Duplicate rule key (`app/services/domain/duplicates.py`)

Every finder is the same rule: rows that agree exactly on the key **and** share at least one name (case-insensitive, via `get_all_names`) are duplicates, transitively.

| Finder | Key | Extra match |
|---|---|---|
| franchise | `franchise_type` (each comma-separated token separately) | — |
| series | `franchise_id` | — |
| `anime` | `franchise_id`, `series_id`, `airing_type`, `season_part` (lower-cased), `is_main`, `ep_special` | — |
| `anime-movie` | `franchise_id` | — |
| `movie` | `franchise_id`, `series_id` | — |
| `tv-show` | `franchise_id`, `series_id`, `season_part` (lower-cased), `is_main` | — |
| `cartoon` | `franchise_id`, `series_id`, `season_part` (lower-cased), `is_main` | — |
| `manga` | `franchise_id`, `series_id`, `is_main` | — |
| `novel` | `franchise_id`, `series_id`, `is_main` | — |
| `comic` | `franchise_id`, `series_id`, `is_main_entry` | a shared name **or** the same non-null `comicvine_id` |
| `game` | `franchise_id`, `series_id`, `game_type` | — |
| `h-comic` | `franchise_id`, `series_id`, `region`, `series_number` | — |
| `h-game` | `franchise_id`, `series_id`, `game_type`, `series_number` | — |
| `hentai` | `franchise_id`, `series_id`, `series_number` | — |

All entry finders except anime skip rows whose `franchise_id` is null. Report keys in `find_all_duplicates` use underscores (`anime_movie`, `tv_show`, `h_comic`, `h_game`); hentai's is `hentai`. The rule text is in [business-rules.md](business-rules.md).

### Notes sections (`app/utils/note_sections.py`)

Sections whose `owners` is `ALL_OWNERS` (all twelve types plus `series`, `franchise`, `collection`): `remark`, `remark_list`, `advantages`, `disadvantages`, `double_edged`, `public_reviews`, `personal_reviews`, `analysis`, `resources`, `questions`, `memes`. `quotes` is `ENTRY_OWNERS` (the twelve media types only). Hentai has no section of its own, so it appears in none of the columns below. The type-specific sections:

| Section key | `anime` | `anime-movie` | `movie` | `tv-show` | `cartoon` | `manga` | `novel` | `comic` | `game` | `h-comic` | `h-game` | series / franchise |
|---|---|---|---|---|---|---|---|---|---|---| --- |---|
| `episode_comments` | x | | | x | x | | | | x (label `各章評論 Part Reviews`, locator "Chapter / Part") | | x (as game) | |
| `highlights` (kinds `神回`/`神片段`/`神篇章`) | x | | | | | | | | | |  | |
| `highlight_episodes` | | | | x (kinds) | x (kinds) | x (label `神回`, locator "Chapter(s)") | | | | |  | |
| `highlight_passages` | | | | | | | x | | | |  | |
| `highlight_moments` (label `神場景 Highlights`, locator "Chapter / Boss") | | | | | | | | | x | | x | |
| 攻略 group — `beginner`, `guide_notes`, `trivia` (`text_links`), `gameplay_systems`, `controls` (`structured`) | | | | | | | | | x | | x | |
| 養成&流派 group — `stats_and_points`, `skills`, `builds_and_styles`, `team_composition` (`structured`) | | | | | | | | | x | | x | |
| 物品 group — `weapons_and_gear`, `items`, `collectibles` (`structured`) | | | | | | | | | x | | x | |
| 圖鑑與名詞 group — `characters_guide`, `enemies`, `game_terms`, `player_terms` (`structured`) | | | | | | | | | x | | x | |
| 資源&工具 group — `mods_and_tools`, `guide_resources` (`structured`) | | | | | | | | | x | | x | |
| 劇情 group — `main_plot`, `side_plot` (`episode_text`, locator optional) | | | | | | | | | x | | x | |
| 劇情列表 group — `story_list_main`, `story_list_side`, `story_list_character`, `story_list_event` (`structured`, nestable) | | | | | | | | | x | | x | |
| 劇情 group — `character_arcs`, `lore`, `mysteries`, `story_other` (`text_links`), `timeline` (`text`), `story_terms` (`structured`) | | | | | | | | | x | | x | |
| 待辦 group — `todo_now`, `todo_next`, `todo_later`, `todo_maybe` (`text_links`, personal scope) | | | | | | | | | x | | x | |
| `cinematography` (`分鏡/演出/巧思`) | x | x | | x | x | x | | | | |  | series |
| `craft` (`巧思`) | | | | | | | x | | | |  | |
| `foreshadowing` | x | x | | x | x | x | x | | | |  | both |
| `symmetry` | x | x | | x | x | x | x | | | |  | both |
| `op`, `ed`, `insert_songs`, `ost` | x | | | | | | | | | |  | |
| `op_ed_changes` | x | | | x | x | | | | | |  | |
| `extended_episodes` (`加長`) | x | | | x | x | | | | | |  | |
| `adaptation` | x (desc required) | x (desc required) | | x | x | | x (desc required) | | | |  | both |
| `h_comic_highlights` (`structured`, grouped by `female_characters`, KR entries only) | | | | | | | | | | x |  | |
| `h_game_highlights` (`structured`, grouped by `female_characters`, locator "Route / Scene") |  |  |  |  |  |  |  |  |  |  | x |  |

Movie and comic get only the shared sections, and H-Comic one of its own, `h_comic_highlights`, which a JP entry refuses (422) through the section's `owner_where`. H-Game takes every game section - they name `GAME_OWNERS`, `("game", "h-game")`, with game's labels, placeholders and groups - plus `h_game_highlights`, h-comic's highlight fields with the locator labelled "Route / Scene" and no `owner_where`. Game carries 36 of its own - `highlight_moments` plus the 攻略 (5), 養成&流派 (4), 物品 (3), 圖鑑與名詞 (4), 資源&工具 (2), 劇情 (4), 劇情列表 (4), 世界觀 (5) and 待辦 (4) groups - beside the shared ones. The guide used to be one card of fifteen sections; five cards, each answering one question, is what it reads as now. It is also the one owner type that reads 解析 Analysis inside 評論 Reviews rather than in a card of its own (`groups_by_owner`), and the one whose 待辦 buckets render inside the detail page's Progress slip rather than as a card. Its guide bookmarks are **`guide_resources`, in the 資源&工具 card immediately before Resources**; the site-wide `resources` section (shape `name_links`, `ALL_OWNERS`, standalone) is a separate section games also inherit, and two keys with two labels is deliberate, because a second card called "Resources" would be unreadable. Shapes, groups and validation: [systems/notes.md](systems/notes.md).
