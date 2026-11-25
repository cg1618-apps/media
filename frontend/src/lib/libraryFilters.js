// Frontend: the FilterDef machinery the library pages and the random picker
// share. The FilterDef shape itself is documented in hooks/useLibraryState.js.

/** An empty range: neither bound set. */
export const EMPTY_RANGE = Object.freeze({ min: "", max: "" });

function emptyValue(fd) {
  if (fd.type === "boolean") return false;
  if (fd.type === "range") return { ...EMPTY_RANGE };
  return new Set();
}

/** A fresh, empty filter state for `filterDefs`: a Set per set def, false for
 *  a boolean, an empty { min, max } for a range. */
export function initialFilters(filterDefs) {
  return Object.fromEntries(filterDefs.map((fd) => [fd.key, emptyValue(fd)]));
}

/** A range filter's state: an object with `min`/`max`, not a Set. */
export function isRangeValue(value) {
  return value != null && typeof value === "object" && !(value instanceof Set) && "min" in value;
}

/** One bound as a number, or null when it is blank or not a number. */
export function rangeBound(text) {
  if (text === "" || text == null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** True when a filter value narrows anything: a non-empty Set, a true boolean,
 *  or a range with at least one numeric bound. */
export function isFilterActive(value) {
  if (value instanceof Set) return value.size > 0;
  if (isRangeValue(value)) return rangeBound(value.min) != null || rangeBound(value.max) != null;
  return !!value;
}

/** How many chips, toggles and ranges are on across the whole filter state. */
export function countActiveFilters(filters) {
  return Object.values(filters).reduce(
    (n, v) => n + (v instanceof Set ? v.size : isFilterActive(v) ? 1 : 0),
    0,
  );
}

/** True when two filter states hold the same values in every group. */
export function sameFilters(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const x = a[key];
    const y = b[key];
    if (x instanceof Set || y instanceof Set) {
      if (!(x instanceof Set && y instanceof Set) || x.size !== y.size) return false;
      for (const v of x) if (!y.has(v)) return false;
    } else if (isRangeValue(x) || isRangeValue(y)) {
      const bounds = (r) => (isRangeValue(r) ? [rangeBound(r.min), rangeBound(r.max)] : [null, null]);
      const [a1, a2] = bounds(x);
      const [b1, b2] = bounds(y);
      if (a1 !== b1 || a2 !== b2) return false;
    } else if (!!x !== !!y) {
      return false;
    }
  }
  return true;
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
 * filter the chosen values OR, which is each def's own `match`. A def with
 * nothing chosen narrows nothing - unless it declares `idle(item)`, the rows
 * it keeps while nothing is chosen (an entity library's entry type, which
 * keeps the restricted-only rows out until Restricted is ticked).
 */
export function applyFilterDefs(items, filterDefs, filters, franchiseDict, seriesDict) {
  let result = items;
  for (const fd of filterDefs) {
    const activeValue = filters[fd.key];
    if (!isFilterActive(activeValue)) {
      if (fd.idle) result = result.filter((item) => fd.idle(item));
      continue;
    }
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
