// Frontend: chip/toggle state for a list of FilterDefs, shared by the library
// pages and the random picker. The defs are read once: a caller whose defs
// change remounts (a `key`) rather than carrying one set's state into another.
import { useCallback, useMemo, useState } from "react";

import {
  countActiveFilters,
  deriveDynamicOptions,
  initialFilters,
} from "../lib/libraryFilters";

export function useFilterState(filterDefs, data) {
  const [filters, setFilters] = useState(() => initialFilters(filterDefs));

  const toggleFilter = useCallback((group, value) => {
    setFilters((prev) => {
      const current = prev[group];
      if (typeof current === "boolean") {
        return { ...prev, [group]: !current };
      }
      const next = new Set(current);
      next.has(value) ? next.delete(value) : next.add(value);
      return { ...prev, [group]: next };
    });
  }, []);

  const clearFilters = useCallback(
    () => setFilters(initialFilters(filterDefs)),
    [filterDefs],
  );

  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

  const dynamicFilterOptions = useMemo(
    () => deriveDynamicOptions(filterDefs, data),
    [filterDefs, data],
  );

  return { filters, toggleFilter, clearFilters, activeFilterCount, dynamicFilterOptions };
}
