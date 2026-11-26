// Frontend: page component file for FutureReleases.
//
// With a list (self.list), each group is ordered by the viewer's own status
// and franchise expectation, and every card says whether the entry is on the
// viewer's list and whether it is planned. Without one, the catalogue only:
// each group in release-date order, with no personal marker.
//
// Every card is FutureReleaseCard, the one the Plan page's future-releases
// section draws too: the type at the cover's top left, the viewer's own
// expectation at its top right, and each type's dates under the title.
//
// Books and manga have no release status: they are upcoming by date alone. A
// book is listed while its own JP or TW date, or one of its units', is still
// ahead (lib/releaseDate.js, isUpcomingReleaseDate), with those units under
// its card; a manga while its next volume's JP or TW date is. A date that has
// passed simply drops off.
import { useState, useCallback, useMemo } from "react";
import {
  earliestUpcomingReleaseDate,
  isUpcomingReleaseDate,
  primaryReleaseValue,
  releaseScore,
  releaseYear,
  todayIso,
} from "../../lib/releaseDate";
import { PLAN_FLAG_KEYS } from "../../hooks/useStatusToggle";
import { useViewScope } from "../../hooks/useViewScope";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import FutureReleaseCard from "../../components/cards/FutureReleaseCard";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useMediaList } from "../../hooks/useMediaList";
import { Chip } from "../../components/ui/primitives";
import {
  UnitCoverThumb,
  UnitReleaseDates,
  unitName,
} from "../../components/info/BookUnitParts";

const SEASON_ORDER = { WIN: 0, SPR: 1, SUM: 2, FAL: 3 };
const SEASON_LABEL = {
  WIN: "Winter",
  SPR: "Spring",
  SUM: "Summer",
  FAL: "Fall",
};
// Watch When Airs and the films' Watch When Released rank together.
const WATCHING_PRIORITY = {
  "Watch When Airs": 0,
  "Watch When Released": 0,
  "Plan to Watch": 1,
  "Might Watch": 2,
};
const EXPECTATION_PRIORITY = { Highest: 0, High: 1, Medium: 2, Low: 3 };

function getGroupKey(anime) {
  // The season names the JP broadcast, so only the JP year pairs with it.
  const jpYear = releaseYear(anime.release_date_jp) || null;
  const season = anime.release_season;
  if (jpYear && season && SEASON_ORDER[season] !== undefined)
    return `S_${jpYear}_${SEASON_ORDER[season]}`;
  const year = jpYear || releaseYear(anime.release_date_tw) || null;
  if (year) return `Y_${year}`;
  return "Z_TBD";
}

function getGroupLabel(key) {
  if (key === "Z_TBD") return "TBD";
  if (key.startsWith("Y_")) return key.slice(2);
  const parts = key.split("_");
  const seasonCode = Object.keys(SEASON_ORDER).find(
    (k) => SEASON_ORDER[k] === Number(parts[2]),
  );
  return `${SEASON_LABEL[seasonCode] || "?"} ${parts[1]}`;
}

function seasonRawToKey(raw) {
  if (!raw || raw === "Not Set") return null;
  const parts = raw.trim().split(" ");
  if (parts.length !== 2) return null;
  const [code, year] = parts;
  const idx = SEASON_ORDER[code];
  if (idx === undefined) return null;
  return `S_${year}_${idx}`;
}

function getNextSeasonKey(currentKey) {
  if (!currentKey || !currentKey.startsWith("S_")) return null;
  const parts = currentKey.split("_");
  const year = Number(parts[1]);
  const idx = Number(parts[2]);
  return idx < 3 ? `S_${year}_${idx + 1}` : `S_${year + 1}_0`;
}

function sortGroup(entries, franchiseDict) {
  return [...entries].sort((a, b) => {
    const wa = WATCHING_PRIORITY[a.watching_status] ?? 9;
    const wb = WATCHING_PRIORITY[b.watching_status] ?? 9;
    if (wa !== wb) return wa - wb;
    const fa = franchiseDict[a.franchise_id];
    const fb = franchiseDict[b.franchise_id];
    const ea = EXPECTATION_PRIORITY[fa?.franchise_expectation] ?? 9;
    const eb = EXPECTATION_PRIORITY[fb?.franchise_expectation] ?? 9;
    return ea - eb;
  });
}

// Without a list: earliest release first, an undated entry after every dated
// one, by name. The date is the type's own most meaningful release column.
function sortByReleaseDate(entries, mediaType) {
  const score = (e) => releaseScore(primaryReleaseValue(mediaType, e)) || Infinity;
  return [...entries].sort((a, b) => {
    const d = score(a) - score(b);
    if (d !== 0 && !Number.isNaN(d)) return d;
    return String(a.display_name ?? "").localeCompare(String(b.display_name ?? ""));
  });
}

// The viewer's own mark on a card: planned (any plan flag), read from the
// fields every list response carries. Whether it is on the list at all is
// not marked: the card's status select already says so.
function ListMarkers({ data }) {
  const planned = [...PLAN_FLAG_KEYS].some((key) => data[key] === true);
  if (!planned) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1" data-testid="list-markers">
      <Chip>Planned</Chip>
    </div>
  );
}

function FutureCard({ ownData, ...cardProps }) {
  return (
    <div>
      <FutureReleaseCard {...cardProps} />
      {ownData && <ListMarkers data={cardProps.data} />}
    </div>
  );
}

// A game is "future" while it is one of these. "Early Access" is already
// out, and "Cancelled" is never coming - neither belongs on this page.
const GAME_UNRELEASED_STATUSES = ["Unreleased"];

// games.release_date is ISO and may be a bare year, a year-month or a full
// date (ck_games_release_date_iso), so the year is always its first four
// characters.
function releaseGroupYear(date) {
  if (!date) return "TBD";
  const year = String(date).substring(0, 4);
  return /^\d{4}$/.test(year) ? year : "TBD";
}

function byYearTbdLast(a, b) {
  if (a === "TBD") return 1;
  if (b === "TBD") return -1;
  return a.localeCompare(b);
}

const SPECIFIC_TYPES = ["TV", "ONA", "Movie"];

// A unit is upcoming while either of its dates is.
function isUpcomingUnit(unit, today) {
  return (
    isUpcomingReleaseDate(unit.release_date_jp, today) ||
    isUpcomingReleaseDate(unit.release_date_tw, today)
  );
}

// The books Future Releases lists, as {entry, units, date}: `units` are the
// book's upcoming units, `date` the earliest upcoming date among the book's
// own and theirs, which places the book on the page.
function upcomingBooks(books, today) {
  const rows = [];
  for (const book of books) {
    const units = (book.units || []).filter((unit) => isUpcomingUnit(unit, today));
    const date = earliestUpcomingReleaseDate(
      [
        book.release_date_jp,
        book.release_date_tw,
        ...units.flatMap((unit) => [unit.release_date_jp, unit.release_date_tw]),
      ],
      today,
    );
    if (date) rows.push({ entry: book, units, date });
  }
  return rows;
}

// The manga whose next volume is upcoming, as {entry, date}.
function upcomingMangas(mangas, today) {
  const rows = [];
  for (const manga of mangas) {
    const date = earliestUpcomingReleaseDate(
      [manga.next_vol_release_date_jp, manga.next_vol_release_date_tw],
      today,
    );
    if (date) rows.push({ entry: manga, date });
  }
  return rows;
}

// {groups: {year: rows}, years} with each year's rows earliest first, then by
// name, and the years in order. Every row is dated, so there is no TBD group.
function groupByYear(rows) {
  const groups = {};
  for (const row of rows) {
    const year = releaseGroupYear(row.date);
    if (!groups[year]) groups[year] = [];
    groups[year].push(row);
  }
  for (const year of Object.keys(groups)) {
    groups[year].sort(
      (a, b) =>
        releaseScore(a.date) - releaseScore(b.date) ||
        String(a.entry.display_name ?? "").localeCompare(String(b.entry.display_name ?? "")),
    );
  }
  return { groups, years: Object.keys(groups).sort(byYearTbdLast) };
}

// The book's upcoming units under its card, each by its name.
function UpcomingUnits({ units }) {
  if (units.length === 0) return null;
  return (
    <ul className="mt-1.5 space-y-1" aria-label="Upcoming units">
      {units.map((unit) => (
        <li key={unit.system_id} className="flex items-start gap-1.5">
          <UnitCoverThumb unit={unit} className="w-6 h-8" />
          <div className="min-w-0">
            <p className="text-xs text-text break-words">{unitName(unit)}</p>
            <UnitReleaseDates unit={unit} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// The year sections of the book and manga tabs, in the other tabs' markup.
function YearSections({ years, groups, renderRow }) {
  return (
    <div className="space-y-10">
      {years.map((year) => (
        <section key={year}>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-display text-2xl font-semibold text-text leading-none">
              {year}
            </h2>
            <span className="font-mono text-[11px] text-text-faint tabular-nums">
              {groups[year].length}
            </span>
            <div className="flex-1 border-t border-dotted border-border-strong/60"></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {groups[year].map(renderRow)}
          </div>
        </section>
      ))}
    </div>
  );
}

// A tab's loading, error or empty state, in the other tabs' markup; null once
// there is something to list.
function tabState({ loading, error, empty, noun }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-text-faint text-sm">Loading {noun}...</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-center border border-danger text-danger p-6">
        <p className="font-bold">Failed to load {noun}</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-text-faint text-sm">No upcoming {noun} found.</p>
      </div>
    );
  }
  return null;
}

const LIST_OPTIONS = { params: { limit: 2000 } };

export default function FutureReleases() {
  const { isAdmin } = useAuth();
  const { ownData } = useViewScope();
  const queryClient = useQueryClient();
  const [activeTypeFilter, setActiveTypeFilter] = useState("all");

  const [mainTab, setMainTab] = useState("anime");

  const animeQuery = useMediaList("anime", LIST_OPTIONS);
  // The franchise expectation orders a list's groups and is each card's
  // top-right badge.
  const franchiseQuery = useMediaList("franchise", { ...LIST_OPTIONS, enabled: ownData });
  // The open read every catalogue reader may ask, not the Control Center's
  // manage.pipelines route, which a member would be refused.
  const seasonQuery = useApiQuery(
    ["api", "seasonal", "current-season"],
    "/api/seasonal/current-season",
  );
  const animeMovieQuery = useMediaList("anime-movie", {
    params: { limit: 2000 },
    enabled: mainTab === "anime-movie",
  });
  const liveMovieQuery = useMediaList("movie", {
    enabled: mainTab === "movie",
    params: { limit: 2000, release_status: "Not Released" },
  });
  const tvShowQuery = useMediaList("tv-show", {
    params: { limit: 2000 },
    enabled: mainTab === "tv-show",
  });
  const cartoonQuery = useMediaList("cartoon", {
    params: { limit: 2000 },
    enabled: mainTab === "cartoon",
  });
  const gameQuery = useMediaList("game", {
    params: { limit: 2000 },
    enabled: mainTab === "game",
  });
  // A book's units come with it: the list payload carries them.
  const bookQuery = useMediaList("book", {
    params: { limit: 2000 },
    enabled: mainTab === "book",
  });
  const mangaQuery = useMediaList("manga", {
    params: { limit: 2000 },
    enabled: mainTab === "manga",
  });
  const today = todayIso();

  const franchiseDict = useMemo(
    () =>
      Object.fromEntries(
        (franchiseQuery.data || []).map((franchise) => [
          franchise.system_id,
          franchise,
        ]),
      ),
    [franchiseQuery.data],
  );
  const currentSeasonKey = seasonRawToKey(seasonQuery.data?.current_season || "");
  const allAnime = useMemo(
    () =>
      (animeQuery.data || []).filter((anime) => {
        if (anime.airing_status !== "Not Yet Aired") return false;
        if (currentSeasonKey) {
          const key = getGroupKey(anime);
          if (key.startsWith("S_") && key < currentSeasonKey) return false;
        }
        return true;
      }),
    [animeQuery.data, currentSeasonKey],
  );
  const allAnimeMovies = useMemo(
    () =>
      (animeMovieQuery.data || []).filter(
        (movie) => movie.release_status === "Not Released",
      ),
    [animeMovieQuery.data],
  );
  const allLiveMovies = useMemo(
    () =>
      (liveMovieQuery.data || []).filter(
        (movie) => movie.release_date_usa || movie.release_date_tw,
      ),
    [liveMovieQuery.data],
  );
  const allTvShows = useMemo(
    () =>
      (tvShowQuery.data || []).filter(
        (show) =>
          show.airing_status === "Not Yet Aired" ||
          show.airing_status === "Airing",
      ),
    [tvShowQuery.data],
  );
  const allCartoons = useMemo(
    () =>
      (cartoonQuery.data || []).filter(
        (cartoon) => cartoon.airing_status === "Not Yet Aired",
      ),
    [cartoonQuery.data],
  );
  const allGames = useMemo(
    () =>
      (gameQuery.data || []).filter((game) =>
        GAME_UNRELEASED_STATUSES.includes(game.release_status),
      ),
    [gameQuery.data],
  );
  const bookRows = useMemo(
    () => groupByYear(upcomingBooks(bookQuery.data || [], today)),
    [bookQuery.data, today],
  );
  const mangaRows = useMemo(
    () => groupByYear(upcomingMangas(mangaQuery.data || [], today)),
    [mangaQuery.data, today],
  );
  const loading =
    animeQuery.isLoading || franchiseQuery.isLoading || seasonQuery.isLoading;
  const error =
    animeQuery.error?.message ||
    franchiseQuery.error?.message ||
    seasonQuery.error?.message ||
    null;
  const movieLoading = animeMovieQuery.isLoading;
  const movieError = animeMovieQuery.error?.message || null;
  const liveMovieLoading = liveMovieQuery.isLoading;
  const liveMovieError = liveMovieQuery.error?.message || null;
  const tvShowLoading = tvShowQuery.isLoading;
  const tvShowError = tvShowQuery.error?.message || null;
  const cartoonLoading = cartoonQuery.isLoading;
  const cartoonError = cartoonQuery.error?.message || null;
  const gameLoading = gameQuery.isLoading;
  const gameError = gameQuery.error?.message || null;

  const handleUpdated = useCallback((updated) => {
    queryClient.setQueriesData({ queryKey: ["media-list", "anime"] }, (old) =>
      Array.isArray(old)
        ? old.map((anime) =>
            anime.system_id === updated.system_id ? updated : anime,
          )
        : old,
    );
  }, [queryClient]);

  const handleMovieUpdated = useCallback((updated) => {
    queryClient.setQueriesData(
      { queryKey: ["media-list", "anime-movie"] },
      (old) =>
        Array.isArray(old)
          ? old.map((movie) =>
              movie.system_id === updated.system_id ? updated : movie,
            )
          : old,
    );
  }, [queryClient]);

  const handleLiveMovieUpdated = useCallback((updated) => {
    queryClient.setQueriesData({ queryKey: ["media-list", "movie"] }, (old) =>
      Array.isArray(old)
        ? old.map((movie) =>
            movie.system_id === updated.system_id ? updated : movie,
          )
        : old,
    );
  }, [queryClient]);

  const handleTvShowUpdated = useCallback((updated) => {
    queryClient.setQueriesData({ queryKey: ["media-list", "tv-show"] }, (old) =>
      Array.isArray(old)
        ? old.map((show) =>
            show.system_id === updated.system_id ? updated : show,
          )
        : old,
    );
  }, [queryClient]);

  const handleCartoonUpdated = useCallback((updated) => {
    queryClient.setQueriesData({ queryKey: ["media-list", "cartoon"] }, (old) =>
      Array.isArray(old)
        ? old.map((cartoon) =>
            cartoon.system_id === updated.system_id ? updated : cartoon,
          )
        : old,
    );
  }, [queryClient]);

  const handleGameUpdated = useCallback((updated) => {
    queryClient.setQueriesData({ queryKey: ["media-list", "game"] }, (old) =>
      Array.isArray(old)
        ? old.map((game) =>
            game.system_id === updated.system_id ? updated : game,
          )
        : old,
    );
  }, [queryClient]);

  // The book and manga cards are the library's, whose status button hands the
  // written entry back here.
  const replaceInList = useCallback(
    (type) => (updated) =>
      queryClient.setQueriesData({ queryKey: ["media-list", type] }, (old) =>
        Array.isArray(old)
          ? old.map((item) => (item.system_id === updated.system_id ? updated : item))
          : old,
      ),
    [queryClient],
  );

  const filtered = allAnime.filter((a) => {
    const t = a.airing_type || "";
    if (activeTypeFilter === "all") return true;
    if (activeTypeFilter === "other") return !SPECIFIC_TYPES.includes(t);
    return t === activeTypeFilter;
  });

  const groups = {};
  for (const anime of filtered) {
    const key = getGroupKey(anime);
    if (!groups[key]) groups[key] = [];
    groups[key].push(anime);
  }
  const sortedKeys = Object.keys(groups).sort();
  const nextSeasonKey = getNextSeasonKey(currentSeasonKey);

  const movieGroups = {};
  for (const movie of allAnimeMovies) {
    const year = releaseGroupYear(movie.release_date_jp || movie.release_date_tw);
    if (!movieGroups[year]) movieGroups[year] = [];
    movieGroups[year].push(movie);
  }
  const movieYears = Object.keys(movieGroups).sort(byYearTbdLast);

  function getLiveMovieYear(m) {
    const d = m.release_date_usa || m.release_date_tw || "";
    if (!d) return "TBD";
    const parts = String(d).trim().split(/[\s-]/);
    const year = parts[parts.length - 1];
    return /^\d{4}$/.test(year) ? year : "TBD";
  }
  const liveMovieGroups = {};
  for (const movie of allLiveMovies) {
    const year = getLiveMovieYear(movie);
    if (!liveMovieGroups[year]) liveMovieGroups[year] = [];
    liveMovieGroups[year].push(movie);
  }
  const liveMovieYears = Object.keys(liveMovieGroups).sort(byYearTbdLast);

  const cartoonGroups = {};
  for (const cartoon of allCartoons) {
    const year = releaseGroupYear(cartoon.release_date);
    if (!cartoonGroups[year]) cartoonGroups[year] = [];
    cartoonGroups[year].push(cartoon);
  }
  const cartoonYears = Object.keys(cartoonGroups).sort(byYearTbdLast);

  const gameGroups = {};
  for (const game of allGames) {
    const year = releaseGroupYear(game.release_date);
    if (!gameGroups[year]) gameGroups[year] = [];
    gameGroups[year].push(game);
  }
  const gameYears = Object.keys(gameGroups).sort(byYearTbdLast);
  for (const year of gameYears) {
    // Within a year the fuller date sorts first, so "2027-03-12" precedes a
    // bare "2027" rather than being ordered by name.
    gameGroups[year].sort((a, b) =>
      (a.release_date || "").localeCompare(b.release_date || ""),
    );
  }

  const typeFilters = [
    { key: "all", label: "All" },
    { key: "TV", label: "TV" },
    { key: "ONA", label: "ONA" },
    { key: "Movie", label: "Movie" },
    { key: "other", label: "Other" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-text-faint text-sm">
            Loading future releases...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center border border-danger text-danger p-6">
          <p className="font-bold">Failed to load releases</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <header className="mb-8">
        <h1 className="font-display text-4xl sm:text-5xl font-semibold text-text leading-none">
          Future releases
        </h1>
      </header>

      {/* Main tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { key: "anime", label: "Anime" },
          { key: "anime-movie", label: "Anime movies" },
          { key: "movie", label: "Movies" },
          { key: "tv-show", label: "TV shows" },
          { key: "cartoon", label: "Cartoons" },
          { key: "game", label: "Games" },
          { key: "book", label: "Books" },
          { key: "manga", label: "Manga" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setMainTab(t.key)}
            className={`px-3 py-1.5 border text-sm font-medium whitespace-nowrap transition ${
              mainTab === t.key
                ? "bg-brand text-on-brand border-brand"
                : "bg-surface text-text-muted border-border-strong hover:border-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ANIME TAB ── */}
      {mainTab === "anime" && (
        <>
          {/* Type filter chips */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {typeFilters.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTypeFilter(key)}
                className={`px-3 py-1 border font-mono text-[11px] transition ${
                  activeTypeFilter === key
                    ? "bg-brand text-on-brand border-brand"
                    : "bg-surface text-text-muted border-border-strong hover:border-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {sortedKeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-text-faint text-sm">
                No upcoming releases found.
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {sortedKeys.map((key) => {
                const label = getGroupLabel(key);
                const sorted = ownData
                  ? sortGroup(groups[key], franchiseDict)
                  : sortByReleaseDate(groups[key], "anime");
                let badge = null;
                if (key === currentSeasonKey) {
                  badge = <Chip tone="brand">Current</Chip>;
                } else if (key === nextSeasonKey) {
                  badge = <Chip>Next</Chip>;
                }

                return (
                  <section key={key}>
                    <div className="flex items-center gap-3 mb-4">
                      <h2 className="font-display text-2xl font-semibold text-text leading-none">
                        {label}
                      </h2>
                      {badge}
                      <span className="font-mono text-[11px] text-text-faint tabular-nums">
                        {sorted.length}
                      </span>
                      <div className="flex-1 border-t border-dotted border-border-strong/60"></div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {sorted.map((anime) => (
                        <FutureCard
                          ownData={ownData}
                          key={anime.system_id}
                          type="anime"
                          data={anime}
                          franchiseDict={franchiseDict}
                          isAdmin={isAdmin}
                          onUpdated={handleUpdated}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── ANIME MOVIES TAB ── */}
      {mainTab === "anime-movie" && (
        <>
          {movieLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
                <p className="text-text-faint text-sm">
                  Loading anime movies...
                </p>
              </div>
            </div>
          ) : movieError ? (
            <div className="text-center border border-danger text-danger p-6">
              <p className="font-bold">Failed to load anime movies</p>
              <p className="text-sm mt-1">{movieError}</p>
            </div>
          ) : movieYears.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-text-faint text-sm">
                No upcoming anime movies found.
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {movieYears.map((year) => {
                const sorted = ownData
                  ? sortGroup(movieGroups[year], franchiseDict)
                  : sortByReleaseDate(movieGroups[year], "anime-movie");
                return (
                  <section key={year}>
                    <div className="flex items-center gap-3 mb-4">
                      <h2 className="font-display text-2xl font-semibold text-text leading-none">
                        {year}
                      </h2>
                      <span className="font-mono text-[11px] text-text-faint tabular-nums">
                        {sorted.length}
                      </span>
                      <div className="flex-1 border-t border-dotted border-border-strong/60"></div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {sorted.map((movie) => (
                        <FutureCard
                          ownData={ownData}
                          key={movie.system_id}
                          type="anime-movie"
                          data={movie}
                          isAdmin={isAdmin}
                          franchiseDict={franchiseDict}
                          onUpdated={handleMovieUpdated}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
      {/* ── MOVIE TAB ── */}
      {mainTab === "movie" && (
        <>
          {liveMovieLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
                <p className="text-text-faint text-sm">Loading movies...</p>
              </div>
            </div>
          ) : liveMovieError ? (
            <div className="text-center border border-danger text-danger p-6">
              <p className="font-bold">Failed to load movies</p>
              <p className="text-sm mt-1">{liveMovieError}</p>
            </div>
          ) : liveMovieYears.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-text-faint text-sm">
                No upcoming movies found.
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {liveMovieYears.map((year) => (
                <section key={year}>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="font-display text-2xl font-semibold text-text leading-none">
                      {year}
                    </h2>
                    <span className="font-mono text-[11px] text-text-faint tabular-nums">
                      {liveMovieGroups[year].length}
                    </span>
                    <div className="flex-1 border-t border-dotted border-border-strong/60"></div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {(ownData
                      ? liveMovieGroups[year]
                      : sortByReleaseDate(liveMovieGroups[year], "movie")
                    ).map((movie) => (
                      <FutureCard
                        ownData={ownData}
                        key={movie.system_id}
                        type="movie"
                        data={movie}
                        isAdmin={isAdmin}
                        franchiseDict={franchiseDict}
                        onUpdated={handleLiveMovieUpdated}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── CARTOON TAB ── */}
      {mainTab === "cartoon" && (
        <>
          {cartoonLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
                <p className="text-text-faint text-sm">Loading cartoons...</p>
              </div>
            </div>
          ) : cartoonError ? (
            <div className="text-center border border-danger text-danger p-6">
              <p className="font-bold">Failed to load cartoons</p>
              <p className="text-sm mt-1">{cartoonError}</p>
            </div>
          ) : cartoonYears.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-text-faint text-sm">
                No upcoming cartoons found.
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {cartoonYears.map((year) => (
                <section key={year}>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="font-display text-2xl font-semibold text-text leading-none">
                      {year}
                    </h2>
                    <span className="font-mono text-[11px] text-text-faint tabular-nums">
                      {cartoonGroups[year].length}
                    </span>
                    <div className="flex-1 border-t border-dotted border-border-strong/60"></div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {(ownData
                      ? cartoonGroups[year]
                      : sortByReleaseDate(cartoonGroups[year], "cartoon")
                    ).map((cartoon) => (
                      <FutureCard
                        ownData={ownData}
                        key={cartoon.system_id}
                        type="cartoon"
                        data={cartoon}
                        franchiseDict={franchiseDict}
                        isAdmin={isAdmin}
                        onUpdated={handleCartoonUpdated}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── GAME TAB ── */}
      {mainTab === "game" && (
        <>
          {gameLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
                <p className="text-text-faint text-sm">Loading games...</p>
              </div>
            </div>
          ) : gameError ? (
            <div className="text-center border border-danger text-danger p-6">
              <p className="font-bold">Failed to load games</p>
              <p className="text-sm mt-1">{gameError}</p>
            </div>
          ) : gameYears.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-text-faint text-sm">
                No upcoming games found.
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {gameYears.map((year) => (
                <section key={year}>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="font-display text-2xl font-semibold text-text leading-none">
                      {year}
                    </h2>
                    <span className="font-mono text-[11px] text-text-faint tabular-nums">
                      {gameGroups[year].length}
                    </span>
                    <div className="flex-1 border-t border-dotted border-border-strong/60"></div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {gameGroups[year].map((game) => (
                      <FutureCard
                        ownData={ownData}
                        key={game.system_id}
                        type="game"
                        data={game}
                        franchiseDict={franchiseDict}
                        isAdmin={isAdmin}
                        onUpdated={handleGameUpdated}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── BOOK TAB ──
          A book has neither a release status nor a waiting status to set, so
          its card keeps the status button and draws no bolt. */}
      {mainTab === "book" &&
        (tabState({
          loading: bookQuery.isLoading,
          error: bookQuery.error?.message || null,
          empty: bookRows.years.length === 0,
          noun: "books",
        }) || (
          <YearSections
            years={bookRows.years}
            groups={bookRows.groups}
            renderRow={({ entry, units }) => (
              <div key={entry.system_id}>
                <FutureCard
                  ownData={ownData}
                  type="book"
                  data={entry}
                  isAdmin={isAdmin}
                  franchiseDict={franchiseDict}
                  onUpdated={replaceInList("book")}
                />
                <UpcomingUnits units={units} />
              </div>
            )}
          />
        ))}

      {/* ── MANGA TAB ── */}
      {mainTab === "manga" &&
        (tabState({
          loading: mangaQuery.isLoading,
          error: mangaQuery.error?.message || null,
          empty: mangaRows.years.length === 0,
          noun: "manga",
        }) || (
          <YearSections
            years={mangaRows.years}
            groups={mangaRows.groups}
            renderRow={({ entry }) => (
              <div key={entry.system_id}>
                <FutureCard
                  ownData={ownData}
                  type="manga"
                  data={entry}
                  isAdmin={isAdmin}
                  franchiseDict={franchiseDict}
                  onUpdated={replaceInList("manga")}
                />
              </div>
            )}
          />
        ))}

      {/* ── TV SHOW TAB ── */}
      {mainTab === "tv-show" && (
        <>
          {tvShowLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
                <p className="text-text-faint text-sm">Loading TV shows...</p>
              </div>
            </div>
          ) : tvShowError ? (
            <div className="text-center border border-danger text-danger p-6">
              <p className="font-bold">Failed to load TV shows</p>
              <p className="text-sm mt-1">{tvShowError}</p>
            </div>
          ) : allTvShows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-text-faint text-sm">
                No upcoming TV shows found.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {allTvShows
                .sort((a, b) => {
                  if (!a.release_date && !b.release_date) return 0;
                  if (!a.release_date) return 1;
                  if (!b.release_date) return -1;
                  return a.release_date.localeCompare(b.release_date);
                })
                .map((show) => (
                  <FutureCard
                    ownData={ownData}
                    key={show.system_id}
                    type="tv-show"
                    data={show}
                    isAdmin={isAdmin}
                    franchiseDict={franchiseDict}
                    onUpdated={handleTvShowUpdated}
                  />
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

