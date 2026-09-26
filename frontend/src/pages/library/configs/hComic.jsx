import {
  franchiseColumn,
  myRatingColumn,
  myRatingSort,
  planFlagColumn,
  readButtonColumn,
  usefulnessSort,
} from "../../../components/layout/libraryColumns";
import { progressFor } from "../../../lib/hComicRegion";
import { releaseScore } from "../../../lib/releaseDate";
import { getDisplayName, getSortName } from "../../../lib/naming";
import { READING_STATUS_GROUP } from "../../../utils/media";

// CN leads, as everywhere but comic; lib/naming.js holds the one chain.
const getTitle = (h) => getDisplayName(h, "h-comic");
const getSortKey = (h) => getSortName(h, "h-comic");

// "4 / 20 page" on JP, "12 / ? ch" on KR - one column, since an entry only
// ever counts in the unit its region reads in (lib/hComicRegion.js).
function progressText(item) {
  const progress = progressFor(item);
  if (!progress) return "-";
  return `${progress.fin} / ${progress.total ?? "?"} ${progress.unit}`;
}

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

// ---------------------------------------------------------------------------
// H-Comic library config. The route that renders it is gated (App.jsx), and
// the list endpoint returns nothing to a session that cannot see the type.
// ---------------------------------------------------------------------------
const H_COMIC_LIBRARY_CONFIG = {
  usesSeries: true,
  navPath: "/h-comic",
  defaultSort: "title",
  searchPlaceholder: "Search h-comics, franchise, series...",

  buildSearchString(item, franchiseDict, seriesDict) {
    const f = franchiseDict[item.franchise_id];
    const s = seriesDict[item.series_id];
    return [
      item.h_comic_name_cn,
      item.h_comic_name_en,
      item.h_comic_name_alt,
      item.h_comic_name_jp,
      item.h_comic_name_kr,
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
    setFilter("region", "Region", "region"),
    {
      key: "readingStatus",
      label: "Read Status",
      type: "set-grouped",
      groupOptions: ["Reading", "Planned", "Completed", "Dropped", "Might Read"],
      match: (item, active) =>
        active.has(READING_STATUS_GROUP[item.reading_status] ?? "Might Read"),
    },
    setFilter("serializationStatus", "Serialization Status", "serialization_status"),
    setFilter("originality", "Originality", "originality"),
    setFilter("animationStatus", "Animation Status", "animation_status"),
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
    {
      key: "end_date",
      label: "Ending Date",
      compare: (a, b) => releaseScore(b.end_date) - releaseScore(a.end_date),
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
      key: "region",
      header: "Region",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center font-mono text-text-faint hidden md:table-cell",
      render: (item) => item.region || "-",
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
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center font-mono text-text-muted hidden lg:table-cell",
      render: progressText,
    },
    {
      key: "usefulness",
      header: "Usefulness",
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center text-text-faint hidden lg:table-cell",
      render: (item) => item.usefulness || "-",
    },
    myRatingColumn(),
    readButtonColumn(),
    planFlagColumn("read_next", "Read Next"),
    planFlagColumn("to_reread", "To Reread"),
  ],
};

export default H_COMIC_LIBRARY_CONFIG;
