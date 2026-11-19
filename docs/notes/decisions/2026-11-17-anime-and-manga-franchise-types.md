# Anime and Manga are franchise types; the grouping is called AniManga

- **A franchise type per media type.** With one `ACG` type for anime and manga
  franchises, nothing on a franchise said what it held, and every place that
  cared had to read the entries. An anime, anime movie or series stamps
  `Anime`, a manga stamps `Manga`, and a franchise holding both says `Anime,
  Manga`.
- **Rejected: keeping `ACG` beside `Anime` and `Manga`.** Two ways to say the
  same franchise would split every type test in two.
- **The aggregate views keep one group**, `ANIMANGA_FRANCHISE_TYPES`, shown as
  "AniManga". It is not a franchise type; only the frontend aggregates over it,
  and a franchise carrying both counts once.
- **Storage keys are not renamed.** The favourite grid's key inside
  `franchise.type_slots` stays `ACG` (and the book grid's `Novel`): renaming a
  key nobody sees would need a JSONB rewrite plus a fold on Pull for every
  older sheet. The grid names the franchises it holds (`franchiseTypes`)
  separately from where it stores its slot. `type_covers` keys *are*
  rewritten, because they are franchise types.
- **An older sheet's `ACG` is split by what each franchise holds, after the
  entries are restored**, since the split decides by entries and the Franchise
  tab restores before them (`split_acg_franchise_types`).
