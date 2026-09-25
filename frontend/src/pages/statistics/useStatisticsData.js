// Frontend: statistics page file for useStatisticsData.
import { useMemo } from "react";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useMediaList } from "../../hooks/useMediaList";
import { useAuth } from "../../contexts/AuthContext";
import { canSeeGatedType } from "../../lib/gatedTypes";

const SEASON_WEIGHT = { FAL: 4, SUM: 3, SPR: 2, WIN: 1 };

const LIST_OPTIONS = { params: { limit: 2000 } };

function groupBy(entries, field) {
  const grouped = {};
  entries.forEach((entry) => {
    const id = String(entry[field]);
    if (!grouped[id]) grouped[id] = [];
    grouped[id].push(entry);
  });
  return grouped;
}

export default function useStatisticsData() {
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seriesQuery = useMediaList("series", LIST_OPTIONS);
  const animeQuery = useMediaList("anime", LIST_OPTIONS);
  const animeMovieQuery = useMediaList("anime-movie", LIST_OPTIONS);
  const movieQuery = useMediaList("movie", LIST_OPTIONS);
  const tvQuery = useMediaList("tv-show", LIST_OPTIONS);
  const cartoonQuery = useMediaList("cartoon", LIST_OPTIONS);
  const mangaQuery = useMediaList("manga", LIST_OPTIONS);
  const novelQuery = useMediaList("novel", LIST_OPTIONS);
  const comicQuery = useMediaList("comic", LIST_OPTIONS);
  const gameQuery = useMediaList("game", LIST_OPTIONS);
  // Gated: each asked for only by a session that can see its type, and
  // handed on as null otherwise so the page draws no block of it at all.
  const auth = useAuth();
  const canSeeHComic = canSeeGatedType(auth, "h-comic");
  const hComicQuery = useMediaList("h-comic", {
    ...LIST_OPTIONS,
    enabled: canSeeHComic,
  });
  const canSeeHGame = canSeeGatedType(auth, "h-game");
  const hGameQuery = useMediaList("h-game", {
    ...LIST_OPTIONS,
    enabled: canSeeHGame,
  });
  const canSeeHentai = canSeeGatedType(auth, "hentai");
  const hentaiQuery = useMediaList("hentai", {
    ...LIST_OPTIONS,
    enabled: canSeeHentai,
  });
  const seasonalQuery = useApiQuery(["api", "seasonal"], "/api/seasonal/");
  const currentSeasonQuery = useApiQuery(
    ["api", "seasonal", "current-season"],
    "/api/seasonal/current-season",
  );
  // Hand-maintained rates for the game spend block. Unset is normal and the
  // endpoint answers with an empty table, so this never gates the page.
  const fxRatesQuery = useApiQuery(["api", "fx-rates"], "/api/fx-rates");

  const franchises = franchiseQuery.data || [];
  const series = seriesQuery.data || [];
  const allAnime = animeQuery.data || [];
  const allAnimeMovies = animeMovieQuery.data || [];
  const allMovies = movieQuery.data || [];
  const allTVShows = tvQuery.data || [];
  const allCartoons = cartoonQuery.data || [];
  const allManga = mangaQuery.data || [];
  const allNovel = novelQuery.data || [];
  const allComic = comicQuery.data || [];
  const allGame = gameQuery.data || [];
  const allHComic = canSeeHComic ? hComicQuery.data || [] : null;
  const allHGame = canSeeHGame ? hGameQuery.data || [] : null;
  const allHentai = canSeeHentai ? hentaiQuery.data || [] : null;
  const fxRates = fxRatesQuery.data || null;

  const franchiseMap = useMemo(
    () =>
      Object.fromEntries(
        franchises.map((franchise) => [String(franchise.system_id), franchise]),
      ),
    [franchises],
  );

  const allEntries = useMemo(
    () => [
      ...allAnime.map((entry) => ({ ...entry, _type: "anime" })),
      ...allAnimeMovies.map((entry) => ({ ...entry, _type: "anime_movie" })),
      ...allMovies.map((entry) => ({ ...entry, _type: "movie" })),
      ...allTVShows.map((entry) => ({ ...entry, _type: "tv_show" })),
      ...allCartoons.map((entry) => ({ ...entry, _type: "cartoon" })),
      ...allManga.map((entry) => ({ ...entry, _type: "manga" })),
      ...allNovel.map((entry) => ({ ...entry, _type: "novel" })),
      ...allComic.map((entry) => ({ ...entry, _type: "comic" })),
      ...allGame.map((entry) => ({ ...entry, _type: "game" })),
      ...(allHComic || []).map((entry) => ({ ...entry, _type: "h_comic" })),
      ...(allHGame || []).map((entry) => ({ ...entry, _type: "h_game" })),
      ...(allHentai || []).map((entry) => ({ ...entry, _type: "hentai" })),
    ],
    [
      allAnime,
      allAnimeMovies,
      allMovies,
      allTVShows,
      allCartoons,
      allManga,
      allNovel,
      allComic,
      allGame,
      allHComic,
      allHGame,
      allHentai,
    ],
  );

  const allEntriesByFranchise = useMemo(
    () => groupBy(allEntries, "franchise_id"),
    [allEntries],
  );

  // A series has no type of its own, so the favourite comic-series grid works
  // out what a series holds by looking at its entries.
  const allEntriesBySeries = useMemo(
    () => groupBy(allEntries, "series_id"),
    [allEntries],
  );

  const seasonals = useMemo(
    () =>
      [...(seasonalQuery.data || [])].sort((a, b) => {
        const [aSeason, aYear] = a.seasonal.split(" ");
        const [bSeason, bYear] = b.seasonal.split(" ");
        const yearDiff = parseInt(bYear, 10) - parseInt(aYear, 10);
        if (yearDiff !== 0) return yearDiff;
        return (SEASON_WEIGHT[bSeason] ?? 0) - (SEASON_WEIGHT[aSeason] ?? 0);
      }),
    [seasonalQuery.data],
  );

  const queries = [
    franchiseQuery,
    seriesQuery,
    animeQuery,
    animeMovieQuery,
    movieQuery,
    tvQuery,
    cartoonQuery,
    mangaQuery,
    novelQuery,
    comicQuery,
    gameQuery,
    hComicQuery,
    hGameQuery,
    hentaiQuery,
    seasonalQuery,
    currentSeasonQuery,
    fxRatesQuery,
  ];
  const firstError = queries.find((query) => query.error)?.error;

  return {
    franchises,
    series,
    allAnime,
    allAnimeMovies,
    allMovies,
    allTVShows,
    allCartoons,
    allManga,
    allNovel,
    allComic,
    allGame,
    allHComic,
    allHGame,
    allHentai,
    fxRates,
    seasonals,
    currentSeason: currentSeasonQuery.data?.current_season || null,
    allEntriesByFranchise,
    allEntriesBySeries,
    franchiseMap,
    loading: queries.some((query) => query.isLoading),
    error: firstError?.message || null,
  };
}

