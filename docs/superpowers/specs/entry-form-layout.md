# Entry form layout spec — one shared body per type, one canonical order

Paths relative to `C:\Users\q601513\Documents\personal\cg1618\media\frontend\src` unless `app/...` / `docs/...`.
Line numbers were taken from `dev` at the time of writing — re-read before editing; they drift.

## Owner decisions (final)
- Canonical section order below, for all 12 types (Anime, AnimeMovie, Movie, TvShow, Cartoon, Manga, Novel, Comic, Game, HGame, HComic, Hentai), mirroring the detail pages.
- Add AND Modify share ONE form body per type (Game pattern). Differences between the pages live in the wrappers / page files, never as a mode flag beyond `ownerId`.
- Names: CN always top-left. Rows: `cn | en`, `roman | jp` (only types that have them; HComic jp or kr by region), `alt` full. Label "Romaji" everywhere (not "Roman"/"roman").
- Add to Modify the fields the detail page shows but Modify can't edit: AniList rank + AniList popularity rank (Anime, AnimeMovie, Manga, Novel), Movie `imdb_rating`. (Game Metacritic is already editable.)
- Comic NamingCard (detail page) becomes CN-first: `config/namingConfigs.js` comic → `["comic_name_cn","comic_name_en","comic_name_alt"]`. `getDisplayName`/sort name stay EN-first (backend matches).
- Totals sit in My Tracker beside their "finished" field (`ep_fin | ep_total`, `ch_fin | ch_total`, `vol_fin | vol_total`, `issue_fin | issue_total`, `page_fin | page_total`). Lone totals, lengths and EP Special go in Information.
- Comic: add an editable "Comic Vine ID" (number) beside Comic Vine Link, on both pages; load it in `comicToForm`, send it in `saveComic`.
- Game / HGame `release_date` moves to **Information** (Release & Prices keeps only prices).
- Replace the 7 bespoke Modify ribbons with the shared `FranchiseRibbon` (keep Movie's excluded big franchises via `franchiseId={excluded ? null : id}`); all ribbons render ABOVE the card; AnimeMovie gets one too.
- Anime / AnimeMovie franchise picker keeps accepting every franchise type (unchanged behaviour).
- Structured Notes section: unchanged.

## Canonical sections (titles + icons identical everywhere; omit what a type lacks)
1. "Titles & Naming" `fa-tag` — (HComic: `region` first, required) · `franchise | series` (AnimeMovie franchise only, left half) · names as above
2. "Scores" `fa-star`
3. "My Tracker" `fa-chart-bar` — status | my_rating (| usefulness) · progress pairs fin | total, time_fin · type extras · flags row last
4. "Information" `fa-info-circle`
5. "Genres & Labels" `fa-tags` (GenreLabelFields renders it; types without Label use "Genres"), then TagReplace. HGame adds "Presentation" `fa-layer-group`.
6. "Production" `fa-pen-nib`
7. "Cast" `fa-users`
8. Type extras: "Prices" `fa-tag`/existing icon (Game/HGame — prices only now), "Copies" `fa-box-open` (self.list gate), "Read Order" `fa-link` (Novel, Comic), "Units" `fa-book-open` (Novel)
9. "Links & Sources" `fa-external-link-alt` — id | link pairs, original/exclusive source, serialization_platform, then SourcesEditor
10. "Cover & Remark" `fa-image` — ImagePicker, remark
11. "Structured Notes" (Modify only, unchanged)

Conventions: `a | b` = `grid-cols-1 md:grid-cols-2`; `a | b | c` = md:grid-cols-3, etc. No `required` asterisk on names (page validation is "at least one name"). Number inputs `type="number"`, `min="0"` on counters. Inputs read `f[key] ?? ""`. **A body must never write a default on mount**: credit/tag keys stay `undefined` in Modify state until `loadCreditsIntoForm` resolves and `buildCreditsPayload` (lib/payloads.js) relies on that. Every release date uses `ReleaseDateInput`. Keep Add's placeholders/hints (incl. "English title" and "Search or type new franchise..." — `Add.anime.test.jsx` queries them). `cred` = travels via CREDITS_FIELD_MAP/saveCredits.

## Per-type layout (section: rows)
### Anime
1: franchise|series · anime_name_cn|_en · _roman|_jp · _alt full
2: mal_rating|mal_rank|anilist_rating · anilist_rank|anilist_popularity_rank
3: watching_status|my_rating · ep_fin|ep_total|time_fin · ep_previous|broadcast_day|broadcast_time|my_watch_day · flags: watch_next
4: is_main|season_num|part_num (form-only; payload derives season_part) · airing_type|airing_status · release_season|release_date · ep_special
5: GenreLabelFields (add "anime" to GENRE_LABEL_TYPES in lib/genreLabelFields.js; replace the inline copy) + TagReplace
6: studio|distributor_tw · director|producer · music ("Music / Composer") (cred)
7: CastEditor
9: mal_id|mal_link · exclusive_source (cred, max 1) · SourcesEditor
10: cover, remark
### AnimeMovie
1: franchise (left half) · names cn|en, roman|jp, alt
2: as Anime
3: watching_status|my_rating · time_fin · flags watch_next|to_rewatch
4: airing_status · release_date_jp|release_date_tw (ReleaseDateInput — Modify today uses type=date, which cannot hold YYYY/YYYY-MM) · length_min
5: GenreLabelFields · 6: studio|distributor_tw ("Distributor TW") · director · 7: Cast · 9: mal_id|mal_link · exclusive_source · Sources · 10
### Movie
1: franchise|series · movie_name_cn|_en · _alt full
2: imdb_rating (NEW everywhere: factory, both payloads, liveMovieToForm, body)
3: watching_status|my_rating · time_fin · flags watch_next|to_rewatch
4: is_main|movie_type · airing_status · release_date_tw|release_date_usa (ReleaseDateInput) · length_min
5: GenreLabelFields · 6: director (cred) · 9: imdb_id|imdb_link · original_source (cred) · Sources · 10
### TvShow
1: franchise|series · tv_name_cn|_en · _alt
2: imdb_rating
3: watching_status|my_rating · ep_fin|ep_total|time_fin · flags watch_next|to_rewatch
4: is_main|season_part ("Season")|region · airing_status|release_date (ReleaseDateInput)
5: GenreLabelFields · 9: imdb_id|imdb_link · original_source (cred) · Sources · 10
### Cartoon
1: franchise|series · cartoon_name_cn|_en · _alt
2: imdb_rating
3: watching_status|my_rating · ep_fin|ep_total|time_fin · flags watch_next (schema has no to_rewatch)
4: is_main|season_part · airing_type|airing_status · release_date|length_ep_min ("Ep Length (min)")
5: GenreLabelFields · 9: imdb_id|imdb_link · original_source · Sources · 10
### Manga
1: franchise|series · manga_name_cn|_en · _roman|_jp · _alt
2: mal_rating|mal_rank|anilist_rating · anilist_rank|anilist_popularity_rank (add to mangaToForm + saveManga)
3: reading_status|my_rating · ch_fin|ch_total · vol_fin|vol_total|vol_fin_page · flags read_next|to_reread
4: region|is_main · serialization_status · release_date|end_date
5: GenreLabelFields · 6: author_plot|author_draw · publisher_tw|anime_studio · 7: Cast
9: mal_id|mal_link · serialization_platform (cred) · Sources · 10
### Novel
1: franchise|series · novel_name_cn|_en · _roman|_jp · _alt
2: as Manga (ranks: add to novelToForm + saveNovel)
3: reading_status|my_rating · progress_display (use `withLegacyProgressDisplay(progressDisplayOptions(f), f.progress_display)` on both pages) · [countsChapters] ch_fin|ch_total · arc_fin|arc_total · [countsVolumes] vol_fin|vol_total_original ("Total Volumes (JP/KR)")|vol_total_tw · flags read_next|to_reread
4: region|type|is_main|version · serialization_status · release_date|end_date
5: GenreLabelFields · 6: author|illustrator · publisher_tw (ComboBox) · 7: Cast · 8: Read Order (read_order), Units (NovelUnitsEditor)
9: mal_id|mal_link · openlibrary_id|openlibrary_link · serialization_platform · Sources · 10
### Comic
1: franchise|series · comic_name_cn|_en (CN LEFT) · _alt full
3: reading_status|my_rating · issue_fin|issue_total · flags read_next|to_reread
4: comic_type|volume_label · serialization_status · release_date|end_date · continuity|era · events full (array↔string via eventsToString/eventsToArray)
5: GenreLabelFields · 6: writer|artist · publisher|imprint · 8: Read Order
9: comicvine_id ("Comic Vine ID", NEW editable)|comicvine_link · Sources · 10
### Game (body exists — reorder/relabel)
1: franchise|series · game_name_cn|_en · _roman|_jp · _alt
2: metacritic_score|metacritic_user_score
3: playing_status|my_rating · hours_played|achievements_earned|achievements_total|steam_progress_sync · completion_level|all_endings|all_achievements|all_collected · flags play_next|to_replay
4: is_main|game_type|base_game_id · release_status|release_date|current_patch · hltb_main|hltb_main_extra|hltb_completionist · game_platform|game_mode|combat_mode
5: game_genre|game_theme · label · TagReplace ["game_genre","label"]
6: studio ("Developer")|publisher · director|composer
8: Prices (price_original_us/jp/tw · price_current_us/jp/tw), Copies (self.list gate)
9: igdb_id|igdb_link · steam_appid|steam_link · Sources (showAccess={false}) · 10
### HGame
1: franchise|series · names cn|en, roman|jp, alt
3: playing_status|my_rating|usefulness · achievements_earned|achievements_total|steam_progress_sync · completion_level|all_endings|all_cg · flags play_next|to_replay
4: is_main|game_type|base_game_id · release_status|release_date|current_patch · hltb ×3 · playstyle|series_number|language_availability · platform full (ChoiceChips)
5: game_genre|game_theme · h_genre_plot|h_genre_appearance|h_genre_relation · TagReplace · "Presentation": art_style, h_art_style, h_presentation, dialogue_audio, sound_effect (full-width ChoiceChips, detail order)
6: studio ("Developer") · 8: Prices, Copies · 9: igdb_id|igdb_link · steam_appid|steam_link · dlsite_link_jp|dlsite_link_tw · Sources (showAccess={false}) · 10
### HComic
1: region (HComicRegionField, required, left half) · franchise|series · h_comic_name_cn|_en · _jp or _kr (left half, by showsField) · _alt full
3: reading_status|my_rating|usefulness · JP page_fin ("Pages Read")|page_total · KR ch_fin ("Chapters Read")|ch_total · flags read_next|to_reread
4: serialization_status · release_date|end_date · KR ch_behind · originality|animation_status|series_number (each behind shows(); derived animation_status read-only)
5: h_genre ×3 · TagReplace · 6: club|illustrator ("繪師") · KR author · 7: Cast
9: mal_link|mal_id (read-only) · ehentai_link · KR original_source ("Official Source") · Sources (restrictedSources) · 10
### Hentai
1: franchise|series · hentai_name_cn|_en · _roman ("Romaji")|_jp · _alt
3: watching_status|my_rating|usefulness · ep_fin|ep_total|time_fin · flags watch_next|to_rewatch
4: airing_status|release_date · source_material|originality|series_number
5: h_genre ×3 · TagReplace · 6: studio|director · author · 7: Cast · 9: mal_link|anidb_link · Sources · 10

Schema-only keys that stay out of forms: completed_at (all), type_slots (Movie, Game, HGame), ch_fin_in_arc (Novel), highlight_group_order (HGame, HComic).

## Shared-body API (Game pattern)
Home: `pages/add-tabs/<T>AddTab.jsx` exports `<T>FormBody` and `<T>LineageFields`; default export is the Add wrapper. Modify tab imports them.
- `<T>FormBody({ f, u, sources, ownerId })` for Anime, AnimeMovie, Movie, TvShow, Cartoon, Manga, Novel, Comic. Game/HGame/HComic/Hentai keep their current signatures (`GameFormBody({f,u,allGames,excludeGameId,sources,ownerId})`, `HGameFormBody({f,u,allHGames,excludeId,sources,ownerId})`, `HComicFormBody({f,u,sources,ownerId})`, `HComicRegionField({f,u})`, `HentaiFormBody({f,u,sources,ownerId})`).
- `ownerId` (= editingItem.system_id on Modify, undefined on Add) is the ONLY in-body difference: ImagePicker `ownerId` and `u("pending_image_id", ownerId ? null : imageId)` (copy GameAddTab's cover block), CastEditor `entryId={ownerId}`, TagReplace/GenreLabelFields `entryId={ownerId}`.
- `<T>LineageFields({ f, u, allFranchises, seriesItemsFor<T>, franchiseCollections })` (AnimeMovie: no series prop) = thin wrappers over an extended `components/forms/FamilyLineageFields.jsx`: add `accepts(franchise_type)` predicate prop as an alternative to `family`; render Series only when series items are given; franchise|series as one 2-col row; changing franchise clears series everywhere (Anime currently doesn't — fix). Filters: Anime/AnimeMovie accept all; Movie "Movie"/untyped; TV "TV"/untyped; Cartoon "Cartoon"/untyped; Manga "ACG"/"Manga"/untyped; Novel "Novel"/"ACG"/untyped; Comic "Comic"/untyped; Game "Game"/untyped; gated types RESTRICTED_FAMILY. Franchise placeholder "Search or type new franchise...", allowNew.
- Helpers (Phase 0a), each with a test: `components/forms/EntryNameFields.jsx` `({f,u,prefix,label,names})`; `components/forms/MalAnilistScores.jsx` `({f,u})`; `components/forms/EntryFlags.jsx` `({f,u,flags:[[key,label,caption]]})`; `components/forms/CoverRemarkFields.jsx` `({f,u,ownerType,ownerId})` incl. pending-image rule. Add `data-form-section` (= title) to `SectionHeader` (components/forms/FormField.jsx) so tests read section order.
- Add wrapper: card div > `EntryAutofillSearch` (replaces the 8 inline autofill boxes; badges: anime airing_type, movie movie_type, TV region, cartoon airing_type, manga region, novel region, comic comic_type, anime-movie none; name lists = what the current `*FillResults` search) > external search box(es) (MAL / TMDB / Open Library+MAL / Comic Vine — Add only) > SectionHeader "Titles & Naming" > LineageFields > FormBody. State names unchanged (Add: af/ua, amf/uam, mf/umf, tvf/utf, cf/uc, mgf/umg, nvf/unv, cmf/ucm).
- Modify wrapper: SectionHeader "Titles & Naming" > LineageFields > FormBody(ownerId=editingItem?.system_id) > SectionHeader "Structured Notes" > `<TNotes key={id} ... owner={editingItem ?? {}} isAdmin hideSections={["remark"]}/>` (keep each type's current Notes component + props). State names unchanged (Modify: af/ua, amf/uam, mmf/umm, tvmf/utv, cmf/uc, cmgf/umg, cnvf/unv, ccmf/ucm). Anime/AnimeMovie take allFranchises instead of franchiseItems. Manga/Comic lose `ribbonSection`.

Page-level differences that STAY in Add.jsx / Modify.jsx (never move into bodies): Add requires a name + franchise, Modify validates neither; duplicate modal on Add (anime, anime-movie, movie, TV); ep_fin ≤ ep_total check on anime Add; enrichment (Add: anime, anime-movie; Modify: anime, anime-movie, cartoon, manga); franchise create type per type; content labels picked separately per page; Add initial state freshForm/resolveDefaults, Modify from toForm. HComic Add region updater `setRegion` runs `followRegion` (re-suggest restricted sources); Modify passes plain updater — keep.

## Bug found (fix in Phase 0c, failing test first)
Modify wipes anime/anime-movie `anilist_rank` and `anilist_popularity_rank` on save: `animeToForm` / `movieToForm` (Modify.jsx) never load them, the shared payload builder (lib/payloads.js buildAnimePayload / buildAnimeMoviePayload) sends parseInt(undefined) → null, PATCH keeps explicit nulls. Load them in toForm.

## Phases
### Phase 0 — three agents in parallel, disjoint files
- **0a shared components + config** (only: components/forms/FamilyLineageFields.jsx, FormField.jsx, new helper files + tests, lib/genreLabelFields.js, components/info/GenresCard.jsx comment, config/formFactories.js (`imdb_rating: ""` in defaultMovie, `comicvine_id` already there), config/namingConfigs.js comic CN-first + its comments in lib/naming.js and pages/library/configs/comic.jsx, lib/naming.test.js case). Also make anime detail page + anime-movie + comic? NO — detail pages out of scope except NamingCard config.
- **0b Add.jsx + only the TOP of the 8 add-tab wrappers** (swap inline autofill for EntryAutofillSearch, delete the 8 fill-state blocks/effects/results/makeApply, add apply<T>EntryAutofill, wrapper props per above, `imdb_rating` in submitMovie body, anime genre ensureSourceValues in submitAnime, update pages/add-tabs/ImagePicker.wiring.test.jsx Anime case).
- **0c Modify.jsx** (data fixes: anime/anime-movie ranks in toForm [bug], manga/novel ranks in toForm + save, movie imdb_rating in liveMovieToForm + saveMovie, comic comicvine_id in comicToForm + saveComic, anime genre ensure in saveAnime; ribbons → FranchiseRibbon above the card for all types incl. AnimeMovie; remove `{ribbonSection}` from MangaModifyTab/ComicModifyTab and the prop in ModifyTabNotes.test.jsx; pass allFranchises to anime/anime-movie tabs).
Rule: only 0b touches Add.jsx, only 0c touches Modify.jsx; payloads.js untouched in Phase 0 (except: none).

### Phase 1 — per type (each agent owns only its add-tabs/<T>AddTab.jsx, modify-tabs/<T>ModifyTab.jsx and their tests)
Write `<T>FormBody` + `<T>LineageFields` to the layout above, rewrite the Modify wrapper. Game/HGame/HComic/Hentai: reorder/relabel existing bodies (Game/HGame: release_date to Information). Tests per type: section order via [data-form-section], CN-first names + "Romaji", new fields, Add shows autofill/external boxes and Modify neither, Modify passes ownerId (ImagePicker, CastEditor entryId), franchise change clears series. Fix tests the change breaks (e.g. HentaiAddTab.test.jsx "Roman"→"Romaji").

### Phase 2 — one agent
`pages/add-tabs/FormLayout.test.jsx`: for each of 12 types render Add and Modify with an empty form; ordered <label> texts equal (excluding Add search boxes and Modify Notes); section titles match this spec. Remove unused franchiseItems props from anime/anime-movie call sites (keep the ones the Series tab uses). Docs: docs/frontend/admin-pages.md (autofill paragraph, ribbon paragraph, Game "divergence from the comic pair" passage, Structured Notes paragraph, new "Entry form layout" subsection), docs/frontend/components.md (FamilyLineageFields accepts, inline auto-fill mention, step-5 comic-pair remark, rows for new helpers), docs/frontend/design-system.md short "Entry forms" rule; bump Last verified; present tense. Build/test/lint.

### Phase 3 (optional, later)
Move inline Movie/TV/Cartoon/Manga/Novel/Comic payloads into lib/payloads.js as `<type>FieldsPayload(f)` shared by both pages.

## Where the work stands (branch `refactor/entry-form-layout`)
Working scaffolding: delete this file in the commit that finishes the task, after moving what is worth keeping into `docs/frontend/*` and `docs/notes/decisions.md`.

**Phase 0 is done and committed** (0a shared components, 0b Add autofill swap, 0c Modify data fixes + ribbons). Vitest 2613 passed, eslint 0 errors, build OK. Also done: Add's `submitComic` now sends `comicvine_id` as typed, without requiring a link, matching Modify.

API notes from Phase 0 that Phase 1 must use:
- `FamilyLineageFields({ f, u, family, accepts, hint, allFranchises, seriesItems, franchiseCollections })`: Series renders only when `seriesItems` is given, and a franchise change clears the series.
- `EntryNameFields({ f, u, prefix, label, names, shows, placeholders })` renders no header. HComic passes `names={["cn","en","jp","kr","alt"]}` and `shows={(k) => showsField(f.region, k)}`.
- `MalAnilistScores({ f, u })` and `CoverRemarkFields({ f, u, ownerType, ownerId })` render their OWN SectionHeader, so a body must not add one. `EntryFlags({ f, u, flags })` renders no header.
- Add wrapper prop names from 0b must be kept: `all<T>`, `<t>Loading`, `apply<T>EntryAutofill`. For example `allAnime`/`animeLoading`/`applyAnimeEntryAutofill`, `allMangas`/`mangasLoading`, `allTvShows`/`tvShowsLoading`.
- Modify: one `FranchiseRibbon` above the card for every type. Manga/Comic tabs no longer take `ribbonSection`. Anime/AnimeMovie modify tabs receive `allFranchises`.

**Next: Phase 1.** Run four agents in parallel on disjoint files: Anime/AnimeMovie/Manga · Movie/TV/Cartoon · Novel/Comic · Game/HGame/HComic/Hentai. The Comic agent must add an Add-submit test showing that `comicvine_id` is sent without a link.

**Then Phase 2.** Besides the doc pages listed above, update `docs/entry-types.md:289` (comic NAMING_CONFIGS is now cn, en, alt) and the "seven GENRE_LABEL_TYPES" mentions (`docs/frontend/components.md`, the `GenreLabelFields.jsx` and test headers). Also change `NAMING_LABELS.roman` in `lib/naming.js` from "Roman" to "Romaji", so the detail NamingCard matches the forms.

Gotcha: on Windows, a parallel vitest run can silently skip files with an `UNKNOWN ... open ...Temp...` error. Run with `--no-file-parallelism` when the counts look short.
