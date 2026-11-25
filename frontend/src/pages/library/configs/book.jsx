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
import { getBookProgress } from "../../../utils/media";
import { compareTitles } from "../../../lib/naming";
import {
  BOOK_REGIONS,
  BOOK_SERIALIZATION_STATUSES,
  BOOK_TYPES,
} from "../../../config/fieldOptions";
import {
  genreFilters,
  myRatingFilter,
  publisherTwFilter,
  readStatusFilter,
  vocabularyFilter,
} from "../../../lib/libraryFilterDefs";

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
// The library's title order: the Title sort, and the last tie-break of
// My Rating.
const compareTitle = (a, b) => compareTitles(getSortKey(a), getSortKey(b));

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
    vocabularyFilter(
      "serializationStatus",
      "Serialization Status",
      "serialization_status",
      BOOK_SERIALIZATION_STATUSES,
    ),
    readStatusFilter(),
    vocabularyFilter("type", "Type", "type", BOOK_TYPES),
    vocabularyFilter("region", "Region", "region", BOOK_REGIONS),
    // Advanced section (FilterPanel draws it collapsed).
    publisherTwFilter(),
    myRatingFilter({ advanced: true }),
    ...genreFilters(),
  ],

  sortDefs: [
    {
      key: "title",
      label: "Title",
      ascending: true,
      compare: compareTitle,
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
    myRatingSort({ publicScore: malRatingSort, title: compareTitle }),
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
