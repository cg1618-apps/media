import {
  franchiseColumn,
  myRatingColumn,
  myRatingSort,
  planFlagColumn,
  playButtonColumn,
} from "../../../components/layout/libraryColumns";
import { releaseScore } from "../../../lib/releaseDate";
import { compareTitles, getSortName } from "../../../lib/naming";
import {
  gameGenreFilters,
  labelFilter,
  playStatusFilter,
  rangeFilter,
  tagFilter,
  vocabularyFilter,
} from "../../../lib/libraryFilterDefs";
import { GAME_IS_MAIN, GAME_RELEASE_STATUSES, GAME_TYPES } from "../../../config/fieldOptions";

// CN leads, as everywhere but comic.
function getTitle(g) {
  return (
    g.game_name_cn ||
    g.game_name_en ||
    g.game_name_alt ||
    g.game_name_roman ||
    g.game_name_jp ||
    ""
  );
}

// Playtime reads as one decimal place — "32.5 h" — because half an hour is
// the smallest difference worth showing and hours_played is a float.
function formatHours(hours) {
  if (hours == null || hours === "") return "-";
  const n = Number(hours);
  if (Number.isNaN(n)) return "-";
  return `${n.toFixed(1)} h`;
}

function hoursValue(g) {
  const n = Number(g.hours_played);
  return Number.isFinite(n) ? n : -1;
}

// -1 for a game with no such figure, so it sorts below a genuine zero.
function numberOrLast(value) {
  if (value == null || value === "") return -1;
  const n = Number(value);
  return Number.isFinite(n) ? n : -1;
}

// -1 for an unscored game, so it sorts below a genuinely bad one rather than
// tying with a zero.
function metacriticValue(g) {
  if (g.metacritic_score == null || g.metacritic_score === "") return -1;
  const n = Number(g.metacritic_score);
  return Number.isFinite(n) ? n : -1;
}

// ---------------------------------------------------------------------------
// Game library config
// ---------------------------------------------------------------------------
const metacriticSort = {
  key: "metacritic_score",
  label: "Metacritic",
  compare: (a, b) => metacriticValue(b) - metacriticValue(a),
};

// The library's title order: the Title sort, and the last tie-break of
// My Rating.
const compareTitle = (a, b) => compareTitles(getSortName(a, "game"), getSortName(b, "game"));

const GAME_LIBRARY_CONFIG = {
  usesSeries: true,
  navPath: "/game",
  defaultSort: "title",
  searchPlaceholder: "Search games, franchise, series...",

  buildSearchString(item, franchiseDict, seriesDict) {
    const f = franchiseDict[item.franchise_id];
    const s = seriesDict[item.series_id];
    return [
      item.game_name_cn, item.game_name_en, item.game_name_roman,
      item.game_name_jp, item.game_name_alt,
      item.game_type, item.release_status,
      f?.franchise_name_cn, f?.franchise_name_en, f?.franchise_name_roman,
      s?.series_name_cn,   s?.series_name_en,   s?.series_name_alt,
      String(item.release_date ?? ""),
    ].filter(Boolean).join(" ");
  },

  filterDefs: [
    // Type and Release share a line, Type at the left.
    { ...vocabularyFilter("gameType", "Type", "game_type", GAME_TYPES), row: "kind" },
    {
      ...vocabularyFilter("releaseStatus", "Release", "release_status", GAME_RELEASE_STATUSES),
      row: "kind",
    },
    playStatusFilter(),
    // Mode and Combat Mode share a line. All three are multi-value tag
    // fields, so tagFilter splits them; they stay in the ordinary section.
    { ...tagFilter("gameMode", "Mode", "game_mode"), advanced: false, row: "mode" },
    { ...tagFilter("combatMode", "Combat Mode", "combat_mode"), advanced: false, row: "mode" },
    { ...tagFilter("gamePlatform", "Platform", "game_platform"), advanced: false },
    // Advanced section (FilterPanel draws it collapsed).
    { ...vocabularyFilter("isMain", "Main / Remake", "is_main", GAME_IS_MAIN), advanced: true },
    {
      // `ownership` is derived server-side from the game's copy rows, so it is
      // a plain string here like any other column. The one personal filter in
      // an advanced section.
      key: "ownership",
      label: "Ownership",
      personal: true,
      advanced: true,
      // Advanced in the library, but still offered by the random picker.
      inPicker: true,
      type: "set-dynamic",
      deriveOptions: (data) =>
        [...new Set(data.map((d) => d.ownership).filter(Boolean))].sort(),
      match: (item, active) => active.has(item.ownership),
    },
    rangeFilter("hltbMainExtra", "HLTB Main + Extra", (g) => g.hltb_main_extra, { unit: "h" }),
    ...gameGenreFilters(),
    labelFilter(),
  ],

  sortDefs: [
    {
      key: "title",
      label: "Title",
      // Sorted on the English name first (getSortName), as every other
      // library is; the card still shows the CN-first title.
      compare: compareTitle,
    },
    {
      key: "release_date",
      label: "Release Date",
      compare: (a, b) => releaseScore(b.release_date) - releaseScore(a.release_date),
    },
    myRatingSort({ publicScore: metacriticSort, title: compareTitle }),
    metacriticSort,
    {
      key: "metacritic_user_score",
      label: "Metacritic User",
      compare: (a, b) => numberOrLast(b.metacritic_user_score) - numberOrLast(a.metacritic_user_score),
    },
    {
      key: "hours_played",
      label: "Playtime",
      compare: (a, b) => hoursValue(b) - hoursValue(a),
    },
    {
      // The US list price, highest first; an unpriced game last.
      key: "price_original_us",
      label: "US Price",
      compare: (a, b) => numberOrLast(b.price_original_us) - numberOrLast(a.price_original_us),
    },
  ],

  tableColumns: [
    franchiseColumn(),
    {
      key: "title_cn",
      header: "Title CN",
      tdClass: "text-xs font-bold text-text",
      render: (item) => getTitle(item),
    },
    {
      key: "title_en",
      header: "Title EN",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-text-faint hidden md:table-cell",
      render: (item) => item.game_name_en || "-",
    },
    {
      key: "game_type",
      header: "Type",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center text-text-faint hidden md:table-cell",
      render: (item) => item.game_type || "-",
    },
    {
      key: "hours_played",
      header: "Playtime",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center font-mono text-text-muted hidden lg:table-cell",
      render: (item) => formatHours(item.hours_played),
    },
    myRatingColumn(),
    playButtonColumn(),
    planFlagColumn("play_next", "Play Next"),
    planFlagColumn("to_replay", "To Replay"),
  ],
};

export default GAME_LIBRARY_CONFIG;
