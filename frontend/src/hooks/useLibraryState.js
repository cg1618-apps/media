// Frontend: state hook for library page filters and selections.
import { useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { applyFilterDefs } from "../lib/libraryFilters";
import { cleanString } from "../utils/media";
import { useFilterState } from "./useFilterState";

// ---------------------------------------------------------------------------
// FilterDef type reference
// ---------------------------------------------------------------------------
// Each FilterDef in config.filterDefs has the shape:
//
//   { key, label, type, ...typeSpecificProps, match }
//
// Supported types:
//   "set"          — static option list; filter.key is a Set of selected values
//   "set-dynamic"  — options derived from data at runtime via deriveOptions(data)
//   "set-grouped"  — options are group labels; match uses a groupMap to normalise
//                    the raw item field value before comparing
//   "boolean"      — single toggle; filter.key is a boolean
//
// Optional on the set types: optionLabel(value) => string, the chip text when
// it should differ from the stored value.
//
// Optional on "set": parent: { label, children: [value, ...] } — one extra
// chip standing for a group of values, drawn after `options` and boxed with
// its children (which are NOT repeated in `options`). The children are
// ordinary values of the same Set; the parent chip only switches them:
// none or some on → all on, all on → all off (toggleParentValues in
// lib/libraryFilters.js). It shows active only while every child is on.
//
// match signature (called only when the filter is active):
//   (item, activeValue, franchiseDict, seriesDict) => boolean
//
// SortDef shape:
//   { key, label, compare(a, b, franchiseDict, seriesDict) => number }
// ---------------------------------------------------------------------------

/**
 * Centralised state and computation hook for all library pages.
 *
 * @param {string}   type          - MEDIA_CONFIG key (e.g. "anime")
 * @param {object}   config        - LIBRARY_CONFIG for this media type
 * @param {object[]} data          - primary media array from the API
 * @param {object}   franchiseDict - system_id → franchise object lookup
 * @param {object}   seriesDict    - system_id → series object lookup
 */
export function useLibraryState(type, config, data, franchiseDict, seriesDict) {
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery]   = useState("");
  const [currentSort, setCurrentSort]   = useState(config.defaultSort ?? "title");
  const [currentView, setCurrentView]   = useState("grid");
  const [showFilters, setShowFilters]   = useState(false);

  // -------------------------------------------------------------------------
  // Filter state — shape is derived from config.filterDefs
  // -------------------------------------------------------------------------
  const {
    filters,
    toggleFilter,
    clearFilters,
    activeFilterCount,
    dynamicFilterOptions,
  } = useFilterState(config.filterDefs, data);

  // -------------------------------------------------------------------------
  // Cache-patch callback — used by grid MediaCard onUpdated prop
  // -------------------------------------------------------------------------
  const handleUpdated = useCallback(
    (updatedItem) => {
      queryClient.setQueriesData({ queryKey: ["media-list", type] }, (old) =>
        Array.isArray(old)
          ? old.map((item) =>
              item.system_id === updatedItem.system_id ? updatedItem : item,
            )
          : old,
      );
    },
    [queryClient, type],
  );

  // -------------------------------------------------------------------------
  // Filtered and sorted data — search → filter → sort pipeline
  // -------------------------------------------------------------------------
  const filteredAndSorted = useMemo(() => {
    const q = cleanString(searchQuery);

    // 1. Search
    let result = q
      ? data.filter((item) => {
          const haystack = cleanString(
            config.buildSearchString(item, franchiseDict, seriesDict),
          );
          return haystack.includes(q);
        })
      : [...data];

    // 2. Filter — only apply active FilterDefs
    result = applyFilterDefs(result, config.filterDefs, filters, franchiseDict, seriesDict);

    // 3. Sort
    const sortDef = config.sortDefs.find((s) => s.key === currentSort);
    if (sortDef) {
      result.sort((a, b) =>
        sortDef.compare(a, b, franchiseDict, seriesDict),
      );
    }

    return result;
  }, [
    data,
    searchQuery,
    filters,
    currentSort,
    franchiseDict,
    seriesDict,
    config,
  ]);

  return {
    // UI state
    searchQuery,  setSearchQuery,
    currentSort,  setCurrentSort,
    currentView,  setCurrentView,
    showFilters,  setShowFilters,
    // Filter state & helpers
    filters,
    toggleFilter,
    clearFilters,
    activeFilterCount,
    dynamicFilterOptions,
    // Computed data
    filteredAndSorted,
    // Cache helper
    handleUpdated,
  };
}

