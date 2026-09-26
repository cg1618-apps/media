import {
  airingStatusColumn,
  franchiseColumn,
  myRatingColumn,
  myRatingSort,
  planFlagColumn,
  usefulnessSort,
  watchButtonColumn,
} from "../../../components/layout/libraryColumns";
import { releaseScore } from "../../../lib/releaseDate";
import { getDisplayName, getSortName } from "../../../lib/naming";
import { WATCHING_STATUS_GROUP } from "../../../utils/media";

// CN leads, as everywhere but comic; lib/naming.js holds the one chain.
const getTitle = (h) => getDisplayName(h, "hentai");
const getSortKey = (h) => getSortName(h, "hentai");

// A set filter over one column's distinct values, the shape h-comic's
// library config uses for its own vocabularies.
function setFilter(key, label, field) {
  return {
    key,
    label,
    type: "set-dynamic",
    deriveOptions: (data) => [...new Set(data.map((d) => d[field]).filter(Boolean))].sort(),
    match: (item, active) => active.has(item[field]),
  };
}

// ---------------------------------------------------------------------------
// Hentai library config. The route that renders it is gated (App.jsx), and
// the list endpoint returns nothing to a session that cannot see the type.
// One entry is one episode, so there is no progress column.
// ---------------------------------------------------------------------------
const HENTAI_LIBRARY_CONFIG = {
  usesSeries: true,
  navPath: "/hentai",
  defaultSort: "title",
  searchPlaceholder: "Search hentai, franchise, series...",

  buildSearchString(item, franchiseDict, seriesDict) {
    const f = franchiseDict[item.franchise_id];
    const s = seriesDict[item.series_id];
    return [
      item.hentai_name_cn,
      item.hentai_name_en,
      item.hentai_name_alt,
      item.hentai_name_roman,
      item.hentai_name_jp,
      f?.franchise_name_cn,
      f?.franchise_name_en,
      f?.franchise_name_roman,
      s?.series_name_cn,
      s?.series_name_en,
      s?.series_name_alt,
      item.studio,
      String(item.release_date ?? ""),
    ]
      .filter(Boolean)
      .join(" ");
  },

  filterDefs: [
    {
      key: "watchingStatus",
      label: "Watch Status",
      type: "set-grouped",
      groupOptions: ["Watching", "Planned", "Completed", "Dropped", "Might Watch"],
      match: (item, active) =>
        active.has(WATCHING_STATUS_GROUP[item.watching_status] ?? "Might Watch"),
    },
    setFilter("airingStatus", "Airing Status", "airing_status"),
    setFilter("sourceMaterial", "Source Material", "source_material"),
    setFilter("originality", "Originality", "originality"),
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
    usefulnessSort,
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
      key: "source_material",
      header: "Source",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center text-text-faint hidden md:table-cell",
      render: (item) => item.source_material || "-",
    },
    airingStatusColumn(),
    {
      key: "usefulness",
      header: "Usefulness",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center text-text-faint hidden lg:table-cell",
      render: (item) => item.usefulness || "-",
    },
    myRatingColumn(),
    watchButtonColumn(),
    planFlagColumn("watch_next", "Watch Next"),
    planFlagColumn("to_rewatch", "To Rewatch"),
  ],
};

export default HENTAI_LIBRARY_CONFIG;
