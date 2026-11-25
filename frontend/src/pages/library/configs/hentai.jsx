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
import { compareTitles, getDisplayName, getSortName } from "../../../lib/naming";
import {
  airingStatusFilter,
  hGenreFilters,
  watchStatusFilter,
} from "../../../lib/libraryFilterDefs";

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
// Progress is cartoon's episode pair, ep_fin of ep_total.
// ---------------------------------------------------------------------------
// The library's title order: the Title sort, and the last tie-break of
// My Rating.
const compareTitle = (a, b) => compareTitles(getSortKey(a), getSortKey(b));

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
    watchStatusFilter("hentai"),
    airingStatusFilter(),
    setFilter("sourceMaterial", "Source Material", "source_material"),
    setFilter("originality", "Originality", "originality"),
    { ...setFilter("usefulness", "Usefulness", "usefulness"), personal: true },
    // Advanced section (FilterPanel draws it collapsed).
    ...hGenreFilters(),
  ],

  sortDefs: [
    {
      key: "title",
      label: "Title",
      compare: compareTitle,
    },
    {
      key: "release_date",
      label: "Release Date",
      compare: (a, b) => releaseScore(b.release_date) - releaseScore(a.release_date),
    },
    myRatingSort({ title: compareTitle }),
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
      key: "ep",
      header: "Ep",
      personal: true,
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center font-mono text-text-muted hidden lg:table-cell",
      render: (item) => `${item.ep_fin ?? 0} / ${item.ep_total ?? "?"}`,
    },
    {
      key: "usefulness",
      header: "Usefulness",
      personal: true,
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
