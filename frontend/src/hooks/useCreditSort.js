// Frontend: the credit lists' one sort (lib/creditSorts.js) and its
// direction, for the studio, publisher and person pages. `options` drops My
// rating for a viewer without a list; `sorted` orders one group's entries.
import { useViewScope } from "./useViewScope";
import { useSortState } from "./useSortState";
import { CREDIT_SORT_DEFAULT, creditSortOptions, sortCredits } from "../lib/creditSorts";

export function useCreditSort() {
  const { ownData } = useViewScope();
  const state = useSortState(CREDIT_SORT_DEFAULT);
  return {
    ...state,
    options: creditSortOptions(ownData),
    sorted: (entries, mediaType) => sortCredits(entries, mediaType, state.sort, state.reversed),
  };
}
