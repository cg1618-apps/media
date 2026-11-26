// Frontend: page component file for Statistics.
//
// Opened by view.statistics (App.jsx). With a list (self.list), the viewer's
// own numbers - computed from its lists, seasonal rows and game copies - and
// the catalogue sections below them. Without one, the catalogue sections
// alone (StatsCatalogue): the personal sections are absent, not empty.
//
// The page with a list carries a table of contents on the right on xl+
// screens, and below xl the same rows as a line of chips pinned under the
// nav (ContentsBar), as on the plan and detail pages. Its rows are
// STATS_SECTIONS (sections.js), each favourite grid a sub-row.
//
// Favourite Entity draws studios and people, so it is drawn - and listed in
// the contents - only for a viewer holding view.studio and view.person, and
// its two lists are fetched only then. They do not hold the page's spinner:
// the section's grids fill in when the lists land.
import { useViewScope } from "../../hooks/useViewScope";
import { useAuth } from "../../contexts/AuthContext";
import StatsCatalogue, { StatsCatalogueSections } from "../statistics/StatsCatalogue";
import useStatisticsData from "../statistics/useStatisticsData";
import { StatsFavoriteSection } from "../statistics/StatsFavoriteGrids";
import StatsFranchiseSummary from "../statistics/StatsFranchiseSummary";
import StatsGameSpend from "../statistics/StatsGameSpend";
import {
  FAVORITE_ENTITY_SECTION,
  FAVORITE_MEDIA_SECTION,
  STATS_SECTIONS,
  statsTocItems,
} from "../statistics/sections";
import { useApiQuery } from "../../hooks/useApiQuery";
import { endpoints } from "../../api/endpoints";
import ContentsBar, { contentsBarHeight } from "../../components/layout/ContentsBar";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import TableOfContents from "../../components/layout/TableOfContents";
import { navOffset, useScrollSpy } from "../../hooks/useScrollSpy";

// What covers an anchor: the nav, and the contents bar while it is drawn.
function statsOffset() {
  return navOffset() + contentsBarHeight();
}

export default function Statistics() {
  const { ownData } = useViewScope();
  return ownData ? <StatisticsWithList /> : <StatsCatalogue />;
}

function StatisticsWithList() {
  const {
    franchises,
    series,
    allAnime,
    allAnimeMovies,
    allMovies,
    allManga,
    allBook,
    allComic,
    allGame,
    allHComic,
    allHGame,
    allHentai,
    fxRates,
    seasonals,
    currentSeason,
    allEntriesByFranchise,
    allEntriesBySeries,
    loading,
    error,
  } = useStatisticsData();

  const viewScope = useViewScope();
  const showEntities = Boolean(viewScope.studio && viewScope.person);
  const studiosQuery = useApiQuery(["api", "studio"], endpoints.studio.list(), {
    enabled: showEntities,
  });
  const peopleQuery = useApiQuery(["api", "person"], endpoints.person.list(), {
    enabled: showEntities,
  });
  const sections = showEntities
    ? STATS_SECTIONS
    : STATS_SECTIONS.filter((section) => section !== FAVORITE_ENTITY_SECTION);
  const tocItems = statsTocItems(useAuth(), sections);
  const activeId = useScrollSpy(
    tocItems.map(({ id }) => id),
    { offsetFor: statsOffset, enabled: !loading && !error },
  );

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
    <div className="max-w-7xl xl:max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full xl:flex xl:gap-8">
      <ContentsBar
        items={tocItems}
        activeId={activeId}
        offsetFor={statsOffset}
        sticky
        className="-mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 mb-6"
      />
      <div className="min-w-0 xl:flex-1 space-y-12">
        {/* Blocks 1 — favourite 3×3 grids, across all three tiers */}
        <StatsFavoriteSection
          section={FAVORITE_MEDIA_SECTION}
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

        {showEntities && (
          <StatsFavoriteSection
            section={FAVORITE_ENTITY_SECTION}
            studios={studiosQuery.data || []}
            people={peopleQuery.data || []}
            allEntriesByFranchise={allEntriesByFranchise}
            allEntriesBySeries={allEntriesBySeries}
          />
        )}

        {/* Blocks 2, 2.5 */}
        <StatsFranchiseSummary
          franchises={franchises}
          allAnime={allAnime}
          allAnimeMovies={allAnimeMovies}
          allMovies={allMovies}
          allManga={allManga}
          allBook={allBook}
          allComic={allComic}
          allHComic={allHComic}
          allHGame={allHGame}
          allHentai={allHentai}
          seasonals={seasonals}
          currentSeason={currentSeason}
        />

        {/* Block 3 — what the game collection cost */}
        <StatsGameSpend games={allGame} fxRates={fxRates} />

        {/* Block 4 — the catalogue's own counts, the same sections a
            shared account sees as its whole page */}
        <StatsCatalogueSections />
      </div>

      {/* Contents column, on the right as on the detail pages - xl+ only. */}
      <aside className="hidden xl:block w-40 shrink-0">
        <TableOfContents items={tocItems} activeId={activeId} offsetFor={statsOffset} />
      </aside>
    </div>
  );
}
