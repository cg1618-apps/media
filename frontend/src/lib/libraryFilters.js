// Frontend: the FilterDef machinery the library pages and the random picker
// share. The FilterDef shape itself is documented in hooks/useLibraryState.js.

/** A fresh, empty filter state for `filterDefs`: a Set per def, false for booleans. */
export function initialFilters(filterDefs) {
  return Object.fromEntries(
    filterDefs.map((fd) => [fd.key, fd.type === "boolean" ? false : new Set()]),
  );
}

/** True when a filter value narrows anything: a non-empty Set or a true boolean. */
export function isFilterActive(value) {
  return value instanceof Set ? value.size > 0 : !!value;
}

/** How many chips and toggles are on across the whole filter state. */
export function countActiveFilters(filters) {
  return Object.values(filters).reduce(
    (n, v) => n + (v instanceof Set ? v.size : v ? 1 : 0),
    0,
  );
}

/** The options of every "set-dynamic" def, derived from `data`. */
export function deriveDynamicOptions(filterDefs, data) {
  return Object.fromEntries(
    filterDefs
      .filter((fd) => fd.type === "set-dynamic")
      .map((fd) => [fd.key, fd.deriveOptions(data)]),
  );
}

/**
 * `items` narrowed by every active def. Defs AND together; inside one set
 * filter the chosen values OR, which is each def's own `match`.
 */
export function applyFilterDefs(items, filterDefs, filters, franchiseDict, seriesDict) {
  let result = items;
  for (const fd of filterDefs) {
    const activeValue = filters[fd.key];
    if (!isFilterActive(activeValue)) continue;
    result = result.filter((item) => fd.match(item, activeValue, franchiseDict, seriesDict));
  }
  return result;
}
