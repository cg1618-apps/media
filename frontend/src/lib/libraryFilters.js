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

// ---------------------------------------------------------------------------
// Parent chips
// ---------------------------------------------------------------------------
// A "set" def may carry `parent: { label, children: [...] }`: one chip that
// stands for a group of option values (the gated media types under
// "Restricted"). The children are ordinary values of the same Set, drawn as
// their own chips beside the parent, so matching never needs to know the
// parent exists.

/** True when every one of `children` is in `active` (and there is at least one). */
export function isParentActive(active, children) {
  return (
    children.length > 0 &&
    active instanceof Set &&
    children.every((child) => active.has(child))
  );
}

/**
 * `active` after a click on the parent chip of `children`. With every child
 * on, the click turns them all off; with none or only some on, it turns the
 * rest on. Values outside `children` are left alone. Returns a new Set.
 */
export function toggleParentValues(active, children) {
  const next = new Set(active instanceof Set ? active : []);
  if (isParentActive(next, children)) {
    children.forEach((child) => next.delete(child));
  } else {
    children.forEach((child) => next.add(child));
  }
  return next;
}
