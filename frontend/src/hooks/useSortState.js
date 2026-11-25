// Frontend: a list's sort and its direction, held together.
//
// `reversed` runs the chosen sort against its natural direction (see
// components/layout/SortControl.jsx and lib/sortDirection.js). Choosing a
// different sort starts it in its own natural direction again, so a reversed
// title sort never turns into a worst-first rating sort unasked.
import { useCallback, useState } from "react";

export function useSortState(defaultSort) {
  const [state, setState] = useState({ sort: defaultSort, reversed: false });
  const setSort = useCallback(
    (sort) => setState((prev) => (prev.sort === sort ? prev : { sort, reversed: false })),
    [],
  );
  const setReversed = useCallback(
    (reversed) => setState((prev) => ({ ...prev, reversed })),
    [],
  );
  return { sort: state.sort, setSort, reversed: state.reversed, setReversed };
}
