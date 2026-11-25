// Frontend: the page every entity library is - studio, publisher, person and
// character. Each page fetches its one list and says what it is (title,
// nouns, filters, sorts, card, list columns); this draws the rest the same
// way for all four: the title and count, the LibraryToolbar, the FilterPanel,
// the empty state, and the grid or the table.
//
// Search, filters and sort run client-side over the one list response: a
// per-filter request would refetch on each click. The filters are ordinary
// FilterDefs (lib/entityFilters.js) drawn by the FilterPanel the media
// libraries use. The panel opens shown, with nothing ticked - which keeps every
// row but one whose entries are all of restricted types (the entry-type
// group's `idle`).
//
// Props:
//   title, nouns { one, many }  - "Studios", { one: "studio", many: "studios" }
//   items, loading, error       - the list and its load state
//   filterDefs                  - the library's defs (lib/entityFilters.js)
//   matchesSearch(item, q)      - q is already cleanString()ed and non-empty
//   sorts                       - [{ value, label, descending?, compare? }];
//                                 a tie, and a sort with no compare, falls
//                                 through to the name. The page leaves out a
//                                 sort the viewer cannot use (My rating
//                                 without self.list).
//   renderCard(item)            - the grid card, keyed by rowKey
//   columns                     - the table view's columns (entityColumns.jsx)
//   rowPath(item)               - where a table row opens, or "" for nowhere
//   rowKey(item)                - defaults to system_id
import { useMemo, useState } from "react";

import { cleanString } from "../../utils/media";
import { compareTitles, entitySortName } from "../../lib/naming";
import { applyFilterDefs } from "../../lib/libraryFilters";
import { resolveSortKey } from "../../lib/libraryScope";
import { directed } from "../../lib/sortDirection";
import { useEntityFilterState } from "../../hooks/useFilterState";
import { useIncrementalList } from "../../hooks/useIncrementalList";
import { useSortState } from "../../hooks/useSortState";
import { Eyebrow } from "../ui/primitives";
import FilterPanel from "./FilterPanel";
import LibraryTable from "./LibraryTable";
import LibraryToolbar from "./LibraryToolbar";

const byName = (a, b) => compareTitles(entitySortName(a), entitySortName(b));

export default function EntityLibrary({
  title,
  nouns,
  items,
  loading,
  error,
  filterDefs,
  matchesSearch,
  sorts,
  renderCard,
  columns,
  rowPath,
  rowKey = (item) => item.system_id,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [currentView, setCurrentView] = useState("grid");
  const { sort: chosenSort, setSort, reversed, setReversed } = useSortState(sorts[0]?.value);
  // A sort no longer offered (My rating once the viewer has no list) reads as
  // the first one, the name.
  const sort = resolveSortKey(
    sorts.map((s) => ({ key: s.value })),
    chosenSort,
  );

  const {
    filters,
    toggleFilter,
    clearFilters,
    resetFilters,
    isDefault,
    activeFilterCount,
    dynamicFilterOptions,
  } = useEntityFilterState(filterDefs, items);

  const filteredAndSorted = useMemo(() => {
    const q = cleanString(searchQuery);
    const searched = q ? items.filter((item) => matchesSearch(item, q)) : items;
    const result = applyFilterDefs(searched, filterDefs, filters);
    const primary = sorts.find((s) => s.value === sort)?.compare;
    const compare = (a, b) => (primary ? primary(a, b) : 0) || byName(a, b);
    return [...result].sort(directed(compare, reversed));
  }, [items, searchQuery, matchesSearch, filterDefs, filters, sorts, sort, reversed]);

  // Search, filter and sort see every item; the grid draws them a batch at a
  // time, so a long library does not mount every card - and its cover - at once.
  const { visible, hasMore, sentinelRef } = useIncrementalList(filteredAndSorted);

  const narrowed = searchQuery !== "" || activeFilterCount > 0;
  // The empty state's way out: no search and no filter, not the default -
  // the default may be exactly what left nothing to show.
  function showEverything() {
    setSearchQuery("");
    clearFilters();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-2xl mb-3"></i>
          <p className="text-text-faint">Loading {nouns.many}...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center border border-danger bg-danger/10 px-6 py-4 text-danger">
          <p className="font-bold">{error}</p>
        </div>
      </div>
    );
  }

  const count = filteredAndSorted.length;

  return (
    <div className="min-h-screen">
      {/* Filter strip: flat on the canvas */}
      <div className="border-b border-border sticky top-[var(--nav-h)] z-30 bg-canvas">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="mb-3">
            <h1 className="font-display text-3xl font-semibold text-text leading-none">
              {title}
            </h1>
            <p className="font-mono text-[11px] text-text-faint mt-1.5">
              {count} {count === 1 ? nouns.one : nouns.many}
              {searchQuery && ` matching "${searchQuery}"`}
              {activeFilterCount > 0 && " (filtered)"}
            </p>
          </div>

          <LibraryToolbar
            search={{
              value: searchQuery,
              onChange: setSearchQuery,
              placeholder: `Search ${nouns.searchMany ?? nouns.many}...`,
            }}
            sort={{
              options: sorts,
              value: sort,
              onChange: setSort,
              reversed,
              onReversedChange: setReversed,
            }}
            filters={{
              open: showFilters,
              onToggle: () => setShowFilters((o) => !o),
              activeFilterCount,
            }}
            view={{ value: currentView, onChange: setCurrentView }}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {showFilters && (
          <FilterPanel
            filterDefs={filterDefs}
            filters={filters}
            toggleFilter={toggleFilter}
            clearFilters={clearFilters}
            resetFilters={isDefault ? undefined : resetFilters}
            activeFilterCount={activeFilterCount}
            dynamicFilterOptions={dynamicFilterOptions}
          />
        )}
        {count === 0 ? (
          <div className="text-center py-16 border border-dashed border-border-strong">
            <Eyebrow className="mb-1">Empty</Eyebrow>
            <p className="text-text-muted text-sm">No {nouns.searchMany ?? nouns.many} found</p>
            <p className="text-sm text-text-faint mt-1">
              {narrowed ? (
                <>
                  Try a different search or filter, or{" "}
                  <button onClick={showEverything} className="text-brand hover:underline">
                    show everything
                  </button>
                </>
              ) : (
                `No ${nouns.searchMany ?? nouns.many} in the database yet.`
              )}
            </p>
          </div>
        ) : currentView === "table" ? (
          <LibraryTable
            columns={columns}
            rows={filteredAndSorted}
            rowPath={rowPath}
            rowKey={rowKey}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {visible.map(renderCard)}
            </div>
            {hasMore && <div ref={sentinelRef} aria-hidden="true" />}
          </>
        )}
      </div>
    </div>
  );
}
