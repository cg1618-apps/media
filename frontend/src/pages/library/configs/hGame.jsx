import {
  franchiseColumn,
  myRatingColumn,
  myRatingSort,
  planFlagColumn,
  playButtonColumn,
} from "../../../components/layout/libraryColumns";
import { PLAYING_STATUS_GROUP } from "../../../config/statusGroups";
import { getDisplayName, getSortName } from "../../../lib/naming";
import { releaseScore } from "../../../lib/releaseDate";

// CN leads, as everywhere but comic; lib/naming.js holds the one chain.
const getTitle = (g) => getDisplayName(g, "h-game");
const getSortKey = (g) => getSortName(g, "h-game");

// A set filter over one column's distinct values, the shape every library
// config spells out by hand.
function setFilter(key, label, field) {
  return {
    key,
    label,
    type: "set-dynamic",
    deriveOptions: (data) => [...new Set(data.map((d) => d[field]).filter(Boolean))].sort(),
    match: (item, active) => active.has(item[field]),
  };
}

// The same over a multi-choice list column: an entry matches when its list
// holds any chosen value. An unrecorded (null) list matches nothing.
function listFilter(key, label, field) {
  return {
    key,
    label,
    type: "set-dynamic",
    deriveOptions: (data) =>
      [...new Set(data.flatMap((d) => (Array.isArray(d[field]) ? d[field] : [])))].sort(),
    match: (item, active) =>
      Array.isArray(item[field]) && item[field].some((v) => active.has(v)),
  };
}

// Achievements are the one progress figure an h-game records.
function achievementsText(item) {
  const total = Number(item.achievements_total);
  if (!Number.isFinite(total) || total <= 0) return "-";
  return `${item.achievements_earned ?? 0} / ${total}`;
}

// ---------------------------------------------------------------------------
// H-Game library config: Game's, minus playtime and Metacritic, plus the
// h-game columns. The route that renders it is gated (App.jsx), and the list
// endpoint returns nothing to a session that cannot see the type.
// ---------------------------------------------------------------------------
const H_GAME_LIBRARY_CONFIG = {
  usesSeries: true,
  navPath: "/h-game",
  defaultSort: "title",
  searchPlaceholder: "Search h-games, franchise, series...",

  buildSearchString(item, franchiseDict, seriesDict) {
    const f = franchiseDict[item.franchise_id];
    const s = seriesDict[item.series_id];
    return [
      item.h_game_name_cn,
      item.h_game_name_en,
      item.h_game_name_roman,
      item.h_game_name_jp,
      item.h_game_name_alt,
      item.game_type,
      item.playstyle,
      item.release_status,
      f?.franchise_name_cn,
      f?.franchise_name_en,
      f?.franchise_name_roman,
      s?.series_name_cn,
      s?.series_name_en,
      s?.series_name_alt,
      String(item.release_date ?? ""),
    ]
      .filter(Boolean)
      .join(" ");
  },

  filterDefs: [
    setFilter("gameType", "Type", "game_type"),
    {
      key: "playingStatus",
      label: "Play Status",
      type: "set-grouped",
      groupOptions: ["Playing", "Planned", "Completed", "Dropped", "Might Play"],
      match: (item, active) =>
        active.has(PLAYING_STATUS_GROUP[item.playing_status] ?? "Might Play"),
    },
    setFilter("playstyle", "Play Style", "playstyle"),
    setFilter("language", "Language", "language_availability"),
    listFilter("platform", "Platform", "platform"),
    // Derived server-side from the copy rows, as on Game.
    setFilter("ownership", "Ownership", "ownership"),
    setFilter("releaseStatus", "Release", "release_status"),
    setFilter("usefulness", "Usefulness", "usefulness"),
  ],

  sortDefs: [
    {
      key: "title",
      label: "Title",
      compare: (a, b) => getSortKey(a).localeCompare(getSortKey(b), undefined, { numeric: true }),
    },
    {
      key: "release_date",
      label: "Release Date",
      compare: (a, b) => releaseScore(b.release_date) - releaseScore(a.release_date),
    },
    myRatingSort,
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
      render: (item) => item.h_game_name_en || "-",
    },
    {
      key: "game_type",
      header: "Type",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center text-text-faint hidden md:table-cell",
      render: (item) => item.game_type || "-",
    },
    {
      key: "playstyle",
      header: "Style",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center font-mono text-text-faint hidden md:table-cell",
      render: (item) => item.playstyle || "-",
    },
    {
      key: "language",
      header: "Language",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center text-text-faint hidden lg:table-cell",
      render: (item) => item.language_availability || "-",
    },
    {
      key: "achievements",
      header: "Achievements",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center font-mono text-text-muted hidden lg:table-cell",
      render: achievementsText,
    },
    myRatingColumn(),
    playButtonColumn(),
    planFlagColumn("to_replay", "To Replay"),
  ],
};

export default H_GAME_LIBRARY_CONFIG;
