// Frontend: layout component file for LibraryLayout.
import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { useLibraryState } from "../../hooks/useLibraryState";
import { useViewScope } from "../../hooks/useViewScope";
import { libraryConfigFor } from "../../lib/libraryScope";
import { useStatusToggle } from "../../hooks/useStatusToggle";
import { statusToggleFields } from "../../lib/status";
import { MEDIA_CONFIG } from "../../utils/media";
import { useIncrementalList } from "../../hooks/useIncrementalList";
import MediaCard from "../cards/MediaCard";
import FilterPanel from "./FilterPanel";
import LibraryTable from "./LibraryTable";
import LibraryToolbar from "./LibraryToolbar";
import MediaLoadingState from "./MediaLoadingState";
import { Eyebrow } from "../ui/primitives";

// ---------------------------------------------------------------------------
// LibraryLayout — shared scaffold for all 7 media library pages
// ---------------------------------------------------------------------------
/**
 * Props:
 *   type        {string}   — MEDIA_CONFIG key (e.g. "anime")
 *   config      {object}   — LIBRARY_CONFIG: { filterDefs, sortDefs, defaultSort,
 *                             searchPlaceholder, buildSearchString, tableColumns }
 *   data        {object[]} — primary media array
 *   franchises  {object[]} — franchise array (pass [] if type doesn't use it)
 *   series      {object[]} — series array (pass [] if type doesn't use it)
 *   isLoading   {boolean}
 *   error       {string|null}
 *
 * A viewer without self.list (`ownData`) is shown the catalogue parts only:
 * every filter, sort and column the config marks `personal` is dropped before
 * anything reads the config (lib/libraryScope.js). The body is keyed on the
 * scope, so a sort or filter chosen under one scope is not carried into the
 * other when the viewer's permissions change.
 */
export default function LibraryLayout({ config, ...props }) {
  const { ownData } = useViewScope();
  const scoped = useMemo(() => libraryConfigFor(config, ownData), [config, ownData]);
  return (
    <LibraryBody key={ownData ? "own" : "catalogue"} config={scoped} {...props} />
  );
}

function LibraryBody({
  type,
  config,
  data,
  franchises,
  series,
  isLoading,
  error,
}) {
  // `has("self.list")`, not isAdmin. The tracker controls in the library
  // table write the viewer's OWN user_media_list row, so the permission that
  // authorises them is self.list. isAdmin has meant manage.catalog since
  // Phase A, and gating a self-service control on a catalogue permission is
  // what made the `user` role usable through the API and useless in the UI.
  const { has } = useAuth();
  const canTrack = has("self.list");
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Build O(1) lookup dicts from raw arrays
  const franchiseDict = useMemo(
    () => Object.fromEntries((franchises ?? []).map((f) => [f.system_id, f])),
    [franchises],
  );
  const seriesDict = useMemo(
    () => Object.fromEntries((series ?? []).map((s) => [s.system_id, s])),
    [series],
  );

  const {
    searchQuery, setSearchQuery,
    currentSort, setCurrentSort,
    reversed, setReversed,
    currentView, setCurrentView,
    showFilters, setShowFilters,
    filters, toggleFilter, clearFilters, activeFilterCount,
    dynamicFilterOptions,
    filteredAndSorted,
    handleUpdated,
  } = useLibraryState(type, config, data, franchiseDict, seriesDict);

  // Search, filter and sort see every item; the grid view draws them a batch
  // at a time, so a long library does not mount every card - and its cover -
  // at once. The table view draws every row.
  const { visible, hasMore, sentinelRef } = useIncrementalList(filteredAndSorted);

  // A sort may name the score a grid card should show in place of its default
  // (libraryColumns' `cardScoreField`), so that sorting an anime library by
  // AniList does not leave every card showing its MAL figure. A sort that
  // names nothing resolves to undefined, which lets MediaCard's own default
  // parameter stand rather than stating the default twice.
  const cardScoreField = useMemo(
    () => config.sortDefs.find((s) => s.key === currentSort)?.cardScoreField,
    [config.sortDefs, currentSort],
  );

  // -------------------------------------------------------------------------
  // Status toggle — uses the existing hook; wraps mutateAsync so the table
  // view gets the same mutation path as grid MediaCards.
  // -------------------------------------------------------------------------
  const statusToggle = useStatusToggle(type);

  const handleStatusToggle = useCallback(
    async (e, item, nextStatus, field) => {
      e.stopPropagation();
      try {
        // The status button (no `field`) zeroes the finished counts when it
        // moves a row off Completed; the plan-flag toggles write one field.
        const statusField = MEDIA_CONFIG[type].statusField;
        await statusToggle.mutateAsync(
          field
            ? { id: item.system_id, value: nextStatus, field }
            : {
                id: item.system_id,
                fields: statusToggleFields(type, statusField, item[statusField], nextStatus),
              },
        );
        // field-specific toasts
        if (
          field === "watch_next" ||
          field === "read_next" ||
          field === "play_next"
        ) {
          showToast("success", nextStatus ? "Added to Watch/Read Next" : "Removed from Watch/Read Next");
        } else if (
          field === "to_rewatch" ||
          field === "to_reread" ||
          field === "to_replay"
        ) {
          showToast("success", nextStatus ? "Marked for rewatch/reread" : "Removed from rewatch/reread");
        } else {
          showToast("success", `Status → ${nextStatus}`);
        }
      } catch {
        showToast("error", "Failed to update");
      }
    },
    [statusToggle, showToast, type],
  );

  // Row-click navigation
  const handleRowClick = useCallback(
    (item) => navigate(`${config.navPath}/${item.system_id}`),
    [navigate, config.navPath],
  );

  // -------------------------------------------------------------------------
  // Column render context passed to every tableColumn.render() call
  // -------------------------------------------------------------------------
  const columnCtx = useMemo(
    () => ({
      franchiseDict,
      seriesDict,
      canTrack,
      handleStatusToggle,
    }),
    [franchiseDict, seriesDict, canTrack, handleStatusToggle],
  );

  // -------------------------------------------------------------------------
  // Loading / error states
  // -------------------------------------------------------------------------
  if (isLoading || error) {
    return (
      <MediaLoadingState
        isLoading={isLoading}
        error={error}
        loadingText="Loading library..."
        errorTitle="Database Error"
      />
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Top bar: a flat strip on the canvas */}
      <div className="mb-4 border-b border-border pb-4">
        <LibraryToolbar
          search={{
            value: searchQuery,
            onChange: setSearchQuery,
            placeholder: config.searchPlaceholder ?? "Search...",
          }}
          sort={{
            options: config.sortDefs.map((s) => ({
              value: s.key,
              label: s.label,
              descending: !s.ascending,
            })),
            value: currentSort,
            onChange: setCurrentSort,
            reversed,
            onReversedChange: setReversed,
          }}
          filters={{
            open: showFilters,
            onToggle: () => setShowFilters((o) => !o),
            activeFilterCount,
          }}
          view={{ value: currentView, onChange: setCurrentView }}
          trailing={
            <span className="font-mono text-[11px] text-text-faint">
              {filteredAndSorted.length} results
            </span>
          }
        />
      </div>

      {/* Filter panel */}
      {showFilters && (
        <FilterPanel
          filterDefs={config.filterDefs}
          filters={filters}
          toggleFilter={toggleFilter}
          clearFilters={clearFilters}
          activeFilterCount={activeFilterCount}
          dynamicFilterOptions={dynamicFilterOptions}
        />
      )}

      {/* Content */}
      {filteredAndSorted.length === 0 ? (
        <div className="border border-dashed border-border-strong px-4 py-12 text-center">
          <Eyebrow className="text-text-muted mb-1">No results</Eyebrow>
          <p className="text-sm text-text-faint">
            No items match the current filters. Clear a filter or change the search.
          </p>
        </div>
      ) : currentView === "grid" ? (
        /* Grid view */
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {visible.map((item) => (
              <MediaCard
                key={item.system_id}
                type={type}
                data={item}
                onUpdated={handleUpdated}
                scoreField={cardScoreField}
              />
            ))}
          </div>
          {hasMore && <div ref={sentinelRef} aria-hidden="true" />}
        </>
      ) : (
        /* Table view */
        <LibraryTable
          columns={config.tableColumns}
          rows={filteredAndSorted}
          ctx={columnCtx}
          onRowClick={handleRowClick}
        />
      )}
    </div>
  );
}

