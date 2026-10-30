// Frontend: everything one random picker mode draws on - the lists of its
// types as picker entries (or, in the franchise mode, every franchise, with
// the type lists describing what each holds), its FilterDefs, its stored
// default filters, and whether it draws weighted by default.
// Shared by the picker and the defaults editor, which must agree on all three.
import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { endpoints } from "../api/endpoints";
import { MEDIA_CONFIG } from "../config/mediaRegistry";
import {
  FRANCHISE_MODE,
  filterDefsForMode,
  isWeightedMode,
  resolveDefaultFilters,
  toEntries,
  toFranchiseEntries,
} from "../lib/randomPicker";
import { LIST_OPTIONS, mediaListQueryKey } from "./useMediaList";
import { buildUrl, fetchJson } from "./queryUtils";
import { useViewScope } from "./useViewScope";

export function pickerDefaultsQueryKey(mode) {
  return ["random-picker-defaults", mode];
}

// Lists merged into one result. Module-level so its identity is stable, which
// lets useQueries keep the merged result until a list actually changes.
function combineLists(results) {
  return {
    lists: results.map((r) => r.data),
    isLoading: results.some((r) => r.isLoading),
    error: results.find((r) => r.error)?.error?.message ?? null,
  };
}

/**
 * mode      "all", one type, or FRANCHISE_MODE
 * typesKey  the comma-joined types the mode draws from (for the franchise
 *           mode, every visible type) - a string, so the memos below see a
 *           change of types rather than a new array
 */
export function usePickerData(mode, typesKey) {
  const types = useMemo(() => typesKey.split(",").filter(Boolean), [typesKey]);

  // The same cache entries the library pages fill, so either page warms the
  // other.
  const { lists, isLoading: listsLoading, error } = useQueries({
    queries: types.map((t) => ({
      queryKey: mediaListQueryKey(t, LIST_OPTIONS.params),
      queryFn: () => fetchJson(buildUrl(`${MEDIA_CONFIG[t].apiEndpoint}/`, LIST_OPTIONS.params)),
      staleTime: 30_000,
    })),
    combine: combineLists,
  });

  // The franchise mode's pool. The same key the franchise lists share.
  const isFranchiseMode = mode === FRANCHISE_MODE;
  const franchisesQuery = useQuery({
    queryKey: mediaListQueryKey("franchise", LIST_OPTIONS.params),
    queryFn: () =>
      fetchJson(buildUrl(`${MEDIA_CONFIG.franchise.apiEndpoint}/`, LIST_OPTIONS.params)),
    staleTime: 30_000,
    enabled: isFranchiseMode,
  });

  // Defaults that cannot be read are no defaults: the picker still works.
  const defaultsQuery = useQuery({
    queryKey: pickerDefaultsQueryKey(mode),
    queryFn: () =>
      fetchJson(endpoints.randomPickerDefaults.detail(mode)).catch(() => ({
        filters: {},
        weighted: true,
      })),
    staleTime: 30_000,
  });

  const franchises = franchisesQuery.data;
  const entries = useMemo(
    () =>
      isFranchiseMode
        ? toFranchiseEntries(franchises, Object.fromEntries(types.map((t, i) => [t, lists[i]])))
        : types.flatMap((t, i) => toEntries(t, lists[i])),
    [isFranchiseMode, franchises, types, lists],
  );
  // A franchise's expectation and rating are personal content
  // (view.personal); without the key their filters are not offered.
  const { personal } = useViewScope();
  const filterDefs = useMemo(
    () => filterDefsForMode(mode, types, { personal }),
    [mode, types, personal],
  );
  const storedFilters = defaultsQuery.data?.filters;
  const defaultFilters = useMemo(
    () => resolveDefaultFilters(filterDefs, storedFilters),
    [filterDefs, storedFilters],
  );

  return {
    entries,
    filterDefs,
    defaultFilters,
    // Weighted unless a mode was saved otherwise, or cannot be weighted.
    defaultWeighted: isWeightedMode(mode) && (defaultsQuery.data?.weighted ?? true),
    isLoading: listsLoading || defaultsQuery.isLoading || franchisesQuery.isLoading,
    error: error ?? franchisesQuery.error?.message ?? null,
  };
}
