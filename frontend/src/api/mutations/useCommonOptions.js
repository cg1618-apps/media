// Frontend: the values of one common option category, as strings.
//
// A common option category is a suggestion-only vocabulary curated on the
// Add and Modify pages' Common Options sub-tab (COMMON_OPTION_CATEGORIES in
// app/utils/credit_roles.py). Read through /api/options like any other
// Tier 2 list, so it sits under the options prefix and a write there
// refetches it.
import { endpoints } from "../endpoints";
import { useApiQuery } from "../../hooks/useApiQuery";

/** The category's values in their sort order. */
export function useCommonOptionValues(category, { enabled = true } = {}) {
  return useApiQuery(
    ["options", category],
    endpoints.options.byCategory(encodeURIComponent(category)),
    { enabled, queryOptions: { select: (rows) => (rows ?? []).map((row) => row.value) } },
  );
}
