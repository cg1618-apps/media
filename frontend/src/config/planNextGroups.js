// Frontend: the size-bucket vocabularies and Plan page tabs.
//
// This is a hand-maintained copy of app/utils/plan_next_kinds.py
// (SIZE_THRESHOLDS/ALLOWED_SCOPES) - there is no runtime guard keeping the
// two in sync (GET /api/plan-next/kinds exists but is unused by the
// frontend), so update both by hand whenever one changes. Media type keys
// are the hyphenated ones the API stores. Previously these lived hardcoded
// in three separate files (FranchisePage, FranchiseModifyTab,
// PlanWatchNext), which is how they drifted out of docs/options.md entirely.

// The groups a queued game is filed under on the Do next tab, in display
// order (PLATFORM_GROUPS in app/utils/plan_next_kinds.py). Unlike every other
// bucket here, a game's group is the caller's own choice, stored on the plan
// row itself (plan_next.platform_group) and set from the Plan card or the
// game's detail page; a row with none is drawn under "Ungrouped".
export const PLATFORM_GROUPS = ["PC", "Console", "Handheld Console", "Switch"];

// The types whose "next" row takes a platform group
// (PLATFORM_GROUP_MEDIA_TYPES in app/utils/plan_next_kinds.py). H-game
// mirrors game.
export const PLATFORM_GROUP_TYPES = ["game", "h-game"];

// Anime's two groups after its size buckets on the Do next tab. They are read
// off the entry's own airing type at display time (entryBucket in
// utils/planNext.js), not derived by Calculate, so they are not size buckets
// and are absent from SIZE_GROUPS and from app/utils/plan_next_kinds.py: the
// size override dropdown, which reads SIZE_GROUPS, cannot offer them.
// Movie holds a Movie-airing entry; Others holds every other non-TV airing
// type (OVA, ONA, Special and the rest) and a series or franchise row that
// has no size bucket.
export const ANIME_AIRING_GROUPS = [
  { key: "movie", label: "Movie" },
  { key: "others", label: "Others" },
];

export const SIZE_GROUPS = {
  anime: [
    { key: "12ep", label: "12 EP" },
    { key: "24ep", label: "24 EP" },
    { key: "30ep_plus", label: "30+ EP" },
  ],
  "tv-show": [
    { key: "1season", label: "1 Season" },
    { key: "2season", label: "2 Seasons" },
    { key: "3season_plus", label: "3+ Seasons" },
  ],
  cartoon: [
    { key: "1season", label: "1 Season" },
    { key: "2season", label: "2 Seasons" },
    { key: "3season_plus", label: "3+ Seasons" },
  ],
  movie: [
    { key: "standalone", label: "Standalone" },
    { key: "2_3movies", label: "2-3 Movies" },
    { key: "4movies_plus", label: "4+ Movies" },
  ],
  comic: [
    { key: "1_3", label: "1-3 Issues" },
    { key: "4_10", label: "4-10 Issues" },
    { key: "11_plus", label: "11+ Issues" },
  ],
  "anime-movie": [],
  // A game groups by where it will be played - PLATFORM_GROUPS above.
  game: PLATFORM_GROUPS.map((key) => ({ key, label: key })),
  // H-comic and hentai are absent on purpose, exactly as anime-movie is
  // empty: there is no axis either groups by, so each Plan tab renders one
  // ungrouped list. Hentai has no airing type, so anime's Movie and Others
  // groups do not reach it. H-game groups by platform, as game does, through
  // planNextGroups below rather than here: a franchise or series h-game row
  // is offered the size override, which must not list platforms.
  // Manga and book do NOT have a size bucket. They group by a column on the
  // entry itself - the way the pre-plan_next Plan page did - so these two
  // vocabularies exist only here, never in app/utils/plan_next_kinds.py, which
  // is about size buckets Calculate derives. See entryBucket in
  // frontend/src/utils/planNext.js.
  manga: [
    { key: "完結", label: "完結" },
    { key: "連載中", label: "連載中" },
    { key: "腰斬", label: "腰斬" },
    { key: "停更", label: "停更" },
  ],
  // Keys must stay a subset of BOOK_TYPES in frontend/src/config/fieldOptions.js,
  // which is the form dropdown's source of truth. Only the ORDER differs: 網路小說
  // leads here, where the dropdown lists it third.
  book: [
    { key: "網路小說", label: "網路小說" },
    { key: "輕小說", label: "輕小說" },
    { key: "小說", label: "小說" },
    { key: "短篇集", label: "短篇集" },
    { key: "指南/設定集", label: "指南/設定集" },
    { key: "其他", label: "其他" },
  ],
};

// The groups a Do next tab draws, in display order: the type's size buckets
// or self-grouping vocabulary, then anime's airing groups; or the platform
// groups for game and h-game. The trailing "ungrouped" pile is added by
// groupByBucket.
export function planNextGroups(mediaType) {
  if (PLATFORM_GROUP_TYPES.includes(mediaType)) {
    return PLATFORM_GROUPS.map((key) => ({ key, label: key }));
  }
  const groups = SIZE_GROUPS[mediaType] ?? [];
  return mediaType === "anime" ? [...groups, ...ANIME_AIRING_GROUPS] : groups;
}

// What a tab calls its trailing catch-all group. Manga has no "other" value in
// its own vocabulary, so its empties land here under the label the old page
// used. Book is absent because it has a real "其他" key that entryBucket maps
// empties onto directly - giving it a label here would produce two
// near-identical trailing sections.
export const UNGROUPED_LABELS = {
  manga: "其他",
};

// Tab order on the Plan page. Comic is new - the page had no comic tab before
// plan_next made every type render the same way.
export const PLAN_TABS = [
  { key: "anime", label: "Anime", icon: "fa-tv" },
  { key: "anime-movie", label: "Anime Movie", icon: "fa-film" },
  { key: "movie", label: "Movie", icon: "fa-ticket-alt" },
  { key: "tv-show", label: "TV Show", icon: "fa-broadcast-tower" },
  { key: "cartoon", label: "Cartoon", icon: "fa-laugh-squint" },
  { key: "comic", label: "Comic", icon: "fa-book-dead" },
  { key: "manga", label: "Manga", icon: "fa-book" },
  { key: "book", label: "Book", icon: "fa-book-open" },
  { key: "game", label: "Game", icon: "fa-gamepad" },
  // Gated: the Plan page filters its tabs through visibleByType.
  { key: "h-comic", label: "H-Comic", icon: "fa-book" },
  { key: "h-game", label: "H-Game", icon: "fa-gamepad" },
  { key: "hentai", label: "Hentai", icon: "fa-tv" },
];

export const SCOPE_LABELS = {
  entry: null, // an entry card carries no tier badge
  series: "Series",
  franchise: "Franchise",
};

// Mirrors app/utils/plan_next_kinds.py. Kept as a literal rather than fetched
// so the Plan page renders without waiting on a vocabulary request; the
// table-driven test in planNext.test.js guards the two copies against drift.
export const KINDS = ["next", "rewatch"];

const SCOPE_ORDER = ["entry", "series", "franchise"];

export const ALLOWED_SCOPES = {
  next: {
    anime: ["entry", "series", "franchise"],
    "anime-movie": ["entry"],
    movie: ["entry", "series", "franchise"],
    "tv-show": ["entry", "series", "franchise"],
    cartoon: ["entry", "series", "franchise"],
    manga: ["entry"],
    book: ["entry"],
    comic: ["entry", "series"],
    // A game is queued one game at a time, never a whole series or franchise.
    game: ["entry"],
    "h-comic": ["entry"],
    "h-game": ["entry", "series", "franchise"],
    // Queued one entry at a time (app/utils/plan_next_kinds.py).
    hentai: ["entry"],
  },
  rewatch: {
    // Anime and cartoon are rewatched as whole franchises; books are reread
    // at every tier though they are only ever queued one book at a time.
    anime: ["franchise"],
    "anime-movie": ["entry"],
    movie: ["entry", "series", "franchise"],
    "tv-show": ["entry", "series", "franchise"],
    cartoon: ["franchise"],
    manga: ["entry"],
    book: ["entry", "series", "franchise"],
    comic: ["entry", "series"],
    // A game is replayed at any tier: one DLC, a series of them, or the whole
    // franchise from the start.
    game: ["entry", "series", "franchise"],
    // An h-comic is queued and reread one entry at a time.
    "h-comic": ["entry"],
    // Replayed at any tier, as a game is.
    "h-game": ["entry", "series", "franchise"],
    hentai: ["entry"],
  },
};

export const REWATCH_TABS = [
  { key: "anime", label: "Anime", icon: "fa-tv" },
  { key: "anime-movie", label: "Anime Movie", icon: "fa-film" },
  { key: "movie", label: "Movie", icon: "fa-ticket-alt" },
  { key: "tv-show", label: "TV Show", icon: "fa-broadcast-tower" },
  { key: "cartoon", label: "Cartoon", icon: "fa-laugh-squint" },
  { key: "manga", label: "Manga", icon: "fa-book" },
  { key: "book", label: "Book", icon: "fa-book-open" },
  { key: "comic", label: "Comic", icon: "fa-book-dead" },
  { key: "game", label: "Game", icon: "fa-gamepad" },
  { key: "h-comic", label: "H-Comic", icon: "fa-book" },
  { key: "h-game", label: "H-Game", icon: "fa-gamepad" },
  { key: "hentai", label: "Hentai", icon: "fa-tv" },
];

export function scopesFor(kind, mediaType) {
  const scopes = ALLOWED_SCOPES[kind]?.[mediaType];
  if (!scopes) return [];
  return SCOPE_ORDER.filter((scope) => scopes.includes(scope));
}
