// Frontend: page component file for Plan.
//
// Three sections - Do next, To redo, and Plan to do for future releases -
// with a table of contents on the right on xl+ screens, and below xl the
// same rows as a line of chips pinned under the nav (ContentsBar), as on a
// detail page. Do next and To redo are one row each: their groups change
// with the tab, and a contents row per tab's group would come and go as the
// tabs are clicked. The future-releases section lists one sub-row per year
// group, read from the same usePlanFuture the section draws.
import { useState } from "react";
import usePlanData from "../plan/usePlanData";
import PlanWatchNext from "../plan/PlanWatchNext";
import PlanToRewatch from "../plan/PlanToRewatch";
import PlanToWatchFuture, { futureYearAnchor, usePlanFuture } from "../plan/PlanToWatchFuture";
import ContentsBar, { contentsBarHeight } from "../../components/layout/ContentsBar";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import TableOfContents from "../../components/layout/TableOfContents";
import { Eyebrow } from "../../components/ui/primitives";
import { navOffset, useScrollSpy } from "../../hooks/useScrollSpy";

// The anchors of the three sections, in page order.
export const PLAN_SECTIONS = [
  { id: "plan-do-next", label: "Do next" },
  { id: "plan-to-redo", label: "To redo" },
  { id: "plan-future", label: "Future releases" },
];

// What covers an anchor: the nav, and the contents bar while it is drawn.
function planOffset() {
  return navOffset() + contentsBarHeight();
}

/** The contents rows: the three sections, the future one's year groups under it. */
export function planTocItems(futureGroups) {
  return [
    ...PLAN_SECTIONS,
    ...futureGroups.map(({ year }) => ({ id: futureYearAnchor(year), label: year, level: 2 })),
  ];
}

export default function Plan() {
  const [reloadKey, setReloadKey] = useState(0);
  const {
    allAnime,
    allAnimeMovies,
    allMovies,
    allTVShows,
    allCartoons,
    franchiseMap,
    planRows,
    loading,
    error,
  } = usePlanData(reloadKey);
  const future = usePlanFuture({ allAnime, allAnimeMovies, allMovies, allTVShows, allCartoons });

  const tocItems = planTocItems(future.grouped);
  const activeId = useScrollSpy(
    tocItems.map(({ id }) => id),
    { offsetFor: planOffset, enabled: !loading && !error },
  );

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Loading plan..." />;
  }

  if (error) {
    return (
      <MediaLoadingState error={error} errorTitle="Error loading plan." />
    );
  }

  return (
    <div className="max-w-7xl xl:max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full xl:flex xl:gap-8">
      <ContentsBar
        items={tocItems}
        activeId={activeId}
        offsetFor={planOffset}
        sticky
        className="-mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 mb-6"
      />
      <div className="min-w-0 xl:flex-1 space-y-12">
        {/* Page header */}
        <header>
          <Eyebrow className="mb-3">Plan</Eyebrow>
          <h1 className="font-display text-5xl sm:text-6xl font-semibold text-text leading-[0.95] mb-2">
            Plan
          </h1>
          <p className="text-text-muted">
            Do next, to redo and future releases.
          </p>
        </header>

        <PlanWatchNext id={PLAN_SECTIONS[0].id} planRows={planRows} />

        <PlanToRewatch id={PLAN_SECTIONS[1].id} planRows={planRows} />

        <PlanToWatchFuture
          id={PLAN_SECTIONS[2].id}
          future={future}
          franchiseMap={franchiseMap}
          onUpdated={() => setReloadKey((k) => k + 1)}
        />
      </div>

      {/* Contents column, on the right as on the detail pages - xl+ only. */}
      <aside className="hidden xl:block w-40 shrink-0">
        <TableOfContents items={tocItems} activeId={activeId} offsetFor={planOffset} />
      </aside>
    </div>
  );
}
