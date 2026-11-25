// Frontend: the direction a sorted list runs in.
//
// Every sort has a natural direction - a title A to Z, a rating best first, a
// release date newest first on a library - and SortControl's direction button
// reverses it. A list holds `reversed` beside its sort key and applies it
// here, so no comparator has to know about it.

/** `compare`, run backwards when `reversed`. Extra arguments pass through. */
export function directed(compare, reversed) {
  if (!reversed) return compare;
  return (a, b, ...rest) => -compare(a, b, ...rest);
}

/**
 * The direction a sort actually runs in: "desc" when its natural order is
 * descending (`descending`) and it is not reversed, or ascending and it is.
 */
export function effectiveDirection(descending, reversed) {
  return Boolean(descending) !== Boolean(reversed) ? "desc" : "asc";
}
