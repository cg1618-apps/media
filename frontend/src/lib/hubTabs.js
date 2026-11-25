// The media tabs of the franchise and series hubs: what each type's tab can
// be sorted by, which filters its strip carries, and how a tab's view (sort,
// filters, grouping) is applied to its entries.
//
// Both hubs read the same table, so a tab sorts and filters the same way on
// either; `scopes` holds the few places where one tier differs (the comic
// tab, whose franchise strip is built for a shelf of many short runs).
//
// A view is { sort, reversed, groupBySeries, filters }, where `reversed` runs
// the sort against its natural direction (SortControl's button) and `filters`
// maps each
// filter's key to a Set (a chip filter, empty = no narrowing) or to one of
// "all" / "yes" / "no" (a tri-state filter, "all" = no narrowing).
import { primaryReleaseValue, releaseScore } from "./releaseDate";
import { directed } from "./sortDirection";
import { getRatingWeight, getSortName } from "../utils/media";
import { isCompleted } from "./mediaTabs";
import { COMPLETION_LEVELS, GAME_TYPES } from "../config/fieldOptions";

export const TRI_STATES = ["all", "yes", "no"];

// The book types that count as a novel for the 小說 filter. Everything else,
// an untyped book included, is "No".
export const NOVEL_BOOK_TYPES = ["輕小說", "小說", "網路小說"];

// The chip a game whose completion_level is empty sits under.
export const NOT_COMPLETED = "__not_completed__";

// The completion ladder as the filter offers it: Post-game after the other
// three, then the entries with no level at all.
const COMPLETION_LEVEL_CHIPS = [
  ...COMPLETION_LEVELS.filter((v) => v !== "Post-game"),
  ...COMPLETION_LEVELS.filter((v) => v === "Post-game"),
  NOT_COMPLETED,
];

// ── sorts ───────────────────────────────────────────────────────────────────

function numeric(value) {
  if (value == null || value === "" || value === "N/A") return -1;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : -1;
}

// Highest first; an entry without the figure sorts last.
const byScoreDesc = (field) => (a, b) => numeric(b[field]) - numeric(a[field]);

/**
 * Every sort a tab can offer. `own` marks a sort on the viewer's own data,
 * offered only to a viewer who keeps a list. `descending` marks a sort whose
 * natural order runs high to low (SortControl shows it); the dates run old to
 * new and the title A to Z. `compare` receives the media type for the sorts
 * whose column differs by type; the title is always the tie-break.
 */
export const HUB_SORTS = {
  title: { label: "Title", compare: () => 0 },
  release_date: {
    label: "Release date",
    compare: (a, b, type) =>
      releaseScore(primaryReleaseValue(type, a)) -
      releaseScore(primaryReleaseValue(type, b)),
  },
  my_rating: {
    label: "My rating",
    own: true,
    descending: true,
    compare: (a, b) => getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating),
  },
  mal_rating: { label: "MAL rating", descending: true, compare: byScoreDesc("mal_rating") },
  imdb_rating: { label: "IMDb rating", descending: true, compare: byScoreDesc("imdb_rating") },
  metacritic_score: {
    label: "Metacritic",
    descending: true,
    compare: byScoreDesc("metacritic_score"),
  },
  metacritic_user_score: {
    label: "Metacritic user",
    descending: true,
    compare: byScoreDesc("metacritic_user_score"),
  },
  hours_played: { label: "Hours played", descending: true, compare: byScoreDesc("hours_played") },
  end_date: {
    label: "End date",
    compare: (a, b) => releaseScore(a.end_date) - releaseScore(b.end_date),
  },
};

/** The tab's sorts as SortControl options, without the own ones when `ownData` is false. */
export function hubSortOptions(config, ownData) {
  return config.sorts
    .filter((key) => ownData || !HUB_SORTS[key].own)
    .map((key) => ({
      value: key,
      label: HUB_SORTS[key].label,
      descending: HUB_SORTS[key].descending,
    }));
}

// ── filters ─────────────────────────────────────────────────────────────────

// Every tab but the two game tabs: finished by the entry's own status field.
const COMPLETED = {
  key: "completed",
  kind: "tri",
  label: "Completed",
  test: (entry, type) => isCompleted(type, entry),
};

const chips = (key, options, value, extra = {}) => ({
  key,
  kind: "chips",
  options,
  value,
  ...extra,
});

// The values a list actually holds, for a vocabulary that is open or that a
// franchise only uses part of. `order`, when given, ranks the known values
// first, in its order.
const present = (field, order = []) => (entries) => {
  const values = [...new Set(entries.map((e) => e[field]).filter(Boolean))];
  const rank = (v) => (order.includes(v) ? order.indexOf(v) : order.length);
  return values.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
};

const SERIALIZATION = chips(
  "serializationStatus",
  ["連載中", "完結", "腰斬", "停更"],
  (e) => e.serialization_status || "",
);

// The two game tabs: how deep the finish went, in place of a Completed filter.
const GAME_FILTERS = [
  chips("gameType", present("game_type", GAME_TYPES), (e) => e.game_type),
  chips("completionLevel", COMPLETION_LEVEL_CHIPS, (e) => e.completion_level || NOT_COMPLETED, {
    optionLabel: (v) => (v === NOT_COMPLETED ? "Not completed" : v),
  }),
];

// ── the table ───────────────────────────────────────────────────────────────

const nameOf = (...fields) => (e) => {
  for (const f of fields) if (e[f]) return e[f];
  return "";
};

const FILM_SORTS = ["release_date", "title", "my_rating", "imdb_rating"];
const PRINT_SORTS = ["title", "my_rating", "mal_rating", "release_date", "end_date"];

/**
 * Per media type: `title` (the name the title sort and every tie-break
 * compare), `sorts` in the order the select offers them, `defaultSort`,
 * `filters` in the order the strip draws them, and `groupBySeries` - the
 * grouping toggle's default on the franchise hub, absent for a type the
 * franchise hub does not group.
 */
const HUB_TABS = {
  anime: {
    title: (e) => getSortName(e, "anime"),
    sorts: ["title", "release_date", "my_rating", "mal_rating"],
    defaultSort: "release_date",
    filters: [
      chips("airingType", ["TV", "Movie", "ONA", "OVA", "Special"], (e) => e.airing_type),
      COMPLETED,
    ],
    groupBySeries: true,
  },
  "anime-movie": {
    title: nameOf("anime_movie_name_en", "anime_movie_name_roman", "anime_movie_name_cn"),
    sorts: ["release_date", "title", "my_rating", "mal_rating"],
    defaultSort: "release_date",
    filters: [COMPLETED],
  },
  manga: {
    title: nameOf("manga_name_cn", "manga_name_en"),
    sorts: PRINT_SORTS,
    defaultSort: "release_date",
    filters: [
      SERIALIZATION,
      COMPLETED,
      chips("region", ["日漫", "韓漫", "國漫", "台漫", "其他"], (e) => e.region || ""),
    ],
    groupBySeries: false,
  },
  book: {
    title: nameOf("book_name_cn", "book_name_en"),
    sorts: PRINT_SORTS,
    defaultSort: "title",
    filters: [
      {
        key: "novel",
        kind: "tri",
        label: "小說",
        test: (e) => NOVEL_BOOK_TYPES.includes(e.type),
      },
      COMPLETED,
    ],
    groupBySeries: false,
  },
  comic: {
    title: nameOf("comic_name_en", "comic_name_cn"),
    sorts: ["title", "my_rating", "release_date", "end_date"],
    defaultSort: "title",
    filters: [SERIALIZATION, COMPLETED],
    scopes: {
      // A comic franchise is a shelf of many short runs: grouped by series,
      // in release order, and narrowed by run type and era.
      franchise: {
        sorts: ["release_date", "title", "my_rating"],
        defaultSort: "release_date",
        filters: [
          chips("comicType", ["Ongoing", "Limited", "One-Shot", "Annual"], (e) => e.comic_type || ""),
          COMPLETED,
          // Era is user-defined in system_options: the chips are the eras
          // the list holds.
          chips("era", present("era"), (e) => e.era || ""),
        ],
        groupBySeries: true,
      },
    },
  },
  movie: {
    title: nameOf("movie_name_en", "movie_name_cn"),
    sorts: FILM_SORTS,
    defaultSort: "release_date",
    filters: [COMPLETED],
    groupBySeries: true,
  },
  "tv-show": {
    title: nameOf("tv_name_en", "tv_name_cn"),
    sorts: FILM_SORTS,
    defaultSort: "release_date",
    filters: [COMPLETED],
    groupBySeries: true,
    // A lone group needs no rail naming it.
    railForSingleGroup: false,
  },
  cartoon: {
    title: nameOf("cartoon_name_en", "cartoon_name_alt", "cartoon_name_cn"),
    numericTitle: true,
    sorts: FILM_SORTS,
    defaultSort: "release_date",
    filters: [chips("airingType", present("airing_type"), (e) => e.airing_type), COMPLETED],
    groupBySeries: true,
  },
  game: {
    title: nameOf("game_name_cn", "game_name_en"),
    sorts: [
      "release_date",
      "title",
      "my_rating",
      "metacritic_score",
      "metacritic_user_score",
      "hours_played",
    ],
    defaultSort: "release_date",
    filters: GAME_FILTERS,
  },
  // No Metacritic columns and no playtime on an h-game.
  "h-game": {
    title: (e) => getSortName(e, "h-game"),
    sorts: ["release_date", "title", "my_rating"],
    defaultSort: "release_date",
    filters: GAME_FILTERS,
  },
  "h-comic": {
    title: (e) => getSortName(e, "h-comic"),
    sorts: ["release_date", "title", "my_rating"],
    defaultSort: "release_date",
    filters: [COMPLETED],
  },
  // A hentai has no airing type, so Completed is its only filter.
  hentai: {
    title: (e) => getSortName(e, "hentai"),
    sorts: ["release_date", "title", "my_rating"],
    defaultSort: "release_date",
    filters: [COMPLETED],
  },
};

/** The tab definition for `type` on the hub of `scope` ("franchise" | "series"). */
export function hubTabConfig(type, scope) {
  const { scopes, ...base } = HUB_TABS[type];
  const config = { ...base, ...(scopes?.[scope] || {}) };
  // A series hub has no series to group by.
  if (scope !== "franchise") delete config.groupBySeries;
  return config;
}

/** The filters of a tab with nothing narrowed: chips empty, tri-states "all". */
export function defaultFilters(config) {
  return Object.fromEntries(
    config.filters.map((f) => [f.key, f.kind === "tri" ? "all" : new Set()]),
  );
}

export function defaultView(type, scope) {
  const config = hubTabConfig(type, scope);
  return {
    sort: config.defaultSort,
    reversed: false,
    groupBySeries: config.groupBySeries ?? false,
    filters: defaultFilters(config),
  };
}

/** Whether any filter of the view narrows the list (sort and grouping aside). */
export function isFiltered(filters) {
  return Object.values(filters).some((v) =>
    v instanceof Set ? v.size > 0 : v !== "all",
  );
}

/** The chip values a chip filter offers for `entries`. */
export function chipOptions(filter, entries) {
  return typeof filter.options === "function" ? filter.options(entries) : filter.options;
}

function passes(filter, state, entry, type) {
  if (filter.kind === "tri") {
    if (state === "all" || state == null) return true;
    return filter.test(entry, type) === (state === "yes");
  }
  return !state || state.size === 0 || state.has(filter.value(entry));
}

/** The entries the view keeps, in the view's order. */
export function applyView(type, scope, entries, view) {
  const config = hubTabConfig(type, scope);
  const kept = entries.filter((e) =>
    config.filters.every((f) => passes(f, view.filters[f.key], e, type)),
  );
  const sort = HUB_SORTS[view.sort] || HUB_SORTS[config.defaultSort];
  const title = (e) => config.title(e) || "";
  const compare = (a, b) =>
    sort.compare(a, b, type) ||
    title(a).localeCompare(
      title(b),
      undefined,
      config.numericTitle ? { numeric: true } : undefined,
    );
  return kept.sort(directed(compare, Boolean(view.reversed)));
}
