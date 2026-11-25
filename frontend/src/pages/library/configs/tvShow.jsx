import {
  airingStatusColumn,
  franchiseColumn,
  imdbRatingColumn,
  imdbAvgRatingSort,
  imdbRatingSort,
  imdbSeriesRatingSort,
  myRatingColumn,
  myRatingSort,
  planFlagColumn,
  watchButtonColumn,
} from "../../../components/layout/libraryColumns";
import { compareTitles } from "../../../lib/naming";
import {
  airingStatusFilter,
  genreFilters,
  tagFilter,
  watchStatusFilter,
} from "../../../lib/libraryFilterDefs";
import { TV_SHOW_AIRING_TYPES } from "../../../config/fieldOptions";

function getTitle(s)   { return s.tv_name_cn || s.tv_name_en || s.tv_name_alt || ""; }
function getSortKey(s) { return s.tv_name_en || s.tv_name_alt || s.tv_name_cn || ""; }

// ---------------------------------------------------------------------------
// TV Show library config
// ---------------------------------------------------------------------------
// The library's title order: the Title sort, and the last tie-break of
// My Rating.
const compareTitle = (a, b) => compareTitles(getSortKey(a), getSortKey(b));

const TV_LIBRARY_CONFIG = {
  usesSeries: false,
  navPath: "/tv-show",
  defaultSort: "title",
  searchPlaceholder: "Search TV shows, franchise, region...",

  buildSearchString(item, franchiseDict) {
    const f = franchiseDict[item.franchise_id];
    return [
      item.tv_name_cn, item.tv_name_en, item.tv_name_alt,
      f?.franchise_name_cn, f?.franchise_name_en, f?.franchise_name_roman,
      item.season_part, item.region,
    ].filter(Boolean).join(" ");
  },

  filterDefs: [
    airingStatusFilter(),
    watchStatusFilter("tv-show"),
    // Airing Type and Region share a line, Airing Type at the left.
    {
      key: "airingType",
      label: "Airing Type",
      type: "set",
      options: TV_SHOW_AIRING_TYPES,
      row: "kind",
      match: (item, active) => active.has(item.airing_type),
    },
    {
      key: "region",
      label: "Region",
      type: "set-dynamic",
      row: "kind",
      deriveOptions: (data) =>
        [...new Set(data.map((d) => d.region).filter(Boolean))].sort(),
      match: (item, active) => active.has(item.region),
    },
    // Advanced section (FilterPanel draws it collapsed). A TV show's original
    // source is served under its sheet header, source_official.
    tagFilter("originalSource", "Original Source", "source_official"),
    ...genreFilters(),
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
      compare: (a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime(),
    },
    myRatingSort({ publicScore: imdbRatingSort, title: compareTitle }),
    imdbSeriesRatingSort,
    imdbAvgRatingSort,
  ],

  tableColumns: [
    franchiseColumn(),
    {
      key: "title",
      header: "Title",
      render: (item) => {
        const main = getTitle(item);
        const sub  = item.tv_name_en || "";
        return (
          <>
            <div className="text-xs font-bold text-text leading-tight line-clamp-1">{main}</div>
            {sub && sub !== main && (
              <div className="text-[9px] text-text-faint line-clamp-1">{sub}</div>
            )}
          </>
        );
      },
    },
    {
      key: "season",
      header: "Season",
      thClass: "hidden md:table-cell",
      tdClass: "text-xs text-center text-text-faint hidden md:table-cell",
      render: (item) => item.season_part || "-",
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
    myRatingColumn(),
    imdbRatingColumn(),
    imdbRatingColumn({ field: "imdb_series_rating", key: "imdb_show", header: "Show" }),
    watchButtonColumn(),
    planFlagColumn("watch_next", "Watch Next"),
    planFlagColumn("to_rewatch", "To Rewatch"),
  ],
};

export default TV_LIBRARY_CONFIG;
