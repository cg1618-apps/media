import {
  anilistPopularitySort,
  anilistRatingSort,
  franchiseColumn,
  malRatingColumn,
  malRatingSort,
  myRatingColumn,
  myRatingSort,
  planFlagColumn,
  readButtonColumn,
} from "../../../components/layout/libraryColumns";
import { releaseScore } from "../../../lib/releaseDate";
import { READING_STATUS_GROUP, getBookProgress } from "../../../utils/media";

function getTitle(n)   {
  return n.book_name_cn || n.book_name_en || n.book_name_roman
      || n.book_name_jp  || n.book_name_alt || "";
}
// Release date sort score: the JP date, then the TW one, first-of-period for
// the precision an entry does not carry.
function getReleaseSortScore(n) {
  return releaseScore(n.release_date_jp || n.release_date_tw);
}

function getSortKey(n) {
  return n.book_name_en || n.book_name_roman || n.book_name_cn
      || n.book_name_jp  || n.book_name_alt  || "";
}

// ---------------------------------------------------------------------------
// Book library config
// ---------------------------------------------------------------------------
const BOOK_LIBRARY_CONFIG = {
  usesSeries: true,
  navPath: "/book",
  defaultSort: "title",
  searchPlaceholder: "Search books, franchise, series...",

  buildSearchString(item, franchiseDict, seriesDict) {
    const f = franchiseDict[item.franchise_id];
    const s = seriesDict[item.series_id];
    return [
      item.book_name_cn, item.book_name_en, item.book_name_roman,
      item.book_name_jp, item.book_name_alt,
      f?.franchise_name_cn, f?.franchise_name_en, f?.franchise_name_roman,
      s?.series_name_cn,   s?.series_name_en,   s?.series_name_alt,
      item.release_date_jp, item.release_date_tw,
    ].filter(Boolean).join(" ");
  },

  filterDefs: [
    {
      key: "serializationStatus",
      label: "Serialization Status",
      type: "set-dynamic",
      deriveOptions: (data) =>
        [...new Set(data.map((d) => d.serialization_status).filter(Boolean))].sort(),
      match: (item, active) => active.has(item.serialization_status),
    },
    {
      key: "readingStatus",
      label: "Read Status",
      personal: true,
      type: "set-grouped",
      groupOptions: ["Reading", "Planned", "Completed", "Dropped", "Might Read"],
      match: (item, active) =>
        active.has(READING_STATUS_GROUP[item.reading_status] ?? "Might Read"),
    },
    {
      key: "region",
      label: "Region",
      type: "set-dynamic",
      deriveOptions: (data) =>
        [...new Set(data.map((d) => d.region).filter(Boolean))].sort(),
      match: (item, active) => active.has(item.region),
    },
    {
      key: "type",
      label: "Type",
      type: "set-dynamic",
      deriveOptions: (data) =>
        [...new Set(data.map((d) => d.type).filter(Boolean))].sort(),
      match: (item, active) => active.has(item.type),
    },
  ],

  sortDefs: [
    {
      key: "title",
      label: "Title",
      compare: (a, b) =>
        getSortKey(a).localeCompare(getSortKey(b), undefined, { numeric: true }),
    },
    {
      key: "release_date",
      label: "Release Date",
      compare: (a, b) => getReleaseSortScore(b) - getReleaseSortScore(a),
    },
    {
      key: "end_date",
      label: "Ending Date",
      compare: (a, b) => releaseScore(b.end_date) - releaseScore(a.end_date),
    },
    myRatingSort,
    malRatingSort,
    anilistRatingSort,
    anilistPopularitySort,
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
      render: (item) => item.book_name_en || item.book_name_roman || "-",
    },
    {
      key: "status",
      header: "Status",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center text-text-faint hidden md:table-cell",
      render: (item) => item.serialization_status || "-",
    },
    {
      key: "progress",
      header: "Progress",
      personal: true,
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center font-mono text-text-muted hidden lg:table-cell",
      render: (item) => getBookProgress(item),
    },
    myRatingColumn(),
    malRatingColumn(),
    readButtonColumn(),
    planFlagColumn("read_next", "Read Next"),
    planFlagColumn("to_reread", "To Reread"),
  ],
};

export default BOOK_LIBRARY_CONFIG;
