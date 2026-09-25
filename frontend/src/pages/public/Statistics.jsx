// Frontend: page component file for Statistics.
import useStatisticsData from "../statistics/useStatisticsData";
import StatsFavoriteGrids from "../statistics/StatsFavoriteGrids";
import StatsFranchiseSummary from "../statistics/StatsFranchiseSummary";
import StatsGameSpend from "../statistics/StatsGameSpend";
import StatsSidebar from "../statistics/StatsSidebar";
import StatsSectionHeader from "../statistics/StatsSectionHeader";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { Eyebrow } from "../../components/ui/primitives";

export default function Statistics() {
  const {
    franchises,
    series,
    allAnime,
    allAnimeMovies,
    allMovies,
    allManga,
    allNovel,
    allComic,
    allGame,
    allHComic,
    allHGame,
    fxRates,
    seasonals,
    currentSeason,
    allEntriesByFranchise,
    allEntriesBySeries,
    loading,
    error,
  } = useStatisticsData();

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Loading statistics..." />;
  }

  if (error) {
    return (
      <MediaLoadingState
        error={error}
        errorTitle="Error loading statistics."
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="lg:flex lg:gap-10">
        <StatsSidebar />

        <div className="min-w-0 flex-1 space-y-12">
          {/* Page header */}
          <header>
            <Eyebrow className="mb-2">Archive</Eyebrow>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold text-text leading-none mb-2">
              Statistics
            </h1>
            <p className="text-sm text-text-muted font-mono">
              {franchises.length} franchises tracked
            </p>
          </header>

          {/* Blocks 1 — favourite 3×3 grids, across all three tiers */}
          <section id="favourites" className="scroll-mt-24">
            <StatsSectionHeader eyebrow="Statistics" title="Favourites" />
            <StatsFavoriteGrids
              franchises={franchises}
              series={series}
              entriesByType={{
                movie: allMovies,
                game: allGame,
                "h-game": allHGame || [],
              }}
              allEntriesByFranchise={allEntriesByFranchise}
              allEntriesBySeries={allEntriesBySeries}
            />
          </section>

          {/* Blocks 2, 2.5 */}
          <StatsFranchiseSummary
            franchises={franchises}
            allAnime={allAnime}
            allAnimeMovies={allAnimeMovies}
            allMovies={allMovies}
            allManga={allManga}
            allNovel={allNovel}
            allComic={allComic}
            allHComic={allHComic}
            allHGame={allHGame}
            seasonals={seasonals}
            currentSeason={currentSeason}
          />

          {/* Block 3 — what the game collection cost */}
          <StatsGameSpend games={allGame} fxRates={fxRates} />
        </div>
      </div>
    </div>
  );
}
