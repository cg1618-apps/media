// Frontend: the random picker's filters, kept free of React so they can be
// tested directly. The draw is lib/pickerWeights.js.
//
// The picker works on ENTRIES, `{ type, item }`, so one pool can mix media
// types. It has three kinds of mode:
//   general   every visible type at once, filtered by what all types share:
//             media type, status group, my rating, release decade
//   one type  that type's own library filterDefs (LIBRARY_CONFIGS), plus my
//             rating and release decade
//   franchise draws a franchise rather than an entry: `{ type: "franchise",
//             item, cover, heldTypes, statusGroups }`, filtered by franchise
//             type, expectation, my rating, and what its entries are
// Every def here is an ordinary FilterDef (hooks/useLibraryState.js), so
// FilterPanel and useFilterState render and hold them unchanged.
import { FRANCHISE_EXPECTATIONS, FRANCHISE_TYPES, MY_RATINGS } from "../config/fieldOptions";
import { MEDIA_CONFIG } from "../config/mediaRegistry";
import {
  PLAYING_STATUS_GROUP,
  READING_STATUS_GROUP,
  WATCHING_STATUS_GROUP,
} from "../config/statusGroups";
import { LIBRARY_CONFIGS } from "../pages/library/configs";
import { getFranchiseCover, withMediaType } from "./covers";
import { parseTypes } from "./formatters";
import { initialFilters } from "./libraryFilters";
import { primaryReleaseValue, releaseYear } from "./releaseDate";

// Every type the picker offers, in the nav's order. Gated types are listed
// like the rest; the page drops the ones canSeeGatedType refuses.
export const PICKER_TYPES = [
  { type: "anime", label: "Anime" },
  { type: "anime-movie", label: "Anime Movie" },
  { type: "manga", label: "Manga" },
  { type: "novel", label: "Novel" },
  { type: "game", label: "Game" },
  { type: "tv-show", label: "TV Show" },
  { type: "movie", label: "Movie" },
  { type: "cartoon", label: "Cartoon" },
  { type: "comic", label: "Comic" },
  { type: "h-comic", label: "H-Comic" },
  { type: "h-game", label: "H-Game" },
  { type: "hentai", label: "Hentai" },
];

// The mode that draws a franchise. Not a media type, so it is not in
// PICKER_TYPES; it follows them in PICKER_MODES.
export const FRANCHISE_MODE = "franchise";

const LABEL_OF = {
  ...Object.fromEntries(PICKER_TYPES.map((t) => [t.type, t.label])),
  [FRANCHISE_MODE]: "Franchise",
};

/** The display label of a picker type, or of the franchise mode. */
export function pickerTypeLabel(type) {
  return LABEL_OF[type] ?? type;
}

// The watch, read and play vocabularies each group their statuses their own
// way ("Watching", "Reading", "Playing"). Across types the picker needs one
// set of words, so each library group is renamed onto it.
export const STATUS_GROUPS = ["Planned", "In Progress", "Completed", "Dropped", "Might"];

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

const ratingDef = {
  key: "myRating",
  label: "My Rating",
  type: "set",
  options: [...MY_RATINGS, UNRATED],
  match: (entry, active) => active.has(entry.item.my_rating || UNRATED),
};

const decadeDef = {
  key: "decade",
  label: "Release Decade",
  type: "set-dynamic",
  deriveOptions: (entries) =>
    sortDecades(new Set(entries.map((e) => decadeOf(e.type, e.item)))),
  match: (entry, active) => active.has(decadeOf(entry.type, entry.item)),
};

const statusGroupDef = {
  key: "statusGroup",
  label: "Status",
  type: "set",
  options: STATUS_GROUPS,
  match: (entry, active) => active.has(statusGroupOf(entry.type, entry.item)),
};

/** The general mode's defs, offering only `types` as media-type chips. */
export function generalFilterDefs(types) {
  return [
    {
      key: "mediaType",
      label: "Media Type",
      type: "set",
      options: types,
      optionLabel: pickerTypeLabel,
      match: (entry, active) => active.has(entry.type),
    },
    statusGroupDef,
    ratingDef,
    decadeDef,
  ];
}

// A library def reads a raw item; the picker hands it the entry's item.
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

/** One type's defs: its library filters, then my rating and release decade. */
export function typeFilterDefs(type) {
  const libraryDefs = LIBRARY_CONFIGS[type]?.filterDefs ?? [];
  return [...libraryDefs.map(forEntries), ratingDef, decadeDef];
}

/** Wrap one type's list as picker entries. */
export function toEntries(type, items) {
  return (items ?? []).map((item) => ({ type, item }));
}

/** A stable identity for an entry across types. */
export function entryKey(entry) {
  return `${entry.type}:${entry.item.system_id}`;
}

/** Every mode the picker has: "all", then each type, then the franchise mode. */
export const PICKER_MODES = ["all", ...PICKER_TYPES.map((t) => t.type), FRANCHISE_MODE];

/** A mode's defs: the general ones for "all", the franchise ones, else that type's. */
export function filterDefsForMode(mode, types) {
  if (mode === "all") return generalFilterDefs(types);
  if (mode === FRANCHISE_MODE) return franchiseFilterDefs(types);
  return typeFilterDefs(mode);
}

/**
 * Whether a mode has a weighted draw. The weights (lib/pickerWeights.js) are
 * an entry's status, rating, plan marks and release; a franchise has none of
 * those of its own, so the franchise mode always draws evenly.
 */
export function isWeightedMode(mode) {
  return mode !== FRANCHISE_MODE;
}

// FRANCHISE_TYPES order, then any value the vocabulary no longer lists.
function sortFranchiseTypes(values) {
  const rank = (v) => {
    const i = FRANCHISE_TYPES.indexOf(v);
    return i === -1 ? FRANCHISE_TYPES.length : i;
  };
  return [...values].sort((a, b) => rank(a) - rank(b));
}

/**
 * The franchise mode's defs. `types` are the media types this session may
 * see, offered as "holds an entry of" chips.
 */
export function franchiseFilterDefs(types) {
  return [
    {
      key: "franchiseType",
      label: "Franchise Type",
      type: "set-dynamic",
      deriveOptions: (entries) =>
        sortFranchiseTypes(new Set(entries.flatMap((e) => parseTypes(e.item.franchise_type)))),
      match: (entry, active) => parseTypes(entry.item.franchise_type).some((t) => active.has(t)),
    },
    {
      key: "heldType",
      label: "Holds a",
      type: "set",
      options: types,
      optionLabel: pickerTypeLabel,
      match: (entry, active) => [...entry.heldTypes].some((t) => active.has(t)),
    },
    {
      key: "entryStatus",
      label: "Holds an Entry That Is",
      type: "set",
      options: STATUS_GROUPS,
      match: (entry, active) => [...entry.statusGroups].some((g) => active.has(g)),
    },
    {
      key: "expectation",
      label: "Expectation",
      type: "set",
      options: FRANCHISE_EXPECTATIONS,
      match: (entry, active) => active.has(entry.item.franchise_expectation),
    },
    ratingDef,
  ];
}

/**
 * Every franchise as a franchise-mode entry, from `listsByType` - each
 * visible type's entry list. The lists give each franchise its cover (the
 * franchise library's rule, lib/covers.js getFranchiseCover), the types it
 * holds, and the status groups its entries are in.
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
  return (franchises ?? []).map((franchise) => {
    const held = byFranchise[franchise.system_id] ?? [];
    return {
      type: FRANCHISE_MODE,
      item: franchise,
      cover: getFranchiseCover(franchise, byId, byFranchise),
      heldTypes: new Set(held.map((e) => e.media_type)),
      statusGroups: new Set(held.map((e) => statusGroupOf(e.media_type, e))),
    };
  });
}

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
    } else if (value) {
      stored[key] = true;
    }
  }
  return stored;
}
