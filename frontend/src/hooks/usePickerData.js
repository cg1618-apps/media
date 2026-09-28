// Frontend: everything one random picker mode draws on - the lists of its
// types as picker entries, its FilterDefs, its stored default filters, and
// whether it draws weighted by default.
// Shared by the picker and the defaults editor, which must agree on all three.
import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { endpoints } from "../api/endpoints";
import { MEDIA_CONFIG } from "../config/mediaRegistry";
import { filterDefsForMode, resolveDefaultFilters, toEntries } from "../lib/randomPicker";
import { LIST_OPTIONS, mediaListQueryKey } from "./useMediaList";
import { buildUrl, fetchJson } from "./queryUtils";

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
 * mode      "all" or one type
 * typesKey  the comma-joined types the mode draws from - a string, so the
 *           memos below see a change of types rather than a new array
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

  const entries = useMemo(
    () => types.flatMap((t, i) => toEntries(t, lists[i])),
    [types, lists],
  );
  const filterDefs = useMemo(() => filterDefsForMode(mode, types), [mode, types]);
  const storedFilters = defaultsQuery.data?.filters;
  const defaultFilters = useMemo(
    () => resolveDefaultFilters(filterDefs, storedFilters),
    [filterDefs, storedFilters],
  );

  return {
    entries,
    filterDefs,
    defaultFilters,
    // Weighted unless a mode was saved otherwise.
    defaultWeighted: defaultsQuery.data?.weighted ?? true,
    isLoading: listsLoading || defaultsQuery.isLoading,
    error,
  };
}
