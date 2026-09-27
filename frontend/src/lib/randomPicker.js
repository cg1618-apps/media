// Frontend: the random picker's filters and draw, kept free of React so they
// can be tested directly.
//
// The picker works on ENTRIES, `{ type, item }`, so one pool can mix media
// types. It has two modes:
//   general  every visible type at once, filtered by what all types share:
//            media type, status group, my rating, release decade
//   one type that type's own library filterDefs (LIBRARY_CONFIGS), plus my
//            rating and release decade
// Every def here is an ordinary FilterDef (hooks/useLibraryState.js), so
// FilterPanel and useFilterState render and hold them unchanged.
import { MY_RATINGS } from "../config/fieldOptions";
import { MEDIA_CONFIG } from "../config/mediaRegistry";
import {
  PLAYING_STATUS_GROUP,
  READING_STATUS_GROUP,
  WATCHING_STATUS_GROUP,
} from "../config/statusGroups";
import { LIBRARY_CONFIGS } from "../pages/library/configs";
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

const LABEL_OF = Object.fromEntries(PICKER_TYPES.map((t) => [t.type, t.label]));

/** The display label of a picker type. */
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

/**
 * One entry drawn at random from `pool`, or null when it is empty. When the
 * pool holds more than one, `previous` is not drawn again, so a reroll always
 * changes the pick.
 */
export function pickRandom(pool, previous = null, random = Math.random) {
  const candidates =
    previous && pool.length > 1
      ? pool.filter((e) => entryKey(e) !== entryKey(previous))
      : pool;
  if (candidates.length === 0) return null;
  return candidates[Math.floor(random() * candidates.length)];
}

/** Every mode the picker has: "all", then each type. */
export const PICKER_MODES = ["all", ...PICKER_TYPES.map((t) => t.type)];

/** A mode's defs: the general ones for "all", else that type's. */
export function filterDefsForMode(mode, types) {
  return mode === "all" ? generalFilterDefs(types) : typeFilterDefs(mode);
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
