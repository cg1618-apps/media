// Frontend: FilterDefs more than one library config builds the same way - the
// watch-status and airing-status filters and the tag filters of the advanced
// section. The
// FilterDef shape itself is documented in hooks/useLibraryState.js.
import {
  AIRING_STATUSES,
  MY_RATINGS,
  PLAYING_STATUSES,
  READING_STATUSES,
  watchingStatusesFor,
} from "../config/fieldOptions";
import {
  PLAYING_STATUS_GROUP,
  READING_STATUS_GROUP,
  WATCHING_STATUS_GROUP,
} from "../config/statusGroups";
import { rangeBound } from "./libraryFilters";

// ---------------------------------------------------------------------------
// Watch status
// ---------------------------------------------------------------------------

// The watch-status chips, in the order a title moves through them.
export const WATCH_STATUS_FILTER_GROUPS = [
  "Might Watch",
  "Planned",
  "Watching",
  "Completed",
  "Dropped",
];

// A row with no status (or one WATCHING_STATUS_GROUP has never heard of)
// counts as Might Watch, so its chip says so.
const NO_STATUS_GROUP = "Might Watch";

/**
 * The stored watching statuses `group` holds on `type`, in the type's cycle
 * order. A film offers Watch When Released and an airing type Watch When
 * Airs (watchingStatusesFor), so the two never both appear.
 */
export function watchStatusesInGroup(type, group) {
  return watchingStatusesFor(type).filter((s) => WATCHING_STATUS_GROUP[s] === group);
}

/** The hover hint of one watch-status chip: the statuses it includes. */
export function watchStatusHint(type, group) {
  const statuses = watchStatusesInGroup(type, group).join(", ");
  return group === NO_STATUS_GROUP
    ? `Includes: ${statuses}, and no status`
    : `Includes: ${statuses}`;
}

/**
 * The Watch Status filter of one watch library (anime, anime movie, movie,
 * TV show, cartoon, hentai). Personal: it reads the viewer's own list row.
 * Each chip's hint is computed on hover rather than here, because
 * /api/constants refreshes the status vocabulary in place after load.
 */
export function watchStatusFilter(type) {
  return {
    key: "watchingStatus",
    label: "Watch Status",
    personal: true,
    type: "set-grouped",
    groupOptions: WATCH_STATUS_FILTER_GROUPS,
    optionHint: (group) => watchStatusHint(type, group),
    match: (item, active) =>
      active.has(WATCHING_STATUS_GROUP[item.watching_status] ?? NO_STATUS_GROUP),
  };
}

// ---------------------------------------------------------------------------
// Read and play status
// ---------------------------------------------------------------------------

/**
 * A grouped status filter: chips are `groups`, each standing for the stored
 * `statuses` that `groupMap` puts in it, with a row of no status (or an
 * unknown one) counted in `noStatusGroup`. Each chip's hint lists what it
 * includes, and FilterPanel's circled ? lists them all. Personal: it reads the
 * viewer's own list row.
 */
function statusGroupFilter({ key, label, field, groups, statuses, groupMap, noStatusGroup }) {
  const hint = (group) => {
    const included = statuses.filter((s) => groupMap[s] === group).join(", ");
    return group === noStatusGroup ? `Includes: ${included}, and no status` : `Includes: ${included}`;
  };
  return {
    key,
    label,
    personal: true,
    type: "set-grouped",
    groupOptions: groups,
    optionHint: hint,
    match: (item, active) => active.has(groupMap[item[field]] ?? noStatusGroup),
  };
}

// The read-status chips, in the order a title moves through them.
export const READ_STATUS_FILTER_GROUPS = ["Might Read", "Planned", "Reading", "Completed", "Dropped"];

/** The Read Status filter of manga and book. */
export function readStatusFilter() {
  return statusGroupFilter({
    key: "readingStatus",
    label: "Read Status",
    field: "reading_status",
    groups: READ_STATUS_FILTER_GROUPS,
    statuses: READING_STATUSES,
    groupMap: READING_STATUS_GROUP,
    noStatusGroup: "Might Read",
  });
}

// The play-status chips, in the order a game moves through them.
export const PLAY_STATUS_FILTER_GROUPS = ["Might Play", "Planned", "Playing", "Completed", "Dropped"];

/** The Play Status filter of the game library. */
export function playStatusFilter() {
  return statusGroupFilter({
    key: "playingStatus",
    label: "Play Status",
    field: "playing_status",
    groups: PLAY_STATUS_FILTER_GROUPS,
    statuses: PLAYING_STATUSES,
    groupMap: PLAYING_STATUS_GROUP,
    noStatusGroup: "Might Play",
  });
}

// ---------------------------------------------------------------------------
// My rating
// ---------------------------------------------------------------------------

// The chip for a row the viewer has not rated.
export const UNRATED = "Unrated";

/**
 * The viewer's own rating: a chip per rating, best first, then Unrated for a
 * row with none. Personal, since the rating is the viewer's own list value.
 * The media libraries draw it in the advanced section, directly above the
 * genre filters (`advanced: true`); the entity libraries draw it last among
 * their ordinary filters. Built per call: MY_RATINGS is refreshed in place
 * from /api/constants.
 */
export function myRatingFilter({ advanced = false } = {}) {
  return {
    key: "myRating",
    label: "My Rating",
    personal: true,
    advanced,
    type: "set",
    options: [...MY_RATINGS, UNRATED],
    match: (item, active) => active.has(item.my_rating || UNRATED),
  };
}

// ---------------------------------------------------------------------------
// Range filters
// ---------------------------------------------------------------------------

/**
 * A minimum/maximum filter over one number (`read(item)`): either bound alone
 * narrows, both bounds are inclusive, and an item with no number never
 * matches a set range. FilterPanel draws it as two number inputs; `unit` is
 * the label after them ("h", "min").
 */
export function rangeFilter(key, label, read, { unit = "", advanced = true } = {}) {
  return {
    key,
    label,
    type: "range",
    unit,
    advanced,
    match: (item, range) => {
      const raw = read(item);
      const value = raw == null || raw === "" ? null : Number(raw);
      if (value == null || !Number.isFinite(value)) return false;
      const min = rangeBound(range.min);
      const max = rangeBound(range.max);
      return (min == null || value >= min) && (max == null || value <= max);
    },
  };
}

// ---------------------------------------------------------------------------
// Vocabulary filters
// ---------------------------------------------------------------------------

/**
 * A set filter over one column drawn from a vocabulary: its chips are the
 * values the library holds, in the vocabulary's own order, and any value
 * outside the vocabulary (a legacy one) after them in name order - so an
 * unused value draws no empty chip and an unexpected one stays filterable.
 */
export function vocabularyFilter(key, label, field, vocabulary) {
  return {
    key,
    label,
    type: "set-dynamic",
    deriveOptions: (data) => {
      const held = new Set(data.map((d) => d[field]).filter(Boolean));
      const known = vocabulary.filter((v) => held.has(v));
      const rest = [...held].filter((v) => !vocabulary.includes(v)).sort((a, b) => a.localeCompare(b));
      return [...known, ...rest];
    },
    match: (item, active) => active.has(item[field]),
  };
}

// ---------------------------------------------------------------------------
// Airing status
// ---------------------------------------------------------------------------

/**
 * The Airing Status filter of the four airing libraries (anime, TV show,
 * cartoon, hentai). Its chips are AIRING_STATUSES, in the order a title moves
 * through them: Not Yet Aired, Airing, Finished Airing, Canceled. The array
 * is the one /api/constants refreshes in place, so the chips follow it.
 */
export function airingStatusFilter() {
  return {
    key: "airingStatus",
    label: "Airing Status",
    type: "set",
    options: AIRING_STATUSES,
    match: (item, active) => active.has(item.airing_status),
  };
}

// ---------------------------------------------------------------------------
// Tag filters - the advanced section
// ---------------------------------------------------------------------------

/** A ", "-joined tag link field as trimmed values; [] when blank. */
export function tagValues(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * The distinct values of `field` across `data`, the most-carried first: a
 * value counts once per entry that carries it, and a tie reads in name order.
 */
export function valuesByAppearance(data, field) {
  const counts = new Map();
  for (const d of data) {
    for (const v of new Set(tagValues(d[field]))) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b));
}

/**
 * An advanced-section filter over one tag link field (`field` is the list
 * response's attribute, a ", "-joined string). Its chips are the values the
 * library holds, ordered by how many of its entries carry each
 * (valuesByAppearance); an entry matches when it carries any chosen value.
 */
export function tagFilter(key, label, field) {
  return {
    key,
    label,
    type: "set-dynamic",
    advanced: true,
    deriveOptions: (data) => valuesByAppearance(data, field),
    match: (item, active) => tagValues(item[field]).some((v) => active.has(v)),
  };
}

/** Exclusive Source, drawn first in the advanced section where a type has it. */
export function exclusiveSourceFilter(field = "exclusive_source") {
  return tagFilter("exclusiveSource", "Exclusive Source", field);
}

/** Publisher TW: manga's and book's Taiwanese publisher credit. */
export function publisherTwFilter() {
  return tagFilter("publisherTw", "Publisher TW", "publisher_tw");
}

/** Label: the eight mainstream types and game. */
export function labelFilter() {
  return tagFilter("label", "Label", "label");
}

/** The mainstream genres and Label: the eight types that carry Genre Main. */
export function genreFilters() {
  return [
    tagFilter("genreMain", "Genre Main", "genre_main"),
    tagFilter("genreSub", "Genre Sub", "genre_sub"),
    labelFilter(),
  ];
}

/** Game's and h-game's IGDB-shaped genre and theme. */
export function gameGenreFilters() {
  return [
    tagFilter("gameGenre", "Genre", "game_genre"),
    tagFilter("gameTheme", "Theme", "game_theme"),
  ];
}

/** The three adult genre vocabularies the gated types share. */
export function hGenreFilters() {
  return [
    tagFilter("hGenrePlot", "Genre Plot", "h_genre_plot"),
    tagFilter("hGenreAppearance", "Genre Appearance", "h_genre_appearance"),
    tagFilter("hGenreRelation", "Genre Relation", "h_genre_relation"),
  ];
}
