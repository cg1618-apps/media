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
import { compareTitles } from "../../../lib/naming";
import { BOOK_SERIALIZATION_STATUSES, MANGA_REGIONS } from "../../../config/fieldOptions";
import {
  genreFilters,
  myRatingFilter,
  publisherTwFilter,
  readStatusFilter,
  vocabularyFilter,
} from "../../../lib/libraryFilterDefs";

function getTitle(m)   {
  return m.manga_name_cn || m.manga_name_en || m.manga_name_roman
      || m.manga_name_jp  || m.manga_name_alt || "";
}
function getSortKey(m) {
  return m.manga_name_en || m.manga_name_roman || m.manga_name_cn
      || m.manga_name_jp  || m.manga_name_alt  || "";
}

// ---------------------------------------------------------------------------
// Manga library config
// ---------------------------------------------------------------------------
// The library's title order: the Title sort, and the last tie-break of
// My Rating.
const compareTitle = (a, b) => compareTitles(getSortKey(a), getSortKey(b));

const MANGA_LIBRARY_CONFIG = {
  usesSeries: true,
  navPath: "/manga",
  defaultSort: "title",
  searchPlaceholder: "Search manga, franchise, series...",

  buildSearchString(item, franchiseDict, seriesDict) {
    const f = franchiseDict[item.franchise_id];
    const s = seriesDict[item.series_id];
    return [
      item.manga_name_cn, item.manga_name_en, item.manga_name_roman,
      item.manga_name_jp, item.manga_name_alt,
      f?.franchise_name_cn, f?.franchise_name_en, f?.franchise_name_roman,
      s?.series_name_cn,   s?.series_name_en,   s?.series_name_alt,
      String(item.release_date ?? ""),
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
    vocabularyFilter("region", "Region", "region", MANGA_REGIONS),
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
      compare: (a, b) => releaseScore(b.release_date) - releaseScore(a.release_date),
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
      render: (item) => item.manga_name_en || item.manga_name_roman || "-",
    },
    {
      key: "status",
      header: "Status",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center text-text-faint hidden md:table-cell",
      render: (item) => item.serialization_status || "-",
    },
    {
      key: "ch",
      header: "Ch",
      personal: true,
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center font-mono text-text-muted hidden lg:table-cell",
      render: (item) => `${item.ch_fin ?? 0} / ${item.ch_total ?? "?"}`,
    },
    {
      key: "vol",
      header: "Vol",
      personal: true,
      thClass: "hidden lg:table-cell",
      tdClass: "text-xs text-center font-mono text-text-muted hidden lg:table-cell",
      render: (item) => `${item.vol_fin ?? 0} / ${item.vol_total ?? "?"}`,
    },
    myRatingColumn(),
    malRatingColumn(),
    readButtonColumn(),
    planFlagColumn("read_next", "Read Next"),
    planFlagColumn("to_reread", "To Reread"),
  ],
};

export default MANGA_LIBRARY_CONFIG;
