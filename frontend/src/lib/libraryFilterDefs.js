// Frontend: FilterDefs more than one library config builds the same way - the
// watch-status and airing-status filters and the tag filters of the advanced
// section. The
// FilterDef shape itself is documented in hooks/useLibraryState.js.
import { AIRING_STATUSES, watchingStatusesFor } from "../config/fieldOptions";
import { WATCHING_STATUS_GROUP } from "../config/statusGroups";

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
 * An advanced-section filter over one tag link field (`field` is the list
 * response's attribute, a ", "-joined string). Its chips are the values the
 * library holds; an entry matches when it carries any chosen value.
 */
export function tagFilter(key, label, field) {
  return {
    key,
    label,
    type: "set-dynamic",
    advanced: true,
    deriveOptions: (data) =>
      [...new Set(data.flatMap((d) => tagValues(d[field])))].sort((a, b) => a.localeCompare(b)),
    match: (item, active) => tagValues(item[field]).some((v) => active.has(v)),
  };
}

/** Exclusive Source, drawn first in the advanced section where a type has it. */
export function exclusiveSourceFilter(field = "exclusive_source") {
  return tagFilter("exclusiveSource", "Exclusive Source", field);
}

/** The mainstream genres and 標籤 Label: the eight types that carry Genre Main. */
export function genreFilters() {
  return [
    tagFilter("genreMain", "Genre Main", "genre_main"),
    tagFilter("genreSub", "Genre Sub", "genre_sub"),
    tagFilter("label", "標籤 Label", "label"),
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
