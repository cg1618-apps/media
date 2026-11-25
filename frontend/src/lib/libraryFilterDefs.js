// Frontend: FilterDefs more than one library config builds the same way - the
// watch-status and airing-status filters and the tag filters of the advanced
// section. The
// FilterDef shape itself is documented in hooks/useLibraryState.js.
import { AIRING_STATUSES, READING_STATUSES, watchingStatusesFor } from "../config/fieldOptions";
import { READING_STATUS_GROUP, WATCHING_STATUS_GROUP } from "../config/statusGroups";

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
// Read status
// ---------------------------------------------------------------------------

// The read-status chips, in the order a title moves through them.
export const READ_STATUS_FILTER_GROUPS = [
  "Might Read",
  "Planned",
  "Reading",
  "Completed",
  "Dropped",
];

// A row with no status counts as Might Read, so its chip says so.
const NO_READ_STATUS_GROUP = "Might Read";

/** The hover hint of one read-status chip: the statuses it includes. */
export function readStatusHint(group) {
  const statuses = READING_STATUSES.filter((s) => READING_STATUS_GROUP[s] === group).join(", ");
  return group === NO_READ_STATUS_GROUP
    ? `Includes: ${statuses}, and no status`
    : `Includes: ${statuses}`;
}

/**
 * The Read Status filter of manga and book. Personal: it reads the viewer's
 * own list row. Each chip's hint - and the circled ? after the label that
 * lists them all - is computed on hover, as the watch libraries' is.
 */
export function readStatusFilter() {
  return {
    key: "readingStatus",
    label: "Read Status",
    personal: true,
    type: "set-grouped",
    groupOptions: READ_STATUS_FILTER_GROUPS,
    optionHint: readStatusHint,
    match: (item, active) =>
      active.has(READING_STATUS_GROUP[item.reading_status] ?? NO_READ_STATUS_GROUP),
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
