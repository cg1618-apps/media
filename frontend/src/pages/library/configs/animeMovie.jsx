import {
  releaseStatusColumn,
  anilistPopularitySort,
  anilistRatingSort,
  franchiseColumn,
  malRatingColumn,
  malRatingSort,
  myRatingColumn,
  myRatingSort,
  runtimeSort,
  planFlagColumn,
  watchButtonColumn,
} from "../../../components/layout/libraryColumns";
import LazyImage from "../../../components/ui/LazyImage";
import { BAHAMUT_VALUE } from "../../../lib/formatters";
import { sourceIconUrl } from "../../../lib/sourceIcons";
import { getBahaRow, isBaha } from "../../../utils/media";
import { compareTitles } from "../../../lib/naming";
import { ANIME_MOVIE_RELEASE_TYPES, FILM_RELEASE_STATUSES } from "../../../config/fieldOptions";
import {
  exclusiveSourceFilter,
  genreFilters,
  myRatingFilter,
  rangeFilter,
  watchStatusFilter,
} from "../../../lib/libraryFilterDefs";

// ---------------------------------------------------------------------------
// Release date sort score: year * 10000 + month * 100 + day
// ---------------------------------------------------------------------------
function getReleaseSortScore(m) {
  const raw = m.release_date_jp || m.release_date_tw || "";
  if (!raw) return 0;
  const parts = String(raw).trim().split(/[-\s]/);
  return (parseInt(parts[0]) || 0) * 10000
       + (parseInt(parts[1]) || 0) * 100
       + (parseInt(parts[2]) || 0);
}

function getReleaseYearJp(releaseDate) {
  if (!releaseDate) return null;
  const parts = String(releaseDate).trim().split(/[-\s]/);
  return parts[0] && /^\d{4}$/.test(parts[0]) ? parts[0] : parts[parts.length - 1];
}

function getTitle(m) {
  return m.anime_movie_name_cn || m.anime_movie_name_en
      || m.anime_movie_name_roman || m.anime_movie_name_jp
      || m.anime_movie_name_alt  || "";
}

function getSortKey(m) {
  return m.anime_movie_name_en || m.anime_movie_name_roman
      || m.anime_movie_name_alt || m.anime_movie_name_cn
      || m.anime_movie_name_jp  || "";
}

// ---------------------------------------------------------------------------
// Anime Movie library config
// ---------------------------------------------------------------------------
// The library's title order: the Title sort, and the last tie-break of
// My Rating.
const compareTitle = (a, b) => compareTitles(getSortKey(a), getSortKey(b));

const ANIME_MOVIE_LIBRARY_CONFIG = {
  usesSeries: false,
  navPath: "/anime-movie",
  defaultSort: "title",
  searchPlaceholder: "Search anime movies, franchise, release year...",

  buildSearchString(item, franchiseDict) {
    const f = franchiseDict[item.franchise_id];
    return [
      item.anime_movie_name_cn, item.anime_movie_name_en,
      item.anime_movie_name_roman, item.anime_movie_name_jp, item.anime_movie_name_alt,
      f?.franchise_name_cn, f?.franchise_name_en, f?.franchise_name_roman,
      f?.franchise_name_jp, f?.franchise_name_alt,
      getReleaseYearJp(item.release_date_jp),
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
    watchStatusFilter("anime-movie"),
    // Below Watch Status. Never empty: the column is NOT NULL, Cinema by
    // default, so no Not set chip.
    {
      key: "releaseType",
      label: "Release Type",
      type: "set",
      options: ANIME_MOVIE_RELEASE_TYPES,
      match: (item, active) => active.has(item.release_type),
    },
    // Advanced section (FilterPanel draws it collapsed).
    exclusiveSourceFilter(),
    // Runtime in minutes: the film's length.
    rangeFilter("runtime", "Runtime", (x) => x.length_min, { unit: "min" }),
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
    myRatingSort({ publicScore: malRatingSort, title: compareTitle }),
    malRatingSort,
    anilistRatingSort,
    anilistPopularitySort,
    runtimeSort("length_min"),
  ],

  tableColumns: [
    franchiseColumn(),
    {
      key: "title",
      header: "Title",
      render: (item) => {
        const main = getTitle(item);
        const sub  = item.anime_movie_name_en || item.anime_movie_name_roman || "";
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
    malRatingColumn(),
    {
      key: "studio",
      header: "Studio",
      thClass: "hidden xl:table-cell",
      tdClass: "text-xs text-center text-text-faint hidden xl:table-cell truncate max-w-[8rem]",
      render: (item) => item.studio || "-",
    },
    {
      key: "director",
      header: "Director",
      thClass: "hidden xl:table-cell",
      tdClass: "text-xs text-center text-text-faint hidden xl:table-cell truncate max-w-[8rem]",
      render: (item) => item.director || "-",
    },
    {
      key: "baha",
      header: "動畫瘋",
      tdClass: "text-center",
      stopPropagation: true,
      render: (item) => {
        if (!isBaha(item)) return "-";
        const bahaRow = getBahaRow(item);
        const logo = (
          <LazyImage
            src={sourceIconUrl(BAHAMUT_VALUE)}
            className={`w-4 h-4 rounded-sm bg-white object-contain inline-block ${bahaRow?.url ? "" : "opacity-50 grayscale"}`}
            alt={BAHAMUT_VALUE}
          />
        );
        return bahaRow?.url
          ? <a href={bahaRow.url} target="_blank" rel="noreferrer" className="hover:scale-110 transition-transform inline-block">{logo}</a>
          : logo;
      },
    },
    watchButtonColumn(),
    planFlagColumn("watch_next", "Watch Next"),
    planFlagColumn("to_rewatch", "To Rewatch"),
  ],
};

export default ANIME_MOVIE_LIBRARY_CONFIG;
