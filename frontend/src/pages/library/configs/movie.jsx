import {
  releaseStatusColumn,
  franchiseColumn,
  imdbRatingColumn,
  imdbRatingSort,
  myRatingColumn,
  myRatingSort,
  planFlagColumn,
  watchButtonColumn,
} from "../../../components/layout/libraryColumns";
import { compareTitles } from "../../../lib/naming";
import { FILM_RELEASE_STATUSES } from "../../../config/fieldOptions";
import {
  exclusiveSourceFilter,
  genreFilters,
  myRatingFilter,
  watchStatusFilter,
} from "../../../lib/libraryFilterDefs";

function getTitle(m)   { return m.movie_name_cn || m.movie_name_en || m.movie_name_alt || ""; }
function getSortKey(m) { return m.movie_name_en || m.movie_name_alt || m.movie_name_cn || ""; }

/** Year extracted from the last whitespace/dash segment of release_date_usa */
function getReleaseSortScore(m) {
  const raw = m.release_date_usa || "";
  if (!raw) return 0;
  const parts = String(raw).trim().split(/[-\s]/);
  return parseInt(parts[parts.length - 1]) || 0;
}

// ---------------------------------------------------------------------------
// Movie library config
// ---------------------------------------------------------------------------
// The library's title order: the Title sort, and the last tie-break of
// My Rating.
const compareTitle = (a, b) => compareTitles(getSortKey(a), getSortKey(b));

const MOVIE_LIBRARY_CONFIG = {
  usesSeries: false,
  navPath: "/movie",
  defaultSort: "title",
  searchPlaceholder: "Search movies, franchise, director...",

  buildSearchString(item, franchiseDict) {
    const f = franchiseDict[item.franchise_id];
    return [
      item.movie_name_cn, item.movie_name_en, item.movie_name_alt,
      f?.franchise_name_cn, f?.franchise_name_en, f?.franchise_name_roman,
      item.director, item.release_date_usa,
    ].filter(Boolean).join(" ");
  },

  filterDefs: [
    {
      key: "releaseStatus",
      label: "Release Status",
      type: "set",
      options: FILM_RELEASE_STATUSES,
      match: (item, active) => active.has(item.release_status),
    },
    {
      key: "movieType",
      label: "Type",
      type: "set",
      options: ["Reality", "Animation"],
      match: (item, active) => active.has(item.movie_type),
    },
    watchStatusFilter("movie"),
    // Advanced section (FilterPanel draws it collapsed).
    // A movie's original_source is the one it labels Exclusive Source.
    exclusiveSourceFilter("original_source"),
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
    myRatingSort({ publicScore: imdbRatingSort, title: compareTitle }),
    imdbRatingSort,
  ],

  tableColumns: [
    franchiseColumn(),
    {
      key: "title",
      header: "Title",
      render: (item) => {
        const main = getTitle(item);
        const sub  = item.movie_name_en || "";
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
    releaseStatusColumn(),
    myRatingColumn(),
    imdbRatingColumn(),
    {
      key: "director",
      header: "Director",
      thClass: "hidden xl:table-cell",
      tdClass: "text-xs text-center text-text-faint hidden xl:table-cell truncate max-w-[8rem]",
      render: (item) => item.director || "-",
    },
    {
      key: "release",
      header: "Release",
      thClass: "hidden xl:table-cell",
      tdClass: "text-xs text-center text-text-faint hidden xl:table-cell",
      render: (item) => item.release_date_usa || "-",
    },
    watchButtonColumn(),
    planFlagColumn("watch_next", "Watch Next"),
    planFlagColumn("to_rewatch", "To Rewatch"),
  ],
};

export default MOVIE_LIBRARY_CONFIG;
