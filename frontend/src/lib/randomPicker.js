// Frontend: the random picker's filters, kept free of React so they can be
// tested directly. The draw is lib/pickerWeights.js.
//
// The picker works on ENTRIES, `{ type, item }`. It has two kinds of mode:
//   one type  that type's filters, laid out by PICKER_LAYOUTS: the type's own
//             library filterDefs where the library has one, and the picker's
//             own release decade, external scores, my rating, Do Next and
//             Redo
//   franchise draws a franchise rather than an entry: `{ type: "franchise",
//             item, cover }`, filtered by franchise type, my rating and
//             expectation
// Every def here is an ordinary FilterDef (hooks/useLibraryState.js), so
// FilterPanel and useFilterState render and hold them unchanged. The picker
// has no advanced section: every def is drawn in layout order.
//
// A def that reads the viewer's own list - a status, my rating, an
// expectation, ownership, usefulness, a plan mark - carries `personal: true`,
// the key the libraries put on their personal columns. A viewer without
// self.list (a shared account) has none of those values, so
// filterDefsForMode drops every flagged def for them and keeps the catalogue
// ones.
import {
  FRANCHISE_EXPECTATIONS,
  GAME_RELEASE_STATUSES,
  MY_RATINGS,
  TV_REGIONS,
} from "../config/fieldOptions";
import { MEDIA_CONFIG } from "../config/mediaRegistry";
import {
  PLAYING_STATUS_GROUP,
  READING_STATUS_GROUP,
  WATCHING_STATUS_GROUP,
} from "../config/statusGroups";
import { LIBRARY_CONFIGS } from "../pages/library/configs";
import { getFranchiseCover, withMediaType } from "./covers";
import { parseTypes } from "./formatters";
import { exclusiveSourceFilter } from "./libraryFilterDefs";
import { initialFilters, isFilterActive, isRangeValue } from "./libraryFilters";
import { primaryReleaseValue, releaseYear } from "./releaseDate";

// Every type the picker offers, in the strip's order. Gated types are listed
// like the rest, each after the mainstream ones; the page drops the ones
// canSeeGatedType refuses.
export const PICKER_TYPES = [
  { type: "anime", label: "Anime" },
  { type: "anime-movie", label: "Anime Movie" },
  { type: "movie", label: "Movie" },
  { type: "tv-show", label: "TV Show" },
  { type: "cartoon", label: "Cartoon" },
  { type: "manga", label: "Manga" },
  { type: "book", label: "Book" },
  { type: "comic", label: "Comic" },
  { type: "game", label: "Game" },
  { type: "hentai", label: "Hentai" },
  { type: "h-comic", label: "H-Comic" },
  { type: "h-game", label: "H-Game" },
];

// The mode that draws a franchise. Not a media type, so it is not in
// PICKER_TYPES; it leads them in PICKER_MODES, and /random opens on it.
export const FRANCHISE_MODE = "franchise";

const LABEL_OF = {
  ...Object.fromEntries(PICKER_TYPES.map((t) => [t.type, t.label])),
  [FRANCHISE_MODE]: "Franchise",
};

/** The display label of a picker type, or of the franchise mode. */
export function pickerTypeLabel(type) {
  return LABEL_OF[type] ?? type;
}

/** Every mode the picker has: the franchise mode, then each type. */
export const PICKER_MODES = [FRANCHISE_MODE, ...PICKER_TYPES.map((t) => t.type)];

// ---------------------------------------------------------------------------
// Status groups - what the weighted draw groups by
// ---------------------------------------------------------------------------

// The watch, read and play vocabularies each group their statuses their own
// way ("Watching", "Reading", "Playing"). Across types the weighting needs one
// set of words, so each library group is renamed onto it.
export const STATUS_GROUPS = ["Planned", "In Progress", "Stopped", "Completed", "Dropped", "Might"];

const GROUP_MAP = {
  watch: WATCHING_STATUS_GROUP,
  read: READING_STATUS_GROUP,
  play: PLAYING_STATUS_GROUP,
};

const UNIFIED_GROUP = {
  Planned: "Planned",
  Watching: "In Progress",
  Reading: "In Progress",
  Playing: "In Progress",
  Stopped: "Stopped",
  Completed: "Completed",
  Dropped: "Dropped",
};

/**
 * The cross-type status group of one entry. An unset or unknown status is
 * "Might", as the library filters count it.
 */
export function statusGroupOf(type, item) {
  const { statusField, statusType } = MEDIA_CONFIG[type] ?? {};
  const group = GROUP_MAP[statusType]?.[item[statusField]];
  return UNIFIED_GROUP[group] ?? "Might";
}

// ---------------------------------------------------------------------------
// Plan marks
// ---------------------------------------------------------------------------

/**
 * Whether an entry holds a plan mark of `kind` ("next" or "rewatch"): on the
 * entry itself (watch_next, to_rewatch, ...), or through its series or
 * franchise (`planMarks`, lib/pickerWeights.js groupPlanMarks).
 */
export function hasPlanMark(entry, kind, planMarks) {
  const { type, item } = entry;
  const onEntry =
    kind === "next"
      ? item.watch_next || item.read_next || item.play_next
      : item.to_rewatch || item.to_reread || item.to_replay;
  if (onEntry) return true;
  return [item.series_id, item.franchise_id].some(
    (id) => id && planMarks?.has(`${kind}:${type}:${id}`),
  );
}

/**
 * `entries` with each one's plan marks read once, as `doNext` and `redo`, for
 * the Do Next and Redo filters. A franchise entry has none.
 */
export function withPlanMarks(entries, planMarks) {
  return entries.map((e) =>
    e.type === FRANCHISE_MODE
      ? e
      : {
          ...e,
          doNext: Boolean(hasPlanMark(e, "next", planMarks)),
          redo: Boolean(hasPlanMark(e, "rewatch", planMarks)),
        },
  );
}

export const DO_NEXT = "Do next";
export const NOT_DO_NEXT = "Not do next";
export const REDO = "To redo";
export const NOT_REDO = "Not to redo";

const doNextDef = {
  key: "doNext",
  personal: true,
  label: "Do Next",
  type: "set",
  options: [DO_NEXT, NOT_DO_NEXT],
  match: (entry, active) => active.has(entry.doNext ? DO_NEXT : NOT_DO_NEXT),
};

const redoDef = {
  key: "redo",
  personal: true,
  label: "Redo",
  type: "set",
  options: [REDO, NOT_REDO],
  match: (entry, active) => active.has(entry.redo ? REDO : NOT_REDO),
};

// ---------------------------------------------------------------------------
// My rating and release decade
// ---------------------------------------------------------------------------

export const UNRATED = "Unrated";
export const UNKNOWN_DECADE = "Unknown";

/** "2010s" for an entry released in 2014; UNKNOWN_DECADE without a year. */
export function decadeOf(type, item) {
  const year = releaseYear(primaryReleaseValue(type, item));
  return year ? `${Math.floor(year / 10) * 10}s` : UNKNOWN_DECADE;
}

// Newest decade first, UNKNOWN_DECADE last.
function sortDecades(decades) {
  return [...decades].sort((a, b) => {
    if (a === UNKNOWN_DECADE) return 1;
    if (b === UNKNOWN_DECADE) return -1;
    return parseInt(b, 10) - parseInt(a, 10);
  });
}

// Built per call: MY_RATINGS is refreshed in place from /api/constants.
function ratingDef() {
  return {
    key: "myRating",
    personal: true,
    label: "My Rating",
    type: "set",
    options: [...MY_RATINGS, UNRATED],
    match: (entry, active) => active.has(entry.item.my_rating || UNRATED),
  };
}

const decadeDef = {
  key: "decade",
  label: "Release Decade",
  type: "set-dynamic",
  deriveOptions: (entries) =>
    sortDecades(new Set(entries.map((e) => decadeOf(e.type, e.item)))),
  match: (entry, active) => active.has(decadeOf(entry.type, entry.item)),
};

// ---------------------------------------------------------------------------
// External scores
// ---------------------------------------------------------------------------

export const NO_SCORE = "No score";

/** A stored score as a number, or null when unscored (OMDb's "N/A" included). */
function scoreNumber(raw) {
  const n = parseFloat(raw);
  return Number.isNaN(n) ? null : n;
}

/**
 * One external-score filter. `read(item)` gives the score on the filter's
 * `scale` - 10 or 100 - or null. Its chips are the minimums, the one band
 * below the lowest of them ("<5"), and No score; chips OR, so two minimums on
 * together keep the lower one.
 */
function scoreDef(key, label, read, scale) {
  const step = scale / 10;
  const minimums = [9, 8, 7, 6, 5].map((m) => m * step);
  const floor = minimums[minimums.length - 1];
  const below = `<${floor}`;
  return {
    key,
    label,
    type: "set",
    options: [...minimums.map((m) => `${m}+`), below, NO_SCORE],
    match: (entry, active) => {
      const score = read(entry.item);
      if (score === null) return active.has(NO_SCORE);
      if (score < floor) return active.has(below);
      return minimums.some((m) => score >= m && active.has(`${m}+`));
    },
  };
}

// IMDb and MAL score out of 10; AniList stores out of 100 and is read out of
// 10 like them. Metacritic stores out of 100, its user score out of 10, and
// both are read out of 100. On a TV show or cartoon, imdb_rating is the
// season's own.
const SCORE_DEFS = {
  imdbScore: () => scoreDef("imdbScore", "IMDb Score", (i) => scoreNumber(i.imdb_rating), 10),
  malScore: () => scoreDef("malScore", "MAL Score", (i) => scoreNumber(i.mal_rating), 10),
  anilistScore: () =>
    scoreDef(
      "anilistScore",
      "AniList Score",
      (i) => {
        const n = scoreNumber(i.anilist_rating);
        return n === null ? null : n / 10;
      },
      10,
    ),
  metacriticScore: () =>
    scoreDef("metacriticScore", "Metacritic", (i) => scoreNumber(i.metacritic_score), 100),
  metacriticUserScore: () =>
    scoreDef(
      "metacriticUserScore",
      "Metacritic User",
      (i) => {
        const n = scoreNumber(i.metacritic_user_score);
        return n === null ? null : n * 10;
      },
      100,
    ),
};

// ---------------------------------------------------------------------------
// One type's defs
// ---------------------------------------------------------------------------

// A library def reads a raw item; the picker hands it the entry's item.
// Its `personal` flag is the library config's own, so the picker drops
// exactly what the library drops.
function forEntries(fd) {
  return {
    ...fd,
    match: (entry, active, franchiseDict, seriesDict) =>
      fd.match(entry.item, active, franchiseDict, seriesDict),
    ...(fd.deriveOptions && {
      deriveOptions: (entries) => fd.deriveOptions(entries.map((e) => e.item)),
    }),
  };
}

// Defs the picker states itself in place of, or beside, a type's library
// defs: a TV show's Region offers the edit form's vocabulary, and a game's
// Release Status the whole vocabulary, not only the values the library holds.
const TYPE_OVERRIDES = {
  "tv-show": {
    region: {
      key: "region",
      label: "Region",
      type: "set",
      options: TV_REGIONS,
      match: (item, active) => active.has(item.region),
    },
  },
  game: {
    // The game library has no Exclusive Source filter; the picker does.
    exclusiveSource: exclusiveSourceFilter("exclusive_platform"),
    releaseStatus: {
      key: "releaseStatus",
      label: "Release Status",
      type: "set",
      options: GAME_RELEASE_STATUSES,
      match: (item, active) => active.has(item.release_status),
    },
  },
};

// The picker's own defs, by key, shared by every type.
function pickerDefs() {
  return { decade: decadeDef, myRating: ratingDef(), doNext: doNextDef, redo: redoDef };
}

// Each type's filters, in order: [key, row?]. Consecutive defs sharing a row
// draw side by side. The order is the same on every type - source, type,
// region, airing type, airing status (or release or serialization status),
// release decade, external scores (IMDb, MAL, AniList), my rating, the
// viewer's other list values, status, Do Next and Redo, then the genres -
// with a type's own descriptors (a game's mode and platform, a film's
// release type) beside the nearest of those. A key is a picker def
// (pickerDefs, SCORE_DEFS), a TYPE_OVERRIDES def, or the type's library def.
const GENRES = [["genreMain"], ["genreSub"], ["label"]];
const H_GENRES = [["hGenrePlot"], ["hGenreAppearance"], ["hGenreRelation"]];
const PLAN = [["doNext", "plan"], ["redo", "plan"]];

export const PICKER_LAYOUTS = {
  anime: [
    ["exclusiveSource"],
    ["airingType"],
    ["airingStatus"],
    ["decade"],
    ["malScore", "score"],
    ["anilistScore", "score"],
    ["myRating"],
    ["watchingStatus"],
    ...PLAN,
    ...GENRES,
  ],
  "anime-movie": [
    ["exclusiveSource"],
    ["releaseType"],
    ["releaseStatus"],
    ["decade"],
    ["malScore", "score"],
    ["anilistScore", "score"],
    ["myRating"],
    ["watchingStatus"],
    ...PLAN,
    ...GENRES,
  ],
  movie: [
    ["exclusiveSource"],
    ["movieType"],
    ["releaseStatus"],
    ["decade"],
    ["imdbScore"],
    ["myRating"],
    ["watchingStatus"],
    ...PLAN,
    ...GENRES,
  ],
  // Region to the right of Airing Type.
  "tv-show": [
    ["airingType", "kind"],
    ["region", "kind"],
    ["airingStatus"],
    ["decade"],
    ["imdbScore"],
    ["myRating"],
    ["watchingStatus"],
    ...PLAN,
    ...GENRES,
  ],
  cartoon: [
    ["officialSource"],
    ["airingType"],
    ["airingStatus"],
    ["decade"],
    ["imdbScore"],
    ["myRating"],
    ["watchingStatus"],
    ...PLAN,
    ...GENRES,
  ],
  manga: [
    ["region"],
    ["serializationStatus"],
    ["decade"],
    ["malScore", "score"],
    ["anilistScore", "score"],
    ["myRating"],
    ["readingStatus"],
    ...PLAN,
    ...GENRES,
  ],
  book: [
    ["type"],
    ["region"],
    ["serializationStatus"],
    ["decade"],
    ["malScore", "score"],
    ["anilistScore", "score"],
    ["myRating"],
    ["readingStatus"],
    ...PLAN,
    ...GENRES,
  ],
  comic: [["comicType"], ["decade"], ["myRating"], ["readingStatus"], ...PLAN, ...GENRES],
  // Ownership beside Play Status; Mode, Combat Mode and Platform before the
  // genres.
  game: [
    ["exclusiveSource"],
    ["gameType", "kind"],
    ["releaseStatus", "kind"],
    ["decade"],
    ["metacriticScore", "score"],
    ["metacriticUserScore", "score"],
    ["myRating"],
    ["playingStatus", "status"],
    ["ownership", "status"],
    ...PLAN,
    ["gameMode", "mode"],
    ["combatMode", "mode"],
    ["gamePlatform"],
    ["gameGenre"],
    ["gameTheme"],
    ["label"],
  ],
  // The gated types follow their mainstream counterparts - Anime, Manga,
  // Game - with their own adult genres in place of Genre Main and Sub.
  hentai: [
    ["sourceMaterial"],
    ["originality"],
    ["airingStatus"],
    ["decade"],
    ["myRating"],
    ["usefulness"],
    ["watchingStatus"],
    ...PLAN,
    ...H_GENRES,
  ],
  "h-comic": [
    ["region"],
    ["originality"],
    ["serializationStatus"],
    ["animationStatus"],
    ["decade"],
    ["myRating"],
    ["usefulness"],
    ["readingStatus"],
    ...PLAN,
    ...H_GENRES,
  ],
  "h-game": [
    ["gameType", "kind"],
    ["releaseStatus", "kind"],
    ["playstyle"],
    ["language"],
    ["platform"],
    ["decade"],
    ["myRating"],
    ["usefulness"],
    ["playingStatus", "status"],
    ["ownership", "status"],
    ...PLAN,
    ["gameGenre"],
    ["gameTheme"],
    ...H_GENRES,
  ],
};

/**
 * One type's defs, in PICKER_LAYOUTS order. A key the layout names that
 * nothing defines throws, so a renamed library def cannot vanish from the
 * picker unnoticed.
 */
export function typeFilterDefs(type) {
  const library = Object.fromEntries(
    (LIBRARY_CONFIGS[type]?.filterDefs ?? []).map((fd) => [fd.key, fd]),
  );
  const overrides = TYPE_OVERRIDES[type] ?? {};
  const own = pickerDefs();
  return (PICKER_LAYOUTS[type] ?? []).map(([key, row]) => {
    let def = own[key] ?? SCORE_DEFS[key]?.();
    if (!def) {
      const fd = overrides[key] ?? library[key];
      if (!fd) throw new Error(`Picker layout for ${type} names an unknown filter: ${key}`);
      def = forEntries(fd);
    }
    // No advanced section in the picker, and the layout's row is the only one.
    const { advanced: _advanced, row: _row, inPicker: _inPicker, ...rest } = def;
    return row ? { ...rest, row } : rest;
  });
}

/** Wrap one type's list as picker entries. */
export function toEntries(type, items) {
  return (items ?? []).map((item) => ({ type, item }));
}

/** A stable identity for an entry across types. */
export function entryKey(entry) {
  return `${entry.type}:${entry.item.system_id}`;
}

/**
 * A mode's defs: the franchise ones, else that type's. `personal` is whether
 * the viewer holds self.list; without it every def flagged `personal: true`
 * is dropped.
 */
export function filterDefsForMode(mode, { personal = true } = {}) {
  const defs = mode === FRANCHISE_MODE ? franchiseFilterDefs() : typeFilterDefs(mode);
  return personal ? defs : defs.filter((fd) => !fd.personal);
}

/**
 * Whether a mode has a weighted draw. The weights (lib/pickerWeights.js) are
 * an entry's status, rating, plan marks and release; a franchise has none of
 * those of its own, so the franchise mode always draws evenly.
 */
export function isWeightedMode(mode) {
  return mode !== FRANCHISE_MODE;
}

// ---------------------------------------------------------------------------
// The franchise mode
// ---------------------------------------------------------------------------

// The franchise types in the strip's order, then any value this list does not
// name, in name order.
export const FRANCHISE_TYPE_ORDER = [
  "Anime",
  "Anime Movie",
  "Movie",
  "TV",
  "Cartoon",
  "Manga",
  "Book",
  "Comic",
  "Game",
  "Hentai",
  "H-Comic",
  "H-Game",
];

function sortFranchiseTypes(values) {
  const rank = (v) => {
    const i = FRANCHISE_TYPE_ORDER.indexOf(v);
    return i === -1 ? FRANCHISE_TYPE_ORDER.length : i;
  };
  return [...values].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * The franchise mode's defs: franchise type, my rating and expectation. A
 * franchise's rating and expectation are the viewer's own, so those two are
 * personal.
 */
export function franchiseFilterDefs() {
  return [
    {
      key: "franchiseType",
      label: "Franchise Type",
      type: "set-dynamic",
      deriveOptions: (entries) =>
        sortFranchiseTypes(new Set(entries.flatMap((e) => parseTypes(e.item.franchise_type)))),
      match: (entry, active) => parseTypes(entry.item.franchise_type).some((t) => active.has(t)),
    },
    ratingDef(),
    {
      key: "expectation",
      personal: true,
      label: "Expectation",
      type: "set",
      options: FRANCHISE_EXPECTATIONS,
      match: (entry, active) => active.has(entry.item.franchise_expectation),
    },
  ];
}

/**
 * Every franchise as a franchise-mode entry, from `listsByType` - each
 * visible type's entry list, which gives each franchise its cover (the
 * franchise library's rule, lib/covers.js getFranchiseCover).
 */
export function toFranchiseEntries(franchises, listsByType) {
  const all = Object.entries(listsByType ?? {}).flatMap(([type, items]) =>
    withMediaType(items ?? [], type),
  );
  const byId = Object.fromEntries(all.map((e) => [e.system_id, e]));
  const byFranchise = {};
  for (const e of all) {
    if (e.franchise_id) (byFranchise[e.franchise_id] ??= []).push(e);
  }
  return (franchises ?? []).map((franchise) => ({
    type: FRANCHISE_MODE,
    item: franchise,
    cover: getFranchiseCover(franchise, byId, byFranchise),
  }));
}

// ---------------------------------------------------------------------------
// Stored defaults
// ---------------------------------------------------------------------------

/**
 * A filter state for `filterDefs` seeded from stored defaults (the sparse
 * `filters` map /api/random-picker-defaults returns). A key no def has any
 * more is dropped, and so is a chip a fixed-option def no longer offers; a
 * dynamic def's chips are kept, since its options come from the data.
 */
export function resolveDefaultFilters(filterDefs, stored) {
  const state = initialFilters(filterDefs);
  for (const fd of filterDefs) {
    const value = stored?.[fd.key];
    if (value === undefined) continue;
    if (fd.type === "boolean") {
      state[fd.key] = value === true;
      continue;
    }
    if (fd.type === "range") {
      if (value && typeof value === "object") {
        state[fd.key] = { min: String(value.min ?? ""), max: String(value.max ?? "") };
      }
      continue;
    }
    if (!Array.isArray(value)) continue;
    const offered =
      fd.type === "set" ? fd.options : fd.type === "set-grouped" ? fd.groupOptions : null;
    state[fd.key] = new Set(offered ? value.filter((v) => offered.includes(v)) : value);
  }
  return state;
}

/** The sparse `filters` map to store for a filter state: only what is on. */
export function toStoredFilters(filters) {
  const stored = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value instanceof Set) {
      if (value.size > 0) stored[key] = [...value];
    } else if (isRangeValue(value)) {
      if (isFilterActive(value)) stored[key] = { min: value.min, max: value.max };
    } else if (value) {
      stored[key] = true;
    }
  }
  return stored;
}
